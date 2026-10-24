import type { Wait } from '../bridge/board.ts'
import { VIEWER_KEYS } from './viewer.ts'
import { type Attended, isOffer } from './waits.ts'

/** How a wait or an offer rings: how often, and each sound as a score. */

/** How often a viewer wants a wait rung: once as it begins, again every `REMIND_MS` while it waits unwatched, or never. */
export type Ring = 'once' | 'remind' | 'off'
export const RINGS: Ring[] = ['once', 'remind', 'off']
export const RING_KEY = VIEWER_KEYS.ring
export const REMIND_MS = 30_000
/** @deprecated The settings popover names each ring: `RING_LABEL` and `RING_MEANS` of /settings.js. */
export const RING_NAME: Record<Ring, string> = { once: 'ring once', remind: 'remind every 30s', off: 'silent' }
/** @deprecated Rings are set in the settings popover, behind the shared `ICON.settings`: `soundSection` of /settings.js. */
export const RING_MARK: Record<Ring, string> = { once: '🔔', remind: '🔔↻', off: '🔕' }

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

/** The wait to ring for among `waits`: the first one not of the worker being watched. */
export const ringing = (waits: Wait[], watched: string | undefined) => waits.find((w) => w.id !== watched)

/** The sound to ring among `attended` (in `attentionOrder`): the first wait not of the worker being watched, else the first offer. */
export const ringingSound = (attended: Attended[], watched: string | undefined): Sound | undefined => {
  const a = attended.find((a) => isOffer(a) || a.id !== watched)
  return a && (isOffer(a) ? 'offer' : soundOf(a))
}
