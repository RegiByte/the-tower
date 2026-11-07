import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notHere, notHereLine, updateRefusal, type DaemonCheckout } from '../src/checkouts.ts'

const HERE = '/work/clone'
const HUB = '/work/hub'
const at = (name: string, checkout: string): DaemonCheckout => ({ t: 'read', name, checkout })
const unreadable = (name: string): DaemonCheckout => ({ t: 'unreadable', name, why: 'lsof failed' })

test('update goes ahead when nothing runs, or everything it would restart runs from here', () => {
  assert.equal(updateRefusal([], HERE), undefined)
  assert.equal(updateRefusal([at('jobs', HERE), at('tower', HERE)], HERE), undefined)
})

test('update from a second checkout is refused, naming where the tower runs and how to update there', () => {
  const refusal = updateRefusal([at('jobs', HUB), at('tower', HUB)], HERE)
  assert.ok(refusal)
  assert.match(refusal.message, /tower runs from \/work\/hub; this checkout is \/work\/clone$/)
  assert.match(refusal.fix, /^update where they run: \/work\/hub\/src\/mod\/bin\/tower update; or /)
})

test('one daemon elsewhere is enough to refuse, and updating there is not offered while that would be refused too', () => {
  const refusal = updateRefusal([at('jobs', HERE), at('tower', HUB)], HERE)
  assert.ok(refusal)
  assert.doesNotMatch(refusal.message, /jobs/)
  assert.match(refusal.fix, /^to run them from this checkout instead/)
})

test('a running daemon whose checkout cannot be read refuses, saying so', () => {
  const refusal = updateRefusal([at('jobs', HERE), unreadable('tower')], HERE)
  assert.ok(refusal)
  assert.match(refusal.message, /tower is running, but its checkout can't be read: lsof failed; this checkout is/)
  assert.match(refusal.fix, /^to run them from this checkout instead/)
})

test('notHere keeps what runs elsewhere and what cannot be read, and its line names each', () => {
  const elsewhere = notHere([at('host', HUB), at('terms', HERE), unreadable('tower')], HERE)
  assert.equal(notHereLine(elsewhere, HERE), "host runs from /work/hub; tower is running, but its checkout can't be read: lsof failed; this checkout is /work/clone")
})
