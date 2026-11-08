import { type Board, type Card, cardSubject } from '/lib/board.js'
import { addedActions, rankedActions, type Ranked, type Hold, type LayoutEntry } from '/lib/layout.js'
import { heldActions } from '/lib/cards.js'

/** The desk's region, `card.desk`: what it holds, as its `renderer.json` declares, and its entry in the layout. */
export type DeskRegion = { holds: readonly Hold[]; entry: LayoutEntry | undefined }

/**
 * The actions extensions offer on a card, as its desk draws them: those the desk holds (verbs alone: a client command
 * needs a renderer that imports modules), ranked under its layout entry, less the hidden.
 */
export const deskVerbs = (board: Board, c: Card, desk: DeskRegion): Ranked[] => rankedActions(heldActions(desk.holds, addedActions(board, cardSubject(c))), desk.entry)
