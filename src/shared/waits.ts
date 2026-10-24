import type { Board, Wait, WaitReason } from '../bridge/board.ts'
import type { Offer } from '../bridge/policies.ts'
import type { BoardAsk } from './extensions.ts'
import { dutyOrder, findCard, stepFrom } from './crews.ts'
import { VIEWER_KEYS } from './viewer.ts'

/**
 * Who waits on you and the offers open: what a viewer heeds, the order to go to them, what began and ended between
 * boards, and moving between workers.
 */

/** Who waits on you, in the order to go to them. */
export const waitingCards = (board: Board) => board.waiting.map((w) => findCard(board, w.id)!)

/**
 * Where each way of moving between workers goes from `id`; `waiting` (`nextWait` over the waits `heed` leaves) is unset
 * when nobody else waits.
 */
export const neighbours = (board: Board, id: string | undefined, heed: Heed) => {
  const to = nextWait(heededWaits(board, heed), heed.visited, id).to
  return { prev: stepFrom(dutyOrder(board), id, -1), next: stepFrom(dutyOrder(board), id, 1), waiting: to && findCard(board, to.id) }
}
export type Move = keyof ReturnType<typeof neighbours>

/**
 * The keys that move between workers at their defaults, by `KeyboardEvent.code`: Option with ↑ ↓ along the duty order,
 * with J to the next one waiting.
 * @deprecated The keymap (`/keymap.js`) holds them as the commands `prev-worker`, `next-worker` and `next-waiting`, at
 * the chords the config binds, on `board.keys`; these ignore the config. Kept until the API's next major.
 */
export const MOVE_KEYS: Record<Move, { code: string; label: string }> = {
  prev: { code: 'ArrowUp', label: '⌥↑' }, next: { code: 'ArrowDown', label: '⌥↓' }, waiting: { code: 'KeyJ', label: '⌥J' },
}
/** @deprecated `commandOf` in `/keymap.js`, over `board.keys`. Kept until the API's next major. */
export const moveOfKey = (e: { code: string; altKey: boolean; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): Move | undefined =>
  e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey ? (Object.keys(MOVE_KEYS) as Move[]).find((m) => MOVE_KEYS[m].code === e.code) : undefined

/**
 * What one viewer did about the waits on the board, keyed by `Wait.key`: `dismissed`, out of their way until the
 * worker's next wait (kept in `tower.store` under `DISMISSED_KEY`, so every renderer of theirs agrees), and `visited`,
 * gone to in this round of `nextWait` (kept by each renderer).
 */
export type Heed = { dismissed: ReadonlySet<string>; visited: ReadonlySet<string> }

export const DISMISSED_KEY = VIEWER_KEYS.dismissed

/** The waits a viewer hasn't dismissed, in the board's order. */
export const heededWaits = (board: Board, heed: Pick<Heed, 'dismissed'>) => board.waiting.filter((w) => !heed.dismissed.has(w.key))

/** The offers a viewer hasn't dismissed, oldest first. A dismissed offer stays open, and stays acceptable, until its policy's next slot. */
export const heededOffers = (board: Board, heed: Pick<Heed, 'dismissed'>) => board.offers.filter((o) => !heed.dismissed.has(o.key))

/** The asks of extensions a viewer hasn't dismissed, oldest first. */
export const heededAsks = (board: Board, heed: Pick<Heed, 'dismissed'>) => board.asks.filter((a) => !heed.dismissed.has(a.key))

/** What asks for you: a worker's wait, an extension's ask (`board.asks`), or a policy's slot offered (`board.offers`), which has no worker yet. */
export type Attended = Wait | BoardAsk | Offer

export const isOffer = (a: Attended): a is Offer => 'policy' in a

export const isAsk = (a: Attended): a is BoardAsk => 'cap' in a

/** Everything asking for you that a viewer heeds, in the order to go to them: the workers' waits, the extensions' asks, then the offers. */
export const attentionOrder = (board: Board, heed: Pick<Heed, 'dismissed'>): Attended[] => [...heededWaits(board, heed), ...heededAsks(board, heed), ...heededOffers(board, heed)]

/** The dismissed keys to store once `key` (a wait's, an ask's or an offer's) is dismissed too: those that are over drop out. */
export const dismissing = (board: Board, dismissed: ReadonlySet<string>, key: string) =>
  [...board.waiting, ...board.asks, ...board.offers].map((a) => a.key).filter((k) => k === key || dismissed.has(k))

/**
 * The waits that began and the waits that ended between two boards. On the first board a renderer sees nothing begins
 * or ends: what already waited when it opened is not news.
 */
export const transitions = (prev: Board | undefined, next: Board): { began: Wait[]; ended: Wait[] } => (prev ? keyed(prev.waiting, next.waiting) : { began: [], ended: [] })

/** The offers that opened and the offers that closed between two boards, as `transitions` reads waits. */
export const offerTransitions = (prev: Board | undefined, next: Board): { began: Offer[]; ended: Offer[] } => (prev ? keyed(prev.offers, next.offers) : { began: [], ended: [] })

/** The asks that began and the asks that ended between two boards, as `transitions` reads waits. */
export const askTransitions = (prev: Board | undefined, next: Board): { began: BoardAsk[]; ended: BoardAsk[] } => (prev ? keyed(prev.asks, next.asks) : { began: [], ended: [] })

/** Whether `a` is about the worker `id`: its wait, or an ask about its card. */
export const isAbout = (a: Attended, id: string | undefined) => id !== undefined && (isAsk(a) ? a.subject === `card:${id}` : !isOffer(a) && a.id === id)

const keyed = <T extends { key: string }>(prev: T[], next: T[]) => {
  const before = new Set(prev.map((a) => a.key))
  const after = new Set(next.map((a) => a.key))
  return { began: next.filter((a) => !before.has(a.key)), ended: prev.filter((a) => !after.has(a.key)) }
}

/**
 * The next wait to go to from the worker `here`, round-robin: the first in `waits` that isn't `here`'s and wasn't
 * visited this round, and the visited keys to keep once there. `here`'s own wait counts as visited. When every other
 * wait was visited, a new round starts at the first. An offer is no worker's: it is never `here`'s (`nextAttended` places a viewer at a floor's offers).
 */
export const nextWait = <T extends { key: string; id?: string }>(waits: T[], visited: ReadonlySet<string>, here: string | undefined): { to?: T; visited: Set<string> } =>
  nextIn(waits, visited, (w) => w.id !== undefined && w.id === here)

/**
 * `nextWait` over `attentionOrder` from where the viewer is: the worker `here.id`, whose waits and the asks about it
 * count as visited, or the floor `here.policies` whose policies are open, whose offers count as visited the same way.
 */
export const nextAttended = (attended: Attended[], visited: ReadonlySet<string>, here: { id?: string; policies?: string }) =>
  nextIn(attended, visited, (a) => (isOffer(a) ? a.project === here.policies : isAbout(a, here.id)))

const nextIn = <T extends { key: string }>(waits: T[], visited: ReadonlySet<string>, heres: (w: T) => boolean): { to?: T; visited: Set<string> } => {
  const at = waits.filter(heres).map((w) => w.key)
  const seen = new Set([...at, ...waits.map((w) => w.key).filter((k) => visited.has(k))])
  const others = waits.filter((w) => !heres(w))
  const fresh = others.find((w) => !seen.has(w.key))
  const to = fresh ?? others[0]
  if (!to) return { visited: seen }
  return { to, visited: new Set([...(fresh ? seen : []), to.key]) }
}

/** Why a worker waits on you, as a screen reader says it. */
export const WAIT_SAID: Record<WaitReason, string> = { blocked: 'held by a screen', asks: 'asks you', failed: 'failed', done: 'done' }

/** What a renderer's polite live region says as `began` waits begin (`transitions`): one sentence per wait, empty for none. */
export const waitsBeganLine = (began: Wait[], callsignOf: (id: string) => string) =>
  began.map((w) => `${callsignOf(w.id)} is waiting on you: ${WAIT_SAID[w.reason]}.`).join(' ')

export const DISMISS_TITLE = 'dismiss this wait: out of your way until the worker waits again'

/** What a renderer's polite live region says as `began` offers open (`offerTransitions`): one sentence per offer, empty for none. */
export const offersBeganLine = (began: Offer[]) => began.map((o) => `${o.title ?? o.tag} is offered: a slot to start.`).join(' ')

export const DISMISS_OFFER_TITLE = 'dismiss this offer: out of your way, still open until its next slot'

/** What a renderer's polite live region says as `began` asks begin (`askTransitions`): one sentence per ask, empty for none. */
export const asksBeganLine = (began: BoardAsk[]) => began.map((a) => `${a.title}, asked by ${a.cap}.`).join(' ')

export const DISMISS_ASK_TITLE = 'dismiss this ask: out of your way while it stands'
