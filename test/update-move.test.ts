import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveTo } from '../src/update.ts'

test('a branch the release descends from fast-forwards', () => {
  assert.deepEqual(moveTo('main', 'abc1234', 0), { t: 'fast-forward', branch: 'main' })
})

test('a detached HEAD the release descends from is checked out with nothing left behind', () => {
  assert.deepEqual(moveTo(undefined, 'abc1234', 0), { t: 'checkout', leftBehind: undefined })
})

test('a diverged branch is checked out and names what it left behind', () => {
  assert.deepEqual(moveTo('work', 'abc1234', 3), { t: 'checkout', leftBehind: { t: 'branch', branch: 'work', ahead: 3 } })
})

test('a detached HEAD with commits of its own names its sha', () => {
  assert.deepEqual(moveTo(undefined, 'abc1234', 1), { t: 'checkout', leftBehind: { t: 'detached', sha: 'abc1234', ahead: 1 } })
})
