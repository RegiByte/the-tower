import { usageReading } from '../extensions/quota/usage.ts'
import { limitFacts, NO_LIMITS, type LimitFacts } from '../src/bridge/rate-limits.ts'
import type { RateLimitsReading } from '../src/shared/rate-limits.ts'

/** A read of the quota probe, answered or not, as its stream's `p` facts hold one. */
export type ProbeRead = { reads: 'claude.usage'; ms: number } & ({ ok: true; answer: unknown } | { ok: false; error: string })

/** A read at its moment. */
export type ProbeReading = [at: number, read: ProbeRead]

/** Each answered read folded as the core folds the reading the quota extension appends of its answer, a `u` fact. */
export const quotaLimits = (readings: ProbeReading[]): LimitFacts =>
  limitFacts(
    readings.flatMap(([at, read]) => (read.ok ? [[at, 'u', usageReading(read.answer)] as const] : [])),
    (_, fact) => fact as RateLimitsReading,
  )[0] ?? NO_LIMITS
