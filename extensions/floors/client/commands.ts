import type { Subject } from '/lib/board.js'
import type { CommandKit } from '/lib/view.js'

/** `floors/open`, on the board: the New floor form in the main pane. */
export const newFloor = ({ kit }: { target: Subject; kit: CommandKit }) => kit.display('board', { view: 'floors/form' })

/** `floors/watch`, from a clone's ask: floors' clones in the main pane, each running one's screen live. */
export const watchClones = ({ kit }: { target: Subject; kit: CommandKit }) => kit.display('board', { view: 'floors/clones' })
