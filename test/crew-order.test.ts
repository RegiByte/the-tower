import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board, Card, Floor } from '../src/bridge/board.ts'
import { crewTreeIn, orderMoving, workerKeyOf } from '../src/shared/crews.ts'

/**
 * A card with only what a floor's crew order reads: its session, whether it is on duty, whom it reports to, and its
 * lineage, its first session `first` (the worker's key) started at `firstAt`.
 */
const card = (id: string, firstAt: number, more: Partial<Card> & { first?: string } = {}): Card => {
  const { first = id, ...rest } = more
  return { id, callsign: id.toUpperCase(), onDuty: true, startedAt: firstAt, lineage: [{ id: first, startedAt: firstAt }], ...rest } as Card
}

const boardOf = (...floors: Card[][]) => ({ floors: floors.map((cards, n) => ({ id: `f${n}`, cards }) as Floor) }) as Board

/** The callsigns of a floor's crews as listed, a member indented under its head. */
const listed = (cards: Card[], order: string[]) => crewTreeIn(cards, order).map(({ card, depth }) => `${'  '.repeat(depth)}${card.callsign}`)

test("a floor's crews go in the viewer's order, the ones it doesn't name after by first start, members under their head by first start", () => {
  const a = card('a', 10)
  const a1 = card('a1', 40, { reportsTo: 'a' })
  const a0 = card('a0', 30, { reportsTo: 'a' })
  const b = card('b', 20)
  const c = card('c', 50)
  assert.deepEqual(listed([a, a1, a0, b, c], []), ['A', '  A0', '  A1', 'B', 'C'])
  assert.deepEqual(listed([a, a1, a0, b, c], ['c', 'a']), ['C', 'A', '  A0', '  A1', 'B'])
})

test('a resumed worker keeps its place: its key and its start are its first session', () => {
  const a = card('a', 10)
  const resumed = card('b2', 15, { first: 'b', startedAt: 99 })
  const c = card('c', 20)
  assert.deepEqual(listed([a, resumed, c], []), ['A', 'B2', 'C'])
  assert.equal(workerKeyOf(resumed), 'b')
  assert.deepEqual(listed([a, resumed, c], ['b']), ['B2', 'A', 'C'])
})

test('a move puts the head before another or at its floor\'s end, keeps other floors\' keys still on the board and drops the rest', () => {
  const [a, b, c] = [card('a', 10), card('b', 20), card('c', 30)]
  const other = card('x', 5)
  const board = boardOf([a, b, c], [other])
  assert.deepEqual(orderMoving(board, [], 'c', 'a'), ['c', 'a', 'b'])
  assert.deepEqual(orderMoving(board, [], 'a', undefined), ['b', 'c', 'a'])
  assert.deepEqual(orderMoving(board, ['c', 'a', 'b'], 'c', 'b'), ['a', 'c', 'b'])
  assert.deepEqual(orderMoving(board, ['x', 'gone', 'b'], 'a', 'c'), ['b', 'a', 'c', 'x'])
  assert.throws(() => orderMoving(board, [], 'a', 'x'), /x heads no crew on the floor of a/)
})
