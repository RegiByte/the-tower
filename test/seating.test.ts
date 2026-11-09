import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { allCards, archiveOf, board, type Board, type Card } from '../src/bridge/board.ts'
import { factsOf } from '../src/bridge/facts.ts'
import type { Config, SessionLog } from '../src/shared/model.ts'
import { HOST_PROTOCOL } from '../src/shared/protocol.ts'
import { FIXTURES_DIR } from '../scripts/tower3d-fixtures.ts'
import type { FixtureFile } from '../renderers/tower3d/src/fixture-file.ts'
import { buildingSeats, historyFrom, seatsOf } from '../renderers/tower3d/src/seating.ts'
import { galleryOf } from '../renderers/tower3d/src/showings.ts'
import { fixture } from './replay.ts'
import { viewOf } from './view.ts'

const DAY = 86_400_000

/** Each floor's history, by project: the board's cards and its archive's, as Tower 3D's `historyOf` joins them. */
const historiesOf = (b: Board, archive: (project: string) => Card[]) => new Map(b.floors.map((f) => [f.id, historyFrom(f.cards, archive(f.id))]))

/** What Tower 3D derives from the histories, beside what the bridge put on the board. */
function derivedBeside(b: Board, archive: (project: string) => Card[]) {
  const histories = historiesOf(b, archive)
  const seats = buildingSeats(histories)
  return {
    derived: { seats: b.floors.flatMap((f) => f.cards.map((c) => [c.id, seats.get(c.id)])), galleries: b.floors.map((f) => galleryOf(histories.get(f.id)!)) },
    bridge: { seats: b.floors.flatMap((f) => f.cards.map((c) => [c.id, c.seat])), galleries: b.floors.map((f) => f.gallery) },
  }
}

/** The bridge's seats and galleries as recorded, with the session fixtures they were recorded from: a fixture added later changes neither. */
const { sessionFixtures, cases: frozen }: { sessionFixtures: string[]; cases: Record<string, ReturnType<typeof derivedBeside>['bridge']> } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures', 'seating-frozen.json'), 'utf8'),
)
const sessionLogs = sessionFixtures.map((name) => fixture(name))

const configFor = (logs: SessionLog[]): Config => ({
  argv: ['claude'],
  env: {},
  projects: Object.fromEntries([...new Set(logs.map((l) => l.header.project))].map((id) => [id, { name: id, hub: `/${id}`, repos: [] }])),
})

/** Every fixture log on one system, every other one still running, at `now`. */
const fixtureView = (now: number) =>
  viewOf(configFor(sessionLogs), {
    sessions: sessionLogs.map((log) => ({ header: log.header, facts: factsOf(log) })),
    host: { ids: new Set(sessionLogs.filter((_, i) => i % 2 === 0).map((l) => l.header.id)), protocol: HOST_PROTOCOL },
    now,
  })

/** The derivation is the bridge's now, and the bridge's as frozen then (a card with no seat is `null` in the data). */
function assertSeating(label: string, b: Board, archive: (project: string) => Card[]) {
  const { derived, bridge } = derivedBeside(b, archive)
  assert.deepEqual(derived, bridge, label)
  assert.deepEqual(JSON.parse(JSON.stringify(derived)), frozen[label], `${label}, against the frozen expectations`)
  ran.push(label)
}

const ran: string[] = []
test.after(() => assert.deepEqual(ran.toSorted(), Object.keys(frozen).toSorted(), 'every frozen case ran, and every case that ran is frozen'))

test("Tower 3D's seats and galleries, derived from each floor's board and archive, are the bridge's on every session fixture", () => {
  const latest = Math.max(...sessionLogs.map((l) => l.header.startedAt))
  for (const now of [0, latest + 2 * DAY]) {
    const view = fixtureView(now)
    const cards = allCards(view)
    assertSeating(now === 0 ? 'sessions at the epoch' : 'sessions two days after the latest', board(view), (project) => archiveOf(cards, project, now))
  }
})

test("Tower 3D's seats and galleries, derived from each floor's board and archive, are the bridge's on every Tower 3D fixture board", () => {
  for (const file of readdirSync(FIXTURES_DIR)) {
    const { boards }: FixtureFile = JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), 'utf8'))
    for (const [i, { board: b, archive }] of boards.entries()) {
      assertSeating(`${file}, board ${i}`, b, (project) => archive.filter((c) => c.project === project))
    }
  }
})

test('a long-running worker keeps its desk at midnight, when the worker who came before it leaves the board for the archive', () => {
  const day = Date.UTC(2026, 9, 4)
  const session = (id: string, hour: number, exitAfter?: number): SessionLog => ({
    header: { id, project: 'tower', cwd: '/hub', argv: ['claude'], startedAt: day + hour * 3_600_000, cols: 80, rows: 24 },
    events: exitAfter === undefined ? [] : [[exitAfter, 'x', { exitCode: 0 }]],
  })
  const early = session('20261004-100000-aaaa', 10, 5 * 3600)
  const long = session('20261004-110000-bbbb', 11)
  const now = day + 2 * DAY
  const view = viewOf(configFor([early, long]), {
    sessions: [early, long].map((log) => ({ header: log.header, facts: factsOf(log) })),
    host: { ids: new Set([long.header.id]), protocol: HOST_PROTOCOL },
    now,
  })
  const [floor] = board(view).floors
  const archive = archiveOf(allCards(view), 'tower', now)
  assert.deepEqual([floor.cards.map((c) => c.id), archive.map((c) => c.id)], [[long.header.id], [early.header.id]])
  const history = historyFrom(floor.cards, archive)
  assert.deepEqual(seatsOf(history, history).get(long.header.id), { n: 1 }, 'the history keeps it at the workstation it took beside the earlier worker')
  assert.deepEqual(seatsOf(floor.cards, floor.cards).get(long.header.id), { n: 0 }, 'the board alone would move it to the one the earlier worker left')
})

test("a board built just before midnight, with its archive served just after, keeps the bridge's seat: the board's card counts once", () => {
  const day = new Date(2026, 9, 4).getTime()
  const session = (id: string, hour: number, exitAfter?: number): SessionLog => ({
    header: { id, project: 'tower', cwd: '/hub', argv: ['claude'], startedAt: day + hour * 3_600_000, cols: 80, rows: 24 },
    events: exitAfter === undefined ? [] : [[exitAfter, 'x', { exitCode: 0 }]],
  })
  const early = session('20261004-100000-aaaa', 10, 5 * 3600)
  const long = session('20261004-110000-bbbb', 11)
  const at = (now: number) =>
    viewOf(configFor([early, long]), { sessions: [early, long].map((log) => ({ header: log.header, facts: factsOf(log) })), host: { ids: new Set([long.header.id]), protocol: HOST_PROTOCOL }, now })
  const midnight = day + DAY
  const [floor] = board(at(midnight - 1000)).floors
  const history = historyFrom(floor.cards, archiveOf(allCards(at(midnight + 1000)), 'tower', midnight + 1000))
  assert.deepEqual(seatsOf(history, history).get(long.header.id), floor.cards.find((c) => c.id === long.header.id)!.seat)
})
