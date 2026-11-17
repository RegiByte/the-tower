import type { Tower } from './api.ts'
import { nowOf } from './now.ts'
import type { Port } from './port.ts'
import { s, type Spot } from './state.ts'
import type { Walker, WalkerCell } from './walker.ts'

/** Where you stood, kept by the tower for this page so a reload puts you back, with the music on or off and what you've seen shown. */
export type Kept = { spot: Spot; muted: boolean; fps?: boolean; seen?: string[] }

/** How many showings opened are kept: enough to cover every worker on duty. */
const SEEN_KEPT = 300

const spotOf = ({ level, x, z, yaw, pitch, y }: Walker): Spot => ({ level, x, z, yaw, pitch, y })

/** What the keeper is started with. */
export type KeeperDeps = { walker: WalkerCell; tower: Tower; port: Port }

/** Where you stand, the music and what you have seen, kept by the tower every second while it changes. */
export function startKeeper(started: KeeperDeps) {
  const { me } = started.walker
  const { tower } = started
  const { boardNow, viewNow, motionNow } = nowOf(started.port)

  /** Kept only for a person: the door's walks would move their spot. */
  let keptKey = ''
  setInterval(() => {
    if (!boardNow() || viewNow() !== 'walk' || motionNow().ride || started.port.state().doorMode) return
    const kept: Kept = { spot: spotOf(me()), muted: started.port.state().muted, fps: started.port.state().meterShown, seen: [...s.seenShown].slice(-SEEN_KEPT) }
    const key = JSON.stringify(kept)
    if (key !== keptKey) (keptKey = key, tower.remember(kept))
  }, 1000)
}
