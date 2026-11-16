import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loop } from '../src/shared/loop.ts'

type Count = { type: 'add'; by: number } | { type: 'echo'; by: number }

/** A counter whose `echo` dispatches an `add` from its executor, as a read landing does. */
const counter = () =>
  loop<number, Count, { type: 'state'; state: number } | { type: 'echo'; by: number }>({
    state: 0,
    handlers: { add: (n, e) => [{ type: 'state', state: n + e.by }], echo: (_, e) => [{ type: 'echo', by: e.by }] },
    execute: { echo: (e, dispatch) => dispatch({ type: 'add', by: e.by }) },
  })

test('loop until: a state that holds already resolves at once', async () => {
  assert.equal(await counter().until((n) => n === 0), 0)
})

test('loop until: resolves once the effects a dispatch queued have run, and every waiter on its own state', async () => {
  const c = counter()
  const [one, three] = [c.until((n) => n >= 1), c.until((n) => n >= 3)]
  const order: string[] = []
  void one.then((n) => order.push(`one at ${n}`))
  void three.then((n) => order.push(`three at ${n}`))
  c.dispatch({ type: 'echo', by: 2 })
  assert.equal(await one, 2, 'the add the executor dispatched has run before the wait is checked')
  c.dispatch({ type: 'add', by: 1 })
  assert.equal(await three, 3)
  assert.deepEqual(order, ['one at 2', 'three at 3'])
})

test('loop until: asked from an executor, resolves on the state the events it queued left', async () => {
  let wait: Promise<number> | undefined
  const c = loop<number, Count, { type: 'state'; state: number } | { type: 'echo'; by: number }>({
    state: 0,
    handlers: { add: (n, e) => [{ type: 'state', state: n + e.by }], echo: (_, e) => [{ type: 'echo', by: e.by }] },
    execute: {
      echo: (e, dispatch) => {
        dispatch({ type: 'add', by: e.by })
        wait = c.until((n) => n <= 1)
      },
    },
  })
  c.dispatch({ type: 'echo', by: 1 })
  assert.equal(await wait, c.state(), 'the add queued before the wait has run')
})

test('loop subscribe: each event with the effects its handler returned, after they ran, in the order handled', () => {
  const c = counter()
  const seen: string[] = []
  const stop = c.subscribe((event, effects) => seen.push(`${event.type} ${event.by} → ${effects.map((f) => f.type).join(',')} at ${c.state()}`))
  c.dispatch({ type: 'echo', by: 2 })
  assert.deepEqual(seen, ['echo 2 → echo at 0', 'add 2 → state at 2'], 'the add the executor dispatched comes after the echo that asked for it')
  stop()
  c.dispatch({ type: 'add', by: 1 })
  assert.equal(seen.length, 2, 'unsubscribed')
})

test('loop subscribe: a listener that throws leaves the loop running, every event handled and every other listener told, and rejects with its error', () => {
  const c = counter()
  const rejected: unknown[] = []
  const reject = Promise.reject
  Promise.reject = (err?: unknown) => (rejected.push(err), Promise.resolve() as Promise<never>)
  try {
    const told: string[] = []
    c.subscribe(() => {
      throw new Error('a listener broke')
    })
    c.subscribe((event) => told.push(event.type))
    c.dispatch({ type: 'echo', by: 2 })
    c.dispatch({ type: 'add', by: 1 })
    assert.deepEqual(told, ['echo', 'add', 'add'])
    assert.equal(c.state(), 3)
    assert.deepEqual(rejected.map((err) => (err as Error).message), ['a listener broke', 'a listener broke', 'a listener broke'], 'once per event, as a rejection')
  } finally {
    Promise.reject = reject
  }
})
