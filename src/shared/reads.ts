import type { Handlers, StateEffect } from './loop.ts'

/**
 * Reads a viewer holds: each slot (a thread, a worker's Changes) is read at a key (the version of its file, a scope),
 * and holds what it last read until the next read lands. A read is numbered as it starts, so one overtaken by a later
 * read of its slot lands on nothing. A failure is shown only while nothing is held; over a held value it is a toast.
 * The steps are pure, over `Reads`, for a renderer's own machines to compose; `heldHandlers` is the machine of plain
 * held reads on `/loop.js`. The tower serves this module as `/reads.js`.
 */

/** A value a slot held, at the key it was read at. */
export type Last<V> = { key: string; value: V } | undefined

/**
 * A slot read at `key`: being read, read, or failed to be read. While reading anew, and once that read failed, it holds
 * `last`, what it read before, at its own key.
 */
export type Held<V> =
  | { t: 'reading'; key: string; n: number; last: Last<V> }
  | { t: 'read'; key: string; n: number; value: V }
  | { t: 'failed'; key: string; n: number; message: string; last: Last<V> }

/** Every slot's read, by slot, and the number the last read started took. */
export type Reads<V> = { n: number; held: Readonly<Record<string, Held<V>>> }

export const noReads = <V>(): Reads<V> => ({ n: 0, held: {} })

export type ReadEvent<V> =
  | { type: 'want'; slot: string; key: string }
  | { type: 'refresh'; slot: string; key: string }
  | { type: 'got'; slot: string; n: number; value: V }
  | { type: 'failed'; slot: string; n: number; message: string }

/** `read` asks the executor to read `slot` at `key` and dispatch `got` or `failed` with `n`; `draw` follows a read that landed or failed. */
export type ReadEffect = { type: 'read'; slot: string; key: string; n: number } | { type: 'draw' } | { type: 'toast'; message: string }

/** Reads after a step, and the effects it calls for. */
export type ReadStep<V> = [Reads<V>, ReadEffect[]]

/** The value a slot holds, read at any key. */
export const valueOf = <V>(h: Held<V> | undefined): V | undefined => held(h)?.value

/** The value a slot holds as read at `key`. */
export const valueAt = <V>(h: Held<V> | undefined, key: string): V | undefined => {
  const last = held(h)
  return last?.key === key ? last.value : undefined
}

/** Why a slot's read failed, while it holds nothing. */
export const failureOf = <V>(h: Held<V> | undefined) => (h?.t === 'failed' && !h.last ? h.message : undefined)

/** Why a slot's read failed, while it holds nothing read at `key`. */
export const failureAt = <V>(h: Held<V> | undefined, key: string) => (h?.t === 'failed' && h.last?.key !== key ? h.message : undefined)

function held<V>(h: Held<V> | undefined): Last<V> {
  return h?.t === 'read' ? { key: h.key, value: h.value } : h?.last
}

const put = <V>(r: Reads<V>, slot: string, h: Held<V>): Reads<V> => ({ n: Math.max(r.n, h.n), held: { ...r.held, [slot]: h } })

/** Reads `slot` at `key` now, holding what it holds until the read lands. */
export function refreshRead<V>(r: Reads<V>, slot: string, key: string): ReadStep<V> {
  const n = r.n + 1
  return [put(r, slot, { t: 'reading', key, n, last: held(r.held[slot]) }), [{ type: 'read', slot, key, n }]]
}

/** Reads `slot` at `key` unless it holds that key's read already, or is reading it, or failed to: a failed read is read again only when asked (`refreshRead`). */
export const wantRead = <V>(r: Reads<V>, slot: string, key: string): ReadStep<V> =>
  r.held[slot]?.key === key ? [r, []] : refreshRead(r, slot, key)

export function landRead<V>(r: Reads<V>, slot: string, n: number, value: V): ReadStep<V> {
  const h = r.held[slot]
  if (h?.n !== n) return [r, []]
  return [put(r, slot, { t: 'read', key: h.key, n, value }), [{ type: 'draw' }]]
}

export function failRead<V>(r: Reads<V>, slot: string, n: number, message: string): ReadStep<V> {
  const h = r.held[slot]
  if (h?.n !== n) return [r, []]
  const last = held(h)
  return [put(r, slot, { t: 'failed', key: h.key, n, message, last }), [last ? { type: 'toast', message } : { type: 'draw' }]]
}

/** A step's effects with the state it left, for a handler to return; a step that calls for nothing changed nothing. */
export const stepped = <S, V>([r, effects]: ReadStep<V>, into: (r: Reads<V>) => S): (StateEffect<S> | ReadEffect)[] =>
  effects.length ? [{ type: 'state', state: into(r) }, ...effects] : []

/** The machine of plain held reads: a renderer's loop runs it with an executor for each `ReadEffect`. */
export const heldHandlers = <V>(): Handlers<Reads<V>, ReadEvent<V>, StateEffect<Reads<V>> | ReadEffect, unknown> => {
  const same = (r: Reads<V>) => r
  return {
    want: (r, e) => stepped(wantRead(r, e.slot, e.key), same),
    refresh: (r, e) => stepped(refreshRead(r, e.slot, e.key), same),
    got: (r, e) => stepped(landRead(r, e.slot, e.n, e.value), same),
    failed: (r, e) => stepped(failRead(r, e.slot, e.n, e.message), same),
  }
}

/** The executor of `read`: what `read` resolves to lands, why it rejects fails. */
export const reading =
  <V>(read: (slot: string, key: string) => Promise<V>) =>
  (f: Extract<ReadEffect, { type: 'read' }>, dispatch: (e: Extract<ReadEvent<V>, { type: 'got' | 'failed' }>) => void) =>
    void read(f.slot, f.key).then(
      (value) => dispatch({ type: 'got', slot: f.slot, n: f.n, value }),
      (err: Error) => dispatch({ type: 'failed', slot: f.slot, n: f.n, message: err.message }),
    )
