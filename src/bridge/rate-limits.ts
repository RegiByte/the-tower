/**
 * The account's rate limits (kind `tower/rate-limits`, decision `probes`): what the sessions' turns read, beside the
 * readings every started extension appends to a stream fact of that kind. The core folds each such stream into
 * `LimitFacts`, and reads the board's limits, extra usage, the weekly budget and outside use from them and the sessions.
 */
import type { Board } from './board.ts'
import { limitsRead, type Facts, type RateLimit } from './facts.ts'
import type { StreamFact } from './streams.ts'
import type { RateLimitsReading } from '../shared/rate-limits.ts'

/**
 * Extra usage: credits spent past the plan's limits, up to a monthly limit, in `currency` units, as read `at` (epoch
 * ms). `reached`: the monthly limit is spent.
 */
export type ExtraUsage = { at: number; enabled: boolean; used: number; limit: number; currency: string; reached: boolean }

/** A limit's percent climbed `points` from the reading at `from` to the next at `to` (epoch ms), in the window resetting at `resetsAt`. */
export type Rise = [from: number, to: number, points: number, resetsAt: string]

/** What one stream of rate-limit readings says. */
export type LimitFacts = {
  limitReadings: Facts['limitReadings']
  rateLimits?: Facts['rateLimits']
  /** By limit kind, each climb between two readings in a row of the same window: the readings of one source round alike. */
  rises: Record<string, Rise[]>
  /** The account's extra usage as the last reading that had it said. */
  extraUsage?: ExtraUsage
}

export const NO_LIMITS: LimitFacts = { limitReadings: {}, rises: {} }

/** The climbs from the limits of one reading to the next's, by kind. */
const risesTo = (rises: LimitFacts['rises'], before: Facts['rateLimits'], at: number, limits: RateLimit[]): LimitFacts['rises'] =>
  limits.reduce((next, { kind, percentUsed, resetsAt }) => {
    const was = before?.limits.find((l) => l.kind === kind)
    if (!before || !was || !resetsAt || was.resetsAt !== resetsAt || percentUsed <= was.percentUsed) return next
    return { ...next, [kind]: [...(next[kind] ?? []), [before.at, at, percentUsed - was.percentUsed, resetsAt] as Rise] }
  }, rises)

/** One reading folded on, at its moment: a reading with no limits keeps the last, as one without extra usage does. */
export const limitsStep = (facts: LimitFacts, at: number, { limits, extraUsage }: RateLimitsReading): LimitFacts => {
  const extra = extraUsage ? { at, ...extraUsage } : facts.extraUsage
  return {
    limitReadings: limitsRead(facts.limitReadings, at, limits),
    rateLimits: limits.length ? { at, limits } : facts.rateLimits,
    rises: risesTo(facts.rises, facts.rateLimits, at, limits),
    ...(extra && { extraUsage: extra }),
  }
}

/** A stream's readings folded: each fact the `reading` of its code says is one, the rest passed over. */
export const limitFacts = (facts: StreamFact[], reading: (code: string, fact: unknown) => RateLimitsReading | undefined): LimitFacts =>
  facts.reduce((state, [at, code, fact]) => {
    const read = reading(code, fact)
    return read ? limitsStep(state, at, read) : state
  }, NO_LIMITS)

export type LimitsFrom = 'session' | 'probe'

/** The board's account limits: the newest reading of any session's turn or any extension's stream. */
export type LimitsRead = Pick<Board, 'rateLimits' | 'rateLimitsAt' | 'rateLimitsFrom'>

/** The newest of the readings. */
export const newestReading = (readings: Facts['rateLimits'][]): Facts['rateLimits'] =>
  readings.reduce<Facts['rateLimits']>((latest, r) => (r && (!latest || r.at > latest.at) ? r : latest), undefined)

/**
 * How much older than the newest reading a limit only the other source reads may be and stay beside it, under the
 * newest reading's age: the quota probe at its interval keeps a model's week there; off or backing off, it leaves.
 */
const CARRIED_MS = 15 * 60_000

/**
 * Rate limits belong to the account: the newest reading, a session's or a stream's, stands for every limit it has; a
 * limit only the other reads (a model's own week, which only the quota probe reads) is the other's newest, while that
 * is at most `CARRIED_MS` older and its window had not reset as of the newest.
 */
export const accountLimits = (sessions: Pick<Facts, 'rateLimits'>[], streams: LimitFacts[]): LimitsRead => {
  const [session, stream] = [newestReading(sessions.map((f) => f.rateLimits)), newestReading(streams.map((f) => f.rateLimits))]
  const [latest, other, from] = session && (!stream || session.at >= stream.at) ? [session, stream, 'session' as const] : [stream, session, 'probe' as const]
  if (!latest) return { rateLimits: [], rateLimitsAt: undefined, rateLimitsFrom: undefined }
  const carried = other && latest.at - other.at <= CARRIED_MS ? other.limits : []
  const only = carried.filter((l) => !latest.limits.some((n) => n.kind === l.kind) && (!l.resetsAt || Date.parse(l.resetsAt) > latest.at))
  return { rateLimits: [...latest.limits, ...only], rateLimitsAt: latest.at, rateLimitsFrom: from }
}

/** The newest reading's extra usage among the streams'. */
export const extraUsageOf = (streams: LimitFacts[]): { extraUsage?: ExtraUsage } => {
  const newest = streams.reduce<ExtraUsage | undefined>((a, s) => (s.extraUsage && (!a || s.extraUsage.at > a.at) ? s.extraUsage : a), undefined)
  return newest ? { extraUsage: newest } : {}
}
