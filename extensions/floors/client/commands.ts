import type { Subject } from '../../../src/shared/subjects.ts'
import type { CommandKit } from '../../../src/shared/views.ts'

/** `floors/open`, on the board: the New floor form in the main pane. */
export const newFloor = ({ kit }: { target: Subject; kit: CommandKit }) => kit.display('board', { view: 'floors/form' })
