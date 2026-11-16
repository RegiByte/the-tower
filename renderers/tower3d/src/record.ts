import type { Listener } from '/lib/machine.js'

/**
 * What Tower 3D's machines did, newest last: each event a loop handled and the effects its handler returned, as
 * `Loop.subscribe` hands them. The door reads it (`tower3d.events()`), so an agent testing Tower 3D sees which events
 * ran and what they called for, and a missing effect (a draw) shows as one.
 */

/** One event a loop handled. `at` is the simulated clock (`s.simNow`), which a stepped page steps. */
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

/**
 * The last `size` events of every loop `watch` was given, keeping the events and effects as they were and making them
 * plain only when read. `clock` stamps each record's `at`.
 */
export function eventRecord(size: number, clock: () => number) {
  const kept: EventRecord[] = []
  let n = 0
  const listen = (loop: string): Listener<unknown> => (event, effects) => {
    kept.push({ n: ++n, loop, at: clock(), event, effects })
    if (kept.length > size) kept.shift()
  }
  return {
    /** The listener that records `loop`'s events under its name: `someLoop.subscribe(record.listen('name'))`. */
    listen,
    /** The records kept whose `n` is above `after`, as plain data. */
    read: (after: number): EventRecord[] => kept.filter((r) => r.n > after).map((r) => ({ ...r, event: plain(r.event), effects: r.effects.map((f) => plain(f)) })),
  }
}
