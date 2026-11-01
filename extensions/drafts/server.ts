/**
 * The drafts extension: its launch contributor tells each worker on a floor where drafts is on how to keep an idea or a
 * prompt for later, so the brief names the drafts collection only where the floor has it.
 */
import type { Start } from '../../src/shared/extensions.ts'

const KEEPING =
  '- Keeping for later: an idea off the current goal, or a prompt the user wants for a later session, goes in the ' +
  "floor's drafts with `tower keep drafts` (markdown on stdin, its first line a title, written to stand on its own). " +
  'Name it to the user by the tag and title it prints, and carry on.'

const start: Start = () => ({ launch: () => ({ systemPrompt: [KEEPING] }) })

export default start
