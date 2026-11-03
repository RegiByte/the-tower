/**
 * How fast narration reads: one of `SPEEDS`, the viewer's own, kept in `tower.store` so every page of theirs reads at
 * it. The player's speed menu (player.js) picks one, the palette's Read faster and Read slower (narrate.js) step
 * along them, and the voice reads at it from the next word (`voice.setSpeed`).
 */
import * as voice from './voice.js'

/** The speeds offered, slowest first: Google Docs' own. */
export const SPEEDS = [0.5, 0.7, 1, 1.2, 1.5, 1.7, 2]

/** Where the viewer's speed is kept in `tower.store`. */
export const SPEED_KEY = 'narrate.speed'

/** The viewer's speed: 1 until they pick another. */
export const speedOf = async (tower) => /** @type {number | undefined} */ (await tower.store.get(SPEED_KEY)) ?? 1

/** Reads at `rate` from now, and keeps it as the viewer's speed. */
export async function chooseSpeed(tower, rate) {
  voice.setSpeed(rate)
  await tower.store.set(SPEED_KEY, rate)
}

/** The viewer's speed moved `by` steps along `SPEEDS`, chosen, and answered: it stays at either end. */
export async function step(tower, by) {
  const at = SPEEDS.indexOf(await speedOf(tower))
  const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, at + by))]
  await chooseSpeed(tower, next)
  return next
}

/** A speed as it is said: `1.5×`. */
export const speedWords = (speed) => `${speed}×`
