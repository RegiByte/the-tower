/**
 * The wall clock the tower shows: the sky's hour, today's party guests, how long ago things happened. `?at=<ISO time>`
 * pins it, so a page draws the same whenever it is loaded. `moves`: whether it moves; a pinned one stands still, and
 * nothing waits on it.
 */
export type Clock = { now: () => number; moves: boolean }

/** The instant `?at=` pins the clock at, if the page was opened with one. */
function pinnedAt() {
  const at = new URLSearchParams(location.search).get('at')
  const pinned = at === null ? undefined : Date.parse(at)
  if (Number.isNaN(pinned)) throw new Error(`?at=${at} is not a date: use an ISO time, e.g. 2026-10-04T15:00`)
  return pinned
}

/** The live page's clock: the viewer's, unless `?at=` pins it. */
export function startClock(): Clock {
  const pinned = pinnedAt()
  return { now: () => pinned ?? Date.now(), moves: pinned === undefined }
}

/** A fixture page's clock, pinned at the instant `fixture` was built at (`at`, ISO); an `?at=` naming another is refused. */
export function fixtureClock(fixture: { name: string; at: string }): Clock {
  const at = Date.parse(fixture.at)
  const pinned = pinnedAt()
  if (pinned !== undefined && pinned !== at) {
    throw new Error(`?at=${new URLSearchParams(location.search).get('at')} is ${new Date(pinned).toISOString()}, but the ${fixture.name} fixture is built at ${new Date(at).toISOString()}: drop ?at or give that instant`)
  }
  return { now: () => at, moves: false }
}
