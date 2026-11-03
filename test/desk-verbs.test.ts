import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board, Card } from '../src/bridge/board.ts'
import type { Added, VerbAction } from '../src/shared/extensions.ts'
import type { LayoutEntry } from '../src/shared/regions.ts'
import { addedKey, deskVerbs, placed } from '../renderers/tower3d/src/desk-verbs.ts'

const card = { id: 'w1', project: 'lab' } as Card
const verb = (name: string, call: Record<string, unknown> = {}): Added<VerbAction> => ({ verb: name, call, cap: name.split('/')[0] })
const POKE = verb('crowd/poke')
const ZAP_ONE = verb('crowd/zap', { which: 'one' })
const WIPE = verb('crowd/wipe')
const ZAP_TWO = verb('crowd/zap', { which: 'two' })
const boardOf = (actions: Added<VerbAction>[]) => ({ extensions: [], adds: { 'card:w1': { actions } } }) as unknown as Board

/** Each verb the desk draws under `entry`, by its content, with the key it is armed under. */
const keysUnder = (board: Board, entry: LayoutEntry | undefined) =>
  new Map(placed(deskVerbs(board, card, { holds: ['verbs'], entry })).map(({ action, k }) => [JSON.stringify(action), addedKey(card, action, k)]))

test('desk verbs: a pin or a hide reorders the desk and never changes the key an action is armed under', () => {
  const board = boardOf([POKE, ZAP_ONE, WIPE, ZAP_TWO])
  const plain = keysUnder(board, undefined)
  assert.equal(new Set(plain.values()).size, 4, 'two actions sharing an id are armed apart')
  for (const entry of [{ pinned: ['crowd/zap'] }, { pinned: ['crowd/wipe', 'crowd/zap'] }, { hidden: ['crowd/poke'] }, { pinned: ['crowd/zap'], hidden: ['crowd/wipe'] }]) {
    const drawn = deskVerbs(board, card, { holds: ['verbs'], entry })
    assert.notDeepEqual(
      drawn.map((r) => r.action),
      [POKE, ZAP_ONE, WIPE, ZAP_TWO],
      `${JSON.stringify(entry)} reorders the desk`,
    )
    for (const [action, key] of keysUnder(board, entry)) assert.equal(key, plain.get(action), `${action} keeps its key under ${JSON.stringify(entry)}`)
  }
})

test('desk verbs: an armed action whose call a board replaced is no longer armed', () => {
  const armed = keysUnder(boardOf([POKE, ZAP_ONE, WIPE, ZAP_TWO]), undefined).get(JSON.stringify(ZAP_TWO))
  const replaced = keysUnder(boardOf([POKE, ZAP_ONE, WIPE, verb('crowd/zap', { which: 'three' })]), undefined)
  assert.ok(![...replaced.values()].includes(armed!), 'no action on the new board confirms the arm')
  const gone = keysUnder(boardOf([POKE, WIPE, ZAP_TWO]), undefined)
  assert.ok(![...gone.values()].includes(armed!), 'nor once the action of its id before it is gone')
})
