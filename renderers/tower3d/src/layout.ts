import { draftsOf } from '../../../src/shared/drafts.ts'
import { REVIEWS } from '../../../src/shared/reviews.ts'
import type { Board, Card, Floor, GalleryShowing, Shell } from './api.ts'
import { onDuty, shelfKind } from './cards.ts'
import { gamesOf } from './games.ts'
import type { ZoneSlot } from './zones.ts'

type RateLimit = Board['rateLimits'][number]
type ShelfEntry = NonNullable<Floor['shelf']>[number]

/**
 * The building as data: which level is which, how big the floor plate is, and where every desk, kiosk and wall
 * stands. The scene, the walking and the panels all read positions from here.
 *
 * Every level shares one plate, centered on the origin, with the elevator core against the back wall (-z) and its
 * doors facing +z. A worker sits on the core's side of its desk, facing its monitor (+z), so walking out of the
 * elevator you look over the workers' shoulders at their screens. Every floor has the same workstations, a row of
 * them added to the building only when some floor has no free one left for its workers.
 *
 * Each floor's back-left corner is its control room, entered from the side facing the elevator: a video wall of
 * the floor's workers on its back wall, the floor's shells on a bench along the facade, the shelf along its inner
 * wall, and the console in the middle. A floor keeping games has an arcade along the room's glass front, a cabinet
 * per game.
 *
 * Right of the core, a partition stands free before the back glass: the floor's shared wall. A floor keeping drafts
 * has its corkboard on the wall's left, a note pinned on it per draft (what goes in); every floor hangs its gallery
 * on the wall's right, what its workers showed you (what came out).
 */

export const LOBBY_HEIGHT = 5.5
export const STOREY = 4.2
export const SLAB = 0.3
export const WALL = 0.25
export const EYE = 1.6

export const CORE = { width: 4.4, depth: 4 }
export const DOOR_WIDTH = 2
export const DESK = { width: 2.4, depth: 1.1, height: 0.75 }
/** The L's return off a desk's right end (+x), flush with its back edge and as high: `width` along x, `depth` along z. */
export const RETURN = { width: 0.75, depth: 1.5 }
/** From a desk's center to its worker's seat, toward the core. */
export const SEAT_OFFSET = 1.0

const COLUMNS = 4
export const COLUMN_SPACING = 5.8
const ROW_SPACING = 4.8
const MIN_ROWS = 2
/** Clear floor between the elevator doors and the first row of desks. */
const LANDING = 4.2
const SIDE_MARGIN = 4
const BACK_MARGIN = 2.4
const KIOSK_SPACING = 1.9
/** A shell kiosk's footprint along the bench. */
export const KIOSK_DEPTH = 1.2

/** The room's width, and its depth unless its shelf or shells need more. */
export const ROOM = { width: 9, depth: 12 }
/** The room's door, in its wall facing the core: centered this far in front of the core's front. */
const ROOM_DOOR_AT = 3.4
export const ROOM_DOOR = 2.4
const VIDEO_WALL = { width: 8, bottom: 1.2, top: 3.65, gap: 0.12 }
const SHELF_WIDTH: Record<'md' | 'html' | 'url' | 'link', number> = { md: 1.5, html: 1.5, url: 1.5, link: 1 }
const SHELF_GAP = 0.3
/** Where the shelf and the shell bench start, from the room's back wall. */
const SHELF_FROM = 2.2
const KIOSK_FROM = 2.4
/** Clear floor between the room's front and the facade. */
const ROOM_FRONT = 3
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
/** The stretch of the control room's glass front the arcade stands along: in from the facade past the racks, and from the inner wall past the planter. */
const ARCADE = { fromFacade: 1.3, fromInner: 1.4 }
/** How far the control room's watch couch steps back from the glass while an arcade stands there. */
export const ARCADE_DEPTH = 1.6
/** A picture's aspect: a poster's (src/showing.ts). */
export const PICTURE_ASPECT = 1.6

/** A workstation on a floor, numbered from the landing, left to right then row by row. */
export type StationSlot = { n: number; x: number; z: number }
/**
 * A workstation with its worker. A reviewer whose author is at a desk sits beside it, at the free end of the author's
 * desk (`beside`, the author's id): `n` is the author's workstation, `x` and `z` the reviewer's own place there.
 */
export type DeskSlot = StationSlot & { card: Card; beside?: string }

/** From a desk's center to where a reviewer sits beside its worker: the desk's left end, past the worker's mouse. */
export const BESIDE_X = -1
export type KioskSlot = { shell: Shell; x: number; z: number }
/** A worker's screen on the video wall: its center on the wall (facing +z) and its size. */
export type TileSlot = { card: Card; x: number; y: number; w: number; h: number }
/** A shelf entry on the room's inner wall (facing -x), centered at z, `width` along it. */
export type ShelfSlot = { entry: ShelfEntry; n: number; kind: keyof typeof SHELF_WIDTH; z: number; width: number }
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

/** A game's cabinet at the control room's glass front, facing into the room (-z): its center on the floor, and who kept it. */
export type CabinetSlot = { id: string; tag: string; modifiedAt: number; keptBy: string | undefined; x: number; z: number }
/** A floor's arcade, when it keeps games: its cabinets, the newest by the door, as many as fit; `count` is all its games. */
export type ArcadeSlot = { count: number; cabinets: CabinetSlot[] }

/** Every level has its KayKit zones (src/zones.ts), placed by `furnish` once the plan is made. */
export type Level =
  | { kind: 'lobby'; index: number; y: number; name: string; zones: ZoneSlot[] }
  | { kind: 'floor'; index: number; y: number; name: string; zones: ZoneSlot[]; floor: Floor; desks: DeskSlot[]; free: StationSlot[]; kiosks: KioskSlot[]; tiles: TileSlot[]; shelf: ShelfSlot[]; wall: WallSlot; cork: CorkSlot | undefined; pigeonhole: PigeonholeSlot | undefined; arcade: ArcadeSlot | undefined }
  | { kind: 'roof'; index: number; y: number; name: string; zones: ZoneSlot[]; limits: RateLimit[]; floors: DanceFloor[]; guests: GuestSlot[] }

export type Plan = {
  width: number
  depth: number
  /** The control room's depth, the same on every floor. */
  roomDepth: number
  /** Lobby first, a floor per project, the roof last. */
  levels: Level[]
}

/** A worker off duty since today began, at the roof's party, with the project it worked for. Where it is changes with time (src/life.ts#guestAt). */
export type GuestSlot = { card: Card; project: string }

/** An obstacle's footprint on its level. */
export type Box = { minX: number; maxX: number; minZ: number; maxZ: number }

export const levelY = (index: number) => (index === 0 ? 0 : LOBBY_HEIGHT + (index - 1) * STOREY)
export const levelHeight = (index: number) => (index === 0 ? LOBBY_HEIGHT : STOREY)

const rowsFor = (desks: number) => Math.max(MIN_ROWS, Math.ceil(desks / COLUMNS))

/** Where the next worker on a floor sits: its lowest free workstation, as the bridge's seat replay gives it. */
export const openStation = (level: Extract<Level, { kind: 'floor' }>) => level.free[0]

/** The video wall's grid for `n` tiles: the column count giving the largest tiles of a screen's aspect. */
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
      y: top - (best.h + gap) * (row + 0.5),
      w: best.w,
      h: best.h,
    }
  })
}

/** The shelf's entries in a row along the room's inner wall, from `from`, skipping the door; z from the plate's back. */
function shelfSlots(entries: ShelfEntry[], from: number, door: { from: number; to: number }): ShelfSlot[] {
  let z = from
  return entries.map((entry, n) => {
    const own = shelfKind(entry)
    const kind: ShelfSlot['kind'] = own === 'renderer' ? 'html' : own
    const width = SHELF_WIDTH[kind]
    if (z + width > door.from && z < door.to) z = door.to + SHELF_GAP
    const slot = { entry, n, kind, z: z + width / 2, width }
    z += width + SHELF_GAP
    return slot
  })
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
 * A floor's arcade, when it keeps games: a cabinet per game along the control room's glass front, the newest (the
 * latest id, as created items are named) nearest the door, as many as fit.
 */
function arcadeFor(floor: Floor, p: Pick<Plan, 'width' | 'depth' | 'roomDepth'>): ArcadeSlot | undefined {
  const games = gamesOf(floor)
  if (!games) return undefined
  const r = roomBox(p)
  const from = r.minX + ARCADE.fromFacade
  const to = r.maxX - ARCADE.fromInner
  const pitch = CABINET.width + CABINET.gap
  const fit = Math.floor((to - from + CABINET.gap) / pitch)
  const items = games.items.toSorted((a, b) => b.id.localeCompare(a.id)).slice(0, fit)
  const right = (from + to) / 2 + ((fit - 1) / 2) * pitch
  const z = r.maxZ - WALL - 0.05 - CABINET.depth / 2
  return {
    count: games.items.length,
    cabinets: items.map((item, i) => ({ id: item.id, tag: item.tag, modifiedAt: item.modifiedAt, keptBy: item.keptBy?.callsign, x: right - i * pitch, z })),
  }
}

/** A pigeonhole's slots, columns by rows, each a cell this wide and high. */
export const PIGEONHOLE = { columns: 4, rows: 3, cell: 0.44, height: 0.36, depth: 0.32, bottom: 0.4 }

const lastAt = (t: Floor['threads'][number]) => t.last?.at ?? ''

function pigeonholeFor(floor: Floor, p: Pick<Plan, 'width' | 'depth' | 'roomDepth'>): PigeonholeSlot | undefined {
  if (!floor.collections.some((c) => c.id === REVIEWS)) return undefined
  const r = roomBox(p)
  const d = roomDoor(p)
  const fit = PIGEONHOLE.columns * PIGEONHOLE.rows
  const threads = floor.threads.toSorted((a, b) => lastAt(b).localeCompare(lastAt(a)) || a.checkout.localeCompare(b.checkout))
  return { x: r.maxX + WALL + PIGEONHOLE.depth / 2, z: (d.maxZ + r.maxZ) / 2, threads: threads.slice(0, fit), more: Math.max(0, threads.length - fit) }
}

/** The room's depth fitting what stands along its walls, the farthest end given from its back wall. */
const roomFor = (end: number) => end + SHELF_GAP + WALL

/** The building for a board; `today` is when the viewer's day began, which decides who's at the party. */
export function plan(board: Board, today: number): Plan {
  const width = 2 * SIDE_MARGIN + COLUMNS * COLUMN_SPACING + ROOM.width
  const rows = Math.max(...board.floors.map((f) => rowsFor(Math.max(-1, ...stationsTaken(f)) + 1)), MIN_ROWS)
  const doorAt = CORE.depth + ROOM_DOOR_AT
  const shelves = board.floors.map((f) => shelfSlots(f.shelf ?? [], SHELF_FROM, { from: doorAt - ROOM_DOOR / 2 - 0.2, to: doorAt + ROOM_DOOR / 2 + 0.2 }))
  const shells = board.floors.map((f) => board.shells.filter((s) => s.project === f.id))
  const roomDepth = Math.max(
    ROOM.depth,
    ...shelves.flatMap((s) => s.slice(-1).map((last) => roomFor(last.z + last.width / 2))),
    ...shells.filter((s) => s.length > 0).map((s) => roomFor(KIOSK_FROM + (s.length - 1) * KIOSK_SPACING + KIOSK_DEPTH / 2)),
  )
  const depth = Math.max(CORE.depth + LANDING + rows * ROW_SPACING + BACK_MARGIN, roomDepth + ROOM_FRONT)
  const coreFront = -depth / 2 + CORE.depth
  const room = roomBox({ width, depth, roomDepth })
  const stationAt = (n: number): StationSlot => ({
    n,
    x: ROOM.width / 2 + (n % COLUMNS - (COLUMNS - 1) / 2) * COLUMN_SPACING,
    z: coreFront + LANDING + Math.floor(n / COLUMNS) * ROW_SPACING,
  })
  const kioskAt = (shell: Shell, i: number): KioskSlot => ({ shell, x: room.minX + 0.6, z: room.minZ + KIOSK_FROM + i * KIOSK_SPACING })
  const floors = board.floors.map((floor, i): Level => {
    const own = (id: string) => stationAt((floor.cards.find((c) => c.id === id)!.seat as { n: number }).n)
    const desks = onDuty(floor.cards).map((card): DeskSlot => {
      const seat = card.seat!
      if ('n' in seat) return { card, ...stationAt(seat.n) }
      const at = own(seat.beside)
      return { card, ...at, x: at.x + BESIDE_X, beside: seat.beside }
    })
    const taken = new Set(desks.filter((d) => !d.beside).map((d) => d.n))
    const center = (room.minX + room.maxX) / 2
    return {
      kind: 'floor',
      index: i + 1,
      y: levelY(i + 1),
      name: floor.name,
      zones: [],
      floor,
      desks,
      free: Array.from({ length: rows * COLUMNS }, (_, n) => n).filter((n) => !taken.has(n)).map(stationAt),
      kiosks: shells[i].map(kioskAt),
      tiles: tiles(desks.map((d) => d.card)).map((t, i) => ({ ...t, x: center + t.x, card: desks[i].card })),
      shelf: shelves[i].map((slot) => ({ ...slot, z: room.minZ + slot.z })),
      wall: wallFor(floor, depth),
      cork: corkFor(floor, depth),
      pigeonhole: pigeonholeFor(floor, { width, depth, roomDepth }),
      arcade: arcadeFor(floor, { width, depth, roomDepth }),
    }
  })
  const roof = board.floors.length + 1
  const partyGoers = guestCards(board, today)
  const dancing = danceFloors({ width, depth }, board.floors.filter((f) => partyGoers.some((c) => c.project === f.id)), board.rateLimits.length)
  return {
    width,
    depth,
    roomDepth,
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

/** The control room's footprint: the plate's back-left corner. */
export const roomBox = (p: Pick<Plan, 'width' | 'depth' | 'roomDepth'>): Box => ({ minX: -p.width / 2, maxX: -p.width / 2 + ROOM.width, minZ: -p.depth / 2, maxZ: -p.depth / 2 + p.roomDepth })

/** The door's gap in the room's wall facing the core. */
export const roomDoor = (p: Pick<Plan, 'width' | 'depth'>): Box => {
  const x = -p.width / 2 + ROOM.width
  const z = -p.depth / 2 + CORE.depth + ROOM_DOOR_AT
  return { minX: x - WALL, maxX: x + WALL, minZ: z - ROOM_DOOR / 2, maxZ: z + ROOM_DOOR / 2 }
}

/** Where the console stands in the room, facing the video wall (-z). */
export const consoleSpot = (p: Plan) => {
  const r = roomBox(p)
  return { x: (r.minX + r.maxX) / 2, z: r.minZ + 4.45 }
}

/**
 * The floor's "Running" board on the room's outer side wall, between the back glass and the door, facing +x: its
 * face, its center along the wall and its width.
 */
export const runningSpot = (p: Plan) => {
  const r = roomBox(p)
  const from = r.minZ + WALL + 0.5
  const to = roomDoor(p).minZ - 0.5
  return { x: r.maxX + WALL + 0.02, z: (from + to) / 2, width: Math.min(5, to - from) }
}

/** A floor's filing cabinet: `width` along the wall, `depth` out from it, its drawers stacked from the floor. */
export const FILING = { width: 0.48, depth: 0.6, height: 1.32, drawers: 4 }

/**
 * Where a floor's filing cabinet stands: against the control room's outer wall, between the back glass and the Running
 * board, facing the same way (+x); its center on the floor.
 */
export const filingSpot = (p: Plan) => {
  const r = roomBox(p)
  return { x: r.maxX + WALL + FILING.depth / 2, z: r.minZ + WALL + 0.5 - FILING.width / 2 - 0.02 }
}

/** The video wall's face: tiles sit on it, facing +z. */
export const videoWallZ = (p: Plan) => roomBox(p).minZ + WALL + 0.08

/** The shelf's face on the room's inner wall, facing -x. */
export const shelfX = (p: Plan) => roomBox(p).maxX - WALL

/**
 * The way from just outside the elevator's doors to the seat at a desk centered at (x, z): across the landing, down
 * the aisle on the desk's left past the rows in front, then behind the chair and into it.
 */
export function walkway(p: Plan, x: number, z: number) {
  const front = coreFront(p)
  const behind = z - SEAT_OFFSET - 0.9
  const firstRow = front + LANDING - SEAT_OFFSET - 0.9
  const aisle = x - COLUMN_SPACING / 2
  const down = behind > firstRow ? [{ x: aisle, z: firstRow }, { x: aisle, z: behind }] : []
  return [{ x: 0, z: front + 0.4 }, ...down, { x, z: behind }, { x, z: z - SEAT_OFFSET }]
}

/** Standing behind a worker, looking at its screen. */
export const deskSpot = (d: DeskSlot) => ({ x: d.x, z: d.z - SEAT_OFFSET - 2.3, yaw: 0 })

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

/** What a walker bumps into on a level: the outer walls, the core, the furniture. */
export function colliders(p: Plan, level: Level): Box[] {
  const w = p.width / 2
  const d = p.depth / 2
  const outer: Box[] = [
    { minX: -w - 1, maxX: -w + WALL, minZ: -d - 1, maxZ: d + 1 },
    { minX: w - WALL, maxX: w + 1, minZ: -d - 1, maxZ: d + 1 },
    { minX: -w - 1, maxX: w + 1, minZ: -d - 1, maxZ: -d + WALL },
    { minX: -w - 1, maxX: w + 1, minZ: d - WALL, maxZ: d + 1 },
    ...level.zones.flatMap((z) => z.boxes),
  ]
  if (level.kind === 'lobby') {
    const lounge = loungeSpots(p)
    return [...outer, ...coreWalls(p), receptionBox(p), box(lounge.couch.x, lounge.couch.z, 2.8, 1), box(lounge.table.x, lounge.table.z, 1.8, 0.9)]
  }
  if (level.kind === 'roof') {
    const party = partySpots(p)
    const jumbo = bigScreens(p)[1]
    return [
      ...outer, ...coreWalls(p), ...rateLimitBoxes(p, level.limits.length), box(party.dj.x, party.dj.z, 4.2, 2.2), box(party.bar.x, party.bar.z - 0.15, 4.4, 2.5),
      box(jumbo.x, jumbo.z, jumbo.w + 0.4, 0.5),
    ]
  }
  return [
    ...outer,
    ...coreWalls(p),
    ...roomWalls(p),
    box(consoleSpot(p).x, consoleSpot(p).z + 0.25, 2.6, 2.2),
    box(filingSpot(p).x, filingSpot(p).z, FILING.depth + 0.1, FILING.width + 0.1),
    ...[...level.desks.filter((d) => !d.beside), ...level.free].map((s) => box(s.x + RETURN.width / 2, s.z - 0.35, DESK.width + RETURN.width + 0.1, DESK.depth + 0.6 + SEAT_OFFSET)),
    ...level.kiosks.map((k) => box(k.x, k.z, 0.8, KIOSK_DEPTH)),
    ...level.shelf.map((s) => box(shelfX(p) - 0.25, s.z, 0.5, s.width)),
    { minX: level.wall.minX, maxX: level.wall.maxX, minZ: level.wall.z - PARTITION.thick / 2, maxZ: level.wall.face + 0.1 },
    ...(level.pigeonhole ? [box(level.pigeonhole.x, level.pigeonhole.z, PIGEONHOLE.depth + 0.1, PIGEONHOLE.columns * PIGEONHOLE.cell + 0.2)] : []),
    ...(level.arcade?.cabinets ?? []).map((c) => box(c.x, c.z - 0.1, CABINET.width + 0.1, CABINET.depth + 0.3)),
  ]
}

/** The room's walls facing the floor: its front, and its inner side but for the door. */
export function roomWalls(p: Plan): Box[] {
  const r = roomBox(p)
  const d = roomDoor(p)
  return [
    { minX: r.minX, maxX: r.maxX + WALL, minZ: r.maxZ - WALL, maxZ: r.maxZ + WALL },
    { minX: r.maxX - WALL, maxX: r.maxX + WALL, minZ: r.minZ, maxZ: d.minZ },
    { minX: r.maxX - WALL, maxX: r.maxX + WALL, minZ: d.maxZ, maxZ: r.maxZ },
  ]
}

export const receptionBox = (p: Plan): Box => box(7, coreFront(p) + 5, 4.4, 1.2)

/** Where the roof's rate-limit columns stand, `n` of them in a row across the front, and the stats board last in the row. */
export const rateLimitBoxes = (p: Pick<Plan, 'depth'>, n: number): Box[] =>
  Array.from({ length: n + 1 }, (_, i) => box((i - n / 2) * 4, p.depth / 2 - 4, 1.6, 1.6))
