import type { Board } from '../bridge/board.ts'
import type { Attention } from '../bridge/life.ts'
import type { Replies } from './api.ts'
import { clockAt, plural, span } from './format.ts'
import type { ProbeStatus as LegacyProbe } from '../bridge/legacy.ts'
import type { QuotaStatus } from '../../extensions/quota/status.ts'

/** The account's rate limits, the budget's pace and the probes that read them, in words. */

type RateLimit = Board['rateLimits'][number]

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const WEEK = 7 * DAY

/** A rate-limit reading refreshes only while some session runs a turn: past this age it may have moved. */
export const LIMITS_STALE_MS = 15 * MINUTE

/** The budget's pace in words: what to spend a day to last, and when it runs out at today's rate, if before the reset. */
export const paceWords = (pace: { perDay: number; runsOutAt?: number }, now: number) =>
  [`≈ $${Math.round(pace.perDay).toLocaleString('en-US')}/day to last`, ...(pace.runsOutAt === undefined ? [] : [`at today's rate, out by ${clockAt(pace.runsOutAt, now)}`])]

/** When a limit resets: `in 1h 12m` within a day, `Sun 22:00` further off; undefined once it has passed. */
export const resetWhen = (resetsAt: string, now: number) => {
  const left = Date.parse(resetsAt) - now
  return left <= 0 ? undefined : left < DAY ? `in ${span(left)}` : clockAt(Date.parse(resetsAt), now)
}

/** `resets in 1h 12m`, `resets Sun 22:00`, or `reset since` the reading. */
export const resetLine = (resetsAt: string, now: number) => {
  const when = resetWhen(resetsAt, now)
  return when ? `resets ${when}` : 'reset since'
}

/**
 * How much of a weekly limit's window has passed, in percent: spending at an even pace, `percentUsed` would sit
 * here. Undefined for the other windows and for a limit with no known reset.
 */
export const weekElapsed = (r: RateLimit, now: number) =>
  r.kind.startsWith('seven_day') && r.resetsAt ? Math.min(100, Math.max(0, 100 - ((Date.parse(r.resetsAt) - now) / WEEK) * 100)) : undefined

/** A limit's pace in words: `61% of the week gone, 34 points under pace`. */
export const paceLine = (percentUsed: number, elapsed: number) => {
  const gap = Math.round(elapsed - percentUsed)
  return `${Math.round(elapsed)}% of the week gone, ${gap >= 0 ? `${plural(gap, 'point')} under pace` : `${plural(-gap, 'point')} over pace`}`
}

/** A probe as these words read it: the quota extension's part with its name (`quotaOf`), or an entry of `board.probes`. */
type ProbeStatus = Omit<LegacyProbe, 'reads'>

/** The quota probe as the quota extension's part on the board says it stands, by its name: none while it doesn't run. */
export const quotaOf = (b: Pick<Board, 'x'>): ProbeStatus | undefined => {
  const quota = b.x?.quota as QuotaStatus | undefined
  return quota && { name: 'quota', ...quota }
}

/** A probe's state in words, coloured by how much it asks of you: a failing probe leaves the limits to age. */
export const PROBE_STATE_NAME: Record<ProbeStatus['state'], string> = { off: 'off', new: 'not read yet', ok: 'answering', failing: 'failing', backoff: 'backing off', unavailable: 'nothing to read' }
export const PROBE_ATTENTION: Record<ProbeStatus['state'], Attention> = { off: 'quiet', new: 'quiet', ok: 'quiet', failing: 'working', backoff: 'broken', unavailable: 'working' }

/** When a probe reads next: `reads now` once due, else in how long, and why when a session's turn holds it. */
const probeNext = (p: ProbeStatus, now: number) =>
  p.nextAt === undefined ? undefined : p.nextAt <= now ? 'reads now' : `next in ${span(p.nextAt - now)}${p.held ? ", after a session's reading" : ''}`

/** A probe in a short line: `quota probe · answered 3m ago · next in 7m`. */
export const probeLine = (p: ProbeStatus, now: number) =>
  [
    `${p.name} probe`,
    p.state === 'off' || p.lastAt === undefined ? PROBE_STATE_NAME[p.state] : `${p.error === undefined ? 'answered' : 'failed'} ${span(now - p.lastAt)} ago`,
    probeNext(p, now),
  ].filter(Boolean).join(' · ')

/** A probe in full: its line, then what its state means, why its last read failed and when it last answered. */
export const probeTitle = (p: ProbeStatus, now: number) =>
  [
    probeLine(p, now),
    p.state === 'off' && `off in the config (extensions.${p.name}.off): the limits refresh only during sessions' turns`,
    p.state === 'new' && `reads Claude's usage every ${span(p.every)} while no session's turn has`,
    p.state === 'unavailable' && `the account has no rate limits to read (an API key, a cloud provider, or nobody signed in): it reads again every ${span(p.wait)}`,
    p.error !== undefined && `${p.failsInRow} failed in a row${p.state === 'backoff' ? `, so it waits ${span(p.wait)}` : ''}: ${p.error}`,
    p.error !== undefined && p.answeredAt !== undefined && `last answered ${span(now - p.answeredAt)} ago`,
  ].filter(Boolean).join('\n')

/** What a read now came to: `quota probe answered in 1.4s`, or why it has no answer. */
export const probedLine = (name: string, r: Pick<Replies['probe/run'], 'ms' | 'ok' | 'error'>) =>
  r.ok ? `${name} probe answered in ${(r.ms / 1000).toFixed(1)}s` : `${name} probe failed: ${r.error}`

/** Extra usage spent of its monthly limit: `$12 of $1,000`. */
export const extraUsageAmounts = (e: NonNullable<Board['extraUsage']>) => {
  const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: e.currency, maximumFractionDigits: 0 }).format(v)
  return `${money(e.used)} of ${money(e.limit)}`
}

/** Extra usage in a line: `extra usage · $12 of $1,000 this month`, or that its limit is spent. */
export const extraUsageLine = (e: NonNullable<Board['extraUsage']>) =>
  !e.enabled ? 'extra usage off' : `extra usage · ${extraUsageAmounts(e)} this month${e.reached ? ', spent' : ''}`

/** Whose reading the board's limits are, for the line that says how old they are. */
export const limitsFromTitle = (b: Pick<Board, 'rateLimitsFrom'>) =>
  b.rateLimitsFrom === 'probe' ? "read by the tower's quota probe, while no session's turn reads them" : "read during a session's turn; the quota probe reads them while none does"
