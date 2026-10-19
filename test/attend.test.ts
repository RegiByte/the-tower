import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board, Wait } from '../src/bridge/board.ts'
import type { Offer } from '../src/bridge/policies.ts'
import { attending, chooseRing, dismiss, remind, seeBoard, stored, type AttendEffect } from '../src/shared/attend.ts'

const wait = (id: string, reason: Wait['reason'] = 'asks'): Wait => ({ id, key: `${id}:1`, reason, since: 0 })
const offer = { key: 'nightly:1', project: 'p', policy: 'nightly', tag: 'quiet-owl', slot: 0, since: 0, until: 1 } as Offer
const boardOf = (waiting: Wait[], offers: Offer[] = []) =>
  ({ waiting, offers, floors: [{ cards: ['A', 'B'].map((id) => ({ id, callsign: `${id}-01` })) }] }) as unknown as Board
const kinds = (effects: AttendEffect[]) => effects.map((e) => (e.type === 'sound' ? `sound:${e.sound}` : e.type))

test('attend: the first board is silent, a wait that begins is said, notified and rung, and one that ends closes', () => {
  const [opened, first] = seeBoard(attending(), boardOf([wait('A')]), undefined)
  assert.deepEqual(first, [])
  const [asked, began] = seeBoard(opened, boardOf([wait('A'), wait('B', 'done')]), undefined)
  assert.deepEqual(kinds(began), ['announce', 'notify', 'sound:done'])
  assert.deepEqual(kinds(seeBoard(asked, boardOf([wait('B', 'done')]), undefined)[1]), ['unnotify'])
})

test("attend: the watched worker's wait is said but neither notified nor rung, and an offer rings beside it", () => {
  const [opened] = seeBoard(attending(), boardOf([]), undefined)
  assert.deepEqual(kinds(seeBoard(opened, boardOf([wait('A')]), 'A')[1]), ['announce'])
  assert.deepEqual(kinds(seeBoard(opened, boardOf([wait('A')], [offer]), 'A')[1]), ['announce', 'notify', 'sound:offer'])
})

test('attend: a ring set to off still notifies, and a dismissed wait is out of the way until the next', () => {
  const [silent] = chooseRing(seeBoard(attending(), boardOf([]), undefined)[0], 'off')
  assert.deepEqual(kinds(seeBoard(silent, boardOf([wait('A')]), undefined)[1]), ['announce', 'notify'])
  const [waited] = seeBoard(seeBoard(attending(), boardOf([]), undefined)[0], boardOf([wait('A')]), undefined)
  const [dismissed, effects] = dismiss(waited, 'A:1')
  assert.deepEqual(effects, [{ type: 'keep', field: 'dismissed', value: ['A:1'] }, { type: 'unnotify', key: 'A:1' }])
  assert.deepEqual(seeBoard(dismissed, boardOf([wait('A')]), undefined)[1], [])
})

test('attend: with remind, what is heeded rings again unless the tower is lost, and the reminder runs only while set', () => {
  const [opened] = seeBoard(attending(), boardOf([wait('A')]), undefined)
  const [reminding, armed] = stored(opened, { dismissed: [], ring: 'remind' })
  assert.deepEqual(kinds(armed), ['timer/start'])
  assert.deepEqual(kinds(remind(reminding, undefined)[1]), ['sound:question', 'timer/start'])
  assert.deepEqual(kinds(remind(reminding, 'A')[1]), ['timer/start'])
  assert.deepEqual(kinds(remind({ ...reminding, lost: true }, undefined)[1]), ['timer/start'])
  assert.deepEqual(kinds(remind(seeBoard({ ...reminding, lost: true }, reminding.board!, undefined)[0], undefined)[1]), ['timer/start'], 'the board held while lost, seen again, leaves it lost')
  assert.deepEqual(kinds(remind(dismiss(reminding, 'A:1')[0], undefined)[1]), ['timer/start'])
  assert.deepEqual(kinds(chooseRing(reminding, 'once')[1]), ['keep', 'timer/cancel'])
  assert.deepEqual(remind(opened, undefined)[1], [])
})
