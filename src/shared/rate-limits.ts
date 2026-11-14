/**
 * The core's fact kind `tower/rate-limits` (decision `probes`): a reading of the account's rate limits, which an
 * extension appends to one of its system streams by declaring the kind on a fact code; the core folds every such
 * reading beside the sessions' turns'. A reading with no `runtime` is Claude's, and its limits Claude's windows; one
 * with no `command` is the default command's, as the config says when it is read.
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
  command: z.string().optional().describe("The `argv` command whose account it read: the config's default command when left out. @since 1.152"),
})
export type RateLimitsReading = z.infer<typeof RateLimitsReading>

/** Each kind's schema: a fact of a code declaring it holds to it as well as to its own. */
export const KIND_SCHEMAS: Record<FactKind, z.ZodType> = { 'tower/rate-limits': RateLimitsReading }
