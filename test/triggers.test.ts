import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board, Card, Floor, Wait } from '../src/bridge/board.ts'
import type { Offer } from '../src/bridge/policies.ts'
import { triggerBoards } from '../src/bridge/triggers.ts'

const floor = (id: string, cards: string[]) => ({ id, cards: cards.map((c) => ({ id: c }) as Card) }) as Floor
const wait = (id: string) => ({ id, key: `${id}@0`, reason: 'done', since: 0 }) as Wait
const offer = (project: string) => ({ key: `${project}/nightly`, project }) as Offer
const boardOf = (floors: Floor[], waiting: Wait[], offers: Offer[] = []) => ({ floors, waiting, offers, today: { spent: 1 } }) as unknown as Board

test('a board trigger sees neither board hold a floor where its capability is off: its cards, waits and offers go, the aggregates stay', () => {
  const prev = boardOf([floor('lab', ['a'])], [])
  const next = boardOf([floor('lab', ['a']), floor('ops', ['b'])], [wait('a'), wait('b')], [offer('ops')])
  const seen = triggerBoards(prev, next, new Set(['ops']))
  assert.deepEqual(seen.next.floors.map((f) => f.id), ['lab'])
  assert.deepEqual(seen.next.waiting.map((w) => w.id), ['a'])
  assert.deepEqual(seen.next.offers, [])
  assert.deepEqual((seen.next as unknown as { today: unknown }).today, { spent: 1 })
  assert.equal(seen.prev, prev)
})

test('a floor that appears is a first build for itself: its waits and offers are taken as already in the previous board', () => {
  const prev = boardOf([floor('lab', ['a'])], [])
  const next = boardOf([floor('lab', ['a']), floor('ops', ['b'])], [wait('a'), wait('b')], [offer('ops')])
  const seen = triggerBoards(prev, next, new Set())
  assert.deepEqual(seen.prev.floors.map((f) => f.id), ['lab', 'ops'])
  assert.deepEqual(seen.prev.waiting.map((w) => w.id), ['b'], 'the new floor waits already; the old one starts to')
  assert.deepEqual(seen.prev.offers.map((o) => o.project), ['ops'])
  assert.deepEqual(seen.next.waiting.map((w) => w.id), ['a', 'b'])
})
