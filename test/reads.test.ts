import assert from 'node:assert/strict'
import { test } from 'node:test'
import { failRead, failureAt, failureOf, landRead, noReads, refreshRead, valueAt, valueOf, wantRead } from '../src/shared/reads.ts'

test('held read: the last read is held while the next is read, and an overtaken read lands on nothing', () => {
  const [first, asked] = wantRead(noReads<string>(), 'a', 'v1')
  assert.deepEqual(asked, [{ type: 'read', slot: 'a', key: 'v1', n: 1 }])
  const [held] = landRead(first, 'a', 1, 'one')
  assert.deepEqual(wantRead(held, 'a', 'v1'), [held, []])
  const [moved] = wantRead(held, 'a', 'v2')
  assert.equal(valueOf(moved.held.a), 'one')
  assert.equal(valueAt(moved.held.a, 'v2'), undefined)
  const [again] = refreshRead(moved, 'a', 'v2')
  assert.deepEqual(landRead(again, 'a', 2, 'stale'), [again, []])
  assert.equal(valueOf(landRead(again, 'a', 3, 'two')[0].held.a), 'two')
})

test('held read: a failure shows only while nothing is held, else it is a toast over what is held', () => {
  const [reading] = wantRead(noReads<string>(), 'a', 'v1')
  const [failed, drawn] = failRead(reading, 'a', 1, 'gone')
  assert.equal(failureOf(failed.held.a), 'gone')
  assert.deepEqual(drawn, [{ type: 'draw' }])
  const [held] = landRead(refreshRead(failed, 'a', 'v1')[0], 'a', 2, 'one')
  const [kept, toasted] = failRead(refreshRead(held, 'a', 'v2')[0], 'a', 3, 'gone')
  assert.deepEqual(toasted, [{ type: 'toast', message: 'gone' }])
  assert.equal(failureOf(kept.held.a), undefined)
  assert.equal(valueAt(kept.held.a, 'v1'), 'one')
})

test('held read: a failed re-read over a held value is not read again at the same key', () => {
  const [held] = landRead(wantRead(noReads<string>(), 'a', 'v1')[0], 'a', 1, 'one')
  const [failed] = failRead(wantRead(held, 'a', 'v2')[0], 'a', 2, 'gone')
  assert.deepEqual(wantRead(failed, 'a', 'v2')[1], [], 'the next draw asks for v2 again and reads it again')
  assert.equal(valueOf(failed.held.a), 'one')
  assert.equal(failureAt(failed.held.a, 'v2'), 'gone')
  assert.equal(failureAt(failed.held.a, 'v1'), undefined)
})
