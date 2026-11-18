import type { Subject } from '/lib/board.js'
import type { CommandKit } from '/lib/view.js'

/** `guides/open`, on the board: the learning center in the main pane. */
export const openCenter = ({ kit }: { target: Subject; kit: CommandKit }) => kit.display('board', { view: 'guides/center' })
