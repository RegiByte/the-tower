import type { ClaudeHookInput, LogEvent, ModEvent } from '../shared/model.ts'
import { blockedBy, type BlockedKind } from './blocked.ts'

/**
 * `blocked`: held before it starts by one of Claude's screens (`blocked.ts`) until the user answers it. `watching`: the
 * main loop's turn ended while something it started can start its next turn without the user (a background task, a
 * `/loop`, a cron); `done`: it ended with nothing but the user to wake it. `failed`: the main loop's last turn ended in
 * an API error or a refusal, with no answer to review.
 */
export type Status = 'booting' | 'blocked' | 'idle' | 'working' | 'needs_input' | 'watching' | 'done' | 'failed' | 'exited' | 'lost'

/**
 * `since` is when the session entered `status`, in seconds since its start. `compaction` is the trigger (`auto` or
 * `manual`) of the compaction in progress, which decides what the `SessionStart` that ends it means. `blocked`: the
 * screen a `blocked` session shows.
 */
export type SessionState = { status: Status; since: number; compaction?: string; blocked?: BlockedKind }

/**
 * Classic hooks (posted by curl) decide these; the mod's `turn.complete` and `tower.tool.abandoned` decide
 * interrupts and failures. Claude awaits each post in turn, so both reach the log in the order Claude raised them.
 */
const HOOK_STATUS: Record<string, Status> = {
  SessionStart: 'idle',
  UserPromptSubmit: 'working',
  PreToolUse: 'working',
  PostToolUse: 'working',
  PostToolUseFailure: 'working',
  PermissionRequest: 'needs_input',
}

/**
 * Claude's `Stop` lists the background tasks (subagents, shells, monitors) still running and the session's crons
 * (`/loop`, `ScheduleWakeup`, `CronCreate`): each can wake the main loop into a new turn, which ends in its own `Stop`.
 */
const stopStatus = (hook: ClaudeHookInput | ModEvent): Status => {
  const tasks = hook.background_tasks as { status: string }[]
  const crons = hook.session_crons as unknown[]
  return tasks.some((task) => task.status === 'running') || crons.length ? 'watching' : 'done'
}

const NOTIFICATION_STATUS: Record<string, Status> = {
  permission_prompt: 'needs_input',
}

/**
 * The user interrupted the main loop's turn, which ends with no Stop: Esc aborts the turn, and a denied
 * permission abandons its tool call.
 */
const isInterrupt = (hook: ClaudeHookInput | ModEvent): boolean =>
  hook.agentId === undefined &&
  ((hook.hook_event_name === 'turn.complete' && hook.reason === 'aborted') || hook.hook_event_name === 'tower.tool.abandoned')

/** Claude raises no Stop after a failed turn. */
const isFailure = (hook: ClaudeHookInput | ModEvent): boolean =>
  hook.agentId === undefined && hook.hook_event_name === 'turn.complete' && (hook.reason === 'error' || hook.reason === 'refusal')

/**
 * A compaction starts with the classic `PreCompact`, and outside a Team or Enterprise organization also with the mod's
 * `session.compact` (Claude's built-in `sec-default` mod keeps it from user mods inside one): both carry the trigger,
 * and the second changes nothing.
 */
const isCompactionStart = (hook: ClaudeHookInput | ModEvent): boolean =>
  hook.hook_event_name === 'PreCompact' || hook.hook_event_name === 'session.compact'

/**
 * Claude raises `SessionStart` with `source: compact` when a compaction is done. A manual `/compact` works between
 * turns and leaves the session idle. Any other leaves the status as it was: an automatic one runs inside a turn,
 * which carries on after it, or gives up with no `SessionStart`, and an idle one (its `PreCompact` says `auto`)
 * summarizes the conversation of a session that waits, which keeps waiting.
 */
const isCompactionEnd = (hook: ClaudeHookInput | ModEvent): boolean =>
  hook.hook_event_name === 'SessionStart' && hook.source === 'compact'

/** Only a session that hasn't started reads its output: a blocking screen shows before Claude raises any hook. */
export const readsOutput = ({ status }: SessionState) => status === 'booting' || status === 'blocked'

const blockedAfter = (state: SessionState, event: LogEvent): BlockedKind | undefined =>
  event[1] === 'o' && readsOutput(state) ? (blockedBy(event[2]) ?? state.blocked) : undefined

const statusAfter = ({ status, compaction }: SessionState, event: LogEvent, screen: BlockedKind | undefined): Status => {
  if (event[1] === 'x') return 'exited'
  if (event[1] === 'o') return screen ? 'blocked' : status
  if (event[1] !== 'h') return status
  const hook = event[2]
  if (hook.agent_id !== undefined) return status
  if (isInterrupt(hook)) return 'idle'
  if (isFailure(hook)) return 'failed'
  if (isCompactionStart(hook)) return hook.trigger === 'manual' ? 'working' : status
  if (isCompactionEnd(hook)) return compaction === 'manual' ? 'idle' : status
  if (hook.hook_event_name === 'Stop') return stopStatus(hook)
  if (hook.hook_event_name === 'Notification') return NOTIFICATION_STATUS[String(hook.notification_type)] ?? status
  return HOOK_STATUS[hook.hook_event_name] ?? status
}

/**
 * A compaction ends with its `SessionStart`, or, when it gives up, with the main loop's next step of the turn. A
 * subagent's compaction raises the same `PreCompact` and `SessionStart` as the main loop's, with no `agent_id`: an
 * automatic start during a manual `/compact` can only be a subagent's, and keeps the manual trigger.
 */
const compactionAfter = (compaction: string | undefined, event: LogEvent): string | undefined => {
  if (event[1] === 'x') return undefined
  if (event[1] !== 'h') return compaction
  const hook = event[2]
  if (isCompactionStart(hook)) return compaction === 'manual' ? compaction : String(hook.trigger)
  const turnMoves = hook.agentId === undefined && (hook.hook_event_name === 'turn.step' || hook.hook_event_name === 'turn.complete')
  return isCompactionEnd(hook) || turnMoves ? undefined : compaction
}

export const BOOTING: SessionState = { status: 'booting', since: 0 }

/** A screen that blocks holds the session until the hook that starts it, or its exit. */
export const nextState = (state: SessionState, event: LogEvent): SessionState => {
  const screen = blockedAfter(state, event)
  const status = statusAfter(state, event, screen)
  const blocked = status === 'blocked' ? (screen ?? state.blocked) : undefined
  const compaction = compactionAfter(state.compaction, event)
  if (status === state.status && compaction === state.compaction && blocked === state.blocked) return state
  return { status, since: status === state.status ? state.since : event[0], compaction, ...(blocked && { blocked }) }
}

/** The main loop's turn ended, answered or failed: an outcome for someone to read. */
export const isOutcome = (status: Status): boolean => status === 'done' || status === 'failed'

/**
 * Held by a screen or a question, or holding an outcome (an answer or a failure) that nobody has typed to since it
 * arrived. `typedAt` is when someone last typed into the session. Whom it waits on is the board's (`Card.waitsOn`).
 */
export const waitsOnSomeone = ({ status, since }: SessionState, typedAt: number | undefined): boolean =>
  status === 'blocked' || status === 'needs_input' || (isOutcome(status) && (typedAt === undefined || typedAt < since))

/** The main loop's turn started and hasn't ended: Claude works on it, compacts inside it, or asks the user about it. */
export const isMidTurn = (status: Status): boolean => status === 'working' || status === 'needs_input'

/** A session that never logged its exit is alive only if the host still runs it. */
export const withLiveness = (state: SessionState, id: string, live: Set<string>): SessionState => {
  if (state.status === 'exited' || live.has(id)) return state
  return { status: 'lost', since: state.since }
}
