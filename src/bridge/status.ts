import type { Happening, NormalEvent } from './events.ts'
import { blockedBy, type BlockedKind } from './blocked.ts'

/**
 * `blocked`: held before it starts by one of Claude's screens (`blocked.ts`) until the user answers it. `watching`: the
 * main loop's turn ended while something it started can start its next turn without the user (a background task, a
 * `/loop`, a cron); `done`: it ended with nothing but the user to wake it. `failed`: the main loop's last turn ended in
 * an API error or a refusal, with no answer to review.
 */
export type Status = 'booting' | 'blocked' | 'idle' | 'working' | 'needs_input' | 'watching' | 'done' | 'failed' | 'exited' | 'lost'

type Unblocked = Exclude<Status, 'blocked'>

/**
 * The compaction in progress: its trigger decides what its end means. A manual one that started
 * while the session was watching `resumes` watching when it ends.
 */
type Compaction = { trigger: 'auto' } | { trigger: 'manual'; resumes?: 'watching' }

/**
 * `since` is when the session entered `status`, in seconds since its start. `blocked`: the screen a `blocked` session
 * shows, which has started nothing to compact.
 */
export type SessionState =
  | { status: 'blocked'; since: number; blocked: BlockedKind; compaction?: undefined }
  | { status: Unblocked; since: number; compaction?: Compaction; blocked?: undefined }

/**
 * The status the main loop's event moves it to, when it moves it. A turn the user interrupts ends with no stop (Esc
 * aborts it, a denied permission abandons its tool call), and Claude raises no stop after a failed turn. Claude awaits
 * each of its posts in turn, so they reach the log in the order Claude raised them.
 */
const statusOf = (event: Happening): Unblocked | undefined => {
  switch (event.t) {
    case 'ready':
      return 'idle'
    case 'prompt.accepted':
    case 'permission.answered':
    case 'tool.started':
    case 'tool.done':
    case 'tool.failed':
      return 'working'
    case 'permission.requested':
      return 'needs_input'
    case 'notified':
      return event.kind === 'permission' ? 'needs_input' : undefined
    case 'turn.stopped':
      return event.wakes ? 'watching' : 'done'
    case 'turn.ended':
      return event.reason === 'aborted' ? 'idle' : event.reason === 'error' || event.reason === 'refusal' ? 'failed' : undefined
    case 'tool.abandoned':
      return 'idle'
    default:
      return undefined
  }
}

/** Only the main loop's events move the status: a subagent's, its compactions included, are left out. */
const ofMainLoop = (event: Happening) => !('agent' in event) || event.agent === undefined

/** Only a session that hasn't started reads its output: a blocking screen shows before Claude raises any hook. */
export const readsOutput = ({ status }: SessionState) => status === 'booting' || status === 'blocked'

const screenAfter = (state: SessionState, event: NormalEvent): BlockedKind | undefined =>
  event[1] === 'o' && readsOutput(state) ? (blockedBy(event[2]) ?? state.blocked) : state.blocked

/** The status a session moves to as if no screen held it: a blocked session is one that hasn't started. */
/**
 * A stop with no turn running ends none: a runtime that runs a manual `/compact` as a turn of its own stops after it.
 * A manual `/compact` works between turns and leaves the session idle when it ends, or watching when it was watching:
 * what can wake the main loop still runs. Any other compaction leaves the status as it was: an automatic one runs
 * inside a turn, which carries on after it, or gives up with no end, and an idle one summarizes the conversation of a
 * session that waits, which keeps waiting.
 */
const statusAfter = (status: Unblocked, compaction: Compaction | undefined, event: NormalEvent): Unblocked => {
  if (event[1] === 'x') return 'exited'
  if (event[1] !== 'e' || !ofMainLoop(event[2])) return status
  const happening = event[2]
  if (happening.t === 'compaction.started') return happening.trigger === 'manual' ? 'working' : status
  if (happening.t === 'compaction.ended' || happening.t === 'compaction.failed') return compaction?.trigger === 'manual' ? (compaction.resumes ?? 'idle') : status
  if (happening.t === 'turn.stopped' && status === 'idle') return status
  return statusOf(happening) ?? status
}

const AUTO: Compaction = { trigger: 'auto' }
const MANUAL: Compaction = { trigger: 'manual' }
const MANUAL_FROM_WATCHING: Compaction = { trigger: 'manual', resumes: 'watching' }

/**
 * A compaction ends with its end, or, when it gives up, with the main loop's next step of the turn. A subagent's
 * compaction names its subagent (Claude's since 2.1.323) and is left out. Claude's before it name none: an automatic
 * start during a manual `/compact` can only be a subagent's, and keeps the manual compaction.
 */
const compactionAfter = ({ status, compaction }: SessionState, event: NormalEvent): Compaction | undefined => {
  if (event[1] === 'x') return undefined
  if (event[1] !== 'e' || !ofMainLoop(event[2])) return compaction
  switch (event[2].t) {
    case 'compaction.started':
      if (compaction?.trigger === 'manual') return compaction
      if (event[2].trigger === 'auto') return AUTO
      return status === 'watching' ? MANUAL_FROM_WATCHING : MANUAL
    case 'compaction.ended':
    case 'compaction.failed':
    case 'turn.step':
    case 'turn.ended':
      return undefined
    default:
      return compaction
  }
}

export const BOOTING: SessionState = { status: 'booting', since: 0 }

/** A screen that blocks holds the session until the hook that starts it, or its exit. */
export const nextState = (state: SessionState, event: NormalEvent): SessionState => {
  const held = state.status === 'blocked' ? 'booting' : state.status
  const status = statusAfter(held, state.compaction, event)
  const screen = status === held ? screenAfter(state, event) : undefined
  if (screen) {
    if (screen === state.blocked) return state
    return { status: 'blocked', since: state.status === 'blocked' ? state.since : event[0], blocked: screen }
  }
  const compaction = compactionAfter(state, event)
  if (status === state.status && compaction === state.compaction) return state
  return { status, since: status === state.status ? state.since : event[0], ...(compaction && { compaction }) }
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
