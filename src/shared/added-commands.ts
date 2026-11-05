import type { Board } from '../bridge/board.ts'
import type { Added, CommandAction, ExtensionCommand } from './extensions.ts'

/** An extension's command as the board shows it, while its extension runs. */
export const commandOf = (board: Board, action: Added<CommandAction>): ExtensionCommand | undefined =>
  board.extensions.find((e) => e.provides === action.cap && e.state === 'started')?.commands.find((c) => c.name === action.command)

/** The page's `tower`, from `/tower.js`, as far as a verb is called on it. */
export const towerOf = () => (globalThis as unknown as { tower: { call(verb: never, body: never): Promise<unknown> } }).tower
