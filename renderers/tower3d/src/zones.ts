import { mixOklab } from '../../../src/shared/design.ts'
import { turnXZ, type Vec3 } from '../../kaykit/src/catalog.ts'
import type { ModelItem, Theme } from '../../kaykit/src/scene.ts'
import { ARCADE_DEPTH, CORE, COLUMN_SPACING, DESK, KIOSK_DEPTH, RETURN, SEAT_OFFSET, STRING_ROWS, WALL, bigScreens, coreFront, partySpots, receptionBox, roomBox, runningSpot, type Box, type Level, type Plan } from './layout.ts'

/**
 * The office's places beyond the desks, composed from the KayKit playground's scene documents
 * (`renderers/kaykit/scenes`): each zone is a prefab placed in a free region of the plan, so what a floor's corner looks
 * like is a document anyone can check (`npm run tool:kaykit -- check`) and render headless, and where it stands is
 * derived from the plan here.
 */

/** Every scene document the office places, relative to `renderers/kaykit/scenes`: the build flattens each one. */
export const PREFABS = [
  'prefabs/office_lounge.json',
  'prefabs/office_coffee.json',
  'prefabs/planter.json',
  'prefabs/planter_low.json',
  'prefabs/desk_rug.json',
  'prefabs/hero_dropship.json',
  'prefabs/hero_terrarium.json',
  'prefabs/hero_rover.json',
  'prefabs/control_watch.json',
  'prefabs/control_rack.json',
  'prefabs/planter_tall.json',
  'prefabs/lobby_waiting.json',
  'prefabs/reception_top.json',
  'prefabs/city_table.json',
  'prefabs/roof_mechanicals.json',
  'prefabs/roof_helipad.json',
  'prefabs/roof_lantern.json',
  'prefabs/roof_pumpkins.json',
  'prefabs/office_meeting.json',
  'prefabs/meeting_rug.json',
  'prefabs/lobby_runner.json',
  'prefabs/running_bench.json',
]

/** The heroes, one per floor in turn up the building, so neighbours differ: each stands on a landing pad lit in its floor's colour. */
const HEROES = ['prefabs/hero_dropship.json', 'prefabs/hero_terrarium.json', 'prefabs/hero_rover.json']
/** The roof plant's paint: the Space Base's orange calmed to a blue-grey, so the party's lights stay the colour up there. */
const PLANT_GREY = '#6f7f8c'
/** The lobby's and the roof's own colour (src/sign.ts's LOBBY_BAND). */
const LOBBY_AMBER = '#ffb547'
/** The Space Base's orange and amber (pad lights, windows): what a hero repaints in its floor's colour. */
const SPACE_ACCENT = '#e97d19'


/** A model of a flattened prefab, in the prefab's own frame. */
export type PrefabItem = { model: string; at: Vec3; turn: number; scale: number | Vec3; parts?: Record<string, Vec3> }
/** A prefab as built (in `out/kaykit/kit.kaykit`): its models, and the floor they take that a walker bumps into. */
export type Prefab = { items: PrefabItem[]; footprint: Box[] }
export type Prefabs = Record<string, Prefab>

/**
 * A prefab on a level: where its origin stands, its turn in degrees about +Y, how far it is stretched along its own x
 * (a table made to fit), and the theme its packs draw in.
 */
export type ZoneSlot = { prefab: string; x: number; z: number; turn: number; stretch?: number; theme?: Theme; boxes: Box[] }

/** A footprint in a prefab's frame, in level space once the prefab stands at (x, z), stretched, turned by `turn`. */
const turnBox = (b: Box, x: number, z: number, turn: number, stretch = 1): Box => {
  const corners = [[b.minX * stretch, b.minZ], [b.minX * stretch, b.maxZ], [b.maxX * stretch, b.minZ], [b.maxX * stretch, b.maxZ]].map(([cx, cz]) => turnXZ(cx, cz, turn))
  const xs = corners.map(([cx]) => x + cx)
  const zs = corners.map(([, cz]) => z + cz)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

const prefabOf = (prefabs: Prefabs, name: string) => {
  const found = prefabs[name]
  if (!found) throw new Error(`no prefab ${name} in the kit: list it in PREFABS and run npm run tower3d`)
  return found
}

/** Where each prefab stands on a level, before its footprint is known. */
type Zone = Omit<ZoneSlot, 'boxes'>

/**
 * The office floor's furnishings: the pastel furniture atlas, the restaurant's orange calmed to a warm grey, the City
 * Builder's emerald trees to a potted sage.
 */
const OFFICE: Theme = {
  atlas: { furniture: 'alt_B' },
  swaps: { restaurant: [{ from: '#c56632', to: '#9c8f84', tol: 16 }], city: [{ from: '#008c56', to: '#4a8a5c', tol: 20 }] },
}
/** The office's theme with the Space Base's lights in a project's colour. */
const lit = (tint: string): Theme => ({ ...OFFICE, swaps: { ...OFFICE.swaps, space: [{ from: SPACE_ACCENT, to: tint, tol: 22 }] } })
/**
 * A floor's own furnishings: the office's theme with the pastel atlas's pinks and lilacs (cushions, seats, side tables,
 * a sideboard) and the fridge's mint in a pastel of the project's colour, so each floor's lounge, table and coffee
 * point carry it softly while its large pieces stay cream and grey.
 */
const PASTEL = { share: 50, ground: '#efe6dc', fridge: 70 }
const floorTheme = (tint: string): Theme => ({
  atlas: OFFICE.atlas,
  swaps: {
    ...OFFICE.swaps,
    furniture: [
      { from: '#ff9cb2', to: mixOklab(tint, PASTEL.share, PASTEL.ground), tol: 40 },
      { from: '#cfbeeb', to: mixOklab(tint, PASTEL.share, PASTEL.ground), tol: 38 },
    ],
    restaurant: [...OFFICE.swaps!.restaurant!, { from: '#21a389', to: mixOklab(tint, PASTEL.fridge, PASTEL.ground), tol: 20 }],
  },
})
/** The desks' rugs: the pastel lilac taken down to a taupe a step lighter than the carpet (the floor's light lifts it). */
const RUG: Theme = { atlas: { furniture: 'alt_B' }, swaps: { furniture: [{ from: '#cdbeeb', to: '#5e574e', tol: 50 }] } }
/** How far a planter stands off the glass, and the lounge's depth from its rug's centre to the couch's back. */
const OFF_GLASS = 0.7
const LOUNGE = { back: 1.8, front: 1.7, half: 2.4 }
/** Planters framing the elevator's doors on every floor, this far either side of their middle against the core. */
const BESIDE_DOORS = 3.3
/** How far before the Running board its couch stands, facing it. */
const RUNNING_VIEW = 5
/** The coffee point's counter run, along the right glass from the landing's side. */
const COFFEE = { length: 6.6 }

/** Low planters along a stretch of glass from `from` to `to`, one every `TROUGH` metres, centred. */
const TROUGH = 2.2
const troughs = (from: number, to: number) => {
  const n = Math.max(0, Math.floor((to - from) / TROUGH))
  return Array.from({ length: n }, (_, i) => (from + to) / 2 + (i - (n - 1) / 2) * TROUGH)
}

/**
 * A floor's zones, from where its workstations stand: a rug under each, a lounge facing the front glass in the corner
 * left of the desks and in front of the control room, a round table to meet at in the front strip past the last aisle,
 * a coffee point along the right glass beside the landing, the floor's hero at the end of the aisle you look down from
 * the elevator, planters at the front glass where the other aisles end, low planters along the side glass, planters
 * framing the elevator's doors, and a couch facing the Running board. `tint` is the project's colour as `#rrggbb`.
 */
function floorZones(p: Plan, level: Extract<Level, { kind: 'floor' }>, tint: string): Zone[] {
  const stations = [...level.desks.filter((d) => !d.beside), ...level.free]
  const xs = stations.map((s) => s.x)
  const lastRow = Math.max(...stations.map((s) => s.z))
  const front = p.depth / 2 - WALL
  const right = p.width / 2 - WALL
  const room = roomBox(p)
  const strip = { from: lastRow + DESK.depth / 2 + 0.7, to: front }
  const loungeZ = Math.max(strip.from, room.maxZ + WALL + 0.6) + LOUNGE.back
  const loungeX = (room.minX + Math.min(...xs) - COLUMN_SPACING / 2) / 2
  const aisles = [...new Set(xs)].sort((a, b) => a - b).slice(1).map((x) => x - COLUMN_SPACING / 2)
  const view = aisles.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a))
  const own = floorTheme(tint)
  const running = runningSpot(p)
  const meeting = { x: (aisles.at(-1)! + right) / 2, z: (strip.from + front) / 2 }
  const hero: Zone = { prefab: HEROES[(level.index - 1) % HEROES.length], x: view, z: (strip.from + front) / 2, turn: 180, theme: lit(tint) }
  return [
    hero,
    ...stations.map((s) => ({ prefab: 'prefabs/desk_rug.json', x: s.x + RETURN.width / 2, z: s.z - SEAT_OFFSET / 2 + 0.05, turn: 0, theme: RUG })),
    ...(loungeZ + LOUNGE.front <= front ? [{ prefab: 'prefabs/office_lounge.json', x: loungeX, z: loungeZ, turn: 0, theme: own }] : []),
    { prefab: 'prefabs/meeting_rug.json', ...meeting, turn: 0, theme: RUG },
    { prefab: 'prefabs/office_meeting.json', ...meeting, turn: 0, theme: own },
    { prefab: 'prefabs/office_coffee.json', x: right, z: coreFront(p) + 0.6, turn: 270, theme: own },
    ...aisles.filter((x) => x !== view).map((x) => ({ prefab: 'prefabs/planter.json', x, z: front - OFF_GLASS, turn: 0, theme: own })),
    ...troughs(coreFront(p) + 0.6 + COFFEE.length + 1, front - 1.6).map((z) => ({ prefab: 'prefabs/planter_low.json', x: right - 0.45, z, turn: 90, theme: own })),
    ...troughs(room.maxZ + WALL + 1, front - 1.6).map((z) => ({ prefab: 'prefabs/planter_low.json', x: -right + 0.45, z, turn: 90, theme: own })),
    ...[-1, 1].map((side) => ({ prefab: 'prefabs/planter.json', x: side * BESIDE_DOORS, z: coreFront(p) + 0.32, turn: 0, theme: own })),
    { prefab: 'prefabs/running_bench.json', x: running.x + RUNNING_VIEW, z: running.z, turn: 270, theme: own },
  ]
}

/** The dark lockers that stand in for server racks: the Prototype pack's dark grey atlas. */
const RACKS: Theme = { atlas: { prototype: 'alt_C' } }

/**
 * A control room's furnishings, kept off the video wall so every tile stays readable: a couch facing the wall from the
 * front glass (stepped back into the room while an arcade stands at the glass), and in the front corners, where the
 * shell bench and the shelf leave room, two racks by the facade and a planter by the shelf.
 */
function controlZones(p: Plan, level: Extract<Level, { kind: 'floor' }>, tint: string): Zone[] {
  const room = roomBox(p)
  const front = room.maxZ - 0.1
  const benchEnds = Math.max(room.minZ, ...level.kiosks.map((k) => k.z + KIOSK_DEPTH / 2))
  const shelfEnds = Math.max(room.minZ, ...level.shelf.map((s) => s.z + s.width / 2))
  const racks = [front - 0.9, front - 1.7].filter((z) => z - 0.5 > benchEnds)
  return [
    { prefab: 'prefabs/control_watch.json', x: (room.minX + room.maxX) / 2, z: level.arcade?.cabinets.length ? front - ARCADE_DEPTH : front, turn: 0, theme: floorTheme(tint) },
    ...racks.map((z) => ({ prefab: 'prefabs/control_rack.json', x: room.minX + 0.5, z, turn: 90, theme: RACKS })),
    ...(front - 1.5 > shelfEnds ? [{ prefab: 'prefabs/planter.json', x: room.maxX - WALL - 0.6, z: front - 0.7, turn: 0, theme: floorTheme(tint) }] : []),
  ]
}

/** The lobby's runner: the rugs' lilac taken to a deep amber, the lobby's colour a step above its floor. */
const RUNNER: Theme = { atlas: { furniture: 'alt_B' }, swaps: { furniture: [{ from: '#cdbeeb', to: '#5e4228', tol: 60 }] } }
/** The runner rug's length per unit of stretch, along its own x. */
const RUNNER_UNIT = 2.25

/** Where the lobby's waiting corner stands: by the entrance, right of the way in. */
export const waitingSpot = (p: Plan) => ({ x: p.width / 2 - 7.5, z: p.depth / 2 - 5 })

/** The lobby's city model: a building per project on a table left of the way in, a slot each, its top at `top`. */
const CITY = { slot: 0.95, margin: 0.5, top: 0.75, table: 2.25 }
const citySpot = (p: Plan) => ({ x: -p.width / 2 + 13, z: p.depth / 2 - 5.5 })
const floorsOf = (p: Plan) => p.levels.filter((l): l is Extract<Level, { kind: 'floor' }> => l.kind === 'floor')
const cityStretch = (p: Plan) => (floorsOf(p).length * CITY.slot + CITY.margin * 2) / CITY.table
/** The City Builder buildings the model draws, a different one for each project in turn. */
const BUILDINGS = ['city/building_C', 'city/building_H', 'city/building_E', 'city/building_G', 'city/building_D', 'city/building_F', 'city/building_A', 'city/building_B']
/** The models the city model places itself, outside any prefab: the build measures them with the prefabs'. */
export const CITY_MODELS = [...BUILDINGS, 'space/landingpad_small', 'city/park_base_decorated_trees']
/** A building's footprint and its height for no one on duty and for each worker on duty, as scales of the shipped model. */
const STOREY = { across: 0.36, base: 0.24, worker: 0.07, most: 8 }

/**
 * The lobby's city model as items in lobby space, each with its theme: for every project, in the building's order, a
 * small landing pad lit in its colour holding a building whose height grows with its workers on duty; a project with
 * nobody on duty is a park. Derived from the plan alone, so it changes with every board that brings or sends a worker.
 */
export function cityModel(p: Plan, tints: Record<string, string>): { item: ModelItem; theme: Theme }[] {
  const at = citySpot(p)
  const floors = floorsOf(p)
  return floors.flatMap((level, i) => {
    const x = at.x + (i - (floors.length - 1) / 2) * CITY.slot
    const pad = { model: 'space/landingpad_small', at: [x, CITY.top, at.z] as Vec3, scale: 0.42 }
    const deck = CITY.top + 0.21
    const workers = Math.min(level.desks.length, STOREY.most)
    const building: ModelItem = workers === 0
      ? { model: 'city/park_base_decorated_trees', at: [x, deck, at.z], scale: [0.36, 0.3, 0.36] }
      : { model: BUILDINGS[i % BUILDINGS.length], at: [x, deck, at.z], scale: [STOREY.across, STOREY.base + workers * STOREY.worker, STOREY.across] }
    return [{ item: pad, theme: lit(tints[level.floor.id]) }, { item: building, theme: OFFICE }]
  })
}

/**
 * The lobby: a runner from the entrance to the elevator, the reception counter dressed, a waiting corner by the
 * entrance, the city model's table, and tall planters by the glass, the core and the door.
 */
function lobbyZones(p: Plan): Zone[] {
  const r = receptionBox(p)
  const corners = [-1, 1].map((side) => ({ x: side * (p.width / 2 - 1.5), z: p.depth / 2 - 1.5 }))
  const core = [-1, 1].map((side) => ({ x: side * 3.6, z: coreFront(p) + 1 }))
  const door = [-1, 1].map((side) => ({ x: side * 2.6, z: p.depth / 2 - 0.9 }))
  const runner = { from: coreFront(p) + 1.4, to: p.depth / 2 - 0.4 }
  return [
    { prefab: 'prefabs/lobby_runner.json', x: 0, z: (runner.from + runner.to) / 2, turn: 90, stretch: (runner.to - runner.from) / RUNNER_UNIT, theme: RUNNER },
    { prefab: 'prefabs/reception_top.json', x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, turn: 0, theme: OFFICE },
    { prefab: 'prefabs/lobby_waiting.json', ...waitingSpot(p), turn: 0, theme: OFFICE },
    { prefab: 'prefabs/city_table.json', ...citySpot(p), turn: 0, stretch: cityStretch(p) },
    ...[...corners, ...core, ...door].map((at) => ({ prefab: 'prefabs/planter_tall.json', ...at, turn: 0, theme: OFFICE })),
  ]
}

const OCTOBER = 9
/** Between the string lights' poles along the side parapets, and along the front one, every `LANTERN` metres. */
const LANTERN = 4

/**
 * The roof: Space Base plant in the strip behind the party (a water tank, solar modules and cargo between the big
 * screen and the elevator, a landing pad with cargo between the elevator and the bar), and in October lanterns on posts
 * along the parapets and jack-o'-lanterns flanking the decks and the bar. All of it outside the dance floors' zones.
 */
function roofZones(p: Plan, month: number): Zone[] {
  const back = -p.depth / 2
  const spots = partySpots(p)
  const screen = bigScreens(p)[1]
  const core = CORE.width / 2 + WALL
  const strip = back + 2.2
  const october = month === OCTOBER
  const edge = { x: p.width / 2 - 0.55, z: p.depth / 2 - 0.55 }
  const sides = [STRING_ROWS[0] - LANTERN, ...STRING_ROWS.slice(1).map((z, i) => (z + STRING_ROWS[i]) / 2)].map((dz) => back + dz)
  const half = Math.floor((p.width / 2 - 2) / LANTERN + 0.5)
  const front = Array.from({ length: half * 2 }, (_, i) => (i - half + 0.5) * LANTERN)
  return [
    { prefab: 'prefabs/roof_mechanicals.json', x: (screen.x + screen.w / 2 + -core) / 2, z: strip, turn: 0, theme: lit(PLANT_GREY) },
    { prefab: 'prefabs/roof_helipad.json', x: (core + spots.bar.x - 2.4) / 2 - 0.6, z: strip + 0.4, turn: 0, theme: lit(LOBBY_AMBER) },
    ...(october
      ? [
          ...front.map((x) => ({ prefab: 'prefabs/roof_lantern.json', x, z: edge.z, turn: 180 })),
          ...sides.flatMap((z) => [
            { prefab: 'prefabs/roof_lantern.json', x: -edge.x, z, turn: 90 },
            { prefab: 'prefabs/roof_lantern.json', x: edge.x, z, turn: 270 },
          ]),
          { prefab: 'prefabs/roof_pumpkins.json', x: spots.dj.x - 2.9, z: spots.dj.z + 0.6, turn: 20 },
          { prefab: 'prefabs/roof_pumpkins.json', x: spots.dj.x + 2.9, z: spots.dj.z + 0.6, turn: -20 },
          { prefab: 'prefabs/roof_pumpkins.json', x: spots.bar.x + 2.9, z: spots.bar.z + 0.9, turn: -25 },
        ]
      : []),
  ]
}

function zonesOf(p: Plan, level: Level, tints: Record<string, string>, month: number): Zone[] {
  if (level.kind === 'lobby') return lobbyZones(p)
  if (level.kind === 'roof') return roofZones(p, month)
  return level.kind === 'floor' ? [...floorZones(p, level, tints[level.floor.id]), ...controlZones(p, level, tints[level.floor.id])] : []
}

/**
 * The plan with every level's zones placed, each with the floor it takes; `tints` are the projects' colours by id,
 * `month` the viewer's (0 is January), for what is seasonal.
 */
export function furnish(p: Plan, prefabs: Prefabs, tints: Record<string, string>, month: number): Plan {
  return {
    ...p,
    levels: p.levels.map((level) => ({
      ...level,
      zones: zonesOf(p, level, tints, month).map((z) => ({ ...z, boxes: prefabOf(prefabs, z.prefab).footprint.map((b) => turnBox(b, z.x, z.z, z.turn, z.stretch)) })),
    })),
  }
}
