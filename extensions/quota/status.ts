/**
 * The quota probe's reads as its stream says, and when it reads next: pure, so the tick, the board fold and the reads
 * share them. A read waits `every` after the last; longer after failures in a row (doubling) or while the account has
 * nothing to read; and while a session's turn read every limit the probe reads, it waits `every` after that turn's.
 */
import type { StreamFact } from '../../src/shared/extensions.ts'
import { usageReading, type RateLimitsReading } from '../../src/shared/rate-limits.ts'

/** What the stream says. `kinds`: the limits the last answer that had any read. */
export type Reads = {
  lastAt?: number
  /** Why the last read has no answer; absent once a read answers. */
  error?: string
  /** When a read last answered. */
  answeredAt?: number
  /** The reads at the stream's end that failed. */
  failsInRow: number
  /** The last answer says the account has no rate limits to read: an API key, a cloud provider, nobody signed in. */
  unavailable: boolean
  kinds?: string[]
}

export const NO_READS: Reads = { failsInRow: 0, unavailable: false }

/** An answered read, `u`: Claude's answer as it came, and the reading made of it. */
export type Answered = RateLimitsReading & { ms: number; answer: unknown; unavailable: boolean }

/** A read with no answer, `f`. */
export type Failed = { ms: number; error: string }

/** A read as the core's probe wrote it before tower 1.88, `p`: kept, never written again. */
export type Probed = { reads: 'claude.usage'; ms: number } & ({ ok: true; answer: unknown } | { ok: false; error: string })

/** A read in one shape, whichever code holds it: what `quota/reads` answers. */
export type Read = { at: number; ms: number } & ({ ok: true; answer: unknown } | { ok: false; error: string })

/** A fact of the stream as a read: `undefined` for a code it doesn't know. */
export const readOf = ([at, code, fact]: StreamFact): Read | undefined => {
  if (code === 'u') return { at, ms: (fact as Answered).ms, ok: true, answer: (fact as Answered).answer }
  if (code === 'f') return { at, ms: (fact as Failed).ms, ok: false, error: (fact as Failed).error }
  if (code === 'p') {
    const { reads: _, ...read } = fact as Probed
    return { at, ...read }
  }
  return undefined
}

/** The stream's fold: each read, answered or not, from the oldest. */
export const step = (reads: Reads, fact: StreamFact): Reads => {
  const read = readOf(fact)
  if (!read) return reads
  if (!read.ok) return { ...reads, lastAt: read.at, error: read.error, failsInRow: reads.failsInRow + 1 }
  const { limits, unavailable } = fact[1] === 'u' ? (fact[2] as Answered) : usageReading(read.answer)
  return { lastAt: read.at, answeredAt: read.at, failsInRow: 0, unavailable, kinds: limits.length ? limits.map((l) => l.kind) : reads.kinds }
}

/** No read starts sooner than this after the last one started. */
export const FLOOR_MS = 60_000
const FAILS_BEFORE_BACKOFF = 3
const BACKOFF_MS = 10 * 60_000
const BACKOFF_MAX_MS = 60 * 60_000
const UNAVAILABLE_WAIT_MS = 6 * 60 * 60_000

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 }

/** A period of its settings, `10m`, in ms. */
export const periodMs = (every: string): number => {
  const [, n, unit] = /^(\d+)(s|m|h)$/.exec(every)!
  return Number(n) * UNIT_MS[unit]
}

/** How long after its last read it waits: `every`, longer after failures in a row (doubling) or while the account has nothing to read. */
export const waitOf = (every: number, reads: Reads): number =>
  reads.unavailable
    ? UNAVAILABLE_WAIT_MS
    : reads.failsInRow >= FAILS_BEFORE_BACKOFF
      ? Math.max(every, Math.min(BACKOFF_MS * 2 ** (reads.failsInRow - FAILS_BEFORE_BACKOFF), BACKOFF_MAX_MS))
      : every

/** The newest reading a session's turn took, as the board carries it. */
export type Turns = { at: number; limits: { kind: string }[] } | undefined

/**
 * A session's turn measures the five-hour and weekly limits: no read while its reading is newer than `every`, unless
 * the last answer had a limit the sessions don't measure (a model's own week).
 */
const heldUntil = (turns: Turns, reads: Reads, every: number): number | undefined =>
  turns && (reads.kinds ?? []).every((kind) => turns.limits.some((l) => l.kind === kind)) ? turns.at + every : undefined

/**
 * Whether it reads at `now`: never while a session's turn holds it; otherwise once its wait has passed since its last
 * read. A last read dated after `now` (the clock moved back) makes it due: the floor keeps reads apart.
 */
export const due = (every: number, reads: Reads, turns: Turns, now: number): boolean => {
  if (now < (heldUntil(turns, reads, every) ?? -Infinity)) return false
  return reads.lastAt === undefined || reads.lastAt > now || now - reads.lastAt >= waitOf(every, reads)
}

/**
 * How it stands: `new` before its first read, `ok` while its last read answered, `failing` after a read with no
 * answer, `backoff` once failures in a row lengthen its wait, `unavailable` while its last answer said the account has
 * no rate limits to read.
 */
export type QuotaState = 'new' | 'ok' | 'failing' | 'backoff' | 'unavailable'

/** The board's `x.quota`: how often it reads, its last read and when it reads next. Times in epoch ms. */
export type QuotaStatus = {
  /** How often it reads while nothing else holds it, ms. */
  every: number
  state: QuotaState
  lastAt?: number
  error?: string
  answeredAt?: number
  failsInRow: number
  /** How long it waits after its last read, ms. */
  wait: number
  /** When it reads next: its wait after its last read, or later while `held`; a moment past (0 before its first read) means at the next tick. */
  nextAt: number
  /** `nextAt` is set by what the sessions read: a session's turn read every limit it reads, and it reads no sooner than `every` after. */
  held: boolean
}

const stateOf = (reads: Reads): QuotaState =>
  reads.lastAt === undefined ? 'new' : reads.failsInRow >= FAILS_BEFORE_BACKOFF ? 'backoff' : reads.failsInRow ? 'failing' : reads.unavailable ? 'unavailable' : 'ok'

export const statusOf = (every: number, reads: Reads, turns: Turns): QuotaStatus => {
  const wait = waitOf(every, reads)
  const after = reads.lastAt === undefined ? 0 : reads.lastAt + wait
  const held = heldUntil(turns, reads, every) ?? 0
  return {
    every,
    state: stateOf(reads),
    ...(reads.lastAt !== undefined && { lastAt: reads.lastAt }),
    ...(reads.error !== undefined && { error: reads.error }),
    ...(reads.answeredAt !== undefined && { answeredAt: reads.answeredAt }),
    failsInRow: reads.failsInRow,
    wait,
    nextAt: Math.max(after, held),
    held: held > after,
  }
}
