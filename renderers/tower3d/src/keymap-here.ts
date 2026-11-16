import { COMMANDS, panesOf, type Keys } from '/lib/keys.js'
import type { Board } from './api.ts'
import type { Move } from './cards.ts'

export const MOVE_OF: Record<string, Move> = { 'prev-worker': 'prev', 'next-worker': 'next', 'next-waiting': 'waiting' }

/** The panes Tower 3D draws, by the keymap's names: a desk's tabs, the logbook reader's Screen and Logbook among them. */
export const DRAWN_PANES = new Set(['screen', 'brief', 'changes', 'reviews'])

export const GLOBAL_COMMANDS = new Set<string>(COMMANDS.filter((c) => c.scope === 'global').map((c) => c.id))

/**
 * Whether Tower 3D runs a keymap command: every terminal and field command, each by the terminal or field it works in,
 * and the global ones `runCommand` runs. The others are the tower page's alone.
 */
export const runsHere = (board: Board, id: string) =>
  !GLOBAL_COMMANDS.has(id) || id in MOVE_OF || panesOf(board).some((p) => p.command === id && p.name !== undefined && DRAWN_PANES.has(p.name))

/** The keys of the commands Tower 3D runs, which its pause card's sheet lists. */
export const sheetKeys = (board: Board): Keys => Object.fromEntries(Object.entries(board.keys).filter(([id]) => runsHere(board, id)))
