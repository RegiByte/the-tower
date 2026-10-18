import type { Box } from './layout.ts'

/**
 * A floor's plan beyond its desks (decision `floor-plan`): the wing left of the desks is two storeys, a deck over its
 * back with a straight stair up along its face. The plan is data over the plate's size, read by the scene (src/loft.ts),
 * the walking (`groundAt`, `layerAt`) and the colliders (`loftWalls`).
 *
 * The loft is anchored to the back wall: every z is written from the plate's back, so a deeper plate leaves it where it
 * is. A floor's storey holds the deck inside it: 2.95 m clear under the deck, the deck, 3.0 m clear over it, the slab.
 */

/** The deck's walking surface over the floor, its thickness, and a rail's height. */
export const DECK = { top: 3.3, thick: 0.35, rail: 1.05 }
/** A straight flight from the floor to the deck: 18 risers of 183 mm on 300 mm treads. */
export const STAIR = { width: 1.6, run: 5.4, risers: 18 }
/** The wing's width from the left glass, how far the deck reaches from the back, and the stair's landing, from the back. */
const WING = { width: 9, deck: 14, landing: { from: 9.2, to: 10.8 } }
/** The archive under the deck, from the plate's back-left corner: as wide along x and as deep along z. */
export const ARCHIVE = { width: 6.5, depth: 5 }
/** The strip along the front glass the meeting rooms take, and the aisle before it. */
export const STRIP = { depth: 8.2, aisle: 1.6 }
/** How high the rooms under the deck stand, and the meeting rooms' walls, open above. */
const UNDER_DECK = 2.95
const MEETING_HEIGHT = 3.2
/** A rail's half thickness, as a walker bumps into it. */
const RAIL = 0.08
const POST = 0.3

/** Which surface a walker stands on: the floor, or the deck over it. */
export type Layer = 'ground' | 'deck'
/** A flight of stairs: its footprint, rising to the deck from its foot at the box's +z end toward -z. */
export type Stair = { box: Box }

export type Loft = {
  /** The deck over the wing, from the back. */
  deck: Box
  /** Where the stair arrives, beside the deck. */
  landing: Box
  stair: Stair
  /** Rails standing on the deck and the landing along their open edges (the control room's inner wall closes the deck's edge behind the landing), as thin boxes. */
  rails: Box[]
  /** Rails along the stair's open sides, sloping with it. */
  stairRails: Box[]
  /** The post holding the deck's free corner. */
  post: Box
}

const box = (minX: number, maxX: number, minZ: number, maxZ: number): Box => ({ minX, maxX, minZ, maxZ })
const railX = (x: number, z0: number, z1: number) => box(x - RAIL, x + RAIL, z0, z1)
const railZ = (z: number, x0: number, x1: number) => box(x0, x1, z - RAIL, z + RAIL)

/**
 * The loft on a plate `width` by `depth`, its back-left corner the plate's. `wall` is the shell's thickness and how far
 * the control room's side wall, standing on the wing's edge, reaches out of it: the stair runs along that wall's outer
 * face, and the landing reaches over the wall to the deck.
 */
export function loftOf(p: { width: number; depth: number }, wall: number): Loft {
  const left = -p.width / 2
  const back = -p.depth / 2
  const edge = left + WING.width
  const front = back + WING.deck
  const side = edge + wall
  const landing = box(edge, side + STAIR.width, back + WING.landing.from, back + WING.landing.to)
  const stair = { box: box(side, side + STAIR.width, landing.maxZ, landing.maxZ + STAIR.run) }
  return {
    deck: box(left, edge, back, front),
    landing,
    stair,
    rails: [
      railX(edge, landing.maxZ, front),
      railZ(front, left + wall, edge),
      railZ(landing.minZ, edge, landing.maxX),
      railX(landing.maxX, landing.minZ, landing.maxZ),
    ],
    stairRails: [railX(stair.box.maxX, stair.box.minZ, stair.box.maxZ), railX(stair.box.minX, front, stair.box.maxZ)],
    post: box(edge - POST, edge, front - POST, front),
  }
}

/**
 * A room on the floor, drawn by its prefab placed at its door: `door` is the middle of the door's gap on the wall's
 * line, `turn` the way out through it in degrees about +y (0 facing +z), as the prefab's own +z. A meeting room seats
 * `seats` at its long table at most.
 */
export type Room = { id: RoomId; label: string; prefab: string; box: Box; door: { x: number; z: number; turn: number }; height: number; seats?: number }
export type RoomId = 'archive' | 'game' | 'meeting-8' | 'meeting-4'

/**
 * The rooms on a plate `width` by `depth`: under the deck the archive in the back corner and the game room before it,
 * both entered from +x, the archive's door at its wall's front end so the nook's boards have the rest of that wall;
 * along the front glass Meeting · 8 and Meeting · 4, entered from -z, toward the desks. The wing's rooms are anchored
 * to the back, the meeting strip to the front glass.
 */
export function roomsOf(p: { width: number; depth: number }): Room[] {
  const left = -p.width / 2
  const back = -p.depth / 2
  const front = p.depth / 2
  const edge = left + WING.width
  const strip = front - STRIP.depth
  const meeting = (id: RoomId, label: string, minX: number, maxX: number, seats: number): Room => ({
    id, label, prefab: `prefabs/room_${id.replace('-', '_')}.json`, box: box(minX, maxX, strip, front), door: { x: minX + 1.4, z: strip, turn: 180 }, height: MEETING_HEIGHT, seats,
  })
  return [
    { id: 'archive', label: 'Archive', prefab: 'prefabs/room_archive.json', box: box(left, left + ARCHIVE.width, back, back + ARCHIVE.depth), door: { x: left + ARCHIVE.width, z: back + ARCHIVE.depth - 0.9, turn: 90 }, height: UNDER_DECK },
    { id: 'game', label: 'Game room', prefab: 'prefabs/room_game.json', box: box(left, edge, back + ARCHIVE.depth, back + WING.deck), door: { x: edge, z: back + 7.6, turn: 90 }, height: UNDER_DECK },
    meeting('meeting-8', 'Meeting · 8', -8.2, 1.0, 8),
    meeting('meeting-4', 'Meeting · 4', 8.0, 16.2, 4),
  ]
}

export const roomOf = (rooms: Room[], id: RoomId) => rooms.find((r) => r.id === id)!

/** A named point on a floor, `y` over its floor: zones are placed as offsets from these. */
export type Anchor = { x: number; y: number; z: number }
export type Anchors = Record<
  'elevator.doors' | 'desks.first-row' | 'desks.last-row' | 'glass.front' | 'glass.left' | 'glass.right' | 'control.door' | 'stair.foot' | 'stair.top' | 'deck.rail' | 'lounge' | 'hero' | `${RoomId}.door`,
  Anchor
>

/**
 * A floor's anchors on a plate `width` by `depth`: the elevator's doors at the core's front `coreFront`, the desks'
 * first and last rows (`desks`, their middle across), the glass, the control room's door onto the terrace, the
 * stair's foot and top, the deck's front rail, the rooms' doors, the lounge (the wing from the deck's front to the
 * front glass, which stretches with the plate) and the hero, between the meeting rooms.
 */
export function anchorsOf(p: { width: number; depth: number }, l: Loft, rooms: Room[], coreFront: number, desks: { x: number; first: number; last: number }, controlDoor: { x: number; z: number }): Anchors {
  const left = -p.width / 2
  const back = -p.depth / 2
  const front = p.depth / 2
  const at = (x: number, z: number, y = 0): Anchor => ({ x, y, z })
  const stairX = (l.stair.box.minX + l.stair.box.maxX) / 2
  const door = (id: RoomId) => at(roomOf(rooms, id).door.x, roomOf(rooms, id).door.z)
  const m8 = roomOf(rooms, 'meeting-8').box
  const m4 = roomOf(rooms, 'meeting-4').box
  return {
    'elevator.doors': at(0, coreFront),
    'desks.first-row': at(desks.x, desks.first),
    'desks.last-row': at(desks.x, desks.last),
    'glass.front': at(0, front),
    'glass.left': at(left, 0),
    'glass.right': at(p.width / 2, 0),
    'control.door': at(controlDoor.x, controlDoor.z, DECK.top),
    'stair.foot': at(stairX, l.stair.box.maxZ),
    'stair.top': at(stairX, l.stair.box.minZ, DECK.top),
    'deck.rail': at((l.deck.minX + l.deck.maxX) / 2, l.deck.maxZ, DECK.top),
    lounge: at((left + left + WING.width) / 2, (back + WING.deck + front) / 2),
    hero: at((m8.maxX + m4.minX) / 2, front - STRIP.depth / 2),
    'archive.door': door('archive'),
    'game.door': door('game'),
    'meeting-8.door': door('meeting-8'),
    'meeting-4.door': door('meeting-4'),
  }
}

const within = (b: Box, x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ

/** How high over the floor the stair's tread at `z` stands: 0 at its foot, the deck at its top. */
export function stairHeight(s: Stair, z: number) {
  const k = (s.box.maxZ - z) / (s.box.maxZ - s.box.minZ)
  return Math.min(1, Math.max(0, k)) * DECK.top
}

/** The layer a walker standing `y` over the level is on: past halfway up, the deck's. */
export const layerAt = (y: number): Layer => (y > DECK.top / 2 ? 'deck' : 'ground')

/** The surface under a walker at (x, z) standing `y` over the level: a stair's tread, the deck once up there, else the floor. */
export function groundAt(l: Loft, x: number, z: number, y: number) {
  if (within(l.stair.box, x, z)) return stairHeight(l.stair, z)
  if (layerAt(y) === 'deck' && (within(l.deck, x, z) || within(l.landing, x, z))) return DECK.top
  return 0
}

/**
 * What a walker on a layer bumps into that the loft adds: on the deck every rail; on the floor the post and the stair's
 * sides and back, open at its foot.
 */
export function loftWalls(l: Loft, layer: Layer): Box[] {
  if (layer === 'deck') return [...l.rails, ...l.stairRails]
  const s = l.stair.box
  return [l.post, railX(s.minX, s.minZ, s.maxZ - 0.3), railX(s.maxX, s.minZ, s.maxZ - 0.3), railZ(s.minZ, s.minX, s.maxX)]
}
