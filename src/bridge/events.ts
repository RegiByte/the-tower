import type { ModEvent } from '../shared/model.ts'

/**
 * A `tower.*` fact as the host logs it, in the envelope it takes for every runtime: its name under
 * `hook_event_name`, its fields beside it.
 */
export const towerFact = (name: string, fields: Record<string, unknown> = {}): ModEvent => ({ hook_event_name: name, ...fields })
