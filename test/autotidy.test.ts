import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { board, type Floor } from '../src/bridge/board.ts'
import type { RepoRead } from '../src/bridge/worktrees.ts'
import type { Resource } from '../src/bridge/resources.ts'
import type { Config, SessionLog } from '../src/shared/model.ts'
import { HOST_PROTOCOL } from '../src/shared/protocol.ts'
import { eachEntry, fresh, GOING_MS, goingHome, leftBoard, planOf, type Going, type Part } from '../extensions/autotidy/plan.ts'
import { fixture } from './replay.ts'
import { viewOf } from './view.ts'

const HUB = '/hub'
const TREE = 'odin-42'
const BRANCH = `tower/${TREE}`
const CONFIG: Config = { argv: ['claude'], env: {}, projects: { tower: { name: 'tower', hub: HUB, repos: [] } } }
const DAY = 24 * 60 * 60 * 1000
const ALL = { reap: true, worktrees: true, branches: true, extensions: true }

const until = (log: SessionLog, t: number): SessionLog => ({ ...log, events: log.events.filter((e) => e[0] <= t) })
const at = (log: SessionLog, seconds: number) => log.header.startedAt + seconds * 1000
const inTree = (log: SessionLog): SessionLog => ({ ...log, header: { ...log.header, project: 'tower', cwd: `${HUB}/.worktrees/${TREE}` } })
const left = (log: SessionLog, pid: number): Resource => ({ pid, session: log.header.id, command: 'node server.js', ports: [5173], orphan: false })
/** When `log`'s session ended: its exit event. */
const endOf = (log: SessionLog) => at(log, log.events.at(-1)![0])

/** Git's read of the hub: worktree odin-42, clean and landed. */
const REPOS = new Map<string, RepoRead>([
  [HUB, { dir: HUB, git: true, bases: [], originHead: undefined, main: { dirty: 0, ahead: 0 }, trees: [{ name: TREE, path: `${HUB}/.worktrees/${TREE}`, branch: BRANCH, present: true, dirty: 0, unpushed: 0, absorbed: true, risk: [] }], kept: [] }],
])

/** The tower floor at `now` with `logs`, those in `live` running, `running` the processes left, and autotidy's part going `going`. */
const floorAt = (logs: SessionLog[], now: number, live: SessionLog[], running: Resource[] = [], going?: Going[], settings = ALL): Floor => {
  const f = board(
    viewOf(CONFIG, {
      sessions: logs.map((log) => ({ header: log.header, facts: factsOf(log) })),
      host: { ids: new Set(live.map((log) => log.header.id)), protocol: HOST_PROTOCOL },
      repos: REPOS,
      processes: running,
      now,
    }),
  ).floors.find((f) => f.id === 'tower')!
  return going ? { ...f, x: { autotidy: { ...settings, going } satisfies Part } } : f
}

const GOING: Going = { sessions: [], checkout: TREE, branch: BRANCH }

test('a worker that stopped is going home for two minutes after its end, with the sessions it ran as, its checkout and its branch', () => {
  const log = inTree(fixture('tool-turn'))
  const end = endOf(log)
  const going = [{ ...GOING, sessions: [log.header.id] }]
  assert.deepEqual(goingHome(floorAt([log], end + 1000, []), end + 1000), going)
  assert.deepEqual(goingHome(floorAt([log], end + GOING_MS, []), end + GOING_MS), [])
  assert.deepEqual(goingHome(floorAt([until(log, 15)], at(log, 15), [log]), at(log, 15)), [])
})

test('a running worker the board stops carrying as it ends went home, and what it left is planned on that board; one resumed did not', () => {
  const log = inTree(fixture('tool-turn'))
  const running = floorAt([until(log, 15)], at(log, 15), [log])
  const after = endOf(log) + DAY
  const gone = floorAt([log], after, [], [], [])
  assert.deepEqual(gone.cards, [])
  const going = [{ ...GOING, sessions: [log.header.id] }]
  assert.deepEqual(leftBoard(running, gone), going)
  assert.deepEqual(planOf(gone, [{ cap: 'reviews', key: TREE, label: TREE, checkout: TREE }], going), { worktrees: [TREE], branches: [], prune: [], x: { reviews: [TREE] } })
  const resumer = { ...running.cards[0], id: 'resumer', lineage: [{ id: log.header.id, startedAt: log.header.startedAt }, { id: 'resumer', startedAt: after }] }
  assert.deepEqual(leftBoard(running, { ...gone, cards: [resumer] }), [])
  assert.deepEqual(leftBoard(gone, gone), [])
})

test('a stranded worker is not going home: on duty until resumed or let go, and not when found unresumable later', () => {
  const log = inTree(fixture('host-stopped-done'))
  const end = endOf(log)
  const stranded = floorAt([log], end + 1000, [])
  assert.equal(stranded.cards[0].onDuty, true)
  assert.deepEqual(goingHome(stranded, end + 1000), [])
  const unresumable = { ...stranded, cards: stranded.cards.map((c) => ({ ...c, onDuty: false })) }
  assert.deepEqual(goingHome(unresumable, end + 1000), [])
  const letGo = { ...stranded, cards: stranded.cards.map((c) => ({ ...c, onDuty: false, letGoAt: end + DAY })) }
  assert.deepEqual(goingHome(letGo, end + DAY + 1000), [{ ...GOING, sessions: [log.header.id] }])
})

test('what is planned is the going workers\' part of Tidy, as the settings say: nothing of a worker not going', () => {
  const log = inTree(fixture('tool-turn'))
  const later = endOf(log) + DAY
  const going = [{ ...GOING, sessions: [log.header.id] }]
  const seen = planOf(floorAt([log], later, [], [left(log, 41)], going), [])
  assert.deepEqual([seen.worktrees, seen.prune], [[TREE], [{ t: 'reap', id: log.header.id, pid: 41 }]])
  assert.deepEqual(planOf(floorAt([log], later, [], [left(log, 41)], []), []), { worktrees: [], branches: [], prune: [], x: {} })
  const reapOnly = planOf(floorAt([log], later, [], [left(log, 41)], going, { ...ALL, worktrees: false }), [])
  assert.deepEqual([reapOnly.worktrees, reapOnly.prune.length], [[], 1])
})

test("an extension's entry naming the checkout is planned; one naming none, another checkout, or autotidy's own, never", () => {
  const log = inTree(fixture('tool-turn'))
  const later = endOf(log) + DAY
  const going = [{ ...GOING, sessions: [log.header.id] }]
  const entry = (cap: string, key: string, checkout?: string) => ({ cap, key, label: key, ...(checkout && { checkout }) })
  const entries = [entry('reviews', TREE, TREE), entry('reviews', 'other', 'other'), entry('reviews', 'unowned'), entry('autotidy', 'own', TREE)]
  assert.deepEqual(planOf(floorAt([log], later, [], [], going), entries).x, { reviews: [TREE] })
  assert.deepEqual(planOf(floorAt([log], later, [], [], going, { ...ALL, extensions: false }), entries).x, {})
})

test('while another on duty shares the checkout, its processes, worktree and entries wait', () => {
  const log = inTree(fixture('tool-turn'))
  const sharer = inTree(until(fixture('interrupt-says'), 10))
  const later = endOf(log) + DAY
  const going = [{ ...GOING, sessions: [log.header.id] }]
  const plan = planOf(floorAt([log, sharer], later, [sharer], [left(log, 41)], going), [{ cap: 'reviews', key: TREE, label: TREE, checkout: TREE }])
  assert.deepEqual(plan, { worktrees: [], branches: [], prune: [], x: {} })
})

test('a plan is asked for once: only what came to qualify since the last board', () => {
  const before = { worktrees: [TREE], branches: [], prune: [{ t: 'reap' as const, id: 's', pid: 1 }], x: { reviews: [TREE] } }
  const after = { worktrees: [TREE, 'b'], branches: [BRANCH], prune: [{ t: 'reap' as const, id: 's', pid: 1 }, { t: 'reap' as const, id: 's', pid: 2 }], x: { reviews: [TREE, 'b'] } }
  assert.deepEqual(fresh(before, after), { worktrees: ['b'], branches: [BRANCH], prune: [{ t: 'reap', id: 's', pid: 2 }], x: { reviews: ['b'] } })
  assert.deepEqual(fresh(after, after), { worktrees: [], branches: [], prune: [], x: {} })
})

test('a plan is asked for an entry a call, so a stale one is refused alone', () => {
  const plan = { worktrees: [TREE], branches: [BRANCH], prune: [{ t: 'reap' as const, id: 's', pid: 1 }, { t: 'reap' as const, id: 's', pid: 2 }], x: { reviews: [TREE] } }
  const none = { worktrees: [], branches: [], prune: [], x: {} }
  assert.deepEqual(eachEntry(plan), [
    { ...none, worktrees: [TREE] },
    { ...none, branches: [BRANCH] },
    { ...none, prune: [{ t: 'reap', id: 's', pid: 1 }] },
    { ...none, prune: [{ t: 'reap', id: 's', pid: 2 }] },
    { ...none, x: { reviews: [TREE] } },
  ])
  assert.deepEqual(eachEntry(none), [])
})
