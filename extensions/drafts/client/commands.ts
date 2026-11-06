import type { Subject } from '/lib/board.js'
import type { CommandKit } from '/lib/view.js'
import { DRAFTS } from './drafts.ts'

/** `drafts/new`, on a floor: a new draft on it, in the drafts editor. */
export const newDraft = ({ target, kit }: { target: Subject; kit: CommandKit }) => kit.display(`collection:${target.project}/${DRAFTS}`, { view: 'drafts/editor' })
