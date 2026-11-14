import type { Wait } from '../bridge/board.ts'
import { type Attended, isAbout, isAsk } from './waits.ts'

/** How a wait or an offer rings: how often, and each sound as a score. */

/** How often a viewer wants a wait rung: once as it begins, again every `REMIND_MS` while it waits unwatched, or never. */
export type Ring = 'once' | 'remind' | 'off'
export const RINGS: Ring[] = ['once', 'remind', 'off']
export const REMIND_MS = 30_000

/**
 * A question to answer (a screen, a tool, a failure to look at) rings apart from an answer to read, and both apart
 * from a policy's slot offered: no worker waits on that one yet.
 */
export type Sound = 'question' | 'done' | 'offer'
export const soundOf = (w: Wait): Sound => (w.reason === 'done' ? 'done' : 'question')

/** Each sound as a score every renderer plays its own way: notes in Hz, one after another `step` seconds apart. */
export const SOUNDS: Record<Sound, { notes: number[]; wave: 'sine' | 'triangle'; step: number }> = {
  question: { notes: [880, 1174.66, 880, 1174.66], wave: 'triangle', step: 0.11 },
  done: { notes: [659.25, 987.77], wave: 'sine', step: 0.14 },
  offer: { notes: [523.25, 659.25, 783.99], wave: 'sine', step: 0.16 },
}

/**
 * The sound to ring among `attended` (in `attentionOrder`): the first not about the worker being watched. An ask rings
 * as its `sound` says: as a question, or as an offer.
 */
export const ringingSound = (attended: Attended[], watched: string | undefined): Sound | undefined => {
  const a = attended.find((a) => !isAbout(a, watched))
  return a && (isAsk(a) ? (a.sound === 'offer' ? 'offer' : 'question') : soundOf(a))
}
