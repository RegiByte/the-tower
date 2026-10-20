import type { Board } from '../bridge/board.ts'
import { REMIND_MS, attentionOrder, dismissing, findCard, offerTransitions, offersBeganLine, ringingSound, transitions, waitsBeganLine, type Attended, type Ring, type Sound } from './cards.ts'
import type { StateEffect, TimerEffect } from './loop.ts'
import type { Viewer } from './viewer.ts'

/**
 * What a viewer is told about what asks for them (the board's waits and offers): a wait or an offer that begins is
 * said, notified and rung, unless the viewer dismissed it or watches its worker; with `remind`, what they heed rings
 * again every `REMIND_MS` while the tower answers. A dismissal is out of their way until the worker's next wait, and
 * closes its notification. The steps are pure; a renderer's own machine on `/loop.js` runs them through `attendStep`, beside
 * what the viewer looks at, with its executors of what is said, notified, rung and kept in the viewer's record
 * (`/viewer.js`). The tower serves this module as `/attend.js`.
 */

/**
 * The board the last transitions were read against (none until the first, which is silent: what waited when the
 * renderer opened is not news), the keys the viewer dismissed and their ring setting (as their `Viewer` record keeps them), and
 * whether the tower stopped answering, which only `lost` says: a board seen again while it is lost is the one it held.
 */
export type Attending = { board: Board | undefined; dismissed: ReadonlySet<string>; ring: Ring; lost: boolean }

export const attending = (): Attending => ({ board: undefined, dismissed: new Set(), ring: 'once', lost: false })

export type AttendEvent =
  | { type: 'board'; board: Board }
  | { type: 'lost'; lost: boolean }
  | { type: 'stored'; viewer: Pick<Viewer, 'dismissed' | 'ring'> }
  | { type: 'dismiss'; key: string }
  | { type: 'ring'; ring: Ring }
  | { type: 'remind' }

/**
 * `announce` a sentence to a polite live region; `notify` the viewer of what began, and `unnotify` once it is over or
 * dismissed; `sound` a ring; `keep` a field of the viewer's record; the reminder is the timer `remind`.
 */
export type AttendEffect =
  | StateEffect<Attending>
  | { type: 'announce'; text: string }
  | { type: 'notify'; attended: Attended }
  | { type: 'unnotify'; key: string }
  | { type: 'sound'; sound: Sound }
  | { type: 'keep'; field: 'dismissed'; value: string[] }
  | { type: 'keep'; field: 'ring'; value: Ring }
  | TimerEffect<AttendEvent>

/** Whether the viewer's window has their eye: focused, and shown on screen. */
export type Eye = { focused: boolean; visible: boolean }

/** What a window's focus and visibility listeners tell a renderer's machine, one event each. */
export type EyeEvent = { type: 'focus'; focused: boolean } | { type: 'visible'; visible: boolean }

/** The eye after `e`. */
export const eyeStep = (eye: Eye, e: EyeEvent): Eye => (e.type === 'focus' ? { ...eye, focused: e.focused } : { ...eye, visible: e.visible })

/** The worker the viewer watches: the one their view is on (`at`, if any), while the window has their eye. Its waits ring for nobody. */
export const watching = (eye: Eye, at: string | undefined): string | undefined => (eye.focused && eye.visible ? at : undefined)

/** What a step calls for beside the next state, which the step returns apart. */
export type AttendOut = Exclude<AttendEffect, StateEffect<Attending>>

export type AttendStep = [Attending, AttendOut[]]

const REMIND: TimerEffect<AttendEvent> = { type: 'timer/start', id: 'remind', ms: REMIND_MS, fire: { type: 'remind' } }

/** Rings `sound` unless rings are off, the next reminder `REMIND_MS` after it. */
const rung = (a: Attending, sound: Sound | undefined): AttendOut[] =>
  !sound || a.ring === 'off' ? [] : [{ type: 'sound', sound }, ...(a.ring === 'remind' ? [REMIND] : [])]

const heeds = (a: Attending) => (x: Attended) => !a.dismissed.has(x.key)

/** A board arrives: the waits and offers that began are said, notified and rung but for the watched worker's; those that ended close. */
export function seeBoard(a: Attending, board: Board, watched: string | undefined): AttendStep {
  const waits = transitions(a.board, board)
  const offers = offerTransitions(a.board, board)
  const next = { ...a, board }
  const heeded = heeds(a)
  const text = [waitsBeganLine(waits.began.filter(heeded), (id) => findCard(board, id)!.callsign), offersBeganLine(offers.began.filter(heeded))].filter(Boolean).join(' ')
  const began = [...waits.began.filter((w) => heeded(w) && w.id !== watched), ...offers.began.filter(heeded)]
  return [next, [
    ...[...waits.ended, ...offers.ended].map((x): AttendOut => ({ type: 'unnotify', key: x.key })),
    ...(text ? [{ type: 'announce' as const, text }] : []),
    ...began.map((attended): AttendOut => ({ type: 'notify', attended })),
    ...rung(next, ringingSound(began, watched)),
  ]]
}

/** The reminder is due: what the viewer heeds rings again, but for the watched worker's waits, unless the tower is lost. */
export function remind(a: Attending, watched: string | undefined): AttendStep {
  if (a.ring !== 'remind') return [a, []]
  if (a.lost || !a.board) return [a, [REMIND]]
  const sound = ringingSound(attentionOrder(a.board, a), watched)
  return [a, sound ? rung(a, sound) : [REMIND]]
}

/** The viewer dismisses a wait's or an offer's `key`: kept for every renderer of theirs, its notification closed. */
export function dismiss(a: Attending, key: string): AttendStep {
  const dismissed = dismissing(a.board!, a.dismissed, key)
  return [{ ...a, dismissed: new Set(dismissed) }, [{ type: 'keep', field: 'dismissed', value: dismissed }, { type: 'unnotify', key }]]
}

/** The viewer chooses how waits ring: kept for every renderer of theirs. */
export function chooseRing(a: Attending, ring: Ring): AttendStep {
  return [{ ...a, ring }, [{ type: 'keep', field: 'ring', value: ring }, retime(ring)]]
}

/** The dismissals and ring setting as the viewer's record was read: another renderer of theirs may have changed them. */
export function stored(a: Attending, { dismissed, ring }: Pick<Viewer, 'dismissed' | 'ring'>): AttendStep {
  return [{ ...a, dismissed: new Set(dismissed), ring }, ring === a.ring ? [] : [retime(ring)]]
}

/** The reminder runs while the ring is `remind`, and only then. */
const retime = (ring: Ring): AttendOut => (ring === 'remind' ? REMIND : { type: 'timer/cancel', id: 'remind' })

/**
 * The attention machine's step for any of its events, `watched` the worker the viewer watches as it is handled
 * (`watching`): a renderer's own machine holds `Attending` beside what the viewer looks at, and runs each event through it.
 */
export function attendStep(a: Attending, e: AttendEvent, watched: string | undefined): AttendStep {
  switch (e.type) {
    case 'board':
      return seeBoard(a, e.board, watched)
    case 'lost':
      return [{ ...a, lost: e.lost }, []]
    case 'stored':
      return stored(a, e.viewer)
    case 'dismiss':
      return dismiss(a, e.key)
    case 'ring':
      return chooseRing(a, e.ring)
    case 'remind':
      return remind(a, watched)
  }
}

