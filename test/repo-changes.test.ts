import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NOTHING, SETTLE_MAX_MS, SETTLE_QUIET_MS, settleHandlers, staleOf, type RepoLayout, type Settling } from '../src/bridge/repo-changes.ts'

const layout: RepoLayout = { root: '/w/lab', gitDir: '/w/lab/.git', commonDir: '/w/lab/.git', admins: { a: '/w/lab/.git/worktrees/a', b: '/w/lab/.git/worktrees/b1' } }
const stale = (file: string | null, nested: string[] = []) => staleOf(layout, nested, file)

test('a change in a checkout makes its status stale; in its git, its status and, past its index, the repo', () => {
  assert.deepEqual(stale('/w/lab/src/x.ts'), { ...NOTHING, main: true })
  assert.deepEqual(stale('/w/lab/.worktrees/a/src/x.ts'), { ...NOTHING, trees: ['a'] })
  assert.deepEqual(stale('/w/lab/.git/index.lock'), { ...NOTHING, main: true })
  assert.deepEqual(stale('/w/lab/.git/HEAD'), { ...NOTHING, repo: true, main: true })
  assert.deepEqual(stale('/w/lab/.git/worktrees/a/index'), { ...NOTHING, trees: ['a'] })
  assert.deepEqual(stale('/w/lab/.git/worktrees/b1/HEAD'), { ...NOTHING, repo: true, trees: ['b'] })
})

test('refs, config and new worktrees make the repo stale; a branch reflog only that branch; no layout or path, everything', () => {
  for (const file of ['/w/lab/.git/refs/heads/tower/a', '/w/lab/.git/packed-refs', '/w/lab/.git/config', '/w/lab/.git/worktrees/new/gitdir', '/w/lab/.worktrees/new', '/w/lab/.worktrees'])
    assert.deepEqual(stale(file), { ...NOTHING, repo: true }, file)
  assert.deepEqual(stale('/w/lab/.git/logs/refs/heads/tower/a'), { ...NOTHING, branches: ['tower/a'] })
  assert.equal(stale(null), 'all')
  assert.equal(staleOf(undefined, [], '/w/lab/src/x.ts'), 'all')
})

test("a nested project dir's changes, and paths outside the repo, are not its", () => {
  assert.deepEqual(stale('/w/lab/frontend/src/x.ts', ['/w/lab/frontend']), NOTHING)
  assert.deepEqual(stale('/w/elsewhere/x'), NOTHING)
})

test('a linked worktree as the project dir: its own git dir is the main checkout', () => {
  const linked: RepoLayout = { root: '/w/lab', gitDir: '/w/main/.git/worktrees/lab', commonDir: '/w/main/.git', admins: {} }
  assert.deepEqual(staleOf(linked, [], '/w/main/.git/worktrees/lab/index'), { ...NOTHING, main: true })
  assert.deepEqual(staleOf(linked, [], '/w/main/.git/refs/heads/x'), { ...NOTHING, repo: true })
})

test('a bare repo as the project dir: its worktrees folder is told apart from the git dir it lies in', () => {
  const bare: RepoLayout = { root: '/w/lab.git', gitDir: '/w/lab.git', commonDir: '/w/lab.git', admins: { a: '/w/lab.git/worktrees/a' } }
  assert.deepEqual(staleOf(bare, [], '/w/lab.git/.worktrees/a/src/x.ts'), { ...NOTHING, trees: ['a'] })
  assert.deepEqual(staleOf(bare, [], '/w/lab.git/.worktrees/new'), { ...NOTHING, repo: true })
  assert.deepEqual(staleOf(bare, [], '/w/lab.git/worktrees/a/index'), { ...NOTHING, trees: ['a'] })
  assert.deepEqual(staleOf(bare, [], '/w/lab.git/refs/heads/x'), { ...NOTHING, repo: true })
})

test('changes settle once quiet, and no later than SETTLE_MAX_MS after the first however long they go on', () => {
  let s: Settling = {}
  const at = (t: number, stale = { ...NOTHING, main: true }) => {
    const effects = settleHandlers.changed(s, { type: 'changed', dir: '/w/lab', stale, at: t })
    for (const e of effects) if (e.type === 'state') s = e.state
    return effects.find((e) => e.type === 'timer/start')
  }
  assert.equal(at(0, NOTHING), undefined)
  assert.deepEqual(at(0), { type: 'timer/start', id: '/w/lab', ms: SETTLE_QUIET_MS, fire: { type: 'due', dir: '/w/lab' } })
  assert.equal(at(SETTLE_MAX_MS - 300, { ...NOTHING, trees: ['a'] })?.ms, 300)
  assert.deepEqual(settleHandlers.due(s, { type: 'due', dir: '/w/lab' }), [
    { type: 'state', state: {} },
    { type: 'read', dir: '/w/lab', stale: { ...NOTHING, main: true, trees: ['a'] } },
  ])
})
