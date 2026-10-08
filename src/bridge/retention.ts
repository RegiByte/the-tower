/**
 * Which logs Tidy offers to archive: gzipped in place, read the same everywhere, never deleted (decision
 * `log-retention`).
 */
import { carriedOn, type Card } from './board.ts'

/** A session's log on disk: archived (gzipped) or plain, and its size in bytes on disk. */
export type LogFile = { archived: boolean; bytes: number }

/** A plain log Tidy would archive, by session id, with its size on disk. */
export type OldLog = { id: string; bytes: number }

const DAY_MS = 86_400_000

/**
 * The plain logs of the sessions whose worker, as it runs now, ended more than `days` ago: not running, and not
 * stranded with a conversation waiting to be resumed. A worker's sessions go together, so a resume chain in use keeps
 * every log it reads its brief from plain. Oldest first. `days` unset: none.
 */
export const oldLogs = (cards: Card[], logs: Map<string, LogFile>, days: number | undefined, now: number): OldLog[] => {
  if (days === undefined) return []
  const byId = new Map(cards.map((c) => [c.id, c]))
  const ended = (c: Card) => !c.live && !c.onDuty && c.enteredAt <= now - days * DAY_MS
  return cards
    .filter((c) => logs.get(c.id)?.archived === false && ended(carriedOn(byId, c.id)!))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((c) => ({ id: c.id, bytes: logs.get(c.id)!.bytes }))
}
