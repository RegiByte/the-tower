import type { Board } from '../bridge/board.ts'
import { commandOf, towerOf } from './added-commands.ts'
import { commandUrl, isCommand, runVerb } from './adds.ts'
import type { Action, Added, CommandAction } from './extensions.ts'
import type { Subject } from './subjects.ts'
import type { CommandKit } from './views.ts'

/**
 * Runs a client command on `subject` with what the renderer running it lends (`kit`, since 1.104): imports its module
 * from `/x/<cap>/` and calls its export with the tower, the board, `target`, the subject, `subject`, its value until
 * 2.0, the action's `args` and the kit. Only a renderer that imports modules runs one: the CLI leaves commands out.
 */
export const runCommandWith = async (board: Board, action: Added<CommandAction>, subject: Subject, kit: CommandKit): Promise<unknown> => {
  const command = commandOf(board, action)
  if (!command) throw new Error(`${action.cap} offers no command ${action.command} now`)
  const module = await import(commandUrl(action.cap, command.module))
  if (typeof module[command.export] !== 'function') throw new Error(`${commandUrl(action.cap, command.module)} exports no function ${command.export}`)
  return module[command.export]({ tower: towerOf(), board, subject: subject.value, target: subject, args: action.args, kit })
}

const unlent = (member: string) => () => {
  throw new Error(`this renderer lends no ${member}: a command that uses kit.${member} runs where a renderer's kit holds it`)
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

/** Runs a client command on `subject` in a renderer that lends it no kit (`runCommandWith`). */
export const runCommand = (board: Board, action: Added<CommandAction>, subject: Subject): Promise<unknown> => runCommandWith(board, action, subject, NO_KIT)

/** Runs an action an extension added: its verb called with its call, or its command run on `subject`. */
export const runAdded = (board: Board, action: Added<Action>, subject: Subject): Promise<unknown> =>
  isCommand(action) ? runCommand(board, action, subject) : runVerb(action)
