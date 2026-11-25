/**
 * Pins, folded from the extension's own stream: `p` a worker pinned (its session, the floor it ran on, why), `u` one
 * unpinned. The stream is the one place a pin lives, so a worker that went home keeps its pin. Pure.
 */
import type { StreamFact } from '/lib/extension.js'

export const PINS = 'pins'

/** What a `p` fact holds. */
export type Pinned = { session: string; project: string; note?: string }

/** The pins standing, by session: each with when it was pinned. */
export type PinsState = Record<string, Pinned & { at: number }>

/** A pin as the board and the list read carry it: the worker's callsign beside it. */
export type Pin = Pinned & { callsign: string; at: number }

export const NO_PINS: PinsState = {}

export const step = (state: PinsState, [at, code, fact]: StreamFact): PinsState => {
  switch (code) {
    case 'p': {
      const pinned = fact as Pinned
      return { ...state, [pinned.session]: { ...pinned, at } }
    }
    case 'u': {
      const { [(fact as { session: string }).session]: _, ...rest } = state
      return rest
    }
    default:
      throw new Error(`The pins stream holds a fact "${code}", which pins never writes`)
  }
}

/**
 * Every pin, newest first, each with its worker's callsign. A session no log holds any more has no callsign, and is
 * listed by its id.
 */
export const pinsOf = (state: PinsState, callsignOf: (session: string) => string | undefined): Pin[] =>
  Object.values(state)
    .map((p) => ({ ...p, callsign: callsignOf(p.session) ?? p.session }))
    .sort((a, b) => b.at - a.at)
