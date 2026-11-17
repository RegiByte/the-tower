import type { Act, Held, Verb } from './acts.ts'
import type { Brief, Card, Tower } from './api.ts'
import type { Layout } from '/lib/layout.js'
import type { Plan } from './layout.ts'
import type { LogbookTab } from './ui.ts'
import { VIEWER_DEFAULT, type Viewer } from '/lib/viewer.js'
import { anchorsOf, loftOf, roomsOf } from './floorplan.ts'
import { noHires, type Hiring } from './hiring.ts'
import type { Walker } from './walker.ts'

export type View = 'walk' | 'focus' | 'overview' | 'pet'
/** Where to stand: `y` is how high over the level's floor, on a stair or the loft's deck, 0 unless given. */
export type Standing = { x: number; z: number; yaw: number; pitch?: number; y?: number }
export type Threads = Awaited<ReturnType<Tower['conversations']>>
/** A game played beside its cabinet; `x` is where the camera framed it. */
export type GamePanel = { kind: 'game'; project: string; id: string; x: number }
export type Panel =
  | { kind: 'desk'; id: string }
  | { kind: 'shell'; id: string }
  /** A floor's panel, with the tray unfolded under it: `worktrees`, a collection's id, or none. */
  | { kind: 'floor'; id: string; tray: string | undefined }
  /** A floor's past workers, filtered by `words`. */
  | { kind: 'archive'; id: string; words: string[] }
  | { kind: 'doc'; project: string; n: number; file?: string }
  /** An item of any collection in the reader; `drawn`: the `modifiedAt` its body was read for. */
  | { kind: 'kept'; project: string; collection: string; id: string; drawn: number }
  /** A gallery's picture in the reader, by its worker and target. */
  | { kind: 'picture'; id: string; target: string }
  | { kind: 'directory' }
  | { kind: 'elevator' }
  /** Where a new shell can start, picked at a floor's console: that floor's places first. */
  | { kind: 'shell-pick'; first: string }
  | { kind: 'tv'; n: number }
  /**
   * A worker's logbook in the reader, for a worker with no desk (a guest, an archived folder): its card as read, its
   * conversations once read and those read whole in them, the tab it shows, and the session whose last screen the
   * Screen tab shows.
   */
  | { kind: 'logbook'; card: Card; threads: Threads | undefined; wholes: Brief[]; tab: LogbookTab; on: string }
  /** A pulled drawer of a floor's filing cabinet, its folders listed beside the world. */
  | { kind: 'drawer'; project: string; n: number }
  /** The draft editor on a draft of `project`'s floor, its body in the panels' editor. */
  | { kind: 'draft'; project: string }
  /** A checkout's review thread read away from any desk, nobody working there now. */
  | { kind: 'thread'; project: string; checkout: string }
  /** The Stats panel in the reader. */
  | { kind: 'stats' }
  | GamePanel
/** A verb whose key or button is held: it runs once held for long enough, `by` the key code, `mouse` or `door`. */
export type Hold = { act: Act; verb: Verb; start: number; by: string }
export type Spot = Pick<Walker, 'level' | 'x' | 'z' | 'yaw' | 'pitch' | 'y'>

/** Tower 3D's state: everything the page knows and is doing, in one record the shell's modules read and write. */
export type State = {
  /** The waits visited by N this round (`Heed`); what you dismissed and how waits ring are the attention machine's (`attend.ts`). */
  visited: ReadonlySet<string>
  /** What you keep in `tower.store` for every renderer of yours: the ring, the logbook's and Changes' looks, the Stats range, the actions seen. */
  viewer: Viewer
  /** Your own layout of Tower 3D, kept in `tower.store` under `layout.tower3d`, over the config's and the renderer's. */
  storedLayout: Layout | undefined

  /** The hires in flight by floor, as the hiring machine in main holds them: read by the open workstations. */
  hiring: () => Hiring<Held>
  /** Every showing you have opened, by `shownKey`, kept with your spot. */
  seenShown: Set<string>
  /** The draft taken off a corkboard. */
  carrying: Held | undefined
  /** A beer from the roof's bar in your right hand. */
  beer: boolean

  /**
   * The door has captured: its capture stands in for pointer lock and follows every lock and unlock the way pointer
   * lock would (the app's `Capture`).
   */
  doorMode: boolean

  /** Kept by the tower for this page: the music off, the frame meter shown. */
  muted: boolean
  fpsShown: boolean
  /** The web page of each project directory's origin remote. */
  origins: Record<string, string>
}

const NO_PLATE = { width: 0, depth: 0 }
const NO_LOFT = loftOf(NO_PLATE, 0)
const NO_ROOMS = roomsOf(NO_PLATE)
/** The plan of no board: no levels, nothing to stand on. */
export const NO_PLAN: Plan = { ...NO_PLATE, levels: [], galleries: [], loft: NO_LOFT, rooms: NO_ROOMS, anchors: anchorsOf(NO_PLATE, NO_LOFT, NO_ROOMS, 0, { x: 0, first: 0, last: 0 }, { x: 0, z: 0 }), until: Infinity }

export const s: State = {
  visited: new Set(), viewer: VIEWER_DEFAULT, storedLayout: undefined,
  hiring: noHires, seenShown: new Set(),
  carrying: undefined, beer: false,
  doorMode: false,
  muted: false, fpsShown: false, origins: {},
}
