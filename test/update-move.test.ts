import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveTo } from '../src/update.ts'

test('a branch the release descends from fast-forwards', () => {
  assert.deepEqual(moveTo('main', true, 0), { t: 'fast-forward', branch: 'main' })
})

test('a detached HEAD is checked out at the release', () => {
  assert.deepEqual(moveTo(undefined, true, 0), { t: 'checkout' })
})

test('a diverged branch is checked out and says what it left behind', () => {
  assert.deepEqual(moveTo('work', false, 3), { t: 'checkout', leftBehind: { branch: 'work', ahead: 3 } })
})
