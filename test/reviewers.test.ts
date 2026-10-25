import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { board, type Card } from '../src/bridge/board.ts'
import { CALLSIGNS, callsigns } from '../src/shared/callsign.ts'
import { exemptFromHiring, hireRefusal, hiresOf } from '../src/shared/crews.ts'
import type { Config, LogEvent, SessionLog } from '../src/shared/model.ts'
import { HOST_PROTOCOL } from '../src/shared/protocol.ts'
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

const cardsOf = (logs: SessionLog[]): Card[] =>
  board(viewOf(CONFIG, { sessions: logs.map((log) => ({ header: log.header, facts: factsOf(log) })), host: { ids: new Set(logs.map((l) => l.header.id)), protocol: HOST_PROTOCOL } })).floors.flatMap((f) => f.cards)

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
    const b = board(viewOf(CONFIG, { sessions: logs.map((log) => ({ header: log.header, facts: factsOf(log) })), host: { ids: new Set(logs.map((l) => l.header.id)), protocol: HOST_PROTOCOL } }))
    const cards = b.floors.flatMap((f) => f.cards)
    return hireRefusal(cards, b.floors[0], cards.find((c) => c.id === AUTHOR)!)
  }
  assert.equal(refusal([author, legacy, withFacts]), undefined)
  assert.match(refusal(all)!, new RegExp(`${AUTHOR_CALLSIGN}'s hires ${callsign(plain.header.id)} still run`))
})
