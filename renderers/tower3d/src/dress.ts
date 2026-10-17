import { fnv1a, mix } from '../../../src/shared/hash.ts'
import { fit, type Model } from '../../kaykit/src/catalog.ts'
import type { Theme } from '../../kaykit/src/scene.ts'
import type { Card } from './api.ts'
import { DESK, RETURN } from './layout.ts'
import type { Prefab, PrefabItem } from './zones.ts'

/**
 * A workstation's KayKit Bits models (CC0, vendored in `renderers/tower3d/kaykit`) as data, in desk space.
 * Every workstation is an L: the desk, and a cabinet as its return off the right end (+x), reaching back past the
 * seat. A worker's things spread over both: what it is doing now on the desk's right end, placed by hand as the states of
 * `DESK_DRESS` (the second monitor stands on the left, the cat perches at x 0.45, the logbook and the subagents stand in
 * its slots), and what its session has piled up on the return, growing with its context: mugs, a plate, a bowl, books, snacks; and a pizza box on the
 * floor for every turn it finished. In October it hoards candy.
 */

/**
 * Every model a workstation's pile may hold (its status props are desk_dress.json's), by catalog id, with its scale on top of the catalog's norms (`NORMS` in
 * renderers/kaykit/src/catalog.ts): KayKit's tabletop props are two to three times real size at room scale, beside
 * the desk's own real-size keyboard and mug.
 */
export const PROPS = {
  'furniture/cabinet_medium': 1,
  'furniture/mug_A': 0.45,
  'furniture/mug_B': 0.45,
  'furniture/cup': 0.45,
  'furniture/book_set': 0.55,
  'furniture/pictureframe_standing_A': 0.5,
  'restaurant/plate_dirty': 0.875,
  'restaurant/food_pizza_pepperoni_slice': 0.75,
  'restaurant/bowl_dirty': 0.75,
  'restaurant/jar_A_small': 1,
  'restaurant/pizzabox_closed': 0.7,
  'halloween/candy_orange_A': 0.625,
  'halloween/candy_purple_A': 0.625,
  'halloween/candycorn': 1,
} as const

export type Prop = keyof typeof PROPS

/** Models drawn in a theme of their pack (an alternate atlas, same UV layout): the return as a grey filing cabinet. */
export const THEMES: Partial<Record<Prop, Theme>> = { 'furniture/cabinet_medium': { atlas: { furniture: 'alt_C' } } }

/** `at` is (x, z) in desk space; `y` the height of its base, the desk top when absent; `turn` degrees about +Y. */
export type Placement = { model: Prop; at: [x: number, z: number]; turn: number; y?: number }

const OCTOBER = 9

/** The scene document of a workstation's dressing: its return, what its status puts on the desk, and the places of what is drawn around its worker (slots). */
export const DESK_DRESS = 'prefabs/desk_dress.json'

/** The return's top: x and z of its center, and its half extents. */
const TOP = { x: DESK.width / 2 + RETURN.width / 2, z: DESK.depth / 2 - RETURN.depth / 2 }

/** The desk dressing's state for a worker's status: what it puts on the desk's right end. */
export function statusState(card: Card): string {
  switch (card.status) {
    case 'working':
    case 'booting':
      return 'working'
    case 'watching':
      return 'watching'
    case 'blocked':
    case 'needs_input':
      return 'needs'
    case 'done':
      return 'done'
    default:
      return 'idle'
  }
}

/** What a session leaves on the return, each from the context share it appears at, back to front. */
const PILE: { from: number; items: Placement[] }[] = [
  { from: 2, items: [{ model: 'furniture/mug_B', at: [1.42, 0.3], turn: 150 }] },
  { from: 6, items: [{ model: 'furniture/cup', at: [1.72, 0.38], turn: 0 }] },
  {
    from: 10,
    items: [
      { model: 'restaurant/plate_dirty', at: [1.6, -0.02], turn: 0 },
      { model: 'restaurant/food_pizza_pepperoni_slice', at: [1.6, 0.08], turn: 40, y: DESK.height + 0.03 },
    ],
  },
  { from: 15, items: [{ model: 'furniture/book_set', at: [1.62, -0.42], turn: 90 }] },
  { from: 20, items: [{ model: 'restaurant/bowl_dirty', at: [1.42, -0.72], turn: 0 }] },
  { from: 26, items: [{ model: 'furniture/mug_A', at: [1.78, -0.78], turn: 250 }] },
  { from: 33, items: [{ model: 'restaurant/jar_A_small', at: [1.35, -0.25], turn: 0 }] },
]

/**
 * One pizza box per finished turn, on the floor past the desk's back edge: stacks of six from the return's far end
 * toward the desk's middle, up to three stacks.
 */
const BOX_HEIGHT = 0.3 * 0.3 * PROPS['restaurant/pizzabox_closed']
const STACK = { boxes: 6, stacks: 3, step: 0.48 }
const pizzas = (turns: number): Placement[] =>
  Array.from({ length: Math.min(STACK.boxes * STACK.stacks, turns) }, (_, i) => ({
    model: 'restaurant/pizzabox_closed',
    at: [TOP.x + 0.05 - Math.floor(i / STACK.boxes) * STACK.step, DESK.depth / 2 + 0.3],
    turn: ((i * 37) % 24) - 12,
    y: (i % STACK.boxes) * BOX_HEIGHT,
  }))

/** What the worker showed you, framed on the return's outer edge facing the aisle from the core: up to two. */
const TROPHIES: Placement[] = [
  { model: 'furniture/pictureframe_standing_A', at: [1.85, 0.1], turn: 135 },
  { model: 'furniture/pictureframe_standing_A', at: [1.85, -0.22], turn: 115 },
]
const trophies = (shown: number) => TROPHIES.slice(0, shown)

const CANDY: Placement[] = [
  { model: 'halloween/candy_orange_A', at: [0.62, 0.05], turn: 30, y: DESK.height + 0.03 },
  { model: 'halloween/candy_purple_A', at: [1.48, -0.5], turn: -50, y: DESK.height + 0.03 },
  { model: 'halloween/candycorn', at: [0.7, 0.42], turn: 10 },
  { model: 'halloween/candycorn', at: [1.3, 0.05], turn: 70 },
]

/** The same desk keeps the same mess: each model of its pile nudged and turned a little by the worker's id. */
const jitter = (id: string) => (it: PrefabItem, i: number): PrefabItem => {
  const h = mix(fnv1a(`${id}:${i}`))
  const nudge = (bits: number) => (((h >>> bits) & 0xff) / 255 - 0.5) * 0.06
  return { ...it, at: [it.at[0] + nudge(0), it.at[1], it.at[2] + nudge(8)], turn: it.turn + (((h >>> 16) & 0xff) / 255 - 0.5) * 30 }
}

/** What a session has piled up around its desk, in desk space. */
const pile = (card: Card, month: number): Placement[] => [
  ...PILE.filter((p) => (card.context ?? 0) >= p.from).flatMap((p) => p.items),
  ...pizzas(card.turns),
  ...trophies(card.shown.length),
  ...(month === OCTOBER ? CANDY : []),
]

/** A worker's workstation in desk space: the dressing's models in its status's state, as placed by hand, and its pile. */
export function dress(card: Card, month: number, desk: Prefab, models: Map<string, Model>): PrefabItem[] {
  return [...desk.states[statusState(card)], ...pile(card, month).map((p) => itemOf(p, models.get(p.model)!)).map(jitter(card.id))]
}

/** A placement as the playground places a model in the desk's frame: its base resting at its height. */
function itemOf(p: Placement, model: Model): PrefabItem {
  const scale = PROPS[p.model]
  return { model: p.model, at: [p.at[0], (p.y ?? DESK.height) - fit(model).min[1] * scale, p.at[1]], turn: p.turn, scale }
}
