import type { CommandLimits } from '../bridge/board.ts'
import type { RateLimit } from '../bridge/facts.ts'
import { clockAt, plural, span } from './format.ts'

/** The account's rate limits and the budget's pace, in words. */

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const WEEK = 7 * DAY

/** A rate-limit reading refreshes only while some session runs a turn: past this age it may have moved. */
export const LIMITS_STALE_MS = 15 * MINUTE

/**
 * Whether the day's spending lasts: `perDay`, the even daily spend that spends what is left exactly at the reset (all of
 * it in the reset's last day), and `runsOutAt` (epoch ms), when what is left runs out at today's rate, only when that
 * is before the reset.
 */
export type Pace = { perDay: number; runsOutAt?: number }

/** Today's rate is measured over at least this long, so the first minutes of a day do not extrapolate. */
const MIN_RATE_WINDOW = 60 * MINUTE

/**
 * The pace of the weekly budget at `now`, from `day`, the account's spend since the day's start (the board's
 * `today.budget.day`). None while what is left is unknown.
 */
export const pace = (budget: { resetsAt: string; usdLeft?: number }, day: { since: number; spend: number }, now: number): Pace | undefined => {
  if (budget.usdLeft === undefined) return undefined
  const resetsAt = Date.parse(budget.resetsAt)
  const perDay = budget.usdLeft / (Math.max(resetsAt - now, DAY) / DAY)
  const perMs = day.spend / Math.max(now - day.since, MIN_RATE_WINDOW)
  const runsOutAt = perMs > 0 ? now + budget.usdLeft / perMs : undefined
  return { perDay, runsOutAt: runsOutAt !== undefined && runsOutAt < resetsAt ? runsOutAt : undefined }
}

/** The budget's pace in words: what to spend a day to last, and when it runs out at today's rate, if before the reset. */
export const paceWords = (p: Pace, now: number) =>
  [`≈ $${Math.round(p.perDay).toLocaleString('en-US')}/day to last`, ...(p.runsOutAt === undefined ? [] : [`at today's rate, out by ${clockAt(p.runsOutAt, now)}`])]

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

/** Extra usage spent of its monthly limit: `$12 of $1,000`. */
export const extraUsageAmounts = (e: NonNullable<CommandLimits['extraUsage']>) => {
  const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: e.currency, maximumFractionDigits: 0 }).format(v)
  return `${money(e.used)} of ${money(e.limit)}`
}

/** Extra usage in a line: `extra usage · $12 of $1,000 this month`, or that its limit is spent. */
export const extraUsageLine = (e: NonNullable<CommandLimits['extraUsage']>) =>
  !e.enabled ? 'extra usage off' : `extra usage · ${extraUsageAmounts(e)} this month${e.reached ? ', spent' : ''}`

/** Whose reading the board's limits are, for the line that says how old they are. */
export const limitsFromTitle = (b: Pick<CommandLimits, 'rateLimitsFrom'>) =>
  b.rateLimitsFrom === 'probe' ? "read by the tower's quota probe, while no session's turn reads them" : "read during a session's turn; the quota probe reads them while none does"
