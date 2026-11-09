import type { Facts } from '../bridge/facts.ts'

/**
 * Whether the tower's wait on a new hire is over: it is counted (the system holds its log, its hirer's log names it and
 * the host runs it, what `liveHires` reads), or its log holds its exit, since a worker that ended never runs to be
 * counted. A hire not live yet, with no exit, is neither.
 */
export const hireSettled = (id: string, hire: Facts | undefined, hirerHired: readonly string[], live: ReadonlySet<string>): boolean =>
  hire !== undefined && (hire.exitedFrom !== undefined || (hirerHired.includes(id) && live.has(id)))
