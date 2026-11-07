import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hostedHandlers, hostedImporting, type HostedEffect, type HostedEvent, type HostedView } from '../src/shared/view-host.ts'
import type { Mounted, View } from '../src/shared/views.ts'
import type { Subject } from '../src/shared/subjects.ts'

const view = { id: 'demo/pane', cap: 'demo', module: 'pane.js', export: 'mount' } as View
const handlers = hostedHandlers(view)

/** Runs events from `from`, each step's state carried on: the last state and the effects of the last event. */
function run(from: HostedView, ...events: HostedEvent[]): [HostedView, HostedEffect[]] {
  let s = from
  let effects: HostedEffect[] = []
  for (const e of events) {
    effects = (handlers[e.type] as (s: HostedView, e: HostedEvent) => HostedEffect[])(s, e)
    for (const f of effects) if (f.type === 'state') s = f.state
  }
  return [s, effects.filter((f) => f.type !== 'state')]
}

const at = { key: 'card:w1' } as Subject
const below = { key: 'line:w1/3' } as Subject
const options = { wrap: true }
const mount = () => done
const done: Mounted = { update() {}, close() {} }
const tunable: Mounted = { ...done, options() {} }
const opened = hostedImporting(at, options)
const imported: HostedEvent = { type: 'imported', module: { mount } }
const types = (effects: HostedEffect[]) => effects.map((f) => f.type)

test('view host: a view imports, mounts under a timer and, once settled, is handed what it was asked while mounting', () => {
  assert.deepEqual(run(opened, { type: 'open' })[1], [{ type: 'import' }])
  const [mounting, called] = run(opened, imported)
  assert.equal(mounting.t, 'mounting')
  assert.deepEqual(called, [
    { type: 'timer/start', id: 'mount', ms: 10_000, fire: { type: 'late' } },
    { type: 'mount', mount, subject: at, options },
  ])
  const [mounted, handed] = run(mounting, { type: 'visible', on: false }, { type: 'show', subject: below }, { type: 'settled', done })
  assert.equal(mounted.t, 'mounted')
  assert.deepEqual(handed, [
    { type: 'timer/cancel', id: 'mount' },
    { type: 'call', done, calls: [{ t: 'visible', on: false }, { t: 'show', subject: below }] },
  ])
  assert.deepEqual(run(mounted, { type: 'update', subject: below })[1], [{ type: 'call', done, calls: [{ t: 'update', subject: below }] }])
})

test('view host: options asked of a view that takes none mount it afresh; one that takes them is handed them first, in the one call that a throw ends', () => {
  const next = { wrap: false }
  const [mounting] = run(opened, imported, { type: 'options', options: next })
  const [again, remount] = run(mounting, { type: 'settled', done })
  assert.deepEqual([again.t, types(remount)], ['importing', ['timer/cancel', 'close', 'release', 'import']])
  assert.deepEqual(run(mounting, { type: 'visible', on: false }, { type: 'settled', done: tunable })[1], [
    { type: 'timer/cancel', id: 'mount' },
    { type: 'call', done: tunable, calls: [{ t: 'options', options: next }, { t: 'visible', on: false }] },
  ])
  const [mounted] = run(opened, imported, { type: 'settled', done })
  assert.deepEqual(types(run(mounted, { type: 'options', options: next })[1]), ['close', 'release', 'import'])
})

test('view host: a mount that never settles fails, and settling after is closed at once, its line drawn again; a failed view takes nothing more', () => {
  const [failed, late] = run(opened, imported, { type: 'late' })
  const drawn = { type: 'failed', why: "its mount hadn't settled in 10 s" } as const
  assert.deepEqual([failed, late], [{ t: 'failed', drawn }, [{ type: 'timer/cancel', id: 'mount' }, { type: 'release' }, drawn]])
  assert.deepEqual(run(failed, { type: 'settled', done }), [failed, [{ type: 'close', done }, { type: 'release' }, drawn]])
  for (const e of [{ type: 'show', subject: below }, { type: 'options', options }, { type: 'update', subject: below }] as HostedEvent[])
    assert.deepEqual(run(failed, e), [failed, []])
  assert.deepEqual(run(failed, { type: 'close' }), [{ t: 'closed' }, []])
  assert.deepEqual(run(failed, { type: 'broke', why: 'its options threw' }), [failed, []])
})

test('view host: a module without its export fails naming it, one that no longer links says so, and a call that throws ends the view', () => {
  assert.deepEqual(run(opened, { type: 'imported', module: {} })[1], [{ type: 'release' }, { type: 'failed', why: '/x/demo/pane.js exports no function mount' }])
  assert.deepEqual(run(opened, { type: 'unlinked', why: 'no export x' })[1], [{ type: 'release' }, { type: 'stale', why: 'no export x' }])
  const [mounted] = run(opened, imported, { type: 'settled', done })
  assert.deepEqual(run(mounted, { type: 'broke', why: 'boom' }), [{ t: 'failed', drawn: { type: 'failed', why: 'boom' } }, [{ type: 'close', done }, { type: 'release' }, { type: 'failed', why: 'boom' }]])
})

test('view host: closing ends what was mounted and releases its kit; a mount still running is closed when it settles', () => {
  const [mounted] = run(opened, imported, { type: 'settled', done })
  assert.deepEqual(run(mounted, { type: 'close' }), [{ t: 'closed' }, [{ type: 'close', done }, { type: 'release' }]])
  const [closed, stopped] = run(opened, imported, { type: 'close' })
  assert.deepEqual([closed, stopped], [{ t: 'closed' }, [{ type: 'timer/cancel', id: 'mount' }, { type: 'release' }]])
  assert.deepEqual(run(closed, { type: 'settled', done })[1], [{ type: 'close', done }, { type: 'release' }])
  assert.deepEqual(run(closed, { type: 'close' })[1], [])
})
