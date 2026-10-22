import assert from 'node:assert/strict'
import { test } from 'node:test'
import { termHandlers, termOpening, type TermEffect, type TermEvent, type TermView } from '../src/shared/term-view.ts'

const handlers = termHandlers()

/** Runs events from `from`, each step's state carried on: the last state and the effects of the last event. */
function run(from: TermView, ...events: TermEvent[]): [TermView, TermEffect[]] {
  let s = from
  let effects: TermEffect[] = []
  for (const e of events) {
    effects = (handlers[e.type] as (s: TermView, e: TermEvent) => TermEffect[])(s, e)
    for (const f of effects) if (f.type === 'state') s = f.state
  }
  return [s, effects.filter((f) => f.type !== 'state')]
}

const snapshot = (others: boolean, exited = false): TermEvent => ({ type: 'snapshot', data: 'screen', cols: 80, rows: 24, exited, others })
const owning: TermView = { t: 'owning', pty: { cols: 100, rows: 30 }, asked: [{ cols: 100, rows: 30 }] }

test('term view: a terminal nobody else views takes the size, one beside another watches, an exited one is read-only', () => {
  const opened = { type: 'open', data: 'screen', cols: 80, rows: 24, exited: false }
  assert.deepEqual(run(termOpening(), snapshot(false)), [{ t: 'watching', pty: { cols: 80, rows: 24 } }, [opened, { type: 'fit', then: '' }]])
  const [taken, sized] = run(termOpening(), snapshot(false), { type: 'fitted', cols: 100, rows: 30, then: '' })
  assert.deepEqual([taken, sized], [
    owning,
    [{ type: 'resize', cols: 100, rows: 30 }, { type: 'mode', mode: { t: 'owning', cols: 100, rows: 30 } }],
  ])
  assert.deepEqual(run(taken, { type: 'resized', cols: 100, rows: 30 }), [{ ...owning, asked: [] }, []])
  assert.deepEqual(run(termOpening(), snapshot(true)), [{ t: 'watching', pty: { cols: 80, rows: 24 } }, [opened, { type: 'mode', mode: { t: 'watching' } }]])
  const [exited, effects] = run(termOpening(), snapshot(false, true))
  assert.equal(exited.t, 'exited')
  assert.deepEqual(effects.at(-1), { type: 'mode', mode: { t: 'exited' } })
  assert.deepEqual(run(exited, { type: 'typed', data: 'x' }), [exited, []])
})

test('term view: a resize from someone else hands control back, the view follows, and typing takes it again with the keys after the resize', () => {
  assert.deepEqual(run({ ...owning, asked: [] }, { type: 'resized', cols: 100, rows: 30 })[0].t, 'watching')
  const [watching, followed] = run(owning, { type: 'resized', cols: 90, rows: 20 })
  assert.deepEqual(watching, { t: 'watching', pty: { cols: 90, rows: 20 } })
  assert.deepEqual(followed, [{ type: 'follow', cols: 90, rows: 20 }, { type: 'mode', mode: { t: 'watching' } }])
  assert.deepEqual(run(watching, { type: 'resized', cols: 100, rows: 30 })[0], { t: 'watching', pty: { cols: 100, rows: 30 } })
  assert.deepEqual(run(watching, { type: 'typed', data: 'a' }), [watching, [{ type: 'fit', then: 'a' }]])
  assert.deepEqual(run(watching, { type: 'fitted', cols: 100, rows: 30, then: 'a' })[1], [
    { type: 'resize', cols: 100, rows: 30 },
    { type: 'send', data: 'a' },
    { type: 'mode', mode: { t: 'owning', cols: 100, rows: 30 } },
  ])
  assert.deepEqual(run(owning, { type: 'typed', data: 'b' }), [owning, [{ type: 'send', data: 'b' }]])
})

test('term view: a focus report from a watching view reaches the PTY and leaves it watching', () => {
  const watching: TermView = { t: 'watching', pty: { cols: 90, rows: 20 } }
  for (const data of ['\x1b[I', '\x1b[O']) assert.deepEqual(run(watching, { type: 'typed', data }), [watching, [{ type: 'send', data }]])
  assert.deepEqual(run(watching, { type: 'typed', data: '\x1b[<35;10;5M' }), [watching, [{ type: 'fit', then: '\x1b[<35;10;5M' }]])
})

test('term view: a pane settles before it redraws, and a pane or font change fits the PTY only while this view holds it', () => {
  assert.deepEqual(run(owning, { type: 'pane' })[1], [{ type: 'timer/start', id: 'pane', ms: 120, fire: { type: 'settled' } }])
  const watching: TermView = { t: 'watching', pty: { cols: 90, rows: 20 } }
  for (const type of ['settled', 'font'] as const) {
    assert.deepEqual(run(owning, { type })[1], [{ type: 'fit', then: '' }])
    assert.deepEqual(run(watching, { type })[1], [{ type: 'follow', cols: 90, rows: 20 }])
    assert.deepEqual(run(termOpening(), { type })[1], [])
  }
})

test('term view: the echo of its own earlier resize, arriving after a later fit, keeps this view in control', () => {
  const [refit] = run(owning, { type: 'settled' }, { type: 'fitted', cols: 90, rows: 25, then: '' })
  assert.deepEqual(refit, { t: 'owning', pty: { cols: 90, rows: 25 }, asked: [{ cols: 100, rows: 30 }, { cols: 90, rows: 25 }] })
  const [late] = run(refit, { type: 'resized', cols: 100, rows: 30 })
  assert.deepEqual(late, { t: 'owning', pty: { cols: 90, rows: 25 }, asked: [{ cols: 90, rows: 25 }] })
  assert.deepEqual(run(late, { type: 'resized', cols: 90, rows: 25 })[0], { ...late, asked: [] })
  assert.equal(run({ ...late, asked: [] }, { type: 'resized', cols: 100, rows: 30 })[0].t, 'watching')
})
