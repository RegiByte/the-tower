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
