/**
 * What each Blender model (models/*.py) must hold for the renderer to use it: nodes it reaches by name (pivots it
 * moves, anchors it hangs things on) and materials it recolors. `npm test` checks every asset against it. Imports
 * nothing, so Node reads it as well as the bundle.
 */

export const MODEL_NAMES = ['bar', 'bean', 'bookcase', 'bot', 'calico', 'console', 'couch', 'desk', 'dj', 'hands', 'kiosk', 'plane', 'puff', 'tabby', 'tv', 'tuxedo', 'wear'] as const
export type ModelName = (typeof MODEL_NAMES)[number]

export const HATS = ['hat_beanie', 'hat_cap', 'hat_crown', 'hat_bow', 'hat_flower']
export const FACES = ['face_glasses', 'face_shades']

/**
 * A worker: pivots `body`, `arm_L` and `arm_R` that poses move, anchors `hat` (the top of its head) and `face`
 * (between its eyes) for what it wears, `hand_R` (in its right hand, under `arm_R`) for what it holds, and its status
 * light. Parts in the worker's hue (`hue_own`) are optional.
 */
const WORKER = { nodes: ['body', 'arm_L', 'arm_R', 'hat', 'face', 'hand_R'], materials: ['bulb_glow_own'] }

/** A cat (models/catkit.py): pivots `head`, `tail` and its front paws, `paw_L` and `paw_R`, that its poses move. */
const CAT = { nodes: ['head', 'tail', 'paw_L', 'paw_R'], materials: [] }

export type Contract = { nodes: string[]; materials: string[] }

export const CONTRACT: Record<ModelName, Contract> = {
  bean: WORKER,
  puff: WORKER,
  bot: WORKER,
  wear: { nodes: [...HATS, ...FACES], materials: ['wear_own'] },
  tabby: CAT,
  calico: CAT,
  tuxedo: CAT,
  bar: { nodes: [], materials: ['strip_glow_own'] },
  dj: { nodes: [], materials: ['neon_glow_own'] },
  console: { nodes: [], materials: ['tint_glow_own'] },
  bookcase: { nodes: [], materials: [] },
  couch: { nodes: [], materials: [] },
  desk: { nodes: ['chair'], materials: [] },
  /** Your own hands in first person: a pivot per hand at its palm, in camera space. */
  hands: { nodes: ['hand_L', 'hand_R'], materials: [] },
  kiosk: { nodes: [], materials: [] },
  /** The plane over the airfield: `prop` spins about z, `strobe` holds the lights that blink. */
  plane: { nodes: ['prop', 'strobe'], materials: [] },
  tv: { nodes: [], materials: [] },
}

/** What a model lacks of its contract, given the names it holds; empty when it keeps it. */
export const missing = (c: Contract, held: { nodes: string[]; materials: string[] }) => [
  ...c.nodes.filter((n) => !held.nodes.includes(n)).map((n) => `node ${n}`),
  ...c.materials.filter((m) => !held.materials.includes(m)).map((m) => `material ${m}`),
]
