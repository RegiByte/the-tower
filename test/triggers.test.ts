import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board, Card, Floor, Wait } from '../src/bridge/board.ts'
import type { BoardAsk } from '../src/shared/extensions.ts'
import { triggerBoards } from '../src/bridge/triggers.ts'

const floor = (id: string, cards: string[]) => ({ id, cards: cards.map((c) => ({ id: c }) as Card) }) as Floor
const wait = (id: string) => ({ id, key: `${id}@0`, reason: 'done', since: 0 }) as Wait
const boardOf = (floors: Floor[], waiting: Wait[], asks: BoardAsk[] = []) =>
  ({ floors, waiting, asks, adds: Object.fromEntries(floors.map((f) => [`floor:${f.id}`, { badges: [{ label: f.id, cap: 'x' }] }])), today: { spent: 1 } }) as unknown as Board
const ask = (project: string) => ({ key: `x:${project}`, subject: `floor:${project}`, cap: 'x' }) as BoardAsk

test('a board trigger sees neither board hold a floor where its capability is off: its cards, waits, adds and asks go, the aggregates stay', () => {
  const prev = boardOf([floor('lab', ['a'])], [])
  const next = boardOf([floor('lab', ['a']), floor('ops', ['b'])], [wait('a'), wait('b')], [ask('ops'), ask('lab')])
  const seen = triggerBoards(prev, next, new Set(['ops']))
  assert.deepEqual(seen.next.floors.map((f) => f.id), ['lab'])
  assert.deepEqual(seen.next.waiting.map((w) => w.id), ['a'])
  assert.deepEqual(Object.keys(seen.next.adds), ['floor:lab'])
  assert.deepEqual(seen.next.asks.map((a) => a.subject), ['floor:lab'])
  assert.deepEqual((seen.next as unknown as { today: unknown }).today, { spent: 1 })
  assert.equal(seen.prev, prev)
})

test('a floor that appears is a first build for itself: its waits and asks are taken as already in the previous board', () => {
  const prev = boardOf([floor('lab', ['a'])], [])
  const next = boardOf([floor('lab', ['a']), floor('ops', ['b'])], [wait('a'), wait('b')], [ask('ops')])
  const seen = triggerBoards(prev, next, new Set())
  assert.deepEqual(seen.prev.floors.map((f) => f.id), ['lab', 'ops'])
  assert.deepEqual(seen.prev.waiting.map((w) => w.id), ['b'], 'the new floor waits already; the old one starts to')
  assert.deepEqual(seen.prev.asks.map((a) => a.subject), ['floor:ops'])
  assert.deepEqual(Object.keys(seen.prev.adds), ['floor:lab', 'floor:ops'])
  assert.deepEqual(seen.next.waiting.map((w) => w.id), ['a', 'b'])
})
