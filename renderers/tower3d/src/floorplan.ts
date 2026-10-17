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
