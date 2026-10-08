import { fnv1a, mix } from '../../../src/shared/hash.ts'
import { fit, type Model } from '../../kaykit/src/catalog.ts'
import type { ModelItem, Theme } from '../../kaykit/src/scene.ts'
import type { Card } from './api.ts'
import { DESK, RETURN } from './layout.ts'

/**
 * A workstation's KayKit Bits models (CC0, vendored in `renderers/tower3d/kaykit`) as data, in desk space.
 * Every workstation is an L: the desk, and a cabinet as its return off the right end (+x), reaching back past the
 * seat. A worker's things spread over both: what it is doing now on the desk's right end (the second monitor stands
 * on the left, the logbook lies right of the keyboard, the cat perches at x 0.45, the subagents line up along the near
 * edge past the logbook), and what its session has
 * piled up on the return, growing with its context: mugs, a plate, a bowl, books, snacks; and a pizza box on the
 * floor for every turn it finished. In October it hoards candy.
 */

/**
 * Every model a workstation may hold, by catalog id, with its scale on top of the catalog's norms (`NORMS` in
 * renderers/kaykit/src/catalog.ts): KayKit's tabletop props are two to three times real size at room scale, beside
 * the desk's own real-size keyboard and mug.
 */
export const PROPS = {
  'furniture/cabinet_medium': 1,
  'furniture/cactus_small_A': 0.7,
  'furniture/lamp_desk': 0.55,
  'furniture/lamp_desk_headphones': 0.55,
  'furniture/mug_A': 0.45,
  'furniture/mug_B': 0.45,
  'furniture/cup': 0.45,
  'furniture/cup_pencils': 0.5,
  'furniture/book_set': 0.55,
  'furniture/pictureframe_standing_A': 0.5,
  'restaurant/plate_dirty': 0.875,
  'restaurant/food_pizza_pepperoni_slice': 0.75,
  'restaurant/food_pizza_cheese_plated': 0.5,
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

/** The return's top: x and z of its center, and its half extents. */
const TOP = { x: DESK.width / 2 + RETURN.width / 2, z: DESK.depth / 2 - RETURN.depth / 2 }

const returnPiece: Placement = { model: 'furniture/cabinet_medium', at: [TOP.x, TOP.z], turn: 90, y: 0 }

/** A workstation nobody sits at: the L, bare. */
export const bare = (): Placement[] => [returnPiece]

/** What a worker's status puts on the desk's right end. */
function now(card: Card): Placement[] {
  switch (card.status) {
    case 'working':
    case 'booting':
      return [
        { model: 'furniture/lamp_desk', at: [1.02, 0.3], turn: 210 },
        { model: 'furniture/cup_pencils', at: [0.78, 0.34], turn: 0 },
      ]
    case 'watching':
      return [
        { model: 'furniture/lamp_desk', at: [1.02, 0.3], turn: 210 },
        { model: 'furniture/mug_A', at: [0.8, 0.3], turn: 30 },
      ]
    case 'blocked':
    case 'needs_input':
      return [{ model: 'furniture/lamp_desk_headphones', at: [1.0, 0.3], turn: 210 }]
    case 'done':
      return [{ model: 'restaurant/food_pizza_cheese_plated', at: [0.85, 0.25], turn: 0 }]
    default:
      return [{ model: 'furniture/cactus_small_A', at: [0.95, 0.3], turn: 0 }]
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

/** The same desk keeps the same mess: each placement nudged and turned a little by the worker's id. */
const jitter = (id: string) => (p: Placement, i: number): Placement => {
  if (p.model === 'furniture/cabinet_medium') return p
  const h = mix(fnv1a(`${id}:${i}`))
  const nudge = (bits: number) => (((h >>> bits) & 0xff) / 255 - 0.5) * 0.06
  return { ...p, at: [p.at[0] + nudge(0), p.at[1] + nudge(8)], turn: p.turn + (((h >>> 16) & 0xff) / 255 - 0.5) * 30 }
}

export function dress(card: Card, month: number): Placement[] {
  const context = card.context ?? 0
  return [
    returnPiece,
    ...now(card),
    ...PILE.filter((p) => context >= p.from).flatMap((p) => p.items),
    ...pizzas(card.turns),
    ...trophies(card.shown.length),
    ...(month === OCTOBER ? CANDY : []),
  ].map(jitter(card.id))
}

/** A placement as the playground places a model in the desk's frame: its base resting at its height. */
export function itemOf(p: Placement, model: Model): ModelItem {
  const scale = PROPS[p.model]
  return { model: p.model, at: [p.at[0], (p.y ?? DESK.height) - fit(model).min[1] * scale, p.at[1]], turn: p.turn, scale }
}
