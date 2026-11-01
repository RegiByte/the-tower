import type { Subject } from '../../../src/shared/subjects.ts'
import type { CommandKit } from '../../../src/shared/views.ts'
import { DRAFTS } from './drafts.ts'

/** `drafts/new`, on a floor: a new draft on it, in the drafts editor. */
export const newDraft = ({ target, kit }: { target: Subject; kit: CommandKit }) => kit.display(`collection:${target.project}/${DRAFTS}`, { view: 'drafts/editor' })
