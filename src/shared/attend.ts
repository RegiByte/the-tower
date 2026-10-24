import type { Board } from '../bridge/board.ts'
import { REMIND_MS, askTransitions, asksBeganLine, attentionOrder, dismissing, findCard, isAbout, offerTransitions, offersBeganLine, ringingSound, transitions, waitsBeganLine, type Attended, type Ring, type Sound } from './cards.ts'
import type { Handlers, StateEffect, TimerEffect } from './loop.ts'
import type { Viewer } from './viewer.ts'

/**
 * What a viewer is told about what asks for them (the board's waits, extensions' asks and offers): one that begins is
 * said, notified and rung, unless the viewer dismissed it or watches its worker; with `remind`, what they heed rings
 * again every `REMIND_MS` while the tower answers. A dismissal is out of their way until the worker's next wait, and
 * closes its notification. The machine is `attendHandlers`, one pure handler per event on `/loop.js`; a renderer's own
 * machine holds `Attending` beside what it draws and hands it every `AttendEvent` (through `attendNext`, or its own
 * `loop`), with executors of what is said, notified, rung and kept in the viewer's record (`/viewer.js`). What the
 * viewer looks at reaches it as events too: the window's `focus` and `visible`, and `watch`. The tower serves this
 * module as `/attend.js`.
 */

/** Whether the viewer's window has their eye: focused, and shown on screen. */
export type Eye = { focused: boolean; visible: boolean }

/**
 * The board the last transitions were read against (none until the first, which is silent: what waited when the
 * renderer opened is not news), the keys the viewer dismissed and their ring setting (as their `Viewer` record keeps them),
 * whether the tower stopped answering, which only `lost` says: a board seen again while it is lost is the one it held,
 * and what the viewer looks at: whether their window has their eye, and the worker their view is on (`at`, if any).
 */
export type Attending = { board: Board | undefined; dismissed: ReadonlySet<string>; ring: Ring; lost: boolean; eye: Eye; at: string | undefined }

/** Attention before any board, the viewer looking at no worker, their window as `eye` says. */
export const attending = (eye: Eye = { focused: true, visible: true }): Attending => ({ board: undefined, dismissed: new Set(), ring: 'once', lost: false, eye, at: undefined })

/** What a window's focus and visibility listeners tell a renderer's machine, one event each. */
export type EyeEvent = { type: 'focus'; focused: boolean } | { type: 'visible'; visible: boolean }

export type AttendEvent =
  | { type: 'board'; board: Board }
  | { type: 'lost'; lost: boolean }
  | { type: 'stored'; viewer: Pick<Viewer, 'dismissed' | 'ring'> }
  | { type: 'dismiss'; key: string }
  | { type: 'ring'; ring: Ring }
  | { type: 'remind' }
  | EyeEvent
  | { type: 'watch'; at: string | undefined }

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

/** The eye after `e`. */
export const eyeStep = (eye: Eye, e: EyeEvent): Eye => (e.type === 'focus' ? { ...eye, focused: e.focused } : { ...eye, visible: e.visible })

/** The worker the viewer watches: the one their view is on (`at`, if any), while the window has their eye. Its waits ring for nobody. */
export const watching = (eye: Eye, at: string | undefined): string | undefined => (eye.focused && eye.visible ? at : undefined)

/** The worker `a`'s viewer watches. */
export const watchedIn = (a: Attending): string | undefined => watching(a.eye, a.at)

/** What a step calls for beside the next state, which the step returns apart. */
export type AttendOut = Exclude<AttendEffect, StateEffect<Attending>>

export type AttendStep = [Attending, AttendOut[]]

const REMIND: TimerEffect<AttendEvent> = { type: 'timer/start', id: 'remind', ms: REMIND_MS, fire: { type: 'remind' } }

/** Rings `sound` unless rings are off, the next reminder `REMIND_MS` after it. */
const rung = (a: Attending, sound: Sound | undefined): AttendOut[] =>
  !sound || a.ring === 'off' ? [] : [{ type: 'sound', sound }, ...(a.ring === 'remind' ? [REMIND] : [])]

const heeds = (a: Attending) => (x: Attended) => !a.dismissed.has(x.key)

/** The reminder runs while the ring is `remind`, and only then. */
const retime = (ring: Ring): AttendOut => (ring === 'remind' ? REMIND : { type: 'timer/cancel', id: 'remind' })

const into = (state: Attending): AttendEffect => ({ type: 'state', state })

/** The attention machine: one handler per event. */
export const attendHandlers: Handlers<Attending, AttendEvent, AttendEffect> = {
  /** The waits and offers that began are said, notified and rung but for the watched worker's; those that ended close. */
  board: (a, { board }) => {
    const waits = transitions(a.board, board)
    const asks = askTransitions(a.board, board)
    const offers = offerTransitions(a.board, board)
    const next = { ...a, board }
    const heeded = heeds(a)
    const watched = watchedIn(a)
    const text = [waitsBeganLine(waits.began.filter(heeded), (id) => findCard(board, id)!.callsign), asksBeganLine(asks.began.filter(heeded)), offersBeganLine(offers.began.filter(heeded))].filter(Boolean).join(' ')
    const began = [...waits.began.filter((w) => heeded(w) && w.id !== watched), ...asks.began.filter((x) => heeded(x) && !isAbout(x, watched)), ...offers.began.filter(heeded)]
    return [
      into(next),
      ...[...waits.ended, ...asks.ended, ...offers.ended].map((x): AttendEffect => ({ type: 'unnotify', key: x.key })),
      ...(text ? [{ type: 'announce' as const, text }] : []),
      ...began.map((attended): AttendEffect => ({ type: 'notify', attended })),
      ...rung(next, ringingSound(began, watched)),
    ]
  },
  lost: (a, { lost }) => [into({ ...a, lost })],
  /** The dismissals and ring setting as the viewer's record was read: another renderer of theirs may have changed them. */
  stored: (a, { viewer: { dismissed, ring } }) => [into({ ...a, dismissed: new Set(dismissed), ring }), ...(ring === a.ring ? [] : [retime(ring)])],
  /** A wait's or an offer's `key` dismissed: kept for every renderer of the viewer's, its notification closed. */
  dismiss: (a, { key }) => {
    const dismissed = dismissing(a.board!, a.dismissed, key)
    return [into({ ...a, dismissed: new Set(dismissed) }), { type: 'keep', field: 'dismissed', value: dismissed }, { type: 'unnotify', key }]
  },
  /** How waits ring chosen: kept for every renderer of the viewer's. */
  ring: (a, { ring }) => [into({ ...a, ring }), { type: 'keep', field: 'ring', value: ring }, retime(ring)],
  /** The reminder is due: what the viewer heeds rings again, but for the watched worker's waits, unless the tower is lost. */
  remind: (a) => {
    if (a.ring !== 'remind') return []
    if (a.lost || !a.board) return [REMIND]
    const sound = ringingSound(attentionOrder(a.board, a), watchedIn(a))
    return sound ? rung(a, sound) : [REMIND]
  },
  focus: (a, e) => [into({ ...a, eye: eyeStep(a.eye, e) })],
  visible: (a, e) => [into({ ...a, eye: eyeStep(a.eye, e) })],
  watch: (a, { at }) => [into({ ...a, at })],
}

/** The state after `e`, and what it calls for beside it. */
export function attendNext(a: Attending, e: AttendEvent): AttendStep {
  const effects = (attendHandlers[e.type] as (a: Attending, e: AttendEvent) => AttendEffect[])(a, e)
  return [effects.find((f): f is StateEffect<Attending> => f.type === 'state')?.state ?? a, effects.filter((f): f is AttendOut => f.type !== 'state')]
}

/**
 * The step of `e` with `watched` the worker the viewer watches as it is handled, in place of the `eye` and `at` the
 * state holds (the state returned keeps its own). A machine that hands `focus`, `visible` and `watch` to `attendNext`
 * needs no such argument.
 */
export function attendStep(a: Attending, e: AttendEvent, watched: string | undefined): AttendStep {
  const [next, out] = attendNext({ ...a, eye: { focused: true, visible: true }, at: watched }, e)
  return [{ ...next, eye: a.eye, at: a.at }, out]
}

/** @deprecated `attendStep` of a `board` event. */
export const seeBoard = (a: Attending, board: Board, watched: string | undefined) => attendStep(a, { type: 'board', board }, watched)

/** @deprecated `attendStep` of a `remind` event. */
export const remind = (a: Attending, watched: string | undefined) => attendStep(a, { type: 'remind' }, watched)

/** @deprecated `attendNext` of a `dismiss` event. */
export const dismiss = (a: Attending, key: string) => attendNext(a, { type: 'dismiss', key })

/** @deprecated `attendNext` of a `ring` event. */
export const chooseRing = (a: Attending, ring: Ring) => attendNext(a, { type: 'ring', ring })

/** @deprecated `attendNext` of a `stored` event. */
export const stored = (a: Attending, viewer: Pick<Viewer, 'dismissed' | 'ring'>) => attendNext(a, { type: 'stored', viewer })
