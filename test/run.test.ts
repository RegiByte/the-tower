import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { runProcess } from '../src/run.ts'

/**
 * Holds the event loop until `true` has exited, so Node hasn't reaped it when the kill comes. That leaves a group of
 * one unreaped leader, which macOS answers with EPERM; an error thrown there is uncaught and ends the tower. Linux
 * doesn't answer EPERM there, so these tests guard the fix only when run on macOS: a green CI on Linux says nothing.
 */
const holdTheLoop = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)

test('a timeout that fires on a leader not yet reaped settles the run', async () => {
  const run = runProcess(['true'], { cwd: tmpdir(), timeoutMs: 50 })
  holdTheLoop()
  assert.equal((await run).exit, 0)
})

test('an abort that comes after the leader exited, before it is reaped, settles the run', async () => {
  const halt = new AbortController()
  const run = runProcess(['true'], { cwd: tmpdir(), timeoutMs: 60_000, signal: halt.signal })
  holdTheLoop()
  halt.abort()
  assert.equal((await run).exit, 0)
})
