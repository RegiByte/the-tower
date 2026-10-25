import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { factsOf } from '../src/bridge/facts.ts'
import { board, type Board, type Card } from '../src/bridge/board.ts'
import { foldBoard, type Folder } from '../src/bridge/folds.ts'
import { projectLegacy } from '../src/bridge/legacy.ts'
import { CALLSIGNS, callsigns } from '../src/shared/callsign.ts'
import { exemptFromHiring, hireRefusal, hiresOf } from '../src/shared/crews.ts'
import type { Config, LogEvent, SessionLog } from '../src/shared/model.ts'
import type { StartCtx, Started } from '../src/shared/extensions.ts'
import { HOST_PROTOCOL } from '../src/shared/protocol.ts'
import startReviews from '../extensions/reviews/server.ts'
import type { RepoRead, TreeRead } from '../src/bridge/worktrees.ts'
import { fixture } from './replay.ts'
import { viewOf } from './view.ts'

const callsign = callsigns(CALLSIGNS)

const CONFIG: Config = { argv: ['claude'], env: {}, projects: { tower: { name: 'tower', hub: '/hub', repos: [], hiring: { depth: 2, live: 1 } } } }

const AUTHOR = '20261004-100000-aaaa'
const AUTHOR_CALLSIGN = callsign(AUTHOR)

/** A session started at minute `m` with `prompt` as its launch prompt, or resumed (`--resume`) without one. */
const session = (id: string, m: number, prompt: string | undefined, events: LogEvent[] = []): SessionLog => ({
  header: { id, project: 'tower', cwd: '/hub', argv: prompt === undefined ? ['claude', '--resume', 'c'] : ['claude', '--', prompt], startedAt: Date.UTC(2026, 9, 4, 10, m), cols: 80, rows: 24 },
  events,
})

const hires = (...ids: string[]): LogEvent[] => ids.map((id) => [1, 'h', { hook_event_name: 'tower.hire', id }])

/** A reviewer as every one was spawned before reviews logged its facts: only its first prompt says so. */
const legacy = session('20261004-100100-bbbb', 1, `/tower:review ${AUTHOR_CALLSIGN} tell`)

/** A reviewer `reviews/hire` spawned: its prompt, the `of` field's fact and the core facts its launch contributor gave. */
const withFacts = session('20261004-100200-cccc', 2, `/tower:review ${AUTHOR_CALLSIGN}`, [
  [0, 'h', { hook_event_name: 'tower.x.reviews.of', value: AUTHOR_CALLSIGN }],
  [0, 'h', { hook_event_name: 'tower.exempt', from: 'hiring', by: 'reviews' }],
  [0, 'h', { hook_event_name: 'tower.reports-to', callsign: AUTHOR_CALLSIGN, session: AUTHOR, by: 'reviews' }],
])

/** A fork of that reviewer: the extension fact copied, the exemption and crew edge left behind, no prompt. */
const fork = session('20261004-100300-dddd', 3, undefined, [[0, 'h', { hook_event_name: 'tower.x.reviews.of', value: AUTHOR_CALLSIGN }]])

/** A plain hire whose prompt names the skill mid-text. */
const plain = session('20261004-100400-eeee', 4, `When you are done, run /tower:review ${AUTHOR_CALLSIGN} on yourself.`)

const author = session(AUTHOR, 0, 'Build the thing.', hires(legacy.header.id, withFacts.header.id, plain.header.id))

/** The bundled reviews extension as the fold pass reads it, its facts read from each card's lineage. */
const reviewsFolder = (logs: SessionLog[]): Folder => ({
  id: 'reviews',
  cap: 'reviews',
  requires: [],
  wants: [],
  off: [],
  specs: new Map([['card', { x: z.unknown(), adds: ['actions'] }]]),
  folds: { card: (startReviews({} as StartCtx) as Started).folds!.card },
  commands: [],
  verbs: new Map([['reviews', new Set(['hire', 'append'])]]),
  settings: () => undefined,
  own: ({ lineage = [] }) => ({
    streams: {},
    collections: {},
    facts: logs
      .filter((log) => lineage.includes(log.header.id))
      .flatMap((log) => factsOf(log).extensionFacts.filter(([, cap]) => cap === 'reviews').map(([t, , name, value]) => ({ name, value, at: log.header.startedAt + t * 1000, session: log.header.id }))),
  }),
})

/** The board as renderers read it: the core's, folded by the reviews extension, its moved parts copied back to their old fields. */
const boardOf = (logs: SessionLog[], repos = new Map<string, RepoRead>(), live = logs.map((l) => l.header.id)): Board => {
  const core = board(viewOf(CONFIG, { sessions: logs.map((log) => ({ header: log.header, facts: factsOf(log) })), host: { ids: new Set(live), protocol: HOST_PROTOCOL }, repos }))
  return projectLegacy(foldBoard({ board: core, callsignOf: () => undefined, folders: [reviewsFolder(logs)], subjects: new Map(), now: 0, clock: () => 0 }).board)
}

const cardsOf = (logs: SessionLog[]): Card[] => boardOf(logs).floors.flatMap((f) => f.cards)

const all = [author, legacy, withFacts, fork, plain]

test('a reviewer, whether its prompt or its facts say so, reviews its author, reports to it, sits beside it and is exempt from hiring; a fork of one and a prompt naming the skill mid-text are neither', () => {
  const cards = cardsOf(all)
  const card = (log: SessionLog) => cards.find((c) => c.id === log.header.id)!
  const authorCard = card(author)
  assert.deepEqual(
    [legacy, withFacts, fork, plain].map((log) => {
      const c = card(log)
      return { reviews: c.reviews, reportsTo: c.reportsTo, beside: c.seat && 'beside' in c.seat ? c.seat.beside : undefined, exempt: exemptFromHiring(c) }
    }),
    [
      { reviews: AUTHOR_CALLSIGN, reportsTo: AUTHOR, beside: AUTHOR, exempt: true },
      { reviews: AUTHOR_CALLSIGN, reportsTo: AUTHOR, beside: undefined, exempt: true },
      { reviews: undefined, reportsTo: undefined, beside: undefined, exempt: false },
      { reviews: undefined, reportsTo: AUTHOR, beside: undefined, exempt: false },
    ],
  )
  assert.deepEqual(hiresOf(cards, authorCard).map((c) => c.id), [legacy.header.id, withFacts.header.id, plain.header.id])
})

test('a reviewer spawned with its facts sits beside its author while no other reviewer does', () => {
  const cards = cardsOf([author, withFacts])
  assert.deepEqual(cards.find((c) => c.id === withFacts.header.id)!.seat, { beside: AUTHOR })
})

test('reviewers never count against the hiring limit: the author is refused only for its plain hire', () => {
  const refusal = (logs: SessionLog[]) => {
    const b = boardOf(logs)
    const cards = b.floors.flatMap((f) => f.cards)
    return hireRefusal(cards, b.floors[0], cards.find((c) => c.id === AUTHOR)!)
  }
  assert.equal(refusal([author, legacy, withFacts]), undefined)
  assert.match(refusal(all)!, new RegExp(`${AUTHOR_CALLSIGN}'s hires ${callsign(plain.header.id)} still run`))
})

test("a reviewer spawned before reviews logged its facts reads as one spawned with them: in its author's crew and exempt from hiring, by reviews", () => {
  const cards = cardsOf(all)
  const read = (log: SessionLog) => {
    const { crew, exempt, x } = cards.find((c) => c.id === log.header.id)!
    return { crew, exempt, of: (x?.reviews as { of?: string } | undefined)?.of }
  }
  const reviewer = { crew: { callsign: AUTHOR_CALLSIGN, session: AUTHOR, by: 'reviews' }, exempt: [{ from: 'hiring', by: 'reviews' }], of: AUTHOR_CALLSIGN }
  assert.deepEqual([read(legacy), read(withFacts)], [reviewer, reviewer])
  assert.deepEqual([read(fork), read(plain)], [{ crew: undefined, exempt: undefined, of: undefined }, { crew: undefined, exempt: undefined, of: undefined }])
})

test("reviews offers Review on a worker whose work goes on, in a floor of git repos, copied back as the card verb `review` and its old call; never on a reviewer, nor once the work landed or its checkout is gone", () => {
  const tree: TreeRead = { name: 'odin-42', path: '/hub/.worktrees/odin-42', branch: 'tower/odin-42', present: true, dirty: 0, unpushed: 1, absorbed: false, against: 'origin/main', risk: [] }
  const reads = (trees: TreeRead[]) => new Map<string, RepoRead>([['/hub', { dir: '/hub', git: true, bases: ['origin/main'], main: { dirty: 0, ahead: 0 }, trees, kept: [] }]])
  const at = (cwd: string): SessionLog => {
    const log = fixture('tool-turn')
    return { ...log, header: { ...log.header, project: 'tower', cwd } }
  }
  const offered = (log: SessionLog, repos: Map<string, RepoRead>) => {
    const b = boardOf([log], repos, [])
    const c = b.floors[0].cards[0]
    return { action: b.adds[`card:${c.id}`]?.actions, review: c.calls.review }
  }
  const main = offered(at('/hub'), reads([]))
  const name = callsign(at('/hub').header.id)
  assert.deepEqual(main, {
    action: [{ verb: 'reviews/hire', call: { project: 'tower', of: name }, cap: 'reviews' }],
    review: ['spawn', { project: 'tower', cut: { from: 'main' }, prompt: `/tower:review ${name}` }],
  })
  const inTree = at(tree.path)
  assert.equal(offered(inTree, reads([tree])).action?.length, 1)
  assert.deepEqual(offered(inTree, reads([{ ...tree, absorbed: true }])), { action: undefined, review: undefined })
  assert.deepEqual(offered(inTree, reads([{ ...tree, present: false }])), { action: undefined, review: undefined })
  assert.deepEqual(offered(inTree, reads([])), { action: undefined, review: undefined })
  const reviewer = { ...at('/hub'), header: { ...at('/hub').header, argv: ['claude', '--', `/tower:review ${AUTHOR_CALLSIGN}`] } }
  assert.deepEqual(offered(reviewer, reads([])), { action: undefined, review: undefined })
})
