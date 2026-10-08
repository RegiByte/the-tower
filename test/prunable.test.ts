import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { board } from '../src/bridge/board.ts'
import { STUCK_MS } from '../src/bridge/prunable.ts'
import type { RepoRead } from '../src/bridge/worktrees.ts'
import type { Resource } from '../src/bridge/resources.ts'
import type { Config, SessionLog } from '../src/shared/model.ts'
import { HOST_PROTOCOL } from '../src/shared/protocol.ts'
import { fixture } from './replay.ts'

const PATHS = { config: '/config.json', collections: '/c' }
const CONFIG: Config = { argv: ['claude'], env: {}, projects: { tower: { name: 'tower', hub: '/hub', repos: [] }, lab: { name: 'lab', hub: '/lab', repos: [] }, rec: { name: 'rec', hub: '/tmp/mc-prometheus-30/work', repos: [] } } }

/** The log up to second `t`, the session still running. */
const until = (log: SessionLog, t: number): SessionLog => ({ ...log, events: log.events.filter((e) => e[0] <= t) })

const at = (log: SessionLog, seconds: number) => log.header.startedAt + seconds * 1000

/** The floor of `log`'s project at `now`, its session running when `live`. */
const floorAt = (log: SessionLog, now: number, live: boolean, running: Resource[] = []) =>
  board(CONFIG, [{ header: log.header, facts: factsOf(log) }], { ids: new Set(live ? [log.header.id] : []), protocol: HOST_PROTOCOL }, running, [], [], [], [], new Map(), new Map(), PATHS, now).floors.find(
    (f) => f.id === log.header.project,
  )!

const left = (log: SessionLog, pid: number, orphan: boolean): Resource => ({ pid, session: log.header.id, command: 'node server.js', ports: [5173], orphan })

test("every process of a session that no longer runs is Tidy's to reap, orphaned or not; a running session's never", () => {
  const log = fixture('tool-turn')
  const running = [left(log, 41, true), left(log, 42, false)]
  const ended = floorAt(log, at(log, 300), false, running)
  assert.deepEqual(ended.tidy.prune, [{ t: 'reap', id: log.header.id, pid: 41 }, { t: 'reap', id: log.header.id, pid: 42 }])
  assert.ok(ended.verbs.includes('tidy'))
  assert.deepEqual(ended.calls.tidy, ['tidy', { project: log.header.project, plan: ended.tidy }])
  const working = floorAt(until(log, 15), at(log, 15), true, running)
  assert.deepEqual(working.tidy.prune, [])
  assert.ok(!working.verbs.includes('tidy'))
})

const HUB = '/hub'
const TREE = 'odin-42'

/**
 * `log` as a worker hired by `interrupt-says`, in worktree odin-42 of the tower floor, or in its main checkout. The hirer
 * has exited unless `upTo` cuts its log short.
 */
const hired = (log: SessionLog, where: 'worktree' | 'main', upTo = Infinity): SessionLog[] => {
  const hirer = until(fixture('interrupt-says'), upTo)
  return [
    { ...hirer, events: [...hirer.events, [1, 'h', { hook_event_name: 'tower.hire', id: log.header.id }]] },
    { ...log, header: { ...log.header, project: 'tower', cwd: where === 'worktree' ? `${HUB}/.worktrees/${TREE}` : HUB } },
  ]
}

/** Git's read of the tower floor's hub: worktree odin-42 with its work landed or not. */
const repos = (absorbed: boolean, dirty: number) =>
  new Map<string, RepoRead>([
    [HUB, { dir: HUB, git: true, bases: [], main: { dirty: 0, ahead: 0 }, trees: [{ name: TREE, path: `${HUB}/.worktrees/${TREE}`, branch: `tower/${TREE}`, present: true, dirty, unpushed: absorbed ? 0 : 1, absorbed, risk: [] }], kept: [] }],
  ])

/** The tower floor at `now` with `logs`, the last of them running, and every one when `allLive`. */
const towerAt = (logs: SessionLog[], now: number, read: Map<string, RepoRead>, allLive = false) =>
  board(
    CONFIG,
    logs.map((log) => ({ header: log.header, facts: factsOf(log) })),
    { ids: new Set((allLive ? logs : logs.slice(-1)).map((log) => log.header.id)), protocol: HOST_PROTOCOL },
    [], [], [], [], [], read, new Map(), PATHS, now,
  ).floors.find((f) => f.id === 'tower')!

const DAY = 24 * 60 * 60 * 1000

test('a worker the user started is never offered for a kill, however long it sits idle', () => {
  const log = until(fixture('tool-turn'), 5)
  const floor = towerAt([log], at(log, 0) + 10 * DAY, repos(true, 0))
  assert.deepEqual([floor.cards[0].status, floor.cards[0].hiredBy, floor.tidy.prune], ['idle', undefined, []])
})

test('a hire whose work has landed is offered for a kill as soon as it is quiet, from when it went quiet', () => {
  const log = until(fixture('tool-turn'), 5)
  const idleAt = at(log, 0.852)
  const floor = towerAt(hired(log, 'worktree'), idleAt, repos(true, 0))
  const hire = floor.cards.find((c) => c.id === log.header.id)!
  assert.ok(hire.hiredBy)
  assert.deepEqual(floor.tidy.prune, [{ t: 'kill', id: log.header.id, since: idleAt }])
})

test('a hire whose work has not landed, or that works in the main checkout, is never offered', () => {
  const log = until(fixture('tool-turn'), 5)
  const later = at(log, 0) + DAY
  assert.deepEqual(towerAt(hired(log, 'worktree'), later, repos(false, 0)).tidy.prune, [])
  assert.deepEqual(towerAt(hired(log, 'worktree'), later, repos(true, 1)).tidy.prune, [])
  assert.deepEqual(towerAt(hired(log, 'main'), later, repos(true, 0)).tidy.prune, [])
})

test('typing into an idle hire moves when it went quiet', () => {
  const log = until(fixture('interrupts'), 158.6)
  const typedAt = at(log, 158.592)
  const floor = towerAt(hired(log, 'worktree'), typedAt, repos(true, 0))
  assert.equal(floor.cards.find((c) => c.id === log.header.id)!.status, 'idle')
  assert.deepEqual(floor.tidy.prune, [{ t: 'kill', id: log.header.id, since: typedAt }])
})

test("a finished hire whose work has landed is offered with its answer unread: its hirer's or the user's", () => {
  const log = until(fixture('tool-turn'), 30)
  const doneAt = at(log, 18.298)
  const prompt = 'List the files in src/bridge with ls, then tell me in one sentence what status.ts does.'
  const launched = { ...log, header: { ...log.header, argv: [...log.header.argv, '--', prompt] } }
  const forHirer = towerAt(hired(launched, 'worktree', 10), at(log, 0) + DAY, repos(true, 0), true)
  const holding = forHirer.cards.find((c) => c.id === log.header.id)!
  assert.deepEqual([holding.status, holding.waitsOn?.callsign !== undefined, forHirer.tidy.prune], ['done', true, [{ t: 'kill', id: log.header.id, since: doneAt }]])
  const forUser = towerAt(hired(log, 'worktree'), at(log, 0) + DAY, repos(true, 0))
  const waiting = forUser.cards.find((c) => c.id === log.header.id)!
  assert.deepEqual([waiting.waiting, forUser.tidy.prune], [true, [{ t: 'kill', id: log.header.id, since: doneAt }]])
  assert.deepEqual(towerAt(hired(log, 'worktree'), at(log, 0) + DAY, repos(false, 0)).tidy.prune, [])
})

test('a hire asking a question is never offered, its work landed or not', () => {
  const log = until(fixture('permission-answered'), 30)
  const floor = towerAt(hired(log, 'worktree'), at(log, 0) + DAY, repos(true, 0))
  assert.deepEqual([floor.cards.find((c) => c.live)!.status, floor.tidy.prune], ['needs_input', []])
})

test('a worker working with no word from Claude for twenty minutes is stuck, and never offered for a kill', () => {
  const log = until(fixture('tool-turn'), 15)
  const heardAt = floorAt(log, at(log, 15), true).cards[0].heardAt!
  assert.equal(floorAt(log, heardAt + STUCK_MS - 1, true).cards[0].stuck, false)
  const stuck = floorAt(log, heardAt + STUCK_MS, true)
  assert.deepEqual([stuck.cards[0].status, stuck.cards[0].stuck, stuck.tidy.prune], ['working', true, []])
})
