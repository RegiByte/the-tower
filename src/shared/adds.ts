import type { Board, Card } from '../bridge/board.ts'
import { exemptionWords } from './crews.ts'
import type { Action, Added, AddedLine, AddedMark, Badge, BadgeTone, CommandAction, ExtensionCommand, VerbAction, Words } from './extensions.ts'
import { SVG_PATH, type ICON } from './icons.ts'
import type { Tower } from './shelf-page.ts'
import { accepted } from './media.ts'
import { onKind, type Subject, type Text } from './subjects.ts'
import type { Hold, LayoutEntry } from './regions.ts'
import type { CommandKit } from './views.ts'

/**
 * What extensions add to the board's subjects, as every renderer draws it (decision `extensions`): a subject's actions
 * and badges beside the core's, each action's words, and running one. A renderer names a subject with `/subjects.js`'s
 * constructors, served here too (`cardSubject`, `floorSubject`, `itemSubject`, …).
 */

export * from './subjects.ts'

/** A command's action, tagged with the capability whose client module runs it. */
export const isCommand = (action: Action): action is CommandAction => 'command' in action

/** Whether `command` is offered on `subject`: its `on` holds its kind, and its `accepts`, when it has one, its type. */
const offers = (command: ExtensionCommand, subject: Subject) =>
  !!command.on && onKind(command.on, subject.kind) && (!command.accepts || accepted(command.accepts, (subject.value as Text).type))

/** The commands offered on `subject` with no fold: each running extension's that offers it, on a floor it is on. */
const offeredCommands = (board: Board, subject: Subject): Added<CommandAction>[] =>
  board.extensions
    .filter((e) => e.state === 'started' && !(subject.project !== undefined && e.off?.includes(subject.project)))
    .flatMap((e) => e.commands.filter((c) => offers(c, subject)).map((c) => ({ command: c.name, cap: e.provides })))

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
 * limit is lifted unseen; then what folds add, most severe first (`rankedBadges`). Every region draws them in this order.
 */
export const badgesOf = (board: Board, subject: Subject): Added<Badge>[] => [...exemptionsOf(board, subject), ...rankedBadges(board, subject)]

/**
 * The actions a region holding `holds` draws, as `landing` places them: a command where it holds commands, a verb
 * where it holds verbs. @since 1.142
 */
export const heldActions = (holds: readonly Hold[], actions: Added<Action>[]): Added<Action>[] => actions.filter((a) => holds.includes(isCommand(a) ? 'commands' : 'verbs'))

/**
 * The id an action is pinned, hidden and seen by (decision `region-overflow`): a command's `<cap>/<command>`, a verb's
 * own qualified name. Every action with that verb or command on a subject shares it, so they pin, hide and clear
 * together. @since 1.138
 */
export const actionId = (action: Added<Action>): string => (isCommand(action) ? `${action.cap}/${action.command}` : action.verb)

/** The id an extension's lines are pinned and hidden by: its capability, so they rank as one. @since 1.138 */
export const lineId = (line: AddedLine): string => line.cap

/** The badge tones from most to least severe; `broken` and `needs` are severe. @since 1.138 */
export const SEVERITY: readonly BadgeTone[] = ['broken', 'needs', 'working', 'offered', 'ready', 'quiet']

const SEVERE: readonly BadgeTone[] = ['broken', 'needs']

/** A badge's tone, `quiet` when it names none. */
const toneOf = (badge: Badge): BadgeTone => badge.tone ?? 'quiet'

/** An action as a region ranks it: the action, its id and whether the layout pins it. @since 1.138 */
export type Ranked = { action: Added<Action>; id: string; pinned: boolean }

/** `items` less those `entry` hides, the pinned first in `pinned`'s order, then the rest in their own. */
const ranked = <T>(items: T[], idOf: (item: T) => string, entry: LayoutEntry | undefined): T[] => {
  const shown = items.filter((item) => !entry?.hidden?.includes(idOf(item)))
  const pins = entry?.pinned ?? []
  return [...pins.flatMap((pin) => shown.filter((item) => idOf(item) === pin)), ...shown.filter((item) => !pins.includes(idOf(item)))]
}

/**
 * `actions` as a region draws them under its layout `entry`: less the hidden, the pinned first in `pinned`'s order,
 * then the rest in board order. A renderer passes what it draws, after leaving out what its holder omits. @since 1.138
 */
export const rankedActions = (actions: Added<Action>[], entry: LayoutEntry | undefined): Ranked[] => {
  const pins = entry?.pinned ?? []
  return ranked(actions, actionId, entry).map((action) => ({ action, id: actionId(action), pinned: pins.includes(actionId(action)) }))
}

/** The badges folds add beside `subject`, most severe first, in board order within a tone. Exemptions are apart: `exemptionsOf`. @since 1.138 */
export const rankedBadges = (board: Board, subject: Subject): Added<Badge>[] =>
  (board.adds[subject.key]?.badges ?? []).toSorted((a, b) => SEVERITY.indexOf(toneOf(a)) - SEVERITY.indexOf(toneOf(b)))

/** A card's exemptions as badges: drawn with its identity and never tucked, so no lifted limit goes unseen. @since 1.138 */
export const exemptionsOf = (board: Board, subject: Subject): Added<Badge>[] =>
  subject.kind === 'card' ? ((subject.value as Card).exempt ?? []).map((e) => ({ label: 'exempt', tone: 'offered' as const, hint: exemptionWords(e), cap: e.by })) : []

/** The lines extensions add to the worker of `card` under its layout `entry`: less the hidden, pinned capabilities first, then fold order. @since 1.138 */
export const rankedLines = (board: Board, card: string, entry: LayoutEntry | undefined): AddedLine[] => ranked(board.adds[`card:${card}`]?.lines ?? [], lineId, entry)

/** Every verb and command id an extension on the board declares, whatever its state: what can be new to a viewer. @since 1.138 */
export const offeredIds = (board: Board): string[] =>
  board.extensions.flatMap((e) => [...e.verbs.map((v) => v.name), ...e.commands.map((c) => `${e.provides}/${c.name}`)])

/** Whether `id` is new to the viewer: an extension declares it (`offered`) and `seen` doesn't hold it. It never ranks. @since 1.138 */
export const isFresh = (offered: readonly string[], seen: readonly string[], id: string): boolean => offered.includes(id) && !seen.includes(id)

/** An item of a head's fill order. @since 1.138 */
export type HeadItem = { t: 'badge'; badge: Added<Badge> } | { t: 'action'; ranked: Ranked }

/** A head's fill order: the severe badges, the pinned actions, the other badges, the other actions. @since 1.138 */
export const headRanked = (badges: Added<Badge>[], actions: Ranked[]): HeadItem[] => {
  const badge = (b: Added<Badge>): HeadItem => ({ t: 'badge', badge: b })
  const action = (r: Ranked): HeadItem => ({ t: 'action', ranked: r })
  const severe = (b: Added<Badge>) => SEVERE.includes(toneOf(b))
  return [...badges.filter(severe).map(badge), ...actions.filter((r) => r.pinned).map(action), ...badges.filter((b) => !severe(b)).map(badge), ...actions.filter((r) => !r.pinned).map(action)]
}

/** The lines extensions add to what `tower whoami` prints for the worker of `card`. */
export const linesOf = (board: Board, card: string): string[] => (board.adds[`card:${card}`]?.lines ?? []).map((l) => l.text)

/** The marks extensions put on the lines the worker of `card` changed, in fold order. @since 1.116 */
export const marksOf = (board: Board, card: string): AddedMark[] => board.adds[`card:${card}`]?.marks ?? []

/** An extension's command as the board shows it, while its extension runs. */
const commandOf = (board: Board, action: Added<CommandAction>): ExtensionCommand | undefined =>
  board.extensions.find((e) => e.provides === action.cap && e.state === 'started')?.commands.find((c) => c.name === action.command)

/** An action in words: its own, as its fold gave them; else its verb's, as its provider's manifest says them, or its command's; its name when it has none. */
export const actionWords = (board: Board, action: Added<Action>): Words => {
  if (action.words) return action.words
  if (isCommand(action)) return commandOf(board, action)?.words ?? { label: action.command }
  const at = action.verb.indexOf('/')
  return board.extensions.find((e) => e.provides === action.verb.slice(0, at))?.verbs.find((v) => v.name === action.verb)?.words ?? { label: action.verb.slice(at + 1) }
}

/** Where a client command's module is served. */
export const commandUrl = (cap: string, module: string) => `/x/${cap}/${module}`

/** A command's glyph: one of the core's icons by name (`/icons.js`), or an SVG its extension serves at `href`. @since 1.130 */
export type Glyph = { t: 'core'; name: keyof typeof ICON } | { t: 'svg'; href: string }

/** The glyph an action's words name: a command's, while its extension runs; none for a verb, or a command that names none. */
export const glyphOf = (board: Board, action: Added<Action>): Glyph | undefined => {
  if (!isCommand(action)) return undefined
  const icon = commandOf(board, action)?.words.icon
  if (!icon) return undefined
  return SVG_PATH.test(icon) ? { t: 'svg', href: commandUrl(action.cap, icon) } : { t: 'core', name: icon as keyof typeof ICON }
}

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

/** Calls a verb an extension offers, with its call: no subject needed, the call holds what it acts on. */
export const runVerb = (action: VerbAction): Promise<unknown> => towerOf().call(action.verb as never, action.call as never)

/** Runs an action an extension added: its verb called with its call, or its command run on `subject`. */
export const runAdded = (board: Board, action: Added<Action>, subject: Subject): Promise<unknown> =>
  isCommand(action) ? runCommand(board, action, subject) : runVerb(action)

/** The page's `tower`, from `/tower.js`. */
const towerOf = (): Tower => (globalThis as unknown as { tower: Tower }).tower
