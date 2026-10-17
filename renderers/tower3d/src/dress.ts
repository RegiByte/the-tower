import { fnv1a, mix } from '../../../src/shared/hash.ts'
import { fit, type Model } from '../../kaykit/src/catalog.ts'
import type { Card } from './api.ts'
import { DESK, RETURN } from './layout.ts'
import type { FlatSlot } from '../../kaykit/src/scene.ts'
import { stateKey, type PrefabPick, type Prefab, type PrefabItem } from './zones.ts'

/**
 * A workstation's KayKit Bits models (CC0, vendored in `renderers/tower3d/kaykit`) as data, in desk space.
 * Every workstation is an L: the desk, and a cabinet as its return off the right end (+x), reaching back past the
 * seat. What stands on it is `DESK_DRESS`, placed by hand: what the worker is doing now on the desk's right end, what
 * its session has piled up on the return, growing with its context, and in October its candy, each a state of one of
 * the document's groups; and the places of what is drawn around the worker, its slots. Counted here: a pizza box on
 * the floor for every turn it finished, and a frame for each thing it showed.
 */

/**
 * The models a workstation draws in code, by catalog id, with its scale on top of the catalog's norms (`NORMS` in
 * renderers/kaykit/src/catalog.ts): KayKit's tabletop props are two to three times real size at room scale, beside
 * the desk's own real-size keyboard and mug.
 */
export const PROPS = {
  'furniture/pictureframe_standing_A': 0.5,
  'restaurant/pizzabox_closed': 0.7,
} as const

export type Prop = keyof typeof PROPS

/** `at` is (x, z) in desk space; `y` the height of its base, the desk top when absent; `turn` degrees about +Y. */
export type Placement = { model: Prop; at: [x: number, z: number]; turn: number; y?: number }

const OCTOBER = 9

/** The scene document of a workstation's dressing: its return, its states by status, pile and season, and the places of what is drawn around its worker (slots). */
export const DESK_DRESS = 'prefabs/desk_dress.json'

/** The return's top: x of its center. */
const TOP = { x: DESK.width / 2 + RETURN.width / 2 }

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

/** The pile state for a session's context: the dressing's `pile_<n>` with the greatest n reached, none below the least. */
function pileState(pile: string[], context: number) {
  const reached = pile.map((name) => ({ name, from: Number(PILE.exec(name)![1]) })).filter((p) => context >= p.from)
  return reached.toSorted((a, b) => b.from - a.from)[0]?.name
}
const PILE = /^pile_(\d+)$/

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

/** A pizza box nudged and turned a little by the worker's id, so no two desks' stacks are clones. */
const jitter = (id: string) => (it: PrefabItem, i: number): PrefabItem => {
  const h = mix(fnv1a(`${id}:${i}`))
  const nudge = (bits: number) => (((h >>> bits) & 0xff) / 255 - 0.5) * 0.06
  return { ...it, at: [it.at[0] + nudge(0), it.at[1], it.at[2] + nudge(8)], turn: it.turn + (((h >>> 16) & 0xff) / 255 - 0.5) * 30 }
}

/** What the worker showed you, framed where the dressing's `trophy_<n>` slots stand them: as many as it showed, up to one per slot. */
const trophies = (slots: FlatSlot[], shown: number): Placement[] =>
  slots.slice(0, shown).map((s) => ({ model: 'furniture/pictureframe_standing_A', at: [s.at[0], s.at[2]], turn: s.turn, y: s.at[1] }))

/** A worker's desk dressing in a state of each of its groups: its status, what its context piled up, October's candy. */
export function pickOf(card: Card, month: number, desk: Prefab): PrefabPick {
  const names = [statusState(card), pileState(desk.groups.pile, card.context ?? 0), month === OCTOBER ? 'october' : undefined].filter((n) => n !== undefined)
  return desk.states[stateKey(names)]
}

/**
 * A worker's workstation in desk space: its dressing's models as placed by hand (`pickOf`), its pizza boxes and the
 * frames for what it showed, at `frames` (`DeskSlots.trophies`).
 */
export function dress(card: Card, placed: PrefabItem[], frames: FlatSlot[], models: Map<string, Model>): PrefabItem[] {
  const counted = [...pizzas(card.turns).map((p) => itemOf(p, models.get(p.model)!)).map(jitter(card.id)), ...trophies(frames, card.shown.length).map((p) => itemOf(p, models.get(p.model)!))]
  return [...placed, ...counted]
}

/** A placement as the playground places a model in the desk's frame: its base resting at its height. */
function itemOf(p: Placement, model: Model): PrefabItem {
  const scale = PROPS[p.model]
  return { model: p.model, at: [p.at[0], (p.y ?? DESK.height) - fit(model).min[1] * scale, p.at[1]], turn: p.turn, scale }
}
