import * as THREE from 'three'
import { DECK, STAIR, stairHeight, type Loft } from './floorplan.ts'
import { GLASS_PAST, type Box } from './layout.ts'
import type { FloorPalette } from './palette.ts'
import { block, glowing, mesh, toon } from './toon.ts'

/**
 * A floor's loft in level space (src/floorplan.ts lays it out): the deck and its landing as slabs edged in the floor's
 * colour, glass rails with a steel handrail along their open edges, the post under the deck's free corner, and the
 * stair's treads between two stringers.
 */

const glass = new THREE.MeshPhysicalMaterial({ color: '#9cc4ff', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })
glass.userData.shared = true
const STEEL = '#8a93a6'
const STRINGER = 0.12
const HANDRAIL = 0.05

const slab = (b: Box, top: THREE.Material, under: THREE.Material, edge: THREE.Material) => {
  const g = new THREE.Group()
  const [w, d, x, z] = [b.maxX - b.minX, b.maxZ - b.minZ, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]
  g.add(block(w, DECK.thick, d, top, x, DECK.top - DECK.thick, z))
  const ceiling = mesh(new THREE.PlaneGeometry(w, d), under, x, DECK.top - DECK.thick - 0.005, z)
  ceiling.rotation.x = Math.PI / 2
  g.add(ceiling, block(w + 0.02, 0.05, d + 0.02, edge, x, DECK.top - 0.12, z))
  return g
}

/** A glass rail standing on the deck along a rail's box: the pane, its handrail on top. */
function rail(b: Box, steel: THREE.Material) {
  const g = new THREE.Group()
  const alongX = b.maxX - b.minX > b.maxZ - b.minZ
  const length = alongX ? b.maxX - b.minX : b.maxZ - b.minZ
  const [x, z] = [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]
  const pane = mesh(new THREE.PlaneGeometry(length, DECK.rail - 0.1), glass, x, DECK.top + 0.05 + (DECK.rail - 0.1) / 2, z)
  if (!alongX) pane.rotation.y = Math.PI / 2
  g.add(pane)
  g.add(block(alongX ? length : HANDRAIL, HANDRAIL, alongX ? HANDRAIL : length, steel, x, DECK.top + DECK.rail - HANDRAIL, z))
  return g
}

/** A rail along the stair's side, from its box's back to its front: a handrail sloping with the treads, on a post at each end. */
function stairRail(l: Loft, b: Box, steel: THREE.Material) {
  const g = new THREE.Group()
  const x = (b.minX + b.maxX) / 2
  const [y0, y1] = [stairHeight(l.stair, b.minZ) + DECK.rail, stairHeight(l.stair, b.maxZ) + DECK.rail]
  const bar = mesh(new THREE.BoxGeometry(HANDRAIL, HANDRAIL, Math.hypot(b.maxZ - b.minZ, y1 - y0)), steel, x, (y0 + y1) / 2, (b.minZ + b.maxZ) / 2)
  bar.rotation.x = Math.atan2(y0 - y1, b.maxZ - b.minZ)
  g.add(bar)
  for (const z of [b.minZ, b.maxZ]) g.add(block(HANDRAIL, DECK.rail, HANDRAIL, steel, x, stairHeight(l.stair, z), z))
  return g
}

/** The stair: a tread per riser, and a stringer up each side. */
function stair(l: Loft, wood: THREE.Material, side: THREE.Material) {
  const g = new THREE.Group()
  const s = l.stair.box
  const rise = DECK.top / STAIR.risers
  const tread = (s.maxZ - s.minZ) / STAIR.risers
  const width = s.maxX - s.minX
  for (let i = 0; i < STAIR.risers; i++) {
    const top = rise * (i + 1)
    g.add(block(width - 2 * STRINGER, 0.05, tread, wood, (s.minX + s.maxX) / 2, top - 0.05, s.maxZ - tread * (i + 0.5)))
    g.add(block(width - 2 * STRINGER, rise - 0.05, 0.02, side, (s.minX + s.maxX) / 2, top - rise, s.maxZ - tread * i - 0.01))
  }
  const length = Math.hypot(s.maxZ - s.minZ, DECK.top)
  for (const x of [s.minX + STRINGER / 2, s.maxX - STRINGER / 2]) {
    const stringer = mesh(new THREE.BoxGeometry(STRINGER, 0.3, length), side, x, DECK.top / 2, (s.minZ + s.maxZ) / 2)
    stringer.rotation.x = Math.atan2(DECK.top, s.maxZ - s.minZ)
    g.add(stringer)
  }
  return g
}

export function buildLoft(l: Loft, colors: FloorPalette, tint: string) {
  const g = new THREE.Group()
  const top = toon(colors.carpet)
  const under = toon(colors.ceiling)
  const edge = glowing(tint)
  const steel = toon(STEEL)
  // The deck's left and back edges meet the building's glass.
  const deck = { ...l.deck, minX: l.deck.minX - GLASS_PAST, minZ: l.deck.minZ - GLASS_PAST }
  g.add(slab(deck, top, under, edge), slab(l.landing, top, under, edge))
  for (const r of l.rails) g.add(rail(r, steel))
  for (const r of l.stairRails) g.add(stairRail(l, r, steel))
  const p = l.post
  g.add(block(p.maxX - p.minX, DECK.top - DECK.thick, p.maxZ - p.minZ, steel, (p.minX + p.maxX) / 2, 0, (p.minZ + p.maxZ) / 2))
  g.add(stair(l, toon(colors.facing), toon('#3a404c')))
  return g
}
