import type { Board, Card, Floor } from '../bridge/board.ts'
import type { Exemption } from '../bridge/facts.ts'
import { plural } from './format.ts'
import { callOf } from './offered.ts'
import { VIEWER_KEYS } from './viewer.ts'

/** Workers by who reports to whom: crews, the duty order every renderer steps through, and who may hire. */

export const cardsOf = (board: Board) => board.floors.flatMap((f) => f.cards)
export const findCard = (board: Board, id: string) => cardsOf(board).find((c) => c.id === id)

/** The workers that report to a worker: its hires and its reviewers, by start. */
export const hiresOf = (cards: Card[], c: Card) => cards.filter((h) => h.reportsTo === c.id).sort((a, b) => a.startedAt - b.startedAt)

/** Each worker's hires by start, `cards` indexed once: the lookup `hiresOf` makes per worker, linear over a floor's workers. */
export const hiresBy = (cards: Card[]): ((c: Card) => Card[]) => {
  const hires = Map.groupBy(cards, (h) => h.reportsTo)
  for (const list of hires.values()) list.sort((a, b) => a.startedAt - b.startedAt)
  return (c) => hires.get(c.id) ?? []
}

/** Everyone under any worker of `cards` (`crewOf`), each worker's hires indexed once. */
export const crewsOf = (cards: Card[]): ((c: Card) => Card[]) => {
  const hires = hiresBy(cards)
  const crew = (c: Card): Card[] => hires(c).flatMap((h) => [h, ...crew(h)])
  return crew
}

/** A worker's hires on other floors than its own, by start: each is drawn in full on its floor and linked under its hirer. */
export const awayHiresOf = (cards: Card[], c: Card) => hiresOf(cards, c).filter((h) => h.project !== c.project)

/** Everyone under a worker, each before those under it. */
export const crewOf = (cards: Card[], c: Card): Card[] => hiresOf(cards, c).flatMap((h) => [h, ...crewOf(cards, h)])

/** Those `send-home` ends: the worker and everyone under it that runs, each a card, the worker first; none once it no longer offers `send-home`. */
export const sentHome = (cards: Card[], c: Card): Card[] =>
  [c, ...crewOf(cards, c)].filter((h) => (callOf(c, 'send-home') ?? []).some(([, { id }]) => id === h.id))

/** A worker gone home from a crew: off duty, and nobody under it on duty, so drawing it holds no one up. */
export const goneHome = (cards: Card[], c: Card) => !c.onDuty && !crewOf(cards, c).some((h) => h.onDuty)

/**
 * A worker's hires as a crew draws them: `drawn`, the ones not gone home, each with its own crew under it; `home`, the
 * ones gone home, folded to one line; and `folded`, everyone that line holds, those under them included.
 */
export const crewFoldsOf = (cards: Card[]) => {
  const hiresIn = hiresBy(cards)
  const crew = crewsOf(cards)
  const gone = (c: Card) => !c.onDuty && !crew(c).some((h) => h.onDuty)
  return (c: Card) => {
    const hires = hiresIn(c)
    const home = hires.filter(gone)
    return { drawn: hires.filter((h) => !gone(h)), home, folded: home.length + home.flatMap(crew).length }
  }
}

export const crewFold = (cards: Card[], c: Card) => crewFoldsOf(cards)(c)

export const goneHomeLine = (folded: number) => `${folded} gone home`

/** The hirers whose gone-home crew a viewer unfolded, by card id, kept in `tower.store` for every renderer of theirs. */
export const CREWS_UNFOLDED_KEY = VIEWER_KEYS.crewsUnfolded

const reportsUpToDuty = (byId: Map<string, Card>, c: Card): boolean => {
  const up = c.reportsTo === undefined ? undefined : byId.get(c.reportsTo)
  return up !== undefined && (up.onDuty || reportsUpToDuty(byId, up))
}

/**
 * A floor's crews as a renderer lists them, by start: each worker on duty that reports to nobody on duty, however high,
 * heads one, and everyone under it follows at its depth, on duty or not.
 */
export const crewTree = (cards: Card[]): { card: Card; depth: number }[] => {
  const hires = hiresBy(cards)
  const byId = new Map(cards.map((c) => [c.id, c]))
  const under = (c: Card, depth: number): { card: Card; depth: number }[] => [{ card: c, depth }, ...hires(c).flatMap((h) => under(h, depth + 1))]
  return cards
    .filter((c) => c.onDuty && !reportsUpToDuty(byId, c))
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap((c) => under(c, 0))
}

/** A worker's current card by callsign: one on duty wins over past ones, and past ones by the latest start. */
export const workerNamed = (cards: Card[], name: string): Card | undefined => {
  const named = cards.filter((c) => c.callsign === name.toUpperCase())
  return named.find((c) => c.onDuty) ?? named.sort((a, b) => b.id.localeCompare(a.id))[0]
}

/** Workers on duty in the order every renderer steps through them: the top floor first, each floor's crews in order (`crewTree`). */
export const dutyOrder = (board: Board) =>
  [...board.floors].reverse().flatMap((f) => crewTree(f.cards).map(({ card }) => card).filter((c) => c.onDuty))

/** The card `by` steps away from `id` in `order`, wrapping round; from outside the order, the first forward and the last back. */
export const stepFrom = (order: Card[], id: string | undefined, by: 1 | -1): Card | undefined => {
  const at = order.findIndex((c) => c.id === id)
  if (at === -1) return by > 0 ? order[0] : order.at(-1)
  return order[(at + by + order.length) % order.length]
}

/** How many hires deep a worker stands: its hirer's depth and one; a worker nobody hired stands at 0. */
export const hireDepth = (cards: Card[], c: Card): number => {
  const hirer = c.hiredBy && cards.find((h) => h.id === c.hiredBy!.session)
  return hirer ? hireDepth(cards, hirer) + 1 : 0
}

/** A worker exempt from its floor's hiring limits: one a launch contributor exempted at its spawn, a reviewer among them. */
export const exemptFromHiring = (c: Card) => (c.exempt ?? []).some((e) => e.from === 'hiring')

/** An exemption in words, as the card and `tower whoami` say it. */
export const exemptionWords = (e: Exemption) => `exempt from ${EXEMPT_FROM[e.from]} by ${e.by}`

const EXEMPT_FROM: Record<Exemption['from'], string> = { hiring: 'hiring limits' }

/** What each extension has exempted, by capability: the worker, by its current card, and from what. */
export const exemptionsBy = (cards: Card[], cap: string): { session: string; callsign: string; from: Exemption['from'] }[] =>
  cards.filter((c) => !c.continuedBy).flatMap((c) => (c.exempt ?? []).filter((e) => e.by === cap).map((e) => ({ session: c.id, callsign: c.callsign, from: e.from })))

/** A worker's hires that run now, the exempt aside, across the sessions it ran as. */
export const liveHires = (cards: Card[], c: Card) => cards.filter((h) => h.live && !exemptFromHiring(h) && h.hiredBy?.callsign === c.callsign)

/**
 * Why a worker may not hire now under its floor's `hiring`, as a sentence; `undefined` when it may. A hire a launch
 * contributor exempts, a reviewer among them, is never refused.
 */
export const hireRefusal = (cards: Card[], f: Floor, c: Card): string | undefined => {
  const depth = hireDepth(cards, c)
  if (depth + 1 > f.hiring.depth) return `${c.callsign} stands ${plural(depth, 'hire')} deep, and ${f.name} lets hires stand at most ${f.hiring.depth} deep`
  const live = liveHires(cards, c)
  if (live.length >= f.hiring.live) return `${c.callsign}'s hires ${live.map((h) => h.callsign).join(', ')} still run, and ${f.name} lets a worker run ${f.hiring.live} at once`
  return undefined
}
