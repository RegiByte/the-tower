/**
 * The wall clock the tower shows: the sky's hour, today's party guests, how long ago things happened. `?at=<ISO time>`
 * pins it, so a page draws the same whenever it is loaded.
 */
const at = new URLSearchParams(location.search).get('at')
const pinned = at === null ? undefined : Date.parse(at)
if (Number.isNaN(pinned)) throw new Error(`?at=${at} is not a date: use an ISO time, e.g. 2026-10-04T15:00`)

export const wallNow = () => pinned ?? Date.now()
