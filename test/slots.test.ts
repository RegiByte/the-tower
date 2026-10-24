import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dueSlot, nextSlot, periodProblem, ruleWords, slotsBetween } from '../src/shared/slots.ts'

const at = (iso: string) => Date.parse(iso)

test('a period is aligned to the UTC clock: its slots are its multiples since the epoch, whenever it is asked', () => {
  const five = { every: '5m' }
  assert.deepEqual(slotsBetween(five, at('2026-10-24T10:03:00Z'), at('2026-10-24T10:15:00Z')).map((s) => new Date(s).toISOString()), [
    '2026-10-24T10:05:00.000Z',
    '2026-10-24T10:10:00.000Z',
    '2026-10-24T10:15:00.000Z',
  ])
  assert.deepEqual(slotsBetween(five, at('2026-10-24T10:05:00Z'), at('2026-10-24T10:09:59Z')), [])
  assert.equal(nextSlot(five, at('2026-10-24T10:05:00Z')), at('2026-10-24T10:10:00Z'))
  assert.equal(nextSlot({ every: '2h' }, at('2026-10-24T10:59:00Z')), at('2026-10-24T12:00:00Z'))
})

test("a period's slot is due once: the latest at or before now, on time within 5 minutes, and later than the one fired", () => {
  const five = { every: '5m' }
  const now = at('2026-10-24T10:07:00Z')
  assert.equal(dueSlot(five, undefined, now), at('2026-10-24T10:05:00Z'))
  assert.equal(dueSlot(five, at('2026-10-24T10:05:00Z'), now), undefined)
  assert.equal(dueSlot(five, at('2026-10-24T10:00:00Z'), now), at('2026-10-24T10:05:00Z'))
  const hourly = { every: '1h' }
  assert.equal(dueSlot(hourly, undefined, at('2026-10-24T10:04:00Z')), at('2026-10-24T10:00:00Z'))
  assert.equal(dueSlot(hourly, undefined, at('2026-10-24T10:06:00Z')), undefined, 'a slot past its 5 minutes is missed')
  const fast = { every: '10s' }
  assert.equal(dueSlot(fast, at('2026-10-24T10:06:50Z'), at('2026-10-24T10:07:20Z')), at('2026-10-24T10:07:20Z'), 'below the loop, the latest slot only')
})

test('a period in words, and what is no period', () => {
  assert.deepEqual([ruleWords({ every: '1m' }), ruleWords({ every: '30s' }), ruleWords({ every: '2h' })], ['every minute', 'every 30 seconds', 'every 2 hours'])
  assert.equal(periodProblem('5m'), undefined)
  assert.match(periodProblem('0m')!, /above 0/)
  assert.match(periodProblem('5 min')!, /no period/)
})
