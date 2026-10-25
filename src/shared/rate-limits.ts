/**
 * The core's fact kind `tower/rate-limits` (decision `probes`): a reading of the account's rate limits, which an
 * extension appends to one of its system streams by declaring the kind on a fact code; the core folds every such
 * reading beside the sessions' turns'. A reading with no `runtime` is Claude's, and its limits Claude's windows.
 * Below it, Claude's answer to `get_usage` read as one.
 */
import { z } from 'zod'

/** The kinds of stream fact the core folds, each by its qualified name. */
export const FACT_KINDS = ['tower/rate-limits'] as const
export type FactKind = (typeof FACT_KINDS)[number]

const RateLimitShape = z.object({
  kind: z.string().describe('five_hour, seven_day, or a model\'s own week, seven_day_<model>.'),
  percentUsed: z.number(),
  resetsAt: z.string().optional().describe('When its window resets, ISO 8601 to the second.'),
})

/** A reading of kind `tower/rate-limits`: other members of its fact are its provider's. */
export const RateLimitsReading = z.looseObject({
  limits: z.array(RateLimitShape).describe('Each limit as read; none when the account has none to read.'),
  extraUsage: z
    .object({ enabled: z.boolean(), used: z.number(), limit: z.number(), currency: z.string(), reached: z.boolean() })
    .optional()
    .describe("Credits spent past the plan's limits this month, in currency units, up to `limit`; `reached` once spent."),
  runtime: z.string().optional().describe("The runtime whose account it read: Claude's when left out."),
})
export type RateLimitsReading = z.infer<typeof RateLimitsReading>

/** Each kind's schema: a fact of a code declaring it holds to it as well as to its own. */
export const KIND_SCHEMAS: Record<FactKind, z.ZodType> = { 'tower/rate-limits': RateLimitsReading }

/** The request Claude answers with `/usage`'s data, and nothing else: no prompt is sent. */
export const USAGE_REQUEST = { type: 'control_request', request_id: 'usage', request: { subtype: 'get_usage', skip_behaviors: true } }

const withoutNulls = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_, v) => (v === null ? undefined : v)))

/** Claude's answer to `USAGE_REQUEST` among what it printed, nulls dropped; why there is none otherwise. */
export const usageAnswer = (stdout: string): { answer: unknown } | { error: string } => {
  const response = stdout
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .find((m) => m.type === 'control_response' && m.response?.request_id === USAGE_REQUEST.request_id)?.response
  if (!response) return { error: 'claude printed no answer to get_usage' }
  return response.subtype === 'success' ? { answer: withoutNulls(response.response) } : { error: String(response.error ?? 'get_usage failed') }
}

type UsageWindow = { utilization?: number; resets_at?: string }

/** Claude's answer to `get_usage`, as much of it as a reading takes: a model's own weekly limit is in `model_scoped`. */
type UsageAnswer = {
  rate_limits_available?: boolean
  rate_limits?: {
    five_hour?: UsageWindow
    seven_day?: UsageWindow
    model_scoped?: (UsageWindow & { display_name?: string })[]
    /** Amounts in the currency's minor units, `decimal_places` of them. */
    extra_usage?: { is_enabled?: boolean; monthly_limit?: number; used_credits?: number; currency?: string; decimal_places?: number; spend_limit_reached?: boolean }
  }
}

/** A model's weekly limit as a kind, the way a session names one: `seven_day_opus`. */
const modelWeek = (model: string): string => `seven_day_${model.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`

/** Claude answers a window's reset to the microsecond and a session measures it to the second: a window is known by its reset in both. */
const toSecond = (iso: string): string => new Date(Math.round(Date.parse(iso) / 1000) * 1000).toISOString()

const limitOf = (kind: string, window: UsageWindow | undefined): RateLimitsReading['limits'] =>
  window?.utilization === undefined ? [] : [{ kind, percentUsed: window.utilization, ...(window.resets_at && { resetsAt: toSecond(window.resets_at) }) }]

const extraUsageOf = (answer: UsageAnswer): Pick<RateLimitsReading, 'extraUsage'> => {
  const extra = answer.rate_limits?.extra_usage
  if (extra?.is_enabled === undefined || extra.monthly_limit === undefined || extra.used_credits === undefined) return {}
  const unit = 10 ** (extra.decimal_places ?? 0)
  return { extraUsage: { enabled: extra.is_enabled, used: extra.used_credits / unit, limit: extra.monthly_limit / unit, currency: extra.currency ?? 'USD', reached: extra.spend_limit_reached === true } }
}

/**
 * Claude's `get_usage` answer as a reading: its limits in a session's shape, its extra usage, and `unavailable` when it
 * says the account has no rate limits to read (an API key, a cloud provider, nobody signed in).
 */
export const usageReading = (answer: unknown): RateLimitsReading & { unavailable: boolean } => {
  const usage = answer as UsageAnswer
  const limits = usage.rate_limits
  return {
    limits: [
      ...limitOf('five_hour', limits?.five_hour),
      ...limitOf('seven_day', limits?.seven_day),
      ...(limits?.model_scoped ?? []).flatMap((m) => (m.display_name ? limitOf(modelWeek(m.display_name), m) : [])),
    ],
    ...extraUsageOf(usage),
    unavailable: usage.rate_limits_available === false,
  }
}
