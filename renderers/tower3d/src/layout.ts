import { draftsOf } from '../../../src/shared/drafts.ts'
import { REVIEWS } from '../../../src/shared/reviews.ts'
import type { Board, Card, Floor, GalleryShowing, Shell } from './api.ts'
import { onDuty, shelfKind } from './cards.ts'
import { DECK, STRIP, anchorsOf, loftOf, loftWalls, roomOf, roomsOf, type Anchors, type Layer, type Loft, type Room, type RoomId } from './floorplan.ts'
import { turnXZ } from '../../kaykit/src/catalog.ts'
import { gamesOf } from './games.ts'
import { breaksOf, nextBreak, type BreakPlace } from './breaks.ts'
import { meetingsOf, stateFor, type MeetingKit, type Place } from './meetings.ts'
import type { PrefabBox, ZoneSlot } from './zones.ts'

type RateLimit = Board['rateLimits'][number]
type ShelfEntry = NonNullable<Floor['shelf']>[number]

/**
 * The building as data: which level is which, how big the floor plate is, and where every desk, kiosk and wall
 * stands. The scene, the walking and the panels all read positions from here.
 *
 * Every level shares one plate, centered on the origin, with the elevator core against the back wall (-z) and its
 * doors facing +z. Every workstation is turned to face +x, away from the wing: a worker sits on the wing's side of its
 * desk, facing its monitor, so from the control room you read the screens over the workers' shoulders. Workers walk to
 * their desks along aisles running from the landing between the columns. Every floor has the same workstations, a row
 * of them added to the building only when some floor has no free one left for its workers.
 *
 * Each floor's back-left corner is a loft (src/floorplan.ts): a deck over the wing, reached by a stair along its edge.
 * The control room stands on the deck's back, entered from the terrace before it and glazed toward the desks: a video
 * wall of the floor's workers in the upper band of that glass, one face into the room and one over the floor, the
 * console before it facing out, and the floor's shells on a bench along the facade. Under the deck,
 * the archive holds the shelf along its walls, and a floor keeping games has an arcade in the game room before it, a
 * cabinet per game. Meeting rooms take the strip along the front glass (src/floorplan.ts's rooms and anchors).
 *
 * Right of the core, a partition stands free before the back glass: the floor's shared wall. A floor keeping drafts
 * has its corkboard on the wall's left, a note pinned on it per draft (what goes in); every floor hangs its gallery
 * on the wall's right, what its workers showed you (what came out).
 */

export const LOBBY_HEIGHT = 5.5
export const STOREY = 6.6
export const SLAB = 0.3
export const WALL = 0.25
/** How far a wall or slab meeting the building's glass runs past its pane, so its end never lies in the pane's plane. */
export const GLASS_PAST = 0.02
export const EYE = 1.6

export const CORE = { width: 4.4, depth: 4 }
export const DOOR_WIDTH = 2
export const DESK = { width: 2.4, depth: 1.1, height: 0.75 }
/** The L's return off a desk's right end (+x), flush with its back edge and as high: `width` along x, `depth` along z. */
export const RETURN = { width: 0.75, depth: 1.5 }
/** From a desk's center to its worker's seat, behind the desk (desk space -z). */
export const SEAT_OFFSET = 1.0
/** Which way every workstation faces, degrees about +y from +z: +x, its back to the control room. */
export const DESK_TURN = 90
/** Behind a worker's seat (desk space), where its way to the desk comes in. */
const BEHIND_SEAT = 0.9
/** How far out of the elevator's doors a worker's way runs across the landing, clear of the planters beside them. */
const ACROSS_LANDING = 1.4

const COLUMNS = 4
export const COLUMN_SPACING = 5.8
const ROW_SPACING = 4.8
const MIN_ROWS = 2
/** The rows of desks the plate is sized for, whatever the board draws: a floor keeps its shape until a fourth is needed. */
const PLATE_ROWS = 3
/** Clear floor between the elevator doors and the first row of desks. */
const LANDING = 4.2
const SIDE_MARGIN = 4
const BACK_MARGIN = 2.4
const KIOSK_SPACING = 1.9
/** A shell kiosk's footprint along the bench. */
export const KIOSK_DEPTH = 1.2

/** The control room's footprint on the deck, from the back wall. */
export const ROOM = { width: 9, depth: 9 }
/** The room's door, in its glass front onto the terrace: centred this far in from the wing's edge. */
const ROOM_DOOR_IN = 2.2
export const ROOM_DOOR = 1.6
/** The control room's clear height: from the deck to the ceiling. */
export const ROOM_HEIGHT = STOREY - SLAB - DECK.top
/**
 * The video wall: a band of the room's glass toward the desks, the tiles' width, their height over the deck and the gap
 * between them, its centre from the back, and the band's thickness and how far it reaches past the tiles.
 */
export const VIDEO_WALL = { width: 7.6, bottom: 1.35, top: 2.9, gap: 0.12, fromBack: 4.5, thick: 0.1, margin: 0.15 }
const SHELF_WIDTH: Record<'md' | 'html' | 'url' | 'link', number> = { md: 1.5, html: 1.5, url: 1.5, link: 1 }
const SHELF_GAP = 0.3
/** Where the shell bench starts, from the room's back wall. */
const KIOSK_FROM = 1.2
/** How far a shelf piece stands off its wall, to its centre. */
const SHELF_OFF = 0.22
/** The archive's floor kept clear before its door, along the wall it shares with the game room. */
const SHELF_DOORWAY = 2.2
/** The shared wall: its gap from the core, how far it stands off the back glass, how tall and thick it is. */
const PARTITION = { fromCore: 0.9, fromBack: 1.6, height: 3.2, thick: 0.2, margin: 0.5 }
/** The corkboard: its size, how far its base is off the floor, and the band its sign takes. */
export const CORK = { width: 4.2, height: 2.1, bottom: 0.75, header: 0.42 }
export const NOTE = { width: 0.46, height: 0.34, gap: 0.08 }
/**
 * The gallery's places, newest first: the centre at eye level, then around it, salon-hung. Each is a box on the wall
 * its picture fits in, offsets from the gallery's centre; how much of the box a picture takes depends on its kind.
 */
const HANG = [
  { x: 0, y: 1.55, w: 2.0, h: 1.25 },
  { x: -2.2, y: 2.2, w: 1.25, h: 0.78 },
  { x: 2.2, y: 2.2, w: 1.25, h: 0.78 },
  { x: -2.2, y: 1.0, w: 1.25, h: 0.78 },
  { x: 2.2, y: 1.0, w: 1.25, h: 0.78 },
  { x: -3.55, y: 2.1, w: 0.9, h: 0.56 },
  { x: 3.55, y: 2.1, w: 0.9, h: 0.56 },
  { x: -3.55, y: 1.1, w: 0.9, h: 0.56 },
  { x: 3.55, y: 1.1, w: 0.9, h: 0.56 },
]
const GALLERY = { width: 8.1, gap: 0.9 }
/** An arcade cabinet's footprint and height, and the gap between two. */
export const CABINET = { width: 0.8, depth: 0.72, height: 2.05, gap: 0.3 }
/** The stretch of the game room's front wall the arcade stands along: in from the facade, and from its glass side. */
const ARCADE = { fromFacade: 1.3, fromInner: 1.4 }
/** A room's walls' thickness, inside its box (its prefab's). */
const ROOM_WALL = 0.15
/** A picture's aspect: a poster's (src/showing.ts). */
export const PICTURE_ASPECT = 1.6

/**
 * A workstation on a floor, numbered from the landing, left to right then row by row: its desk's centre, and its turn
 * (degrees about +y; 0 faces +z). Desk space is the desk's own frame before that turn: its worker faces +z.
 */
export type StationSlot = { n: number; x: number; z: number; turn: number }
/**
 * A workstation with its worker. A reviewer whose author is at a desk sits beside it, at the free end of the author's
 * desk (`beside`, the author's id): `n` and `turn` are the author's workstation's, `x` and `z` the reviewer's own place there.
 * A worker gathered with its crew (src/meetings.ts), or on a break in the game room (src/breaks.ts), sits or stands at
 * its `meeting` place in that room instead, as if at a desk there: its chair at the seat, or standing, playing a
 * cabinet (`play`) or not; `n` is still the workstation it keeps.
 */
export type DeskSlot = StationSlot & { card: Card; beside?: string; meeting?: { room: RoomId; label: string; place: string; stand: boolean; play: boolean } }
/** A worker's workstation while it is in a meeting room or the game room, with the room's name. */
export type AwaySlot = StationSlot & { card: Card; room: string }
/** A meeting room's long table on the level: its centre and turn, the state it is drawn in, the room's places with it so, and the floor it takes. */
export type TableSlot = { room: RoomId; x: number; z: number; turn: number; state: string; places: Place[]; boxes: Box[] }

/** A shell's kiosk on the control room's bench, facing +x: its centre, and how far it is scaled down so every shell's kiosk fits. */
export type KioskSlot = { shell: Shell; x: number; z: number; scale: number }
/** A worker's screen on the video wall: its centre along the wall from the wall's middle, its height over the deck, and its size. */
export type TileSlot = { card: Card; x: number; y: number; w: number; h: number }
/**
 * A shelf entry against one of the archive's walls: its centre on the floor, `width` along the wall, facing `turn`
 * degrees about +y (0 facing +z), and how far it is scaled down so every entry fits.
 */
export type ShelfSlot = { entry: ShelfEntry; n: number; kind: keyof typeof SHELF_WIDTH; x: number; z: number; turn: number; width: number; scale: number }
/** A draft's note on the corkboard: its center on the board's face, in level space. */
export type NoteSlot = { id: string; tag: string; modifiedAt: number; x: number; y: number }
/** A floor's corkboard on its shared wall, facing +z: its center, the drafts it holds, and the notes it has room for. */
export type CorkSlot = { x: number; y: number; z: number; count: number; notes: NoteSlot[] }
type Shown = Card['shown'][number]
/** A showing hung in the gallery: its picture's center on the wall and its size, the frame around it not counted. */
export type PictureSlot = GalleryShowing & { x: number; y: number; w: number; h: number }
/**
 * A floor's shared wall, a partition facing +z: its center line, its extent and its face. The gallery's center is
 * where its sign hangs from.
 */
export type WallSlot = { minX: number; maxX: number; z: number; face: number; height: number; gallery: { x: number; width: number }; pictures: PictureSlot[] }

/**
 * A floor's pigeonhole, when it keeps review threads: its center against the control room's outer wall (facing +x), and
 * its slots, a checkout's thread each, the latest written first, as many as fit; `more` counts the rest.
 */
export type PigeonholeSlot = { x: number; z: number; threads: Floor['threads']; more: number }

/** A game's cabinet against the game room's front wall, facing into the room (-z): its center on the floor, and who kept it. */
export type CabinetSlot = { id: string; tag: string; modifiedAt: number; keptBy: string | undefined; x: number; z: number }
/** A floor's arcade, when it keeps games: its cabinets, the newest by the door, as many as fit; `count` is all its games. */
export type ArcadeSlot = { count: number; cabinets: CabinetSlot[] }
/** The sign in an empty game room, on its front wall facing into it, saying how to fill it: `declared`, whether the floor keeps `games`. */
export type ArcadeSignSlot = { x: number; z: number; declared: boolean }

/** Every level has its KayKit zones (src/zones.ts), placed by `furnish` once the plan is made. */
export type Level =
  | { kind: 'lobby'; index: number; y: number; name: string; zones: ZoneSlot[] }
  | { kind: 'floor'; index: number; y: number; name: string; zones: ZoneSlot[]; floor: Floor; desks: DeskSlot[]; free: StationSlot[]; away: AwaySlot[]; tables: TableSlot[]; kiosks: KioskSlot[]; tiles: TileSlot[]; shelf: ShelfSlot[]; wall: WallSlot; cork: CorkSlot | undefined; pigeonhole: PigeonholeSlot | undefined; arcade: ArcadeSlot | undefined; arcadeSign: ArcadeSignSlot | undefined }
  | { kind: 'roof'; index: number; y: number; name: string; zones: ZoneSlot[]; limits: RateLimit[]; floors: DanceFloor[]; guests: GuestSlot[] }

export type Plan = {
  width: number
  depth: number
  /** Lobby first, a floor per project, the roof last. */
  levels: Level[]
  /** Every floor's loft, the same on each. */
  loft: Loft
  /** Every floor's rooms on the ground and its named points, the same on each (src/floorplan.ts). */
  rooms: Room[]
  anchors: Anchors
  /** When, on the wall clock, the plan stops holding by time alone: the next worker leaves for the break room. */
  until: number
}

/** A worker off duty since today began, at the roof's party, with the project it worked for. Where it is changes with time (src/life.ts#guestAt). */
export type GuestSlot = { card: Card; project: string }

/** An obstacle's footprint on its level. */
export type Box = { minX: number; maxX: number; minZ: number; maxZ: number }

export const levelY = (index: number) => (index === 0 ? 0 : LOBBY_HEIGHT + (index - 1) * STOREY)
export const levelHeight = (index: number) => (index === 0 ? LOBBY_HEIGHT : STOREY)
/** The shaft's head over the roof, which the roof's landing stands in. */
export const SHAFT_HEAD = 4.2

const rowsFor = (desks: number) => Math.max(MIN_ROWS, Math.ceil(desks / COLUMNS))

/** Where the next worker on a floor sits: its lowest free workstation, as the bridge's seat replay gives it. */
export const openStation = (level: Extract<Level, { kind: 'floor' }>) => level.free[0]

/** The video wall's grid for `n` tiles: the column count giving the largest tiles of a screen's aspect, the rows centred in the band. */
function tiles(cards: Card[]): Omit<TileSlot, 'card'>[] {
  const { width, bottom, top, gap } = VIDEO_WALL
  const aspect = 1.6
  const sizeFor = (cols: number) => {
    const rows = Math.ceil(cards.length / cols)
    const w = Math.min(width / cols - gap, ((top - bottom) / rows - gap) * aspect)
    return { cols, rows, w, h: w / aspect }
  }
  const best = Array.from({ length: cards.length }, (_, i) => sizeFor(i + 1)).reduce((a, b) => (b.w > a.w ? b : a), sizeFor(1))
  return cards.map((_, i) => {
    const row = Math.floor(i / best.cols)
    const inRow = Math.min(best.cols, cards.length - row * best.cols)
    return {
      x: (i % best.cols - (inRow - 1) / 2) * (best.w + gap),
      y: (top + bottom) / 2 + (best.h + gap) * (best.rows / 2 - row - 0.5),
      w: best.w,
      h: best.h,
    }
  })
}

/** A stretch of wall pieces stand along: where it starts, which way it runs, how long it is, and the way its pieces face. */
type Run = { x: number; z: number; dx: number; dz: number; length: number; turn: number }

/** How much smaller pieces get at each step while they don't all fit their runs. */
const SHRINK = 0.9

/**
 * Where pieces `widths` wide stand along `runs` in turn, `gap` apart, each whole on one run: all at full size when
 * they fit, else all scaled down together (their widths and the gaps) by the largest step of `SHRINK` that fits every
 * one, so none is left out. Each piece's centre and turn, and the scale.
 */
function packed(widths: number[], gap: number, runs: Run[]) {
  for (let scale = 1; ; scale *= SHRINK) {
    let run = 0
    let along = 0
    const at = widths.map((w) => {
      while (run < runs.length && along + w * scale > runs[run].length) (run += 1, (along = 0))
      if (run === runs.length) return undefined
      const r = runs[run]
      const mid = along + (w * scale) / 2
      along += (w + gap) * scale
      return { x: r.x + r.dx * mid, z: r.z + r.dz * mid, turn: r.turn }
    })
    if (at.every((a) => a !== undefined)) return { scale, at }
  }
}

/**
 * The runs of the archive's walls the shelf takes in turn: the back glass from the left, the left glass toward the
 * front, then the wall it shares with the game room back toward the door, each piece standing off its wall.
 */
function shelfRuns(a: Box): Run[] {
  const glass = WALL + SHELF_OFF
  const partition = ROOM_WALL + SHELF_OFF
  const corner = WALL + 2 * SHELF_OFF + 0.1
  return [
    { x: a.minX + corner, z: a.minZ + glass, dx: 1, dz: 0, length: a.maxX - ROOM_WALL - 0.3 - (a.minX + corner), turn: 0 },
    { x: a.minX + glass, z: a.minZ + corner, dx: 0, dz: 1, length: a.maxZ - ROOM_WALL - 2 * SHELF_OFF - 0.1 - (a.minZ + corner), turn: 90 },
    { x: a.minX + corner, z: a.maxZ - partition, dx: 1, dz: 0, length: a.maxX - SHELF_DOORWAY - (a.minX + corner), turn: 180 },
  ]
}

/** Every shelf entry along the archive's runs in turn (`packed`). */
function shelfSlots(entries: ShelfEntry[], runs: Run[]): ShelfSlot[] {
  const kinds = entries.map((entry): ShelfSlot['kind'] => {
    const own = shelfKind(entry)
    return own === 'renderer' ? 'html' : own
  })
  const { scale, at } = packed(kinds.map((k) => SHELF_WIDTH[k]), SHELF_GAP, runs)
  return entries.map((entry, n) => ({ entry, n, kind: kinds[n], ...at[n]!, width: SHELF_WIDTH[kinds[n]] * scale, scale }))
}

/** A big screen (src/tv.ts) on a level: its center (y over the level's floor) and size, facing +z. */
export type BigScreen = { level: number; x: number; y: number; z: number; w: number; h: number }

/** The big screens: the lobby lounge's on the back wall, left of the core; the roof's behind the DJ. */
export function bigScreens(p: Plan): BigScreen[] {
  const back = -p.depth / 2
  return [
    { level: 0, x: -p.width / 2 + 8.5, y: 2.9, z: back + WALL + 0.12, w: 6.4, h: 3.6 },
    { level: p.levels.at(-1)!.index, x: partySpots(p).dj.x, y: 3.8, z: back + 1.6, w: 6.4, h: 3.6 },
  ]
}

/** The lounge in front of the lobby's big screen: a couch facing it, a low table between. */
export const loungeSpots = (p: Plan) => {
  const s = bigScreens(p)[0]
  return { couch: { x: s.x, z: s.z + 7 }, table: { x: s.x, z: s.z + 5 } }
}

const MAX_GUESTS = 32

/** The roof's party: the DJ before the big screen at the back left, the bar at the back right, both facing +z. */
export const partySpots = (p: Pick<Plan, 'width' | 'depth'>) => {
  const back = -p.depth / 2
  const bar = { x: p.width / 2 - 6, z: back + 2.2 }
  return {
    dj: { x: -p.width / 2 + ROOM.width / 2 + 1.5, z: back + 5.6 },
    bar,
    /** The bar's stools (models/bar.py), where a guest sits facing the counter, and how high their seats are. */
    barSpots: [-1.5, -0.5, 0.5, 1.5].map((dx) => ({ x: bar.x + dx, z: bar.z + 0.85 })),
    barSeat: 0.78,
  }
}

/** The roof's string lights (src/party.ts): their rows, metres from the roof's back edge, a pole at each end. */
export const STRING_ROWS = [8, 12.5, 17]

/** A dance floor's tile, and the most tiles a floor has across (x) and deep (z). */
export const DANCE_TILE = 1.1
const DANCE_MOST = { columns: 6, rows: 5 }
const MAX_DANCE_FLOORS = 8
/** Clear roof kept around the dance floors: from the parapet, around the elevator and the rate limits, behind the DJ and the bar. */
const DANCE_MARGIN = { edge: 1.2, middle: 1.2, dj: 1.8, bar: 2.8 }

/**
 * A dance floor on the roof: its center and its tiles, the projects whose guests dance on it, and its name and colour.
 * A floor of its own takes its project's; the floor shared by the overflow names none.
 */
export type DanceFloor = { key: string; name: string; color?: string; projects: string[]; x: number; z: number; columns: number; rows: number }

/** `k` floors in a zone, as large as they fit up to `DANCE_MOST`, in rows from the back, each centered in its cell. */
function packFloors(zone: Box, k: number) {
  if (k === 0) return []
  const w = zone.maxX - zone.minX
  const d = zone.maxZ - zone.minZ
  const fit = (cols: number) => {
    const rows = Math.ceil(k / cols)
    const columns = Math.min(DANCE_MOST.columns, Math.floor(w / cols / DANCE_TILE - 0.5))
    return { cols, rows, columns, deep: Math.min(DANCE_MOST.rows, Math.floor(d / rows / DANCE_TILE - 0.5)) }
  }
  const best = Array.from({ length: k }, (_, i) => fit(i + 1)).reduce((a, b) => (b.columns * b.deep > a.columns * a.deep ? b : a))
  return Array.from({ length: k }, (_, i) => ({
    x: zone.minX + ((i % best.cols) + 0.5) * (w / best.cols),
    z: zone.minZ + (Math.floor(i / best.cols) + 0.5) * (d / best.rows),
    columns: best.columns,
    rows: best.deep,
  }))
}

/**
 * A dance floor per project with guests today, in the board's order, packed into the roof's free zones on either side
 * of the elevator and the rate limits (`limits` columns): the first on the DJ's side, the next on the bar's, and so on.
 * Past `MAX_DANCE_FLOORS` projects, the last floor is shared by all the rest.
 */
export function danceFloors(p: Pick<Plan, 'width' | 'depth'>, withGuests: Floor[], limits: number): DanceFloor[] {
  const own = withGuests.length > MAX_DANCE_FLOORS ? withGuests.slice(0, MAX_DANCE_FLOORS - 1) : withGuests
  const rest = withGuests.slice(own.length)
  const named = [
    ...own.map((f) => ({ key: f.id, name: f.name, color: f.color, projects: [f.id] })),
    ...(rest.length ? [{ key: '+more', name: `+${rest.length} more`, color: undefined, projects: rest.map((f) => f.id) }] : []),
  ]
  const spots = partySpots(p)
  const middle = Math.max(CORE.width / 2 + WALL, ...rateLimitBoxes(p, limits).map((b) => b.maxX)) + DANCE_MARGIN.middle
  const front = p.depth / 2 - DANCE_MARGIN.edge
  const zones: Box[] = [
    { minX: -p.width / 2 + DANCE_MARGIN.edge, maxX: -middle, minZ: spots.dj.z + DANCE_MARGIN.dj, maxZ: front },
    { minX: middle, maxX: p.width / 2 - DANCE_MARGIN.edge, minZ: spots.bar.z + DANCE_MARGIN.bar, maxZ: front },
  ]
  const placed = zones.map((zone, side) => packFloors(zone, named.filter((_, i) => i % 2 === side).length))
  return named.map((f, i) => ({ ...f, ...placed[i % 2][Math.floor(i / 2)] }))
}

/** The `n`th place a guest takes on a dance floor: its tiles, spread out, then the corners between them. */
export function danceSpot(f: DanceFloor, n: number) {
  const count = f.columns * f.rows
  const stride = [7, 5, 3, 1].find((k) => gcd(k, count) === 1)!
  const tile = (n * stride) % count
  const lap = Math.floor(n / count) % 2
  return {
    x: f.x + ((tile % f.columns) - (f.columns - 1) / 2 + lap / 2) * DANCE_TILE,
    z: f.z + (Math.floor(tile / f.columns) - (f.rows - 1) / 2 + lap / 2) * DANCE_TILE,
  }
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** The dance floor a project's guests dance on. */
export const floorOfProject = (floors: DanceFloor[], project: string) => floors.find((f) => f.projects.includes(project))!

/** Today's off-duty workers, the latest first, each with its project. */
const guestCards = (board: Board, today: number) =>
  board.floors.flatMap((f) => f.cards).filter((c) => !c.onDuty && c.startedAt >= today).sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_GUESTS)

/** The workstations a floor's seats take (`card.seat`, replayed in the bridge). */
const stationsTaken = (floor: Floor) => floor.cards.flatMap((c) => (c.seat && 'n' in c.seat ? [c.seat.n] : []))

/** The wall's frame on a plate `depth` deep: right of the core, the corkboard's stretch then the gallery's. */
function wallFrame(depth: number) {
  const minX = CORE.width / 2 + WALL + PARTITION.fromCore
  const corkX = minX + PARTITION.margin + CORK.width / 2
  const galleryX = corkX + CORK.width / 2 + GALLERY.gap + GALLERY.width / 2
  const z = -depth / 2 + PARTITION.fromBack
  return { minX, maxX: galleryX + GALLERY.width / 2 + PARTITION.margin, z, face: z + PARTITION.thick / 2, corkX, galleryX }
}

/** How much of its place a picture takes: what was made to be read most, a link least. */
const sizeOf = (s: Shown) => (s.kind === 'link' ? 0.72 : s.kind === 'url' ? 0.86 : 1)

/** The floor's gallery (`floor.gallery`, newest first), hung in `HANG`'s places, as many as there are. */
function pictures(floor: Floor, x: number): PictureSlot[] {
  return floor.gallery.slice(0, HANG.length).map(({ worker, shown }, i) => {
    const place = HANG[i]
    const w = Math.min(place.w, place.h * PICTURE_ASPECT) * sizeOf(shown)
    return { worker, shown, x: x + place.x, y: place.y, w, h: w / PICTURE_ASPECT }
  })
}

function wallFor(floor: Floor, depth: number): WallSlot {
  const f = wallFrame(depth)
  return { minX: f.minX, maxX: f.maxX, z: f.z, face: f.face, height: PARTITION.height, gallery: { x: f.galleryX, width: GALLERY.width }, pictures: pictures(floor, f.galleryX) }
}

/** A floor's corkboard, when it keeps drafts: its notes in rows from the top left, as many as fit, oldest first. */
function corkFor(floor: Floor, depth: number): CorkSlot | undefined {
  const drafts = draftsOf(floor)
  if (!drafts) return undefined
  const { corkX: x, face } = wallFrame(depth)
  const y = CORK.bottom + CORK.height / 2
  const pitchX = NOTE.width + NOTE.gap
  const pitchY = NOTE.height + NOTE.gap
  const columns = Math.floor((CORK.width - 2 * NOTE.gap) / pitchX)
  const rows = Math.floor((CORK.height - CORK.header - NOTE.gap) / pitchY)
  const top = CORK.bottom + CORK.height - CORK.header
  const notes = drafts.items.slice(0, columns * rows).map((item, i) => ({
    id: item.id,
    tag: item.tag,
    modifiedAt: item.modifiedAt,
    x: x + (i % columns - (columns - 1) / 2) * pitchX,
    y: top - (Math.floor(i / columns) + 0.5) * pitchY,
  }))
  return { x, y, z: face + 0.04, count: drafts.items.length, notes }
}

/**
 * A floor's arcade, when it keeps games: a cabinet per game along the game room's front wall, facing into the room, the
 * newest (the latest id, as created items are named) nearest the door, as many as fit.
 */
function arcadeFor(floor: Floor, rooms: Room[]): ArcadeSlot | undefined {
  const games = gamesOf(floor)
  if (!games) return undefined
  const r = roomOf(rooms, 'game').box
  const from = r.minX + ARCADE.fromFacade
  const to = r.maxX - ARCADE.fromInner
  const pitch = CABINET.width + CABINET.gap
  const fit = Math.floor((to - from + CABINET.gap) / pitch)
  const items = games.items.toSorted((a, b) => b.id.localeCompare(a.id)).slice(0, fit)
  const right = (from + to) / 2 + ((fit - 1) / 2) * pitch
  const z = r.maxZ - ROOM_WALL - 0.05 - CABINET.depth / 2
  return {
    count: games.items.length,
    cabinets: items.map((item, i) => ({ id: item.id, tag: item.tag, modifiedAt: item.modifiedAt, keptBy: item.keptBy?.callsign, x: right - i * pitch, z })),
  }
}

/** A floor's arcade sign, while its game room holds no cabinet: in the middle of the arcade's stretch of wall. */
function arcadeSignFor(floor: Floor, rooms: Room[]): ArcadeSignSlot | undefined {
  const games = gamesOf(floor)
  if (games?.items.length) return undefined
  const r = roomOf(rooms, 'game').box
  return { x: (r.minX + ARCADE.fromFacade + r.maxX - ARCADE.fromInner) / 2, z: r.maxZ - ROOM_WALL, declared: games !== undefined }
}

/** A pigeonhole's slots, columns by rows, each a cell this wide and high. */
export const PIGEONHOLE = { columns: 4, rows: 3, cell: 0.44, height: 0.36, depth: 0.32, bottom: 0.4 }

const lastAt = (t: Floor['threads'][number]) => t.last?.at ?? ''

/** A floor's pigeonhole beside the nook, on the game room's outer wall between its back and its door. */
function pigeonholeFor(floor: Floor, rooms: Room[]): PigeonholeSlot | undefined {
  if (!floor.collections.some((c) => c.id === REVIEWS)) return undefined
  const game = roomOf(rooms, 'game')
  const fit = PIGEONHOLE.columns * PIGEONHOLE.rows
  const threads = floor.threads.toSorted((a, b) => lastAt(b).localeCompare(lastAt(a)) || a.checkout.localeCompare(b.checkout))
  return { x: game.box.maxX + PIGEONHOLE.depth / 2, z: (game.box.minZ + game.door.z - ROOM_DOOR / 2) / 2, threads: threads.slice(0, fit), more: Math.max(0, threads.length - fit) }
}

/** The workstation standing at a meeting place: its seat (its chair, at `SEAT_OFFSET` behind the desk's centre) on the place. */
const atPlace = (p: Place) => ({ ...fromDesk({ x: p.x, z: p.z, turn: p.turn }, 0, SEAT_OFFSET), turn: p.turn })

/** How far before a cabinet's front its player stands. */
const AT_CABINET = 0.5

/** The places in a game room with `arcade`'s cabinets: before each one, facing it, then `standing`. */
const breakPlaces = (arcade: ArcadeSlot | undefined, standing: BreakPlace[]): BreakPlace[] => [
  ...(arcade?.cabinets ?? []).map((c) => ({ name: `cabinet_${c.id}`, x: c.x, z: c.z - CABINET.depth / 2 - AT_CABINET, turn: 0, stand: true, play: true })),
  ...standing,
]

/**
 * The building for a board at `now` on the wall clock, which decides who is on a break and, by when the viewer's day
 * began, who's at the party. `beside` is how far a reviewer's place is from its author's along the floor and how far it
 * is turned from it, at the author's desk as it is drawn (`besideOf`); `meet`, the meeting rooms' furniture, where a
 * crew gathers; `standing`, where workers on a break stand in the game room.
 */
export function plan(board: Board, now: number, beside: (author: Card) => { x: number; z: number; turn: number }, meet: MeetingKit, standing: (room: Room) => BreakPlace[]): Plan {
  const today = new Date(now).setHours(0, 0, 0, 0)
  const width = 2 * SIDE_MARGIN + COLUMNS * COLUMN_SPACING + ROOM.width
  const rows = Math.max(...board.floors.map((f) => rowsFor(Math.max(-1, ...stationsTaken(f)) + 1)), MIN_ROWS)
  const shells = board.floors.map((f) => board.shells.filter((s) => s.project === f.id))
  const depth = CORE.depth + LANDING + Math.max(rows, PLATE_ROWS) * ROW_SPACING + BACK_MARGIN + STRIP.depth + STRIP.aisle
  const rooms = roomsOf({ width, depth })
  const runs = shelfRuns(roomOf(rooms, 'archive').box)
  const loft = loftOf({ width, depth }, WALL)
  const coreFront = -depth / 2 + CORE.depth
  const room = roomBox({ width, depth })
  const firstRow = coreFront + LANDING
  const anchors = anchorsOf({ width, depth }, loft, rooms, coreFront, { x: ROOM.width / 2, first: firstRow, last: firstRow + (rows - 1) * ROW_SPACING }, { x: (roomDoor({ width, depth }).minX + roomDoor({ width, depth }).maxX) / 2, z: room.maxZ })
  const stationAt = (n: number): StationSlot => ({
    n,
    x: ROOM.width / 2 + (n % COLUMNS - (COLUMNS - 1) / 2) * COLUMN_SPACING,
    z: firstRow + Math.floor(n / COLUMNS) * ROW_SPACING,
    turn: DESK_TURN,
  })
  const bench: Run = { x: room.minX + 0.6, z: room.minZ + KIOSK_FROM - KIOSK_DEPTH / 2, dx: 0, dz: 1, length: ROOM.depth - WALL - (KIOSK_FROM - KIOSK_DEPTH / 2), turn: 90 }
  const kiosksOf = (list: Shell[]): KioskSlot[] => {
    const { scale, at } = packed(list.map(() => KIOSK_DEPTH), KIOSK_SPACING - KIOSK_DEPTH, [bench])
    return list.map((shell, i) => ({ shell, x: at[i]!.x, z: at[i]!.z, scale }))
  }
  const meetingRooms = rooms.filter((r) => r.seats).sort((a, b) => b.seats! - a.seats!)
  const gameRoom = roomOf(rooms, 'game')
  const floors = board.floors.map((floor, i): Level => {
    const own = (id: string) => stationAt((floor.cards.find((c) => c.id === id)!.seat as { n: number }).n)
    const meetings = meetingsOf(floor.cards, meetingRooms, meet)
    const gathered = new Map(meetings.flatMap((m) => m.seats.map(({ card, place }) => [card.id, { room: m.room, place: { ...place, play: false } }] as const)))
    const arcade = arcadeFor(floor, rooms)
    const onBreak = breaksOf(onDuty(floor.cards), breakPlaces(arcade, standing(gameRoom)), now)
    const away = new Map([...gathered, ...onBreak.map(({ card, place }) => [card.id, { room: gameRoom, place }] as const)])
    const desks = onDuty(floor.cards).map((card): DeskSlot => {
      const seat = card.seat!
      const kept = 'n' in seat ? stationAt(seat.n) : own(seat.beside)
      const meeting = away.get(card.id)
      if (meeting) return { card, ...kept, ...atPlace(meeting.place), meeting: { room: meeting.room.id, label: meeting.room.label, place: meeting.place.name, stand: meeting.place.stand, play: meeting.place.play } }
      if ('n' in seat) return { card, ...kept }
      const by = beside(floor.cards.find((c) => c.id === seat.beside)!)
      return { card, ...kept, ...fromDesk(kept, by.x, by.z), turn: kept.turn + by.turn, beside: seat.beside }
    })
    const taken = new Set(desks.filter((d) => !d.beside).map((d) => d.n))
    const stations = desks.flatMap((d) => (d.meeting && 'n' in d.card.seat! ? [{ ...stationAt(d.n), card: d.card, room: d.meeting.label }] : []))
    const tables = meetingRooms.map((room): TableSlot => {
      const state = meetings.find((m) => m.room === room)?.state ?? stateFor(room, Infinity, meet.states)
      return { room: room.id, ...meet.table(room), state, places: meet.places(room, state), boxes: meet.footprint(room, state) }
    })
    return {
      kind: 'floor',
      index: i + 1,
      y: levelY(i + 1),
      name: floor.name,
      zones: [],
      floor,
      desks,
      free: Array.from({ length: rows * COLUMNS }, (_, n) => n).filter((n) => !taken.has(n)).map(stationAt),
      away: stations,
      tables,
      kiosks: kiosksOf(shells[i]),
      tiles: tiles(desks.map((d) => d.card)).map((t, i) => ({ ...t, card: desks[i].card })),
      shelf: shelfSlots(floor.shelf ?? [], runs),
      wall: wallFor(floor, depth),
      cork: corkFor(floor, depth),
      pigeonhole: pigeonholeFor(floor, rooms),
      arcade,
      arcadeSign: arcadeSignFor(floor, rooms),
    }
  })
  const roof = board.floors.length + 1
  const partyGoers = guestCards(board, today)
  const dancing = danceFloors({ width, depth }, board.floors.filter((f) => partyGoers.some((c) => c.project === f.id)), board.rateLimits.length)
  return {
    width,
    depth,
    loft,
    rooms,
    anchors,
    until: nextBreak(board.floors.flatMap((f) => onDuty(f.cards)), now),
    levels: [
      { kind: 'lobby', index: 0, y: 0, name: 'Lobby', zones: [] },
      ...floors,
      { kind: 'roof', index: roof, y: levelY(roof), name: 'Roof', zones: [], limits: board.rateLimits, floors: dancing, guests: partyGoers.map((card) => ({ card, project: card.project })) },
    ],
  }
}

export const coreFront = (p: Plan) => -p.depth / 2 + CORE.depth

/** Inside the elevator car, where a rider stands. */
export const carBox = (p: Plan): Box => ({ minX: -CORE.width / 2 + WALL, maxX: CORE.width / 2 - WALL, minZ: -p.depth / 2 + WALL, maxZ: coreFront(p) })

export const inside = (b: Box, x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ

/** Standing in the car, facing out of its doors. */
export const carSpot = (p: Plan) => ({ x: 0, z: coreFront(p) - CORE.depth / 2 + 0.2, yaw: 0 })

/** The control room's footprint on the deck: the plate's back-left corner. */
export const roomBox = (p: Pick<Plan, 'width' | 'depth'>): Box => ({ minX: -p.width / 2, maxX: -p.width / 2 + ROOM.width, minZ: -p.depth / 2, maxZ: -p.depth / 2 + ROOM.depth })

/** The door's gap in the room's glass front, onto the terrace. */
export const roomDoor = (p: Pick<Plan, 'width' | 'depth'>): Box => {
  const r = roomBox(p)
  const x = r.maxX - ROOM_DOOR_IN
  return { minX: x - ROOM_DOOR / 2, maxX: x + ROOM_DOOR / 2, minZ: r.maxZ - WALL, maxZ: r.maxZ + WALL }
}

/** Where the console stands in the room, facing the video wall and the desks beyond it (+x). */
export const consoleSpot = (p: Plan) => {
  const wall = videoWallSpot(p)
  return { x: wall.x - CONSOLE_OFF, z: wall.z }
}
/** From the video wall's glass back to the console's centre. */
const CONSOLE_OFF = 2.8

/**
 * The nook under the deck beside the archive: the archive's outer wall facing +x, with the filing cabinet and the
 * Running board along it from the back glass to the archive's door (their centres, from the back), and the board's width.
 */
const NOOK = { filing: 0.55, running: 2.05, width: 2.2 }
const nookWall = (p: Pick<Plan, 'rooms'>) => ({ x: roomOf(p.rooms, 'archive').box.maxX, back: roomOf(p.rooms, 'archive').box.minZ })

/** The floor's "Running" board in the nook, facing +x: its face, its center along the wall and its width. */
export const runningSpot = (p: Plan) => {
  const wall = nookWall(p)
  return { x: wall.x + 0.02, z: wall.back + NOOK.running, width: NOOK.width }
}

/** A floor's filing cabinet: `width` along the wall, `depth` out from it, its drawers stacked from the floor. */
export const FILING = { width: 0.48, depth: 0.6, height: 1.32, drawers: 4 }

/** Where a floor's filing cabinet stands in the nook, by the back glass, facing +x as the Running board does; its center on the floor. */
export const filingSpot = (p: Plan) => {
  const wall = nookWall(p)
  return { x: wall.x + FILING.depth / 2, z: wall.back + NOOK.filing }
}

/** The video wall's middle, on the line of the room's glass toward the desks: its tiles face both ways off it. */
export const videoWallSpot = (p: Pick<Plan, 'width' | 'depth'>) => {
  const r = roomBox(p)
  return { x: r.maxX, z: r.minZ + VIDEO_WALL.fromBack }
}

/** The opaque band the video wall's two faces hang on, in the room's glass: from just under the tiles to the ceiling. */
export const videoWallBand = (p: Pick<Plan, 'width' | 'depth'>): Solid => {
  const at = videoWallSpot(p)
  const { width, bottom, thick, margin } = VIDEO_WALL
  return { minX: at.x - thick / 2, maxX: at.x + thick / 2, minZ: at.z - width / 2 - margin, maxZ: at.z + width / 2 + margin, bottom: DECK.top + bottom - margin, top: DECK.top + ROOM_HEIGHT }
}


/** A point in a workstation's desk space (`dx` along its desk, `dz` toward its monitor), on the level. */
export function fromDesk(s: Pick<StationSlot, 'x' | 'z' | 'turn'>, dx: number, dz: number) {
  const [x, z] = turnXZ(dx, dz, s.turn)
  return { x: s.x + x, z: s.z + z }
}

/** A footprint given in a workstation's desk space, as the box round it on the level. */
export function turned(local: Box, s: Pick<StationSlot, 'x' | 'z' | 'turn'>): Box {
  const corners = [[local.minX, local.minZ], [local.minX, local.maxZ], [local.maxX, local.minZ], [local.maxX, local.maxZ]].map(([x, z]) => fromDesk(s, x, z))
  const xs = corners.map((c) => c.x)
  const zs = corners.map((c) => c.z)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

/**
 * The way from just outside the elevator's doors to the seat at the workstation `s` (a reviewer's place beside its
 * author's counts as one): across the landing to the aisle half a column's pitch behind the desk, down it to the desk,
 * then behind the chair and into it. The aisles run along z from the landing, so this holds for desks facing ±x.
 */
export function walkway(p: Plan, s: Pick<StationSlot, 'x' | 'z' | 'turn'>) {
  const front = coreFront(p)
  const aisle = fromDesk(s, 0, -COLUMN_SPACING / 2)
  return [{ x: 0, z: front + 0.4 }, { x: aisle.x, z: front + ACROSS_LANDING }, aisle, fromDesk(s, 0, -SEAT_OFFSET - BEHIND_SEAT), fromDesk(s, 0, -SEAT_OFFSET)]
}

/** Standing behind a worker, looking at its screen: at a meeting, close over its shoulder, inside the room. */
export const deskSpot = (d: DeskSlot) => ({ ...fromDesk(d, 0, -SEAT_OFFSET - (d.meeting ? 0.9 : 2.3)), yaw: (d.turn * Math.PI) / 180 })

/** Where a game's cabinet stands, with its level, if its floor's arcade has room for it. */
export function cabinetOf(p: Plan, project: string, id: string) {
  const level = p.levels.find((l) => l.kind === 'floor' && l.floor.id === project) as Extract<Level, { kind: 'floor' }> | undefined
  const cabinet = level?.arcade?.cabinets.find((c) => c.id === id)
  return level && cabinet && { level, cabinet }
}

/** Where a showing hangs, if it is still among its floor's latest. */
export const pictureOf = (p: Plan, id: string, target: string) =>
  p.levels.flatMap((l) => (l.kind === 'floor' ? l.wall.pictures : [])).find((pic) => pic.worker.id === id && pic.shown.target === target)

export const levelOfCard = (p: Plan, id: string) => p.levels.find((l) => l.kind === 'floor' && l.desks.some((d) => d.card.id === id))
export const deskOf = (p: Plan, id: string) => p.levels.flatMap((l) => (l.kind === 'floor' ? l.desks : [])).find((d) => d.card.id === id)
export const levelOfShell = (p: Plan, id: string) => p.levels.find((l) => l.kind === 'floor' && l.kiosks.some((k) => k.shell.id === id))
export const kioskOf = (p: Plan, id: string) => p.levels.flatMap((l) => (l.kind === 'floor' ? l.kiosks : [])).find((k) => k.shell.id === id)

const box = (x: number, z: number, w: number, d: number): Box => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 })

/** The core's walls: everything but the door gap in its front. */
function coreWalls(p: Plan): Box[] {
  const back = -p.depth / 2
  const front = coreFront(p)
  const half = CORE.width / 2
  const jamb = (half - DOOR_WIDTH / 2) / 2 + DOOR_WIDTH / 2
  return [
    { minX: -half - WALL, maxX: -half + WALL, minZ: back, maxZ: front },
    { minX: half - WALL, maxX: half + WALL, minZ: back, maxZ: front },
    box(-jamb, front, half - DOOR_WIDTH / 2, WALL * 2),
    box(jamb, front, half - DOOR_WIDTH / 2, WALL * 2),
  ]
}

/** The building's shell round a level, as a walker meets it. */
function shellWalls(p: Plan): Box[] {
  const w = p.width / 2
  const d = p.depth / 2
  return [
    { minX: -w - 1, maxX: -w + WALL, minZ: -d - 1, maxZ: d + 1 },
    { minX: w - WALL, maxX: w + 1, minZ: -d - 1, maxZ: d + 1 },
    { minX: -w - 1, maxX: w + 1, minZ: -d - 1, maxZ: -d + WALL },
    { minX: -w - 1, maxX: w + 1, minZ: d - WALL, maxZ: d + 1 },
  ]
}

/** Every workstation standing on a floor: its workers' own, the free ones, and those of workers in a meeting. */
export const workstations = (level: Extract<Level, { kind: 'floor' }>): StationSlot[] => [...level.desks.filter((d) => !d.beside && !d.meeting), ...level.free, ...level.away]

/** Every chair in a floor's meeting rooms, taken or not: at each seat round its room's table in its state, and at its counter. */
const meetingChairs = (level: Extract<Level, { kind: 'floor' }>) => level.tables.flatMap((t) => t.places.filter((pl) => !pl.stand).map((place) => ({ room: t.room, place })))

/** The chairs at meeting places nobody takes. */
export function emptyChairs(level: Extract<Level, { kind: 'floor' }>): Place[] {
  const taken = new Set(level.desks.flatMap((d) => (d.meeting ? [`${d.meeting.room}/${d.meeting.place}`] : [])))
  return meetingChairs(level).filter((c) => !taken.has(`${c.room}/${c.place.name}`)).map((c) => c.place)
}

/** A chair's floor in its own frame (models/desk.py): its casters round it, its back rest behind. */
const CHAIR_FLOOR = box(0, -0.04, 0.75, 0.83)

const sharedWall = (level: Extract<Level, { kind: 'floor' }>): Box => ({ minX: level.wall.minX, maxX: level.wall.maxX, minZ: level.wall.z - PARTITION.thick / 2, maxZ: level.wall.face + 0.1 })

/** What stands on a level's floor and is walked round: the building's shell, the core, the shared wall, and the loft's stair and post. */
export function walls(p: Plan, level: Level): Box[] {
  if (level.kind !== 'floor') return [...shellWalls(p), ...coreWalls(p)]
  return [...shellWalls(p), ...coreWalls(p), sharedWall(level), ...loftWalls(p.loft, 'ground')]
}

/** A box that stops sight, from `bottom` to `top` over its level's floor. */
export type Solid = Box & { bottom: number; top: number }

/**
 * What a look across a level can't pass through: the shell and the core from floor to ceiling, the loft's deck and
 * landing, the control room's front on the deck and its video wall's band, the shared wall as high as it stands, and
 * the prefabs' opaque walls.
 */
export function solids(p: Plan, level: Level): Solid[] {
  const height = levelHeight(level.index)
  const whole = (b: Box): Solid => ({ ...b, bottom: 0, top: height })
  if (level.kind !== 'floor') return [...shellWalls(p), ...coreWalls(p)].map(whole)
  const slab = (b: Box): Solid => ({ ...b, bottom: DECK.top - DECK.thick, top: DECK.top })
  return [
    ...[...shellWalls(p), ...coreWalls(p)].map(whole),
    ...roomFront(p).map((b) => ({ ...b, bottom: DECK.top, top: DECK.top + ROOM_HEIGHT })),
    videoWallBand(p),
    { ...sharedWall(level), bottom: 0, top: PARTITION.height },
    slab(p.loft.deck),
    slab(p.loft.landing),
    ...level.zones.flatMap((z) => z.shapes).filter((b) => b.opacity === undefined && b.size[1] >= EYE).map(shapeSolid),
  ]
}

/** A prefab's box on a level as sight meets it: the box round its turned footprint, as high as it stands. */
function shapeSolid(b: PrefabBox): Solid {
  const t = (b.turn * Math.PI) / 180
  const [hx, hz] = [Math.abs(Math.cos(t)) * b.size[0] / 2 + Math.abs(Math.sin(t)) * b.size[2] / 2, Math.abs(Math.sin(t)) * b.size[0] / 2 + Math.abs(Math.cos(t)) * b.size[2] / 2]
  return { minX: b.at[0] - hx, maxX: b.at[0] + hx, minZ: b.at[2] - hz, maxZ: b.at[2] + hz, bottom: b.at[1], top: b.at[1] + b.size[1] }
}

/** What you bump into on a layer of a level. */
export function collidersOn(p: Plan, level: Level, layer: Layer): Box[] {
  if (level.kind !== 'floor') return colliders(p, level)
  return layer === 'deck' ? deckColliders(p, level) : [...colliders(p, level), ...chairColliders(level)]
}

/**
 * The meeting rooms' chairs, taken or empty, as you bump into them. A worker pulls its chair out to sit, and the rows
 * back to back at a table and its counter leave no way between them, so the grid workers and cats walk leaves them out.
 */
const chairColliders = (level: Extract<Level, { kind: 'floor' }>) => meetingChairs(level).map((c) => turned(CHAIR_FLOOR, c.place))

/** What a walker on a floor's deck bumps into: the shell, the deck's rails, and the control room's walls and furniture. */
function deckColliders(p: Plan, level: Extract<Level, { kind: 'floor' }>): Box[] {
  return [
    ...shellWalls(p),
    ...loftWalls(p.loft, 'deck'),
    ...roomWalls(p),
    ...level.zones.filter((z) => z.y === DECK.top).flatMap((z) => z.boxes),
    box(consoleSpot(p).x - 0.25, consoleSpot(p).z, 2.2, 2.6),
    ...level.kiosks.map((k) => box(k.x, k.z, 0.8 * k.scale, KIOSK_DEPTH * k.scale)),
  ]
}

/** The floor a shelf piece takes: `width` along its wall, half a metre out from it. */
const shelfFloor = (s: ShelfSlot) => (s.turn % 180 === 0 ? box(s.x, s.z, s.width, 0.5) : box(s.x, s.z, 0.5, s.width))

/** A workstation's floor in desk space: the desk and its return, and its chair behind it. */
const WORKSTATION = box(RETURN.width / 2, -0.35, DESK.width + RETURN.width + 0.1, DESK.depth + 0.6 + SEAT_OFFSET)

/** What a walker on a level's floor bumps into: its walls and the furniture. */
export function colliders(p: Plan, level: Level): Box[] {
  const fixed = [...walls(p, level), ...level.zones.filter((z) => z.y === undefined).flatMap((z) => z.boxes)]
  if (level.kind === 'lobby') {
    const lounge = loungeSpots(p)
    return [...fixed, receptionBox(p), box(lounge.couch.x, lounge.couch.z, 2.8, 1), box(lounge.table.x, lounge.table.z, 1.8, 0.9)]
  }
  if (level.kind === 'roof') {
    const party = partySpots(p)
    const jumbo = bigScreens(p)[1]
    return [
      ...fixed, ...rateLimitBoxes(p, level.limits.length), box(party.dj.x, party.dj.z, 4.2, 2.2), box(party.bar.x, party.bar.z - 0.15, 4.4, 2.5),
      box(jumbo.x, jumbo.z, jumbo.w + 0.4, 0.5),
    ]
  }
  return [
    ...fixed,
    box(filingSpot(p).x, filingSpot(p).z, FILING.depth + 0.1, FILING.width + 0.1),
    ...workstations(level).map((s) => turned(WORKSTATION, s)),
    ...level.tables.flatMap((t) => t.boxes),
    ...(level.pigeonhole ? [box(level.pigeonhole.x, level.pigeonhole.z, PIGEONHOLE.depth + 0.1, PIGEONHOLE.columns * PIGEONHOLE.cell + 0.2)] : []),
    ...level.shelf.map(shelfFloor),
    ...(level.arcade?.cabinets ?? []).map((c) => box(c.x, c.z - 0.1, CABINET.width + 0.1, CABINET.depth + 0.3)),
  ]
}

/** The control room's front onto the terrace, but for the door. */
function roomFront(p: Plan): Box[] {
  const r = roomBox(p)
  const d = roomDoor(p)
  return [
    { minX: r.minX, maxX: d.minX, minZ: r.maxZ - WALL, maxZ: r.maxZ + WALL },
    { minX: d.maxX, maxX: r.maxX + WALL, minZ: r.maxZ - WALL, maxZ: r.maxZ + WALL },
  ]
}

/** The control room's glass walked into: its front but for the door, and its side toward the desks. */
export function roomWalls(p: Plan): Box[] {
  const r = roomBox(p)
  return [...roomFront(p), { minX: r.maxX - WALL, maxX: r.maxX + WALL, minZ: r.minZ, maxZ: r.maxZ }]
}

export const receptionBox = (p: Plan): Box => box(7, coreFront(p) + 5, 4.4, 1.2)

/** Where the roof's rate-limit columns stand, `n` of them in a row across the front, and the stats board last in the row. */
export const rateLimitBoxes = (p: Pick<Plan, 'depth'>, n: number): Box[] =>
  Array.from({ length: n + 1 }, (_, i) => box((i - n / 2) * 4, p.depth / 2 - 4, 1.6, 1.6))
