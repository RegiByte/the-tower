import { FIXTURE, FIXTURE_AT } from './fixtures.ts'

/**
 * The wall clock the tower shows: the sky's hour, today's party guests, how long ago things happened. `?at=<ISO time>`
 * pins it, so a page draws the same whenever it is loaded. A fixture board is built at one instant, which pins it.
 */
const at = new URLSearchParams(location.search).get('at')
const pinned = at === null ? undefined : Date.parse(at)
if (Number.isNaN(pinned)) throw new Error(`?at=${at} is not a date: use an ISO time, e.g. 2026-10-04T15:00`)
if (FIXTURE_AT !== undefined && pinned !== undefined && pinned !== FIXTURE_AT) {
  throw new Error(`?at=${at} is ${new Date(pinned).toISOString()}, but the ${FIXTURE} fixture is built at ${new Date(FIXTURE_AT).toISOString()}: drop ?at or give that instant`)
}

export const wallNow = () => FIXTURE_AT ?? pinned ?? Date.now()
