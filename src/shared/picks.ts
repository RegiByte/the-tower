/**
 * Text picked in a document a renderer draws in a frame where nothing runs, as a machine (decision `passage-picks`).
 * Nothing inside such a frame is heard (WebKit calls no listener there), so the renderer reads the frame's selection
 * on each animation frame while the document is seen and tells the machine what it read: `seen`, the selection's
 * signature, or none while it is collapsed or holds only white space. A selection unchanged for `SETTLE_MS` is a pick:
 * the machine asks for it to be taken (`pick`), which reads the passage and opens what acts on it. The pick is held
 * until it is let go: `drop` (what acts on it is done, or a click lands outside it), the selection collapsing (a click
 * in the document; focus leaving the frame for the box keeps a selection as it was), or a new pick settling. While a
 * selection grown from the held one is moving (a key extending it), what acts on the held pick is put aside
 * (`moving`), so it stands nowhere it is being picked. @since 1.170
 */
import type { StateEffect, TimerEffect } from './loop.ts'

/** How long a selection stays as it is before it is a pick: there is no `mouseup` to say a drag ended. */
export const SETTLE_MS = 350

export type PickState = { t: 'none' } | { t: 'moving'; sig: string; held: boolean } | { t: 'held'; sig: string }

export type PickEvent = { type: 'seen'; sig: string | undefined } | { type: 'settled'; sig: string } | { type: 'drop' }

/** `pick`: take the selection as it is now; `moving`: put aside what acts on the held pick; `drop`: let the held pick go. */
export type PickEffect = StateEffect<PickState> | TimerEffect<PickEvent> | { type: 'pick' } | { type: 'moving' } | { type: 'drop' }

export const PICK_START: PickState = { t: 'none' }

const state = (s: PickState): PickEffect => ({ type: 'state', state: s })
const settle = (sig: string): PickEffect => ({ type: 'timer/start', id: 'settle', ms: SETTLE_MS, fire: { type: 'settled', sig } })
const unsettle: PickEffect = { type: 'timer/cancel', id: 'settle' }

/** A selection seen: a new one starts moving, putting aside a held pick; one that collapses lets go of what it picked, or would have. */
function seen(s: PickState, sig: string | undefined): PickEffect[] {
  if (s.t === 'none') return sig === undefined ? [] : [state({ t: 'moving', sig, held: false }), settle(sig)]
  if (s.t === 'held') {
    if (sig === s.sig) return []
    return sig === undefined ? [state({ t: 'none' }), { type: 'drop' }] : [state({ t: 'moving', sig, held: true }), { type: 'moving' }, settle(sig)]
  }
  if (sig === s.sig) return []
  if (sig !== undefined) return [state({ ...s, sig }), settle(sig)]
  return s.held ? [state({ t: 'none' }), unsettle, { type: 'drop' }] : [state({ t: 'none' }), unsettle]
}

export const PICK_HANDLERS = {
  seen: (s: PickState, e: Extract<PickEvent, { type: 'seen' }>) => seen(s, e.sig),
  settled: (s: PickState, e: Extract<PickEvent, { type: 'settled' }>): PickEffect[] => (s.t === 'moving' && s.sig === e.sig ? [state({ t: 'held', sig: e.sig }), { type: 'pick' }] : []),
  drop: (s: PickState): PickEffect[] => (s.t === 'none' ? [] : [state({ t: 'none' }), unsettle, { type: 'drop' }]),
}

