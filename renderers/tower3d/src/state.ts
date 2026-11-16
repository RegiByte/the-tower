import type { ChairKit, Chairs } from './chairs.ts'
import type { Draft } from '../../../extensions/drafts/client/drafts.ts'
import type { Act, CatNames, Held, Verb } from './acts.ts'
import type { Brief, Card, Stats, tower } from './api.ts'
import type { Layout } from '/lib/layout.js'
import type { Renderer } from '/lib/board.js'
import type { Note } from './cork.ts'
import type { ArcadeSign, Cabinet } from './arcade.ts'
import type { Desk, Station } from './desk.ts'
import type { Picture } from './gallery.ts'
import type { Hands } from './hands.ts'
import type { Plan } from './layout.ts'
import type { Arrival, Cat, CatName, Leaver, Origin } from './life.ts'
import type { Models } from './models.ts'
import type { Kit } from './kit.ts'
import type { LevelRoot } from './levels.ts'
import type { DanceFloors, Guest } from './party.ts'
import type { VideoWall } from './room.ts'
import type { Running } from './running.ts'
import type { Pigeonhole } from './pigeonhole.ts'
import type { Filing } from './filing.ts'
import type { LogbookTab } from './ui.ts'
import { STATS_ALL } from '/lib/stats.js'
import { VIEWER_DEFAULT, type Viewer } from '/lib/viewer.js'
import { anchorsOf, loftOf, roomsOf } from './floorplan.ts'
import { noHires, type Hiring } from './hiring.ts'
import type { Walker } from './walker.ts'
import type { World } from './world.ts'
import { shell } from './shell.ts'

export type View = 'walk' | 'focus' | 'overview' | 'pet'
/** Where to stand: `y` is how high over the level's floor, on a stair or the loft's deck, 0 unless given. */
export type Standing = { x: number; z: number; yaw: number; pitch?: number; y?: number }
export type Threads = Awaited<ReturnType<typeof tower.conversations>>
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
  /** The draft editor on a draft of `project`'s floor, its body in `State.draft`. */
  | { kind: 'draft'; project: string }
  /** A checkout's review thread read away from any desk, nobody working there now. */
  | { kind: 'thread'; project: string; checkout: string }
  /** The Stats panel in the reader. */
  | { kind: 'stats' }
  | GamePanel
/** A verb whose key or button is held: it runs once held for long enough, `by` the key code, `mouse` or `door`. */
export type Hold = { act: Act; verb: Verb; start: number; by: string }
export type Spot = Pick<Walker, 'level' | 'x' | 'z' | 'yaw' | 'pitch' | 'y'>
export type WallItem = { key: string; wall: VideoWall }

/** Tower 3D's state: everything the page knows and is doing, in one record the shell's modules read and write. */
export type State = {
  /** The tower stopped answering: the board on show is how it stood, and daemon verbs are held back. */
  lost: boolean
  /** The Blender models, parsed before the first board is built. */
  models: Models | undefined
  /** The KayKit models, loaded before the first board is built. */
  kit: Kit | undefined
  /** What stands on each level, by level index: its KayKit zones are refilled when the building is rebuilt, its workstations' KayKit models on every board. */
  levels: LevelRoot[]
  /** Your hands in first person, made from the models. */
  hands: Hands | undefined
  /** The building as last built, and what made its shape and its rate-limit plaques. */
  world: World | undefined
  worldKey: string
  limitsKey: string
  /** Keyed layers, by worker, workstation, level, draft or showing: kept across boards, in step with the plan. */
  desks: Map<string, Desk>
  stations: Map<string, Station>
  /** The meeting rooms' empty chairs, by level index, drawn from `chairKit`. */
  chairs: Chairs[]
  chairKit: ChairKit | undefined
  walls: Map<string, WallItem>
  /** Each floor's Running board, and its pigeonhole of review threads, by level index. */
  running: Map<string, Running>
  pigeonholes: Map<string, Pigeonhole>
  arcadeSigns: Map<string, ArcadeSign>
  filings: Map<string, Filing>
  guests: Map<string, Guest>
  dance: Map<string, DanceFloors & { key: string }>
  notes: Map<string, Note>
  cabinets: Map<string, Cabinet>
  pictures: Map<string, Picture>
  /** Workers walking in from the elevator, by worker, and those walking out to it. */
  arrivals: Map<string, Arrival>
  leavers: Set<Leaver>
  /** Where each worker leaving its desk for another on its level (to or from a meeting) sets off from, until its new desk is made. */
  moves: Map<string, Origin>
  cats: Map<CatName, Cat>
  /** What the renderer's settings name the cats. */
  catNames: CatNames
  /** The waits visited by N this round (`Heed`); what you dismissed and how waits ring are the attention machine's (`attend.ts`). */
  visited: ReadonlySet<string>
  /** What you keep in `tower.store` for every renderer of yours: the ring, the logbook's and Changes' looks, the Stats range, the actions seen. */
  viewer: Viewer
  /** Tower 3D as `GET /renderers` served it at start: what its `renderer.json` lays out and the config's layout for it. */
  declared: Renderer | undefined
  /** Your own layout of Tower 3D, kept in `tower.store` under `layout.tower3d`, over the config's and the renderer's. */
  storedLayout: Layout | undefined
  /** The lighting setting as last chosen, kept in `tower.store` under `LIGHTING_KEY`: the page draws what it started with (`Lighting`). */
  lighting: boolean
  /** When someone last started waiting on you, in simulated ms: with reduced motion, waiting lights pulse once from then. */
  waitedAt: number

  /** Where you stand and look: what the frames move, as walking, riding, petting or a cut moves you (the app's `Motion`). */
  me: Walker
  /** How open each level's landing doors are, 0 to 1, by level index. */
  doorOpen: Map<number, number>
  /** The hires in flight by floor, as the hiring machine in main holds them: read by the open workstations. */
  hiring: () => Hiring<Held>
  /** Every showing you have opened, by `shownKey`, kept with your spot. */
  seenShown: Set<string>
  /** The actions the open desk drew with a "new" dot: drawn so until its panel closes, though seen once drawn. */
  dotted: Set<string>
  /** The draft taken off a corkboard, and the one open in the editor (extensions/drafts/client/drafts.ts). */
  carrying: Held | undefined
  /** A beer from the roof's bar in your right hand. */
  beer: boolean
  draft: Draft | undefined

  /** A pointer press, kept to act on the release only if it still points at what it pressed. */
  down: { x: number; y: number; act: string } | undefined

  /**
   * The door has captured: its capture stands in for pointer lock and follows every lock and unlock the way pointer
   * lock would (the app's `Capture`).
   */
  doorMode: boolean

  /**
   * Simulated time in ms: what animations, holds, flights and cuts read. Live, real frames advance it; stepped, only
   * the door does. `?stepped` starts it stopped, so a page's frames are the same on every load.
   */
  simNow: number
  stepped: boolean
  /** Boards received and buildings built since load. */
  boards: number
  rebuilds: number
  /** Real frames over the last second: how many, and the ms each spent in update and render; and what the last frame drew of the scene. */
  meter: { since: number; frames: number; work: number; fps: number; frameMs: number; calls: number; triangles: number }

  /** Kept by the tower for this page: where you stood, the music off, the frame meter shown. */
  saved: Spot | undefined
  muted: boolean
  fpsShown: boolean
  /** The web page of each project directory's origin remote. */
  origins: Record<string, string>
  /** The Stats panel: the last read over `viewer.statsRange` and when, the scope shown, and the read in flight's number. */
  stats: { read: Stats | undefined; failed: string | undefined; at: number | undefined; scope: string; reading: number }
}

const NO_PLATE = { width: 0, depth: 0 }
const NO_LOFT = loftOf(NO_PLATE, 0)
const NO_ROOMS = roomsOf(NO_PLATE)
/** The plan of no board: no levels, nothing to stand on. */
export const NO_PLAN: Plan = { ...NO_PLATE, levels: [], galleries: [], loft: NO_LOFT, rooms: NO_ROOMS, anchors: anchorsOf(NO_PLATE, NO_LOFT, NO_ROOMS, 0, { x: 0, first: 0, last: 0 }, { x: 0, z: 0 }), until: Infinity }

export const s: State = {
  lost: false, models: undefined, kit: undefined, levels: [], hands: undefined,
  world: undefined, worldKey: '', limitsKey: '',
  desks: new Map(), stations: new Map(), chairs: [], chairKit: undefined, moves: new Map(), walls: new Map(), running: new Map(), pigeonholes: new Map(), arcadeSigns: new Map(), filings: new Map(), guests: new Map(), dance: new Map(), notes: new Map(), cabinets: new Map(), pictures: new Map(), arrivals: new Map(), leavers: new Set(), cats: new Map(), catNames: {},
  visited: new Set(), viewer: VIEWER_DEFAULT, declared: undefined, storedLayout: undefined, lighting: shell().lighting.lit, waitedAt: 0,
  me: { x: 0, z: 0, yaw: Math.PI, pitch: 0, level: 0, y: 0, vy: 0 },
  doorOpen: new Map(), hiring: noHires, seenShown: new Set(), dotted: new Set(),
  carrying: undefined, beer: false, draft: undefined,
  down: undefined,
  doorMode: false,
  simNow: 0, stepped: new URLSearchParams(location.search).has('stepped'), boards: 0, rebuilds: 0,
  meter: { since: 0, frames: 0, work: 0, fps: 0, frameMs: 0, calls: 0, triangles: 0 },
  saved: undefined, muted: false, fpsShown: false, origins: {},
  stats: { read: undefined, failed: undefined, at: undefined, scope: STATS_ALL, reading: 0 },
}
