import type { Board, Card } from '../bridge/board.ts'
import { exemptionWords } from './crews.ts'
import type { Action, Added, Badge, CommandAction, ExtensionCommand, VerbAction, Words } from './extensions.ts'
import type { Tower } from './shelf-page.ts'
import type { Subject } from './subjects.ts'

/**
 * What extensions add to the board's subjects, as every renderer draws it (decision `extensions`): a subject's actions
 * and badges beside the core's, each action's words, and running one. A renderer names a subject with `/subjects.js`'s
 * constructors, served here too (`cardSubject`, `floorSubject`, `itemSubject`, …).
 */

export * from './subjects.ts'

/** A command's action, tagged with the capability whose client module runs it. */
export const isCommand = (action: Action): action is CommandAction => 'command' in action

/** The commands offered on `subject` with no fold: each running extension's whose `on` holds its kind, on a floor it is on. */
const offeredCommands = (board: Board, subject: Subject): Added<CommandAction>[] =>
  board.extensions
    .filter((e) => e.state === 'started' && !(subject.project !== undefined && e.off?.includes(subject.project)))
    .flatMap((e) => e.commands.filter((c) => c.on?.includes(subject.kind)).map((c) => ({ command: c.name, cap: e.provides })))

/** The commands offered on no subject kind: each running extension's that has no `on`, run on the board, from a palette. */
export const unboundCommands = (board: Board): Added<CommandAction>[] =>
  board.extensions.filter((e) => e.state === 'started').flatMap((e) => e.commands.filter((c) => !c.on).map((c) => ({ command: c.name, cap: e.provides })))

/** What extensions offer on `subject`: their folds' actions, in fold order, then the commands offered on its kind. */
export const addedActions = (board: Board, subject: Subject): Added<Action>[] => [...(board.adds[subject.key]?.actions ?? []), ...offeredCommands(board, subject)]

/** The actions the core offers on `subject`: a card's, a floor's or a conversation's; none on the rest. */
const coreActions = (subject: Subject): { verb: string }[] =>
  ['card', 'floor', 'conversation'].includes(subject.kind) ? (subject.value as { actions: { verb: string }[] }).actions : []

/** Everything offered on `subject`: the core's actions, then what extensions add. */
export const actionsOf = (board: Board, subject: Subject): ({ verb: string } | Added<Action>)[] => [...coreActions(subject), ...addedActions(board, subject)]

/**
 * The badges extensions show beside `subject`: on a card, each exemption a launch contributor gave its worker, so no
 * limit is lifted unseen; then what folds add, in fold order.
 */
export const badgesOf = (board: Board, subject: Subject): Added<Badge>[] => [
  ...(subject.kind === 'card' ? ((subject.value as Card).exempt ?? []).map((e) => ({ label: 'exempt', tone: 'offered' as const, hint: exemptionWords(e), cap: e.by })) : []),
  ...(board.adds[subject.key]?.badges ?? []),
]

/** The lines extensions add to what `tower whoami` prints for the worker of `card`. */
export const linesOf = (board: Board, card: string): string[] => (board.adds[`card:${card}`]?.lines ?? []).map((l) => l.text)

/** An extension's command as the board shows it, while its extension runs. */
const commandOf = (board: Board, action: Added<CommandAction>): ExtensionCommand | undefined =>
  board.extensions.find((e) => e.provides === action.cap && e.state === 'started')?.commands.find((c) => c.name === action.command)

/** An action in words: its verb's, as its provider's manifest says them, or its command's; its name when it has none. */
export const actionWords = (board: Board, action: Added<Action>): Words => {
  if (isCommand(action)) return commandOf(board, action)?.words ?? { label: action.command }
  const at = action.verb.indexOf('/')
  return board.extensions.find((e) => e.provides === action.verb.slice(0, at))?.verbs.find((v) => v.name === action.verb)?.words ?? { label: action.verb.slice(at + 1) }
}

/** Where a client command's module is served. */
export const commandUrl = (cap: string, module: string) => `/x/${cap}/${module}`

/**
 * Runs a client command on `subject`: imports its module from `/x/<cap>/` and calls its export with the tower, the board,
 * the subject's value and the action's `args`. Only a renderer that imports modules runs one: the CLI and Tower 3D leave
 * commands out.
 */
export const runCommand = async (board: Board, action: Added<CommandAction>, subject: Subject): Promise<unknown> => {
  const command = commandOf(board, action)
  if (!command) throw new Error(`${action.cap} offers no command ${action.command} now`)
  const module = await import(commandUrl(action.cap, command.module))
  if (typeof module[command.export] !== 'function') throw new Error(`${commandUrl(action.cap, command.module)} exports no function ${command.export}`)
  return module[command.export]({ tower: towerOf(), board, subject: subject.value, args: action.args })
}

/** Calls a verb an extension offers, with its call: no subject needed, the call holds what it acts on. */
export const runVerb = (action: VerbAction): Promise<unknown> => towerOf().call(action.verb as never, action.call as never)

/** Runs an action an extension added: its verb called with its call, or its command run on `subject`. */
export const runAdded = (board: Board, action: Added<Action>, subject: Subject): Promise<unknown> =>
  isCommand(action) ? runCommand(board, action, subject) : runVerb(action)

/** The page's `tower`, from `/tower.js`. */
const towerOf = (): Tower => (globalThis as unknown as { tower: Tower }).tower
