import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board, Wait } from '../src/bridge/board.ts'
import type { Offer } from '../src/shared/policies-legacy.ts'
import type { BoardAsk } from '../src/shared/extensions.ts'
import { attendNext, attendStep, attending, chooseRing, dismiss, eyeStep, remind, seeBoard, stored, watching, type AttendEffect, type AttendEvent, type AttendOut } from '../src/shared/attend.ts'

const wait = (id: string, reason: Wait['reason'] = 'asks'): Wait => ({ id, key: `${id}:1`, reason, since: 0 })
const offer = { key: 'nightly:1', project: 'p', policy: 'nightly', tag: 'quiet-owl', slot: 0, since: 0, until: 1 } as Offer
/** The same slot as the policies extension asks it: the board carries both, the offer as LEGACY's copy. */
const offerAsk: BoardAsk = { key: 'policies:nightly:1', cap: 'policies', subject: 'item.policies:p/nightly', title: 'Nightly', since: 0, until: 1, sound: 'offer', actions: [] }
const boardOf = (waiting: Wait[], offers: Offer[] = []) =>
  ({ waiting, offers, asks: offers.length ? [offerAsk] : [], floors: [{ cards: ['A', 'B'].map((id) => ({ id, callsign: `${id}-01` })) }] }) as unknown as Board
const kinds = (effects: (AttendEffect | AttendOut)[]) => effects.map((e) => (e.type === 'sound' ? `sound:${e.sound}` : e.type))

test('attend: the first board is silent, a wait that begins is said, notified and rung, and one that ends closes', () => {
  const [opened, first] = seeBoard(attending(), boardOf([wait('A')]), undefined)
  assert.deepEqual(first, [])
  const [asked, began] = seeBoard(opened, boardOf([wait('A'), wait('B', 'done')]), undefined)
  assert.deepEqual(kinds(began), ['announce', 'notify', 'sound:done'])
  assert.deepEqual(kinds(seeBoard(asked, boardOf([wait('B', 'done')]), undefined)[1]), ['unnotify'])
})

test("attend: the watched worker's wait is said but neither notified nor rung, and an offer rings beside it, said and notified once though the board carries it twice", () => {
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

test('attend: the worker in view is watched only while the window is focused and visible, as its events say', () => {
  const eye = { focused: true, visible: true }
  assert.equal(watching(eye, 'A'), 'A')
  assert.equal(watching(eyeStep(eye, { type: 'focus', focused: false }), 'A'), undefined)
  assert.equal(watching(eyeStep(eye, { type: 'visible', visible: false }), 'A'), undefined)
  assert.equal(watching(eyeStep(eyeStep(eye, { type: 'focus', focused: false }), { type: 'focus', focused: true }), 'A'), 'A')
  assert.equal(watching(eye, undefined), undefined)
})

test('attend: attendStep runs each event through its step with the watched worker it is given', () => {
  const [opened] = attendStep(attending(), { type: 'board', board: boardOf([]) }, undefined)
  assert.deepEqual(kinds(attendStep(opened, { type: 'board', board: boardOf([wait('A')]) }, 'A')[1]), ['announce'])
  assert.deepEqual(kinds(attendStep(opened, { type: 'board', board: boardOf([wait('A')]) }, undefined)[1]), ['announce', 'notify', 'sound:question'])
  const [reminding] = attendStep(attendStep(opened, { type: 'board', board: boardOf([wait('A')]) }, undefined)[0], { type: 'ring', ring: 'remind' }, undefined)
  assert.deepEqual(kinds(attendStep(reminding, { type: 'remind' }, 'A')[1]), ['timer/start'])
  assert.deepEqual(kinds(attendStep(reminding, { type: 'remind' }, undefined)[1]), ['sound:question', 'timer/start'])
  assert.equal(attendStep(opened, { type: 'lost', lost: true }, undefined)[0].lost, true)
})

test('attend: the viewer looks at a worker only as events tell it, and its waits ring for nobody while the window has their eye', () => {
  const [opened] = attendNext(attending(), { type: 'board', board: boardOf([]) })
  const run = (events: AttendEvent[]) => events.reduce(([a], e) => attendNext(a, e), [opened, []] as ReturnType<typeof attendNext>)
  const board = { type: 'board', board: boardOf([wait('A')]) } as const
  assert.deepEqual(kinds(run([{ type: 'watch', at: 'A' }, board])[1]), ['announce'])
  assert.deepEqual(kinds(run([{ type: 'watch', at: 'A' }, { type: 'focus', focused: false }, board])[1]), ['announce', 'notify', 'sound:question'])
  assert.deepEqual(kinds(run([{ type: 'watch', at: 'A' }, { type: 'visible', visible: false }, { type: 'visible', visible: true }, board])[1]), ['announce'])
  assert.deepEqual(kinds(run([{ type: 'watch', at: 'A' }, { type: 'watch', at: undefined }, board])[1]), ['announce', 'notify', 'sound:question'])
})
