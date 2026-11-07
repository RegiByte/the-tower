import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RepoRead } from '../src/bridge/worktrees.ts'
import { watchRepos, type RepoAsk } from '../src/repo-watch.ts'
import type { RepoReading } from '../src/worktrees.ts'

const reading = (dir: string, at: number): PromiseSettledResult<RepoReading> => ({ status: 'fulfilled', value: { read: { dir, at, git: false } as RepoRead } })

/** A reader whose reads each wait for `answer`, in the order they were asked. */
const heldReader = () => {
  const asked: { ask: RepoAsk; answer: (r: PromiseSettledResult<RepoReading>) => void }[] = []
  const read = (ask: RepoAsk) => new Promise<PromiseSettledResult<RepoReading>>((answer) => asked.push({ ask, answer }))
  return { asked, read }
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

test('a read that fails keeps the dir out of the rest: the other dir lands', async () => {
  const { asked, read } = heldReader()
  const watch = watchRepos(() => ['/bad', '/well'], read, () => false, () => {})
  const logged = console.error
  console.error = () => {}
  try {
    const done = watch.refresh()
    await turns()
    asked[0].answer({ status: 'rejected', reason: new Error('no') })
    asked[1].answer(reading('/well', 1))
    await done
    assert.deepEqual([...watch.repos().keys()], ['/well'])
  } finally {
    console.error = logged
  }
})

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
