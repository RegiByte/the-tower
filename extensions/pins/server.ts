/**
 * The pins extension: a worker pinned as a conversation worth coming back to, with a note on why. Pins live in the
 * extension's system stream, so the board fold lists every pin, the workers sent home included; a worker's card offers
 * Pin to sidebar or Unpin from sidebar and says it is pinned.
 */
import type { Board, Card } from '/lib/board.js'
import { apiError, type ApiError, isApiError, type CallCtx, type FoldCtx, type Part, type Start } from '/lib/extension.js'
import { NO_PINS, PINS, pinsOf, step, type Pin, type PinsState } from './pins.ts'

/** The session a call is about: the one it names, else the calling worker's own. */
const sessionOf = (named: string | undefined, caller: CallCtx['caller']): string | ApiError =>
  named ?? (caller.t === 'worker' && caller.id ? caller.id : apiError('invalid', 'Only a worker pins itself: name the worker with --session <id> (`tower agents --all` lists them)'))

const listLine = (p: Pin) => `${p.callsign}  ${p.project}  ${p.session}${p.note ? `  ${p.note}` : ''}`

const start: Start = (ctx) => {
  const pins = () => ctx.own.streams(PINS) as PinsState

  /** The card of a session the system holds, gone home or not, or why there is none. */
  const cardOf = (c: CallCtx, session: string): Card | ApiError =>
    c.cards().find((card) => card.id === session) ?? apiError('not_found', `No worker has the session ${session}: \`tower agents --all\` lists them`)

  return {
    reduce: { [PINS]: { init: NO_PINS, step } },
    folds: {
      card: (card: Card, { own }: FoldCtx): Part => {
        const pin = (own.streams[PINS] as PinsState)[card.id]
        const call = { session: card.id }
        return pin
          ? { badges: [{ label: 'pinned', tone: 'quiet', hint: pin.note || 'pinned to come back to', icon: 'pin.svg' }], actions: [{ verb: `${ctx.provides}/unpin`, call }] }
          : { actions: [{ verb: `${ctx.provides}/pin`, call }] }
      },
      board: (_board: Board, { own, callsignOf }: FoldCtx): Part => ({ x: { pins: pinsOf(own.streams[PINS] as PinsState, callsignOf) } }),
    },
    verbs: {
      pin: async ({ session: named, note }: { session?: string; note?: string }, c: CallCtx) => {
        const session = sessionOf(named, c.caller)
        if (isApiError(session)) return session
        const card = cardOf(c, session)
        if (isApiError(card)) return card
        const trimmed = note?.trim()
        await c.streams.append(PINS, {}, 'p', { session, project: card.project, ...(trimmed && { note: trimmed }) })
        return { session, callsign: card.callsign, said: `${card.callsign} is pinned${trimmed ? `: ${trimmed}` : ''}` }
      },
      unpin: async ({ session: named }: { session?: string }, c: CallCtx) => {
        const session = sessionOf(named, c.caller)
        if (isApiError(session)) return session
        if (!pins()[session]) return apiError('not_found', `The session ${session} isn't pinned: \`tower x pins list\` lists the pins`)
        await c.streams.append(PINS, {}, 'u', { session })
        const callsign = c.cards().find((card) => card.id === session)?.callsign ?? session
        return { session, said: `${callsign} is unpinned` }
      },
    },
    reads: {
      list: (_req: unknown, c: CallCtx) => {
        const cards = c.cards()
        const listed = pinsOf(pins(), (s) => cards.find((card) => card.id === s)?.callsign)
        return { pins: listed, said: listed.length ? listed.map(listLine).join('\n') : 'No worker is pinned: `tower x pins pin --note <why>` pins you' }
      },
    },
  }
}
export default start
