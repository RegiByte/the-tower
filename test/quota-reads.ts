import { LEGACY_READINGS, type ProbeRead } from '../src/bridge/legacy.ts'
import { limitFacts, type LimitFacts } from '../src/bridge/rate-limits.ts'

/** A read of the quota probe's stream as the core's probe wrote it before 1.89, at its moment. */
export type ProbeReading = [at: number, read: ProbeRead]

/** Reads of the old format folded as the core folds the quota stream's folder, `probe.quota`. */
export const quotaLimits = (readings: ProbeReading[]): LimitFacts =>
  limitFacts(
    readings.map(([at, read]) => [at, 'p', read]),
    (code, fact) => LEGACY_READINGS['probe.quota'][code]?.(fact),
  )
