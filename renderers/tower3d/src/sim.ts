/**
 * The page's simulated clock, in ms: what animations, holds, flights and cuts read. Live, real frames advance it;
 * stepped, only the door's `step` does. `?stepped` starts it stopped, so a page's frames are the same on every load.
 * A cell advanced by a frame, not a machine (decision `machines`).
 */
export type Sim = ReturnType<typeof startSim>

export function startSim() {
  let now = 0
  let stepped = new URLSearchParams(location.search).has('stepped')
  return {
    now: () => now,
    advance: (dt: number) => void (now += dt * 1000),
    stepped: () => stepped,
    /** Stops the clock: only `advance` moves it, which the door's `step` calls. */
    stop: () => void (stepped = true),
    /** Lets real frames advance the clock again. */
    run: () => void (stepped = false),
  }
}
