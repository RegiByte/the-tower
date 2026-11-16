import type { Listener } from '/lib/machine.js'

/**
 * What Tower 3D's machines did, newest last: each event a loop handled and the effects its handler returned, as
 * `Loop.subscribe` hands them. The door reads it (`tower3d.events()`), so an agent testing Tower 3D sees which events
 * ran and what they called for, and a missing effect (a draw) shows as one.
 */

/**
 * One event a loop handled. `at` is the simulated clock (`s.simNow`), which a stepped page steps. A board anywhere in
 * the event or its effects is kept as its summary, `{ $board, floors, cards, waiting }`.
 */
export type EventRecord = { n: number; loop: string; at: number; event: unknown; effects: readonly unknown[] }

/** Anything JSON carries as it is: what `plain` makes of a value, so a read through JSON loses nothing silently. */
export type Plain = null | boolean | number | string | Plain[] | { [key: string]: Plain }

/** How many records the door keeps. */
export const EVENTS_KEPT = 200

/** The `is<Name>` flag three.js and similar classes set (`isVector3`), which survives minifying where a class name doesn't. */
const flagged = (o: object) => {
  for (const key in o) if (/^is[A-Z]/.test(key) && (o as Record<string, unknown>)[key] === true) return key.slice(2)
  return undefined
}

/**
 * `value` as plain data. A Set is `{ $set: [...] }`, a Map `{ $map: [[key, value], ...] }`, a Date `{ $date }`, an
 * Error `{ $error, message }`, a DOM node `{ $node, id }`, a function `{ $fn }`. A three.js object, material, texture or
 * geometry is `{ $three: type, name }`, its graph left out; any other class instance is `{ $class, ...its own fields }`.
 * A value met again inside itself is `{ $cycle: true }`; a number JSON can't carry is its string; `undefined` is left
 * out of objects and `null` in arrays, as JSON does.
 */
export function plain(value: unknown, above: object[] = []): Plain {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (value === undefined) return null
  if (typeof value === 'bigint' || typeof value === 'symbol') return value.toString()
  if (typeof value === 'function') return { $fn: value.name }
  const o = value as object
  if (above.includes(o)) return { $cycle: true }
  const inner = [...above, o]
  const each = (v: unknown) => plain(v, inner)
  if (Array.isArray(o)) return o.map(each)
  if (o instanceof Set) return { $set: [...o].map(each) }
  if (o instanceof Map) return { $map: [...o].map(([k, v]) => [each(k), each(v)]) }
  if (o instanceof Date) return { $date: Number.isNaN(o.getTime()) ? 'Invalid Date' : o.toISOString() }
  if (o instanceof Error) return { $error: o.name, message: o.message }
  if (typeof Node !== 'undefined' && o instanceof Node) return { $node: o.nodeName, id: o instanceof Element ? o.id : '' }
  const three = o as { isObject3D?: true; isMaterial?: true; isTexture?: true; isBufferGeometry?: true; type?: string; name?: string }
  if (three.isObject3D || three.isMaterial || three.isTexture || three.isBufferGeometry) return { $three: three.type ?? flagged(o) ?? 'object', name: three.name ?? '' }
  const fields = Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (v === undefined ? [] : [[k, each(v)]])))
  const proto = Object.getPrototypeOf(o)
  return proto === Object.prototype || proto === null ? fields : { $class: flagged(o) ?? proto.constructor?.name ?? 'object', ...fields }
}

/** A board, by its shape: every board the tower sends has its floors, its waits and whether the host is up. */
const isBoard = (o: Record<string, unknown>) => Array.isArray(o.floors) && Array.isArray(o.waiting) && typeof o.hostUp === 'boolean'

/**
 * `value` with every board in it replaced by `summary(board)`, its plain objects and arrays copied and everything else
 * kept by reference: a board, a fresh tree on each arrival, is most of what an event weighs, and a record that kept it
 * would hold every board of the last 200 events alive.
 */
function lean(value: unknown, summary: (board: object) => unknown, above: object[] = []): unknown {
  if (typeof value !== 'object' || value === null || above.includes(value)) return value
  const inner = [...above, value]
  if (Array.isArray(value)) return value.map((v) => lean(v, summary, inner))
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  const o = value as Record<string, unknown>
  if (isBoard(o)) return summary(o)
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, lean(v, summary, inner)]))
}

/**
 * The last `size` events of every loop given its `listen`, the events and effects kept as they were but for their
 * boards (`lean`), and made plain only when read. `clock` stamps each record's `at`.
 */
export function eventRecord(size: number, clock: () => number) {
  const kept: EventRecord[] = []
  let n = 0
  /** Each board met, numbered in the order met: the same board in two records has the same number. */
  const boards = new WeakMap<object, number>()
  let met = 0
  const summary = (board: object) => {
    if (!boards.has(board)) boards.set(board, ++met)
    const b = board as { floors: { cards: unknown[] }[]; waiting: unknown[] }
    return { $board: boards.get(board), floors: b.floors.length, cards: b.floors.reduce((sum, f) => sum + f.cards.length, 0), waiting: b.waiting.length }
  }
  const listen = (loop: string): Listener<unknown> => (event, effects) => {
    kept.push({ n: ++n, loop, at: clock(), event: lean(event, summary), effects: effects.map((f) => lean(f, summary)) })
    if (kept.length > size) kept.shift()
  }
  return {
    /** The listener that records `loop`'s events under its name: `someLoop.subscribe(record.listen('name'))`. */
    listen,
    /** The records kept whose `n` is above `after`, as plain data. */
    read: (after: number): EventRecord[] => kept.filter((r) => r.n > after).map((r) => ({ ...r, event: plain(r.event), effects: r.effects.map((f) => plain(f)) })),
  }
}
