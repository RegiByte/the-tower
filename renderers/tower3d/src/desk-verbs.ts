import type { Board, Card } from '../../../src/bridge/board.ts'
import { addedActions, cardSubject, heldActions, rankedActions, type Ranked } from '../../../src/shared/adds.ts'
import type { Action, Added } from '../../../src/shared/extensions.ts'
import type { Hold, LayoutEntry } from '../../../src/shared/regions.ts'

/** The desk's region, `card.desk`: what it holds, as its `renderer.json` declares, and its entry in the layout. */
export type DeskRegion = { holds: readonly Hold[]; entry: LayoutEntry | undefined }

/**
 * The actions extensions offer on a card, as its desk draws them: those the desk holds (verbs alone: a client command
 * needs a renderer that imports modules), ranked under its layout entry, less the hidden.
 */
export const deskVerbs = (board: Board, c: Card, desk: DeskRegion): Ranked[] => rankedActions(heldActions(desk.holds, addedActions(board, cardSubject(c))), desk.entry)

/** Each ranked verb with its place among those of its `actionId`. */
export const placed = (verbs: Ranked[]) => verbs.map((r, n) => ({ ...r, k: verbs.slice(0, n).filter((o) => o.id === r.id).length }))

/**
 * The key a destructive extension verb on a card is armed under: its card, the action itself, and its place among the
 * card's verbs of its `actionId`. A pin or a hide moves every action of an id together, so whatever reorders the desk,
 * a second press confirms only the very action the first one armed.
 */
export const addedKey = (c: Card, action: Added<Action>, k: number) => `added ${c.id} ${k} ${JSON.stringify(action)}`
