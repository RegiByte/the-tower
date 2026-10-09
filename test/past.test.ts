import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Card, Floor } from '../src/bridge/board.ts'
import { pastCrews, pastMatching, pastSize, type PastCrew } from '../src/shared/cards.ts'

/** A past card with only what the archive's order reads: its start, whom it reports to, who carried it on, its prompt. */
const card = (id: string, startedAt: number, more: Partial<Card> = {}): Card =>
  ({ id, callsign: id.toUpperCase(), startedAt, onDuty: false, conversations: [{ prompt: `${id} prompt` }], ...more }) as Card

const floor = (cards: Card[]) => ({ cards }) as Floor

/** Crews as indented lines, in the order they are drawn: each crew above the worker it reports to. */
const lines = (crews: PastCrew[], depth = 0): string[] =>
  crews.flatMap(({ card, crew }) => [...lines(crew, depth + 1), `${'  '.repeat(depth)}${card.callsign}`])

test('the archive goes by crew: hires above the worker they report to, crews and siblings by their latest start, the newest first', () => {
  const lead = card('lead', 10)
  const a = card('a', 20, { reportsTo: 'lead' })
  const b = card('b', 30, { reportsTo: 'lead' })
  const a1 = card('a1', 40, { reportsTo: 'a' })
  const solo = card('solo', 35)
  const old = card('old', 5)
  const crews = pastCrews(floor([b, old]), [lead, a, a1, solo])
  assert.deepEqual(lines(crews), ['    A1', '  A', '  B', 'LEAD', 'SOLO', 'OLD'])
  assert.equal(pastSize(crews), 6)
})

test("a hire whose hirer is not past heads its own crew; a worker's earlier lives follow its latest one", () => {
  const hire = card('hire', 20, { reportsTo: 'on-duty' })
  const first = card('lead', 10, { continuedBy: { id: 'lead-2', callsign: 'LEAD' } })
  const second = card('lead-2', 30, { callsign: 'LEAD' })
  const theirs = card('theirs', 25, { reportsTo: 'lead-2' })
  assert.deepEqual(lines(pastCrews(floor([]), [hire, first, second, theirs])), ['  THEIRS', 'LEAD', 'LEAD', 'HIRE'])
})

test('a filter keeps the crew order: a matching hire of a worker that does not match takes its place', () => {
  const chief = card('chief', 10)
  const a = card('a', 20, { reportsTo: 'chief' })
  const a1 = card('a1', 40, { reportsTo: 'a' })
  const crews = pastCrews(floor([]), [chief, a, a1])
  assert.deepEqual(lines(pastMatching(crews, ['a1'])), ['A1'])
  assert.deepEqual(lines(pastMatching(crews, ['prompt'])), lines(crews))
  const lifted = pastMatching(crews, ['a'])
  assert.deepEqual(lines(lifted), ['  A1', 'A'])
})
