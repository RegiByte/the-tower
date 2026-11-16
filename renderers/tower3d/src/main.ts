import { tower } from './api.ts'
import { s, type Spot } from './state.ts'
import { type Walker } from './walker.ts'
import type { Shell } from './shell.ts'
import type { Music } from './music.ts'
import type { Term } from './term.ts'
import type { Assets } from './loads.ts'
import type { Toasts } from './toasts.ts'
import type { Events } from './events.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'
import type { Views } from './views.ts'
import type { Spawn } from './spawn.ts'

import type { Hud } from './hud.ts'

import type { Navigation } from './navigation.ts'

import type { Panels } from './panels.ts'

import type { AppLoop } from './app-loop.ts'

import type { Controls } from './controls.ts'

import type { Frames } from './frames.ts'

import type { Feed, Kept } from './feed.ts'

/** The resources the page reads as it starts: the leaves' binding (`Shell`), and those only the page reads. */
export type Main = Shell & { music: Music; terminal: Term; assets: Assets; toasts: Toasts; events: Events; world: World; views: Views; spawn: Spawn; hud: Hud; navigation: Navigation; panels: Panels; app: AppLoop; controls: Controls; frames: Frames; feed: Feed }

/**
 * The page: what it draws, the listeners and timers it keeps, and the loops it runs, started by the `main` resource once
 * every resource it reads has (system.ts).
 */
export function startMain(started: Main) {
  const { boardNow, viewNow, motionNow } = nowOf(started.port)










  /** How many showings opened are kept: enough to cover every worker on duty. */
  const SEEN_KEPT = 300



  const spotOf = ({ level, x, z, yaw, pitch, y }: Walker): Spot => ({ level, x, z, yaw, pitch, y })
























































  /** Kept only for a person: the door's walks would move their spot. */
  let keptKey = ''
  setInterval(() => {
    if (!boardNow() || viewNow() !== 'walk' || motionNow().ride || s.doorMode) return
    const kept: Kept = { spot: spotOf(s.me), muted: s.muted, fps: s.fpsShown, seen: [...s.seenShown].slice(-SEEN_KEPT) }
    const key = JSON.stringify(kept)
    if (key !== keptKey) (keptKey = key, tower.remember(kept))
  }, 1000)


}
