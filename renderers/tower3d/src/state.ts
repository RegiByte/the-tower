import type { BriefMarkdown } from '../../../src/shared/brief.ts'
import type * as THREE from 'three'
import type { Heed, Ring } from '../../../src/shared/cards.ts'
import type { Draft } from '../../../src/shared/drafts.ts'
import type { Act, CatNames, Held, Offer, Verb } from './acts.ts'
import type { Board, Card, ShelfSelf, Stats, tower } from './api.ts'
import type { Note } from './cork.ts'
import type { Cabinet } from './arcade.ts'
import type { Desk, Station } from './desk.ts'
import type { Picture } from './gallery.ts'
import type { Hands } from './hands.ts'
import type { Plan } from './layout.ts'
import type { Arrival, Cat, CatName, Leaver } from './life.ts'
import type { Models } from './models.ts'
import type { Pet } from './pet.ts'
import type { Kit } from './kit.ts'
import type { LevelRoot } from './levels.ts'
import type { DanceFloors, Guest } from './party.ts'
import type { VideoWall } from './room.ts'
import type { Running } from './running.ts'
import type { Pigeonhole } from './pigeonhole.ts'
import type { Filing } from './filing.ts'
import type { LinePick, StatsRange } from '../../../src/shared/panels.ts'
import type { Anchor } from '../../../src/shared/reviews.ts'
import type { DeskTab, LogbookTab } from './ui.ts'
import { STATS_ALL } from '../../../src/shared/panels.ts'
import type { Walker } from './walker.ts'
import type { World } from './world.ts'

export type View = 'walk' | 'focus' | 'overview' | 'pet'
export type Ride = { from: number; to: number; t: number; move: number }
export type Flight = { from: THREE.Vector3; to: THREE.Vector3; fromQ: THREE.Quaternion; toQ: THREE.Quaternion; start: number; ms: number; done?: () => void }
export type Standing = { x: number; z: number; yaw: number; pitch?: number }
/** A cut to elsewhere in the building: out to black, there once `at` has passed, back in. */
export type Cut = { at: number; level: number; spot: Standing; then: () => void }
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
  /** An item of any collection in the reader; `drawn`: the `modifiedAt` its body was drawn from. */
  | { kind: 'kept'; project: string; collection: string; id: string; drawn: number | undefined }
  /** A gallery's picture in the reader, by its worker and target. */
  | { kind: 'picture'; id: string; target: string }
  | { kind: 'directory' }
  | { kind: 'elevator' }
  /** Where a new shell can start, picked at a floor's console: that floor's places first. */
  | { kind: 'shell-pick'; first: string }
  | { kind: 'tv'; n: number }
  /**
   * A worker's logbook in the reader, for a worker with no desk (a guest, an archived folder): its card as read, its
   * conversations once read, the tab it shows, and the session whose last screen the Screen tab shows.
   */
  | { kind: 'logbook'; card: Card; threads: Threads | undefined; tab: LogbookTab; on: string }
  /** A pulled drawer of a floor's filing cabinet, its folders listed beside the world. */
  | { kind: 'drawer'; project: string; n: number }
  /** The draft editor, on `State.draft`. */
  | { kind: 'draft' }
  /** A checkout's review thread read away from any desk, nobody working there now. */
  | { kind: 'thread'; project: string; checkout: string }
  /** The Stats panel in the reader. */
  | { kind: 'stats' }
  | GamePanel
/** A verb whose key or button is held: it runs once held for long enough, `by` the key code, `mouse` or `door`. */
export type Hold = { act: Act; verb: Verb; start: number; by: string }
export type Spot = Pick<Walker, 'level' | 'x' | 'z' | 'yaw' | 'pitch'>
export type WallItem = { key: string; wall: VideoWall }

/** Tower 3D's state: everything the page knows and is doing, in one record the shell's modules read and write. */
export type State = {
  /** The board as last received, its plan, and the shelf entry this page is, when it is one. */
  board: Board | undefined
  /** The tower stopped answering: the board on show is how it stood, and daemon verbs are held back. */
  lost: boolean
  plan: Plan
  self: ShelfSelf | undefined
  /** No board has been built yet. */
  first: boolean
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
  walls: Map<string, WallItem>
  /** Each floor's Running board, and its pigeonhole of review threads, by level index. */
  running: Map<string, Running>
  pigeonholes: Map<string, Pigeonhole>
  filings: Map<string, Filing>
  guests: Map<string, Guest>
  dance: Map<string, DanceFloors & { key: string }>
  notes: Map<string, Note>
  cabinets: Map<string, Cabinet>
  pictures: Map<string, Picture>
  /** Workers walking in from the elevator, by worker, and those walking out to it. */
  arrivals: Map<string, Arrival>
  leavers: Set<Leaver>
  cats: Map<CatName, Cat>
  /** What the renderer's settings name the cats. */
  catNames: CatNames
  /**
   * What you did about the waits (`Heed`: dismissed, shared with your other renderers through `tower.store`, and
   * visited by N this round), how often a wait rings, and when one last rang, in simulated ms.
   */
  heed: Heed
  ring: Ring
  /** How the logbook draws prompts and answers, kept in `tower.store` under `BRIEF_MARKDOWN_KEY`. */
  briefMarkdown: BriefMarkdown
  rungAt: number
  /** When someone last started waiting on you, in simulated ms: with reduced motion, waiting lights pulse once from then. */
  waitedAt: number
  /** Each card's status at the last board: working to done or idle is a finished turn. */
  lastStatus: Map<string, Board['floors'][number]['cards'][number]['status']>

  /** Where you are and what you're doing: walking, riding, looking at a terminal, petting a cat, or out over the city. */
  me: Walker
  view: View
  ride: Ride | undefined
  flight: Flight | undefined
  /** The cat being petted, while the view is `pet`. */
  pet: Pet | undefined
  cut: Cut | undefined
  /** How open each level's landing doors are, 0 to 1, by level index. */
  doorOpen: Map<number, number>
  panel: Panel | undefined
  deskTab: DeskTab
  /** Where to go once the board shows it: a desk or shell just spawned or resumed, a desk to open on its brief or its review thread. */
  pendingDesk: string | undefined
  pendingTab: { id: string; tab: 'brief' | 'reviews' } | undefined
  pendingShell: string | undefined
  /** A desk to open on a showing's tab, by its worker and target. */
  pendingShown: { id: string; target: string } | undefined
  /** Every showing you have opened, by `shownKey`, kept with your spot; and every one on the last board, to spot new ones. */
  seenShown: Set<string>
  lastShown: Set<string>
  /** The draft taken off a corkboard, and the one open in the editor (src/shared/drafts.ts). */
  carrying: Held | undefined
  /** A beer from the roof's bar in your right hand. */
  beer: boolean
  draft: Draft | undefined
  /**
   * Review threads: the note being written on each, by `<project>/<checkout>`, and the note it answers; the worker
   * each one's Send was pointed at.
   */
  noteTexts: Map<string, string>
  noteRe: number | undefined
  sendPicks: Map<string, string>
  /**
   * The desk's Changes: files folded or unfolded against their viewed mark (`fileKey`), the lines picked (`picking`
   * while they are dragged across) and the note written under them (`pickFresh` until its box takes focus), and an
   * anchor whose lines to scroll to once drawn.
   */
  folds: Set<string>
  pick: LinePick | undefined
  picking: boolean
  pickText: string
  pickFresh: boolean
  jump: Anchor | undefined

  /** What the crosshair is on, what it offers, the offer the wheel marked, and the held one. */
  aimed: Act | undefined
  offers: Offer[]
  marked: number
  offersOfAimed: string
  hold: Hold | undefined
  /** A destructive button asked once and acts on a second click until `until`. */
  armed: { key: string; until: number } | undefined
  /** A pointer press, kept to act on the release only if it still points at what it pressed. */
  down: { x: number; y: number; act: string } | undefined

  /**
   * Walking takes the mouse: pointer lock, or the door's capture standing in for it. Once the door has captured,
   * `doorHeld` follows every lock and unlock the way pointer lock would.
   */
  doorMode: boolean
  doorHeld: boolean
  /** The mouse let go with P: the view holds as it was, without the pause card, until the mouse is taken again. */
  still: boolean

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
  /** The Stats panel: the last read over `range` and when, the scope shown, and the read in flight's number. */
  stats: { read: Stats | undefined; failed: string | undefined; at: number | undefined; range: StatsRange; scope: string; reading: number }
  /** A past session of a worker at a desk replayed on its monitor, and in its desk panel: its last screen, until back to live. */
  replay: { id: string; session: string } | undefined
}

const NO_PLAN: Plan = { width: 0, depth: 0, roomDepth: 0, levels: [] }

export const s: State = {
  board: undefined, lost: false, plan: NO_PLAN, self: undefined, first: true, models: undefined, kit: undefined, levels: [], hands: undefined,
  world: undefined, worldKey: '', limitsKey: '',
  desks: new Map(), stations: new Map(), walls: new Map(), running: new Map(), pigeonholes: new Map(), filings: new Map(), guests: new Map(), dance: new Map(), notes: new Map(), cabinets: new Map(), pictures: new Map(), arrivals: new Map(), leavers: new Set(), cats: new Map(), catNames: {},
  heed: { dismissed: new Set(), visited: new Set() }, ring: 'once', briefMarkdown: 'rendered', rungAt: 0, waitedAt: 0, lastStatus: new Map(),
  me: { x: 0, z: 0, yaw: Math.PI, pitch: 0, level: 0, y: 0, vy: 0 }, view: 'walk', ride: undefined, flight: undefined, pet: undefined, cut: undefined,
  doorOpen: new Map(), panel: undefined, deskTab: 'screen', pendingDesk: undefined, pendingTab: undefined, pendingShell: undefined, pendingShown: undefined, seenShown: new Set(), lastShown: new Set(),
  carrying: undefined, beer: false, draft: undefined, noteTexts: new Map(), noteRe: undefined, sendPicks: new Map(), folds: new Set(), pick: undefined, picking: false, pickText: '', pickFresh: false, jump: undefined,
  aimed: undefined, offers: [], marked: 0, offersOfAimed: '', hold: undefined, armed: undefined, down: undefined,
  doorMode: false, doorHeld: false, still: false,
  simNow: 0, stepped: new URLSearchParams(location.search).has('stepped'), boards: 0, rebuilds: 0,
  meter: { since: 0, frames: 0, work: 0, fps: 0, frameMs: 0, calls: 0, triangles: 0 },
  saved: undefined, muted: false, fpsShown: false, origins: {},
  stats: { read: undefined, failed: undefined, at: undefined, range: 'week', scope: STATS_ALL, reading: 0 },
  replay: undefined,
}
