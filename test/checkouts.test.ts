import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notHere, notHereLine, updateRefusal, type DaemonCheckout } from '../src/checkouts.ts'

const HERE = '/work/clone'
const HUB = '/work/hub'
const at = (name: string, checkout: string): DaemonCheckout => ({ t: 'read', name, checkout })
const unreadable = (name: string): DaemonCheckout => ({ t: 'unreadable', name, why: 'lsof failed' })
const gone = (name: string): DaemonCheckout => ({ t: 'gone', name, checkout: HUB })
const unowned = (name: string): DaemonCheckout => ({ t: 'unowned', name, where: '/root/jobs.sock' })

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
  assert.match(refusal.fix, /^to run tower from this checkout: .*\/tower down tower, then .*\/tower up tower$/)
  assert.doesNotMatch(refusal.fix, /jobs/)
})

test('a running daemon whose checkout cannot be read refuses, saying so', () => {
  const refusal = updateRefusal([at('jobs', HERE), unreadable('tower')], HERE)
  assert.ok(refusal)
  assert.match(refusal.message, /tower is running, but its checkout can't be read: lsof failed; this checkout is/)
  assert.match(refusal.fix, /^to run tower from this checkout: /)
})

test('moving jobs says it ends running jobs, and only then', () => {
  const refusal = updateRefusal([at('jobs', HUB), at('tower', HERE)], HERE)
  assert.ok(refusal)
  assert.match(refusal.fix, /^to run jobs from this checkout, which ends any running job: .* down jobs, then .* up jobs$/)
})

test('a checkout that no longer exists is said to be gone, and updating there is not offered', () => {
  const refusal = updateRefusal([gone('jobs'), gone('tower')], HERE)
  assert.ok(refusal)
  assert.match(refusal.message, /tower runs from \/work\/hub, which no longer exists/)
  assert.match(refusal.fix, /^to run jobs and tower from this checkout, which ends any running job: /)
})

test('a daemon tower up did not start can only be stopped where it runs, so no down is offered for it', () => {
  const refusal = updateRefusal([unowned('jobs'), at('tower', HERE)], HERE)
  assert.ok(refusal)
  assert.match(refusal.message, /jobs answers at \/root\/jobs\.sock but was not started by tower up/)
  assert.match(refusal.fix, /^stop jobs where it runs/)
  assert.doesNotMatch(refusal.fix, /down jobs/)
  assert.match(updateRefusal([unowned('jobs'), at('tower', HUB)], HERE)!.fix, /^stop jobs where it runs, and to run tower from this checkout: .* down tower, /)
})

test('notHere keeps what runs elsewhere and what cannot be read, and its line names each', () => {
  const elsewhere = notHere([at('host', HUB), at('terms', HERE), unreadable('tower')], HERE)
  const line = notHereLine(elsewhere, HERE)
  assert.match(line, /host runs from \/work\/hub/)
  assert.match(line, /tower is running, but its checkout can't be read/)
  assert.doesNotMatch(line, /terms/)
})
