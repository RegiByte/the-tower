import assert from 'node:assert/strict'
import { test } from 'node:test'
import { watchRepos, type RepoAsk, type RepoReader } from '../src/repo-watch.ts'
import type { RefsReading, RepoReading, RepoRefsReading } from '../src/worktrees.ts'

/** A dir that is no repo, read at `at`: its refs read is its whole read. */
const reading = (dir: string, at: number): PromiseSettledResult<RefsReading> => ({ status: 'fulfilled', value: { read: { dir, at, git: false } } })

/** A reader whose refs reads each wait for `answer`, in the order they were asked; it is never asked for checkouts. */
const heldReader = () => {
  const asked: { ask: RepoAsk; answer: (r: PromiseSettledResult<RefsReading>) => void }[] = []
  const read: RepoReader = {
    refs: (ask) => new Promise((answer) => asked.push({ ask, answer })),
    checkouts: () => assert.fail('a dir that is no repo has no checkouts to read'),
  }
  return { asked, read }
}

/** A repo's refs read with origin's `main`, at `at`. */
const repoRefs = (dir: string, at: number): RepoRefsReading => ({
  read: { dir, at, git: true, bases: ['origin/main'], originHead: 'origin/main' },
  layout: { root: dir, gitDir: `${dir}/.git`, commonDir: `${dir}/.git` },
  facts: { at, entries: [], records: new Map(), heads: new Map(), originHead: 'origin/main', commits: new Map(), remotes: '', ahead: 0 },
})

/** That repo read in full, with no worktrees. */
const repoReading = (refs: RepoRefsReading): RepoReading => ({
  read: { ...refs.read, main: { dirty: 0, ahead: 0 }, trees: [], kept: [] },
  parts: { layout: { ...refs.layout, admins: {} }, facts: refs.facts, main: [], statuses: new Map(), created: new Map(), counted: new Map() },
})

/** A reader of repos whose checkouts reads each wait for `answer`; its refs reads answer at once, or fail with `refsFail`. */
const checkoutsHeld = (refsFail?: string) => {
  const asked: { refs: RepoRefsReading; answer: (r: PromiseSettledResult<RepoReading>) => void }[] = []
  const read: RepoReader = {
    refs: async ({ dir }) => (refsFail ? { status: 'rejected', reason: new Error(refsFail) } : { status: 'fulfilled', value: repoRefs(dir, 1) }),
    checkouts: (_, refs) => new Promise((answer) => asked.push({ refs, answer })),
  }
  return { asked, read }
}

/** Runs `body` with the tower's log silenced: a failed read is logged. */
const quietly = async (body: () => Promise<void>) => {
  const logged = console.error
  console.error = () => {}
  try {
    await body()
  } finally {
    console.error = logged
  }
}

const turns = () => new Promise((resolve) => setImmediate(resolve))

test('a repo that hangs delays only its own read: another lands while it waits, and what it is asked meanwhile waits for it', async () => {
  const { asked, read } = heldReader()
  const changes: string[] = []
  const watch = watchRepos(() => ['/hung', '/well'], read, () => false, () => changes.push('changed'))

  const first = watch.refresh()
  await turns()
  assert.deepEqual(asked.map((a) => a.ask.dir), ['/hung', '/well'])

  asked[1].answer(reading('/well', 1))
  await turns()
  assert.deepEqual([...watch.repos().keys()], ['/well'])
  assert.equal(changes.length, 1)

  void watch.refresh()
  await turns()
  assert.deepEqual(asked.map((a) => a.ask.dir), ['/hung', '/well', '/well'], 'the hung dir has one read at a time')

  asked[2].answer(reading('/well', 2))
  asked[0].answer(reading('/hung', 1))
  await turns()
  assert.deepEqual(asked.map((a) => a.ask.dir), ['/hung', '/well', '/well', '/hung'], 'its queued read starts once its first ends')
  asked[3].answer(reading('/hung', 2))
  await first
  assert.deepEqual([...watch.repos().keys()].sort(), ['/hung', '/well'])
})

test('a read that fails keeps the dir out of the rest: the other dir lands', () =>
  quietly(async () => {
    const { asked, read } = heldReader()
    const watch = watchRepos(() => ['/bad', '/well'], read, () => false, () => {})
    const done = watch.refresh()
    await turns()
    asked[0].answer({ status: 'rejected', reason: new Error('no') })
    asked[1].answer(reading('/well', 1))
    await done
    assert.deepEqual([...watch.repos().keys()], ['/well'])
  }))

test('refresh settles while a hung dir keeps being asked: a read that lands answers the asks before it', async () => {
  const { asked, read } = heldReader()
  const watch = watchRepos(() => ['/hung'], read, () => false, () => {})
  let settled = false
  const first = watch.refresh().then(() => (settled = true))
  await turns()
  for (let round = 0; round < 3; round++) {
    void watch.refresh()
    await turns()
    asked[round].answer(reading('/hung', round))
    await turns()
    assert.equal(asked.length, round + 2)
  }
  assert.equal(settled, true, `three reads landed, the first ask's among them, and refresh still waits (${asked.length} reads asked)`)
  asked.at(-1)!.answer(reading('/hung', 9))
  await first
})

test("a repo's refs land before its checkouts are read: the dir is a first read with its refs, and leaves the first reads once read in full", async () => {
  const { asked, read } = checkoutsHeld()
  const changes: string[] = []
  const watch = watchRepos(() => ['/repo'], read, () => false, () => changes.push('changed'))
  const done = watch.refresh()
  await turns()
  assert.deepEqual(watch.firsts().get('/repo'), { refs: repoRefs('/repo', 1).read })
  assert.equal(watch.repos().size, 0)
  assert.equal(changes.length, 1, 'the refs alone change the board')

  asked[0].answer({ status: 'fulfilled', value: repoReading(asked[0].refs) })
  await done
  assert.equal(watch.firsts().size, 0)
  assert.deepEqual([...watch.repos().keys()], ['/repo'])

  void watch.refresh()
  await turns()
  assert.equal(watch.firsts().size, 0, 'a dir read in full keeps its full read while it is read again')
  asked[1].answer({ status: 'fulfilled', value: repoReading(asked[1].refs) })
})

test("a first read that fails says what git said: with the refs it read, or without them when the refs failed", () =>
  quietly(async () => {
    const checkouts = checkoutsHeld()
    const watch = watchRepos(() => ['/repo'], checkouts.read, () => false, () => {})
    const done = watch.refresh()
    await turns()
    checkouts.asked[0].answer({ status: 'rejected', reason: new Error('git status in /repo: took too long') })
    await done
    assert.deepEqual(watch.firsts().get('/repo'), { refs: repoRefs('/repo', 1).read, failed: 'git status in /repo: took too long' })

    const refs = checkoutsHeld('git rev-parse in /repo: took over 60s')
    const failing = watchRepos(() => ['/repo'], refs.read, () => false, () => {})
    await failing.refresh()
    assert.deepEqual(failing.firsts().get('/repo'), { failed: 'git rev-parse in /repo: took over 60s' })
  }))
