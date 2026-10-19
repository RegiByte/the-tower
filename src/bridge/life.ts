import type { Card, Unresumable } from './board.ts'
import type { SessionRef } from './chains.ts'
import { isStuck } from './prunable.ts'
import { isMidTurn, isOutcome, waitsOnSomeone, type SessionState, type Status } from './status.ts'
import { isLive } from './verbs.ts'

/** How loudly a worker asks for you, the one thing every renderer colours: the status word keeps the fact. */
export type Attention = 'needs' | 'ready' | 'working' | 'quiet' | 'broken'

/** `unread`: it holds what someone has to answer or read (`waitsOnSomeone`). A screen or a question needs a hand; an unread answer is ready. */
export const attentionOf = (status: Status, unread: boolean): Attention => {
  if (status === 'blocked' || status === 'needs_input') return 'needs'
  if (status === 'failed' || status === 'lost') return 'broken'
  if (unread) return 'ready'
  if (status === 'working' || status === 'booting') return 'working'
  return 'quiet'
}

/**
 * What a worker's lifecycle is derived from, as one session's facts say it now, every time in epoch ms. `state`: as the
 * host runs it (`withLiveness`), `since` included; `endedFrom`: the status its log last folded to, its exit's when it exited; `leaveAsked`: it
 * asked to go home with no prompt since; `unresumableHere`: why it couldn't be resumed where it ran; `conversations`:
 * the ones it holds, in order, each with the session that resumed it, if one did.
 */
export type LifeFacts = {
  state: SessionState
  endedFrom: Status
  hostStopped: boolean
  broken: boolean
  typedAt?: number
  heardAt?: number
  leaveAsked: boolean
  letGoAt?: number
  unresumableHere?: Unresumable
  conversations: { resumedBy?: SessionRef }[]
}

/**
 * A worker's lifecycle as its card spells it: running, stranded by the host (cut off mid-turn or not, let go or not) or
 * ended, and whether it waits on the user. Whom a waiting answer waits on instead, and whom it reports to, are its
 * crew's (`withReports`).
 */
export type WorkerLife = Pick<
  Card,
  'status' | 'blocked' | 'live' | 'leaving' | 'waiting' | 'attention' | 'stuck' | 'compacting' | 'stranded' | 'cutOff' | 'letGoAt' | 'unresumable' | 'onDuty'
>

/** A stranded worker is on duty while its latest conversation waits to be resumed and can be, unless let go. */
export const lifeOf = (f: LifeFacts, now: number): WorkerLife => {
  const { status } = f.state
  const stranded = status === 'lost' || f.hostStopped
  const live = isLive(status)
  const leaving = live && f.leaveAsked
  const waiting = !f.broken && waitsOnSomeone(f.state, f.typedAt) && !(leaving && isOutcome(status))
  const unresumable = !live && f.conversations.some((c) => !c.resumedBy) ? f.unresumableHere : undefined
  const resumable = stranded && f.letGoAt === undefined && !unresumable && f.conversations.length > 0 && !f.conversations.at(-1)!.resumedBy
  return {
    status,
    blocked: f.state.blocked,
    live,
    leaving,
    waiting,
    attention: f.broken ? 'broken' : attentionOf(status, waiting),
    stuck: !f.broken && isStuck(status, f.heardAt, now),
    compacting: status === 'working' && f.state.compaction !== undefined,
    stranded,
    cutOff: stranded && !f.broken && isMidTurn(f.endedFrom),
    letGoAt: f.letGoAt,
    unresumable,
    onDuty: live || resumable,
  }
}

/** Stranded on duty: the worker its `carry-on` or `resume` brings back. */
export const awaitsResume = (life: WorkerLife): boolean => life.onDuty && !life.live
