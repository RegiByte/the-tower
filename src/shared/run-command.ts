import type { Board } from '../bridge/board.ts'
import { commandOf, towerOf } from './added-commands.ts'
import { commandUrl } from './adds.ts'
import type { Added, CommandAction } from './extensions.ts'
import { importServed } from './import-served.ts'
import type { Subject } from './subjects.ts'
import { unlent } from './unlent.ts'
import type { CommandKit } from './views.ts'

/**
 * Runs a client command on `subject` with what the renderer running it lends (`kit`, since 1.104): imports its module
 * from `/x/<cap>/` and calls its export with the tower, the board, `target`, the subject, the action's `args` and the
 * kit. Only a renderer that imports modules runs one: the CLI leaves commands out.
 */
export const runCommandWith = async (board: Board, action: Added<CommandAction>, subject: Subject, kit: CommandKit): Promise<unknown> => {
  const command = commandOf(board, action)
  if (!command) throw new Error(`${action.cap} offers no command ${action.command} now`)
  const module = await importServed(commandUrl(action.cap, command.module))
  const run = module[command.export]
  if (typeof run !== 'function') throw new Error(`${commandUrl(action.cap, command.module)} exports no function ${command.export}`)
  return run({ tower: towerOf(), board, target: subject, args: action.args, kit })
}

/** The kit of a renderer that lends a command nothing: every member fails, naming itself. */
export const NO_KIT: CommandKit = {
  display: unlent('display'),
  toast: unlent('toast'),
  notice: unlent('notice'),
  confirm: unlent('confirm'),
  run: unlent('run'),
  bus: { publish: unlent('bus'), clear: unlent('bus'), at: unlent('bus'), under: unlent('bus'), on: unlent('bus'), mark: unlent('bus'), marks: unlent('bus'), onMark: unlent('bus') },
}

