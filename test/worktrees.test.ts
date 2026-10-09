import assert from 'node:assert/strict'
import { test } from 'node:test'
import { carriedOf, commonBases, copiesOf, floorBranches, floorWorktrees, parseTowerRecords, parseWorktreeList, towerTreeName, type RepoRead, type TreeRead } from '../src/bridge/worktrees.ts'

const HUB = '/w/lab'
const API = '/w/lab-api'

const tree = (dir: string, name: string, over: Partial<TreeRead> = {}): TreeRead => ({
  name, path: `${dir}/.worktrees/${name}`, branch: `tower/${name}`, head: 'abc', base: 'origin/main', present: true, dirty: 0, unpushed: 0, absorbed: false, risk: [], ...over,
})
const repo = (dir: string, trees: TreeRead[], kept: Extract<RepoRead, { git: true }>['kept'] = [], bases = ['origin/main']): RepoRead => ({ dir, git: true, bases, main: { dirty: 0, ahead: 0 }, trees, kept })

const states = (reads: RepoRead[], occupants: { id: string; cwd: string }[] = []) =>
  floorWorktrees('lab', reads, occupants, true).map((w) => [w.name, w.state, w.verbs])

test('git worktree list --porcelain: bare, detached and prunable entries', () => {
  const out = [
    'worktree /w/lab\nHEAD 111\nbranch refs/heads/main',
    'worktree /w/lab/.worktrees/a\nHEAD 222\ndetached',
    'worktree /w/lab/.worktrees/b\nHEAD 333\nbranch refs/heads/tower/b\nprunable gitdir file points to non-existent location',
    'worktree /w/lab/.worktrees/c\nHEAD 444\nbranch refs/heads/tower/c\nlocked',
  ].join('\n\n')
  assert.deepEqual(parseWorktreeList(`${out}\n`), [
    { path: '/w/lab', head: '111', branch: 'main', prunable: false, locked: false },
    { path: '/w/lab/.worktrees/a', head: '222', branch: undefined, prunable: false, locked: false },
    { path: '/w/lab/.worktrees/b', head: '333', branch: 'tower/b', prunable: true, locked: false },
    { path: '/w/lab/.worktrees/c', head: '444', branch: 'tower/c', prunable: false, locked: true },
  ])
})

test("only the tower's own worktrees have a name: others' are invisible", () => {
  assert.equal(towerTreeName(HUB, `${HUB}/.worktrees/forger-08`), 'forger-08')
  assert.equal(towerTreeName(HUB, `${HUB}/.worktrees/a/b`), undefined)
  assert.equal(towerTreeName(HUB, '/Users/me/conductor/workspaces/lab/x'), undefined)
  assert.equal(towerTreeName(HUB, `${HUB}-api/.worktrees/x`), undefined)
})

test('tower records: branch names keep their dots, the key is lowercased by git', () => {
  assert.deepEqual(parseTowerRecords('branch.tower/v1.2.towerbase origin/main\nbranch.tower/v1.2.towername v1.2\nbranch.tower/sub.towerbase origin/tower/arch-v2\n'), new Map([
    ['tower/v1.2', { base: 'origin/main', name: 'v1.2' }],
    ['tower/sub', { base: 'origin/tower/arch-v2' }],
  ]))
})

test('tower records: a fork keeps its snapshot and the checkout it was forked from', () => {
  assert.deepEqual(parseTowerRecords('branch.tower/rev-12.towerbase origin/main\nbranch.tower/rev-12.towername rev-12\nbranch.tower/rev-12.towerfork 0a1b2c\nbranch.tower/rev-12.towerfrom odin-07\n'), new Map([
    ['tower/rev-12', { base: 'origin/main', name: 'rev-12', fork: '0a1b2c', from: 'odin-07' }],
  ]))
})

test('a squash-merged branch looks unpushed but is absorbed: removable, not at risk', () => {
  assert.deepEqual(states([repo(HUB, [tree(HUB, 'a', { unpushed: 2, absorbed: true })])]), [['a', 'removable', ['remove']]])
  assert.deepEqual(states([repo(HUB, [tree(HUB, 'a', { unpushed: 2 })])]), [['a', 'at-risk', ['discard']]])
  assert.deepEqual(states([repo(HUB, [tree(HUB, 'a', { dirty: 1, absorbed: true })])]), [['a', 'at-risk', ['discard']]])
})

test('state in priority order: live, then lost, then at risk, then removable', () => {
  const lostAndRisky = [repo(HUB, [tree(HUB, 'a', { present: false })]), repo(API, [tree(API, 'a', { dirty: 3 })])]
  assert.deepEqual(states(lostAndRisky), [['a', 'lost', ['recut', 'prune']]])
  assert.deepEqual(states(lostAndRisky, [{ id: 's1', cwd: `${API}/.worktrees/a` }]), [['a', 'live', []]])
})

test('one repo at risk puts the whole name at risk', () => {
  assert.deepEqual(states([repo(HUB, [tree(HUB, 'a')]), repo(API, [tree(API, 'a', { unpushed: 1 })])]), [['a', 'at-risk', ['discard']]])
})

test('a session counts inside its worktree and below it, never in a worktree sharing its prefix', () => {
  const reads = [repo(HUB, [tree(HUB, 'sub1'), tree(HUB, 'sub10')])]
  const w = floorWorktrees('lab', reads, [{ id: 's1', cwd: `${HUB}/.worktrees/sub10/src` }, { id: 'sh', cwd: HUB }], true)
  assert.deepEqual(w.map((x) => [x.name, x.state, x.sessions]), [['sub1', 'removable', []], ['sub10', 'live', ['s1']]])
})

test('kept branches: recut always, deletable only when absorbed in every repo that has it', () => {
  const kept = (absorbed: boolean) => [{ branch: 'tower/k', base: 'origin/main', unpushed: 1, absorbed, risk: [] }]
  const both = floorBranches('lab', [repo(HUB, [], kept(true)), repo(API, [], kept(true))])
  const one = floorBranches('lab', [repo(HUB, [], kept(true)), repo(API, [], kept(false))])
  assert.deepEqual([both[0].absorbed, both[0].verbs, both[0].calls.delete], [true, ['recut', 'delete'], ['branch/delete', { project: 'lab', name: 'tower/k' }]])
  assert.deepEqual([one[0].absorbed, one[0].verbs], [false, ['recut']])
})

test('a cut can start from the origin branches every repo has, in the hub order; none if any dir is not git', () => {
  const reads = [repo(HUB, [], [], ['origin/main', 'origin/tower/arch-v2', 'origin/x']), repo(API, [], [], ['origin/x', 'origin/main'])]
  assert.deepEqual(commonBases(reads), ['origin/main', 'origin/x'])
  assert.deepEqual(commonBases([...reads, { dir: '/w/notes', git: false }]), [])
})

test('carried: each branch commit without an equal patch has a copy by author and date, committed no earlier', () => {
  const mark = (side: '<' | '>' | '=', commit: string, committed: number, made = 'A <a@a> 100 +0000 fix') => ({ side, commit, committed, made })
  assert.deepEqual(copiesOf([mark('<', 'c1', 300), mark('>', 'b1', 200), mark('=', 'b2', 200, 'A <a@a> 101 +0000 fix')]), [{ commit: 'b1', copy: 'c1' }])
  assert.equal(copiesOf([mark('<', 'c1', 300), mark('>', 'b1', 400)]), undefined, 'amended on the branch after its older version landed')
  assert.equal(copiesOf([mark('<', 'c1', 300, 'B <b@b> 100 +0000 fix'), mark('>', 'b1', 200)]), undefined, 'another author')
  assert.equal(copiesOf([mark('<', 'c1', 300, 'A <a@a> 100 +0000 other'), mark('>', 'b1', 200)]), undefined, 'another subject in the same second')
  assert.equal(copiesOf([mark('<', 'c1', 300), mark('>', 'b1', 200), mark('>', 'b2', 200)]), undefined, 'one copy stands for one commit')
  assert.deepEqual(carriedOf([mark('<', 'c1', 300), mark('>', 'b1', 200)], 3), { commits: 3, edited: 1 })
})

test('a clean worktree whose work landed only as copies is carried: removed on its own, never by Tidy', () => {
  const carried = { unpushed: 2, carried: { commits: 2, edited: 1 } }
  assert.deepEqual(states([repo(HUB, [tree(HUB, 'a', carried)])]), [['a', 'carried', ['remove']]])
  assert.deepEqual(states([repo(HUB, [tree(HUB, 'a', { ...carried, dirty: 1 })])]), [['a', 'at-risk', ['discard']]])
  assert.deepEqual(states([repo(HUB, [tree(HUB, 'a', carried)]), repo(API, [tree(API, 'a', { unpushed: 1 })])]), [['a', 'at-risk', ['discard']]])
  assert.deepEqual(floorWorktrees('lab', [repo(HUB, [tree(HUB, 'a', { unpushed: 1 })])], [], false)[0].verbs, [], 'discard notes on a thread: none on a floor keeping none')
})

test('discard carries what each repo held as shown', () => {
  const [w] = floorWorktrees('lab', [repo(HUB, [tree(HUB, 'a', { dirty: 2 })]), repo(API, [tree(API, 'a', { head: 'def' })])], [], true)
  assert.deepEqual(w.calls.discard, ['worktree/discard', { project: 'lab', name: 'a', held: [{ dir: HUB, head: 'abc', dirty: 2 }, { dir: API, head: 'def', dirty: 0 }] }])
})

test('a kept branch carried in every repo that has it is deletable on its own, and never absorbed', () => {
  const kept = (over: object) => [{ branch: 'tower/k', base: 'origin/main', unpushed: 1, absorbed: false, risk: [], ...over }]
  const [b] = floorBranches('lab', [repo(HUB, [], kept({ carried: { commits: 1, edited: 1 } })), repo(API, [], kept({ absorbed: true }))])
  assert.deepEqual([b.absorbed, b.carried, b.verbs], [false, true, ['recut', 'delete']])
})
