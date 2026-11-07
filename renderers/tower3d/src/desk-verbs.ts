import type { Board, Card } from '../../../src/bridge/board.ts'
import { addedActions, cardSubject, heldActions, rankedActions, type Ranked } from '../../../src/shared/adds.ts'
import type { Hold, LayoutEntry } from '../../../src/shared/regions.ts'

/** The desk's region, `card.desk`: what it holds, as its `renderer.json` declares, and its entry in the layout. */
export type DeskRegion = { holds: readonly Hold[]; entry: LayoutEntry | undefined }

/**
 * The actions extensions offer on a card, as its desk draws them: those the desk holds (verbs alone: a client command
 * needs a renderer that imports modules), ranked under its layout entry, less the hidden.
 */
export const deskVerbs = (board: Board, c: Card, desk: DeskRegion): Ranked[] => rankedActions(heldActions(desk.holds, addedActions(board, cardSubject(c))), desk.entry)
