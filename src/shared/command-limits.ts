import type { Board, CommandLimits, Floor } from '../bridge/board.ts'

/** Each `argv` command's limits on the board, an account's. */

type Limits = Pick<Board, 'limits'>

/** The entry of `command`; the first, the default command's, for none. */
const entryOf = (board: Limits, command: string | undefined): CommandLimits | undefined =>
  command === undefined ? board.limits[0] : board.limits.find((l) => l.command === command)

/** A named command's limits; none for a name `argv` doesn't hold. */
export const limitsOf = (board: Limits, command: string): CommandLimits | undefined => entryOf(board, command)

/** The default command's limits: the only ones in single-command mode. */
export const defaultLimits = (board: Limits): CommandLimits => entryOf(board, undefined)!

/** A floor's own limits: its `command`'s, or the default command's on a floor that names none. */
export const floorLimits = (board: Limits, floor: Pick<Floor, 'command'>): CommandLimits => entryOf(board, floor.command)!
