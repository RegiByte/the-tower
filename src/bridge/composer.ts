/**
 * What Claude's composer may hold, folded from the log, and whether a worker takes a prompt typed into it from outside
 * its terminal: at its prompt, with nothing in the composer, or else why not.
 */
import type { LogEvent } from '../shared/model.ts'
import { isTyped } from './input.ts'
import type { Status } from './status.ts'

/** Claude's composer has focus: not before Claude starts (on a screen that blocks it, maybe), nor on a question. */
export const AT_COMPOSER: ReadonlySet<Status> = new Set(['idle', 'working', 'watching', 'done', 'failed'])

/**
 * The main loop waits for its next prompt. `watching` counts: a background task can start a turn at any moment, which
 * the check before Enter catches (`moved`).
 */
export const AT_PROMPT: ReadonlySet<Status> = new Set(['idle', 'watching', 'done', 'failed'])

const ESC = '\x1b'
const ENTER = '\r'
const SHIFT_TAB = '\x1b[Z'
const CTRL_C = '\x03'

/**
 * Esc interrupts a turn or closes what is open, a bare Enter submits what the composer holds, and Shift+Tab cycles the
 * permission mode: none leaves text in it.
 */
const fillsComposer = (input: string) => isTyped(input) && input !== ESC && input !== ENTER && input !== SHIFT_TAB

/**
 * When the composer may have started holding text, until something empties it: typed input while it has focus, or an
 * Esc before Claude streamed anything, which puts the turn's prompt back in it. A prompt or command submitted from the
 * composer empties it, as do Ctrl+C typed at it and a new conversation; a compaction keeps what it held. `status` is the session's before
 * the event; `streamed`, whether the main loop's current turn has stepped or called a tool.
 */
export const heldAfter = (heldSince: number | undefined, status: Status, streamed: boolean, event: LogEvent): number | undefined => {
  if (event[1] === 'i') {
    if (!AT_COMPOSER.has(status)) return heldSince
    if (event[2] === CTRL_C) return undefined
    return heldSince ?? (fillsComposer(event[2]) ? event[0] : undefined)
  }
  if (event[1] !== 'h' || event[2].agentId !== undefined) return heldSince
  const hook = event[2]
  switch (hook.hook_event_name) {
    case 'prompt.submit':
    case 'command.run':
      return (hook.origin as { kind?: string } | undefined)?.kind === 'composer' ? undefined : heldSince
    case 'SessionStart':
      return hook.source === 'compact' ? heldSince : undefined
    case 'turn.complete':
      return hook.reason === 'aborted' && !hook.answer && !streamed ? (heldSince ?? event[0]) : heldSince
    default:
      return heldSince
  }
}

/**
 * Claude's composer leaves plain-prompt mode on a first character: `/` opens a command (a panel that takes keys, with
 * no turn to move the status) and `!` runs the rest as a shell command. Leading whitespace does not hide either.
 */
const NOT_PLAIN: ReadonlySet<string> = new Set(['/', '!'])

/** Whether the text opens with a character that makes Claude's composer run it as something other than a prompt. */
export const isPlain = (text: string) => !NOT_PLAIN.has(text.trimStart().charAt(0))

/** Why a worker takes no prompt now: `not_at_prompt`, its main loop is busy or held; `composer_holds`, text sits in its composer. */
export type PromptRefusal = 'not_at_prompt' | 'composer_holds'

export const promptRefusal = (status: Status, heldSince: number | undefined): PromptRefusal | undefined =>
  !AT_PROMPT.has(status) ? 'not_at_prompt' : heldSince !== undefined ? 'composer_holds' : undefined
