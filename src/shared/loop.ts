/**
 * A machine as data. Each event type has a handler, `(state, event, ctx) -> effects`, pure: what it calls for is
 * returned as tagged effects, the next state among them (`state`). The loop applies `state` itself and hands every
 * other effect to the renderer's executor of its type, which does the I/O (a fetch, the DOM, `tower.store`) and
 * dispatches what comes of it. A timer is an effect that carries the event it fires, so a poll's whole life is in the
 * data the handlers return. The tower serves this module as `/loop.js`.
 */

type Tagged = { type: string }

/** The machine's next state. */
export type StateEffect<S> = { type: 'state'; state: S }

/** Fires `fire` once after `ms`, in place of any timer running under `id`; `timer/cancel` stops the one under `id`. */
export type TimerEffect<E> = { type: 'timer/start'; id: string; ms: number; fire: E } | { type: 'timer/cancel'; id: string }

/** One handler per event type: a missing one is a type error. */
export type Handlers<S, E extends Tagged, F extends Tagged, C> = {
  [K in E['type']]: (state: S, event: Extract<E, { type: K }>, ctx: C) => F[]
}

/** One executor per effect type but `state`, which the loop applies. */
export type Executors<F extends Tagged, E> = {
  [K in Exclude<F['type'], 'state'>]: (effect: Extract<F, { type: K }>, dispatch: (event: E) => void) => void
}

export type Loop<S, E> = { dispatch(event: E): void; state(): S }

/**
 * Runs a machine from `state`. An event dispatched while another is handled (an executor drawing, and the draw asking
 * for a read) waits until that one's effects have all run, so each handler sees the state the one before it left.
 */
export function loop<S, E extends Tagged, F extends Tagged, C>(m: { state: S; handlers: Handlers<S, E, F, C>; ctx: C; execute: Executors<F, E> }): Loop<S, E> {
  let state = m.state
  const queue: E[] = []
  let handling = false
  const step = (event: E) => {
    const handler = m.handlers[event.type as E['type']] as (state: S, event: E, ctx: C) => F[]
    for (const effect of handler(state, event, m.ctx)) {
      if (effect.type === 'state') state = (effect as Tagged as StateEffect<S>).state
      else (m.execute[effect.type as Exclude<F['type'], 'state'>] as (effect: F, dispatch: (event: E) => void) => void)(effect, dispatch)
    }
  }
  const dispatch = (event: E) => {
    queue.push(event)
    if (handling) return
    handling = true
    try {
      for (let next = queue.shift(); next; next = queue.shift()) step(next)
    } finally {
      handling = false
    }
  }
  return { dispatch, state: () => state }
}

/** The executors of `TimerEffect`s, each loop its own. */
export function timers<E>(): Executors<TimerEffect<E>, E> {
  const running = new Map<string, ReturnType<typeof setTimeout>>()
  const cancel = (id: string) => (clearTimeout(running.get(id)), running.delete(id))
  return {
    'timer/start': ({ id, ms, fire }, dispatch) => {
      cancel(id)
      running.set(id, setTimeout(() => (running.delete(id), dispatch(fire)), ms))
    },
    'timer/cancel': ({ id }) => void cancel(id),
  }
}
