/**
 * The renderer's one source of chance: seeded by `?seed=<n>` for repeatable frames, else by the clock. Music keeps
 * `Math.random`: what it plays never reaches a frame.
 */
const seed = Number(new URLSearchParams(location.search).get('seed') ?? Date.now()) >>> 0

let state = seed

/** mulberry32: a uniform number in [0, 1). */
export function random() {
  state = (state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const SEED = seed
