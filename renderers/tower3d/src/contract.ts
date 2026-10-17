/**
 * What each model must hold for the renderer to use it: nodes it reaches by name (pivots it moves, anchors it hangs
 * things on, bones it poses) and materials it recolors, for the Blender models (models/*.py); and the parts and clips
 * of the KayKit characters workers are made of (kaykit/Characters). `npm test` checks every asset against it. Imports
 * nothing, so Node reads it as well as the bundle.
 */

export const MODEL_NAMES = ['bar', 'bookcase', 'bot', 'calico', 'console', 'couch', 'desk', 'dj', 'hands', 'kiosk', 'plane', 'tabby', 'tv', 'tuxedo', 'wear'] as const
export type ModelName = (typeof MODEL_NAMES)[number]

export const HATS = ['hat_beanie', 'hat_cap', 'hat_crown', 'hat_bow', 'hat_flower']
export const FACES = ['face_glasses', 'face_shades']

/**
 * KayKit's `Rig_Medium`, the skeleton every worker stands on, by the names three.js gives its bones (glTF's `hand.r`
 * is `handr`). Clips move them; the bot's parts ride them.
 */
export const BONES = [
  'root', 'hips', 'spine', 'chest', 'head',
  'upperarml', 'lowerarml', 'wristl', 'handl', 'handslotl', 'upperarmr', 'lowerarmr', 'wristr', 'handr', 'handslotr',
  'upperlegl', 'lowerlegl', 'footl', 'toesl', 'upperlegr', 'lowerlegr', 'footr', 'toesr',
] as const
export type Bone = (typeof BONES)[number]

/** The KayKit Adventurers whose bodies, heads and atlases a worker is dressed from. */
export const ADVENTURERS = ['Knight', 'Mage', 'Rogue', 'Barbarian'] as const
export type Adventurer = (typeof ADVENTURERS)[number]

/** The skinned parts every adventurer has, named `<Adventurer>_<part>`. */
export const BODY_PARTS = ['Body', 'ArmLeft', 'ArmRight', 'LegLeft', 'LegRight'] as const
/** Heads, each in its adventurer's atlas: the rogue's comes hooded too. */
export const HEADS = ['Knight_Head', 'Mage_Head', 'Rogue_Head', 'Rogue_Head_Hooded', 'Barbarian_Head'] as const
/** Rigid parts on the head bone, and capes on the chest bone. */
export const HELMS = ['Knight_Helmet', 'Mage_Hat', 'Barbarian_Hat'] as const
export const CAPES = ['Knight_Cape', 'Mage_Cape', 'Rogue_Cape', 'Barbarian_Cape'] as const
/** Gear held in the right hand (`handslotr`), out while a worker stands. */
export const GEAR = ['Mug', '1H_Wand', 'Spellbook', '1H_Sword', '1H_Axe', 'Knife'] as const

export const ADVENTURER_PARTS = [...ADVENTURERS.flatMap((a) => BODY_PARTS.map((p) => `${a}_${p}`)), ...HEADS, ...HELMS, ...CAPES, ...GEAR]

/** The skeletons characters stand on: KayKit's Rig_Medium, and Rig_Large, the big ones' (the same bones, longer). */
export const RIGS = ['medium', 'large'] as const
export type RigKind = (typeof RIGS)[number]

/**
 * The atlases parts are painted in, each its material `<name in lowercase>_texture`. A colourway (`COLOURWAYS`) repaints
 * every part made in the atlas it is a colourway of.
 */
/**
 * The Clanker's family: eight variants of the Clanker another model generated from his file (kaykit/Characters/README.md),
 * each a GLB of its own named after it (`kingbolt.glb` for `Clanker_KingBolt`): its atlas is a colourway of his, its
 * eyes glow in a colour of its own, and its props are parts of his (`CLANKER_PROPS`).
 */
export const CLANKER_FAMILY = ['Clanker_Sentinel', 'Clanker_Tinker', 'Clanker_Brute', 'Clanker_Clanksworth', 'Clanker_Scout', 'Clanker_Frostbyte', 'Clanker_Sludge', 'Clanker_KingBolt'] as const

export const ATLAS_NAMES = [...ADVENTURERS, 'Skeleton', 'Helpers', 'CombatMech', 'CombatMech_Alt', 'Clanker', 'Clanker_Alt', ...CLANKER_FAMILY] as const
export type Atlas = (typeof ATLAS_NAMES)[number]
export const COLOURWAYS: Partial<Record<Atlas, Atlas>> = { CombatMech_Alt: 'CombatMech', Clanker_Alt: 'Clanker', ...Object.fromEntries(CLANKER_FAMILY.map((a) => [a, 'Clanker'])) }
export const textureOf = (atlas: Atlas) => `${atlas.toLowerCase()}_texture`
/** The material an atlas's glowing parts are drawn with, `<name in lowercase>_glow`: a colourway glows in a colour of its own. */
export const glowOf = (atlas: Atlas) => `${atlas.toLowerCase()}_glow`

/**
 * KayKit characters beyond the Adventurers, packed from their packs' own files (scripts/tower3d-characters.ts): their
 * skinned body parts, their head and what is drawn with it (a skull's jaw and glowing eyes), their other parts by
 * slot, those packed as one mesh from several of the file's (`joined`), and what the body wears unless a look says
 * otherwise (`wears`, besides its head). Rig_Medium's parts mix with every Rig_Medium body, Rig_Large's with Rig_Large's.
 */
export const KAYKIT = {
  Skeleton_Minion: { pack: 'skeletons', rig: 'medium', atlas: 'Skeleton', head: ['Skeleton_Minion_Head', 'Skeleton_Minion_Jaw', 'Skeleton_Minion_Eyes'], slots: { Cape: ['Skeleton_Minion_Cloak'] } },
  Skeleton_Warrior: { pack: 'skeletons', rig: 'medium', atlas: 'Skeleton', head: ['Skeleton_Warrior_Head', 'Skeleton_Warrior_Jaw', 'Skeleton_Warrior_Eyes'], slots: { Helm: ['Skeleton_Warrior_Helmet'], Cape: ['Skeleton_Warrior_Cloak'] } },
  Skeleton_Rogue: { pack: 'skeletons', rig: 'medium', atlas: 'Skeleton', head: ['Skeleton_Rogue_Head', 'Skeleton_Rogue_Jaw', 'Skeleton_Rogue_Eyes'], slots: { Helm: ['Skeleton_Rogue_Hood'], Cape: ['Skeleton_Rogue_Cape'] } },
  Skeleton_Mage: { pack: 'skeletons', rig: 'medium', atlas: 'Skeleton', head: ['Skeleton_Mage_Skull', 'Skeleton_Mage_Jaw', 'Skeleton_Mage_Eyes'], slots: { Helm: ['Skeleton_Mage_Hat'] } },
  Helper_A: { pack: 'series5', rig: 'medium', atlas: 'Helpers', head: ['Helper_A_Head'], slots: { Hat: ['Helper_A_Hat'] } },
  Helper_B: { pack: 'series5', rig: 'medium', atlas: 'Helpers', head: ['Helper_B_Head'], slots: { Hat: ['Helper_B_Hat'] } },
  CombatMech: { pack: 'series5', rig: 'medium', atlas: 'CombatMech', body: ['ShoulderLeft', 'ShoulderRight', 'WingLeft', 'WingRight'], head: ['CombatMech_Head'], slots: {} },
  Clanker: {
    pack: 'series5', rig: 'large', atlas: 'Clanker', head: ['Clanker_Head', 'Clanker_Head_Glow'],
    slots: { Cape: ['Clanker_Exhausts', 'Clanker_ExhaustLeft'] },
    joined: { Clanker_Exhausts: ['Clanker_ExhaustLeft', 'Clanker_ExhaustRight'] },
    wears: { Cape: 'Clanker_Exhausts' },
  },
} as const satisfies Record<string, { pack: string; rig: RigKind; atlas: Atlas; body?: readonly string[]; head: readonly string[]; slots: Partial<Record<Slot, readonly string[]>>; joined?: Record<string, readonly string[]>; wears?: Partial<Record<Slot, string>> }>

/**
 * The Clanker family's props as parts of the Clanker, by name: the node of a variant's file each is packed from
 * (`<variant>_<prop>`, in `<variant>.glb`), rigid on the bone it hangs on there, the slot it joins, and whether it glows
 * (its glowing primitive packed apart as `<part>_Glow`, drawn with it).
 */
export const CLANKER_PROPS = {
  Clanker_Antenna: { node: 'sentinel_antenna', slot: 'Hat', glows: true },
  Clanker_TallAntenna: { node: 'scout_tallAntenna', slot: 'Hat', glows: true },
  Clanker_TopHat: { node: 'clanksworth_topHat', slot: 'Hat', glows: false },
  Clanker_Crown: { node: 'kingbolt_crown', slot: 'Hat', glows: true },
  Clanker_Wrench: { node: 'tinker_wrench', slot: 'Gear', glows: false },
  Clanker_Sledgehammer: { node: 'brute_hammer', slot: 'Gear', glows: false },
  Clanker_Drill: { node: 'frostbyte_drill', slot: 'Prop', glows: false },
  Clanker_ArmCannon: { node: 'kingbolt_cannon', slot: 'Prop', glows: false },
  Clanker_Beacon: { node: 'scout_beacon', slot: 'Prop', glows: true },
  Clanker_Canister: { node: 'sludge_canister', slot: 'Prop', glows: true },
} as const satisfies Record<string, { node: string; slot: Slot; glows: boolean }>
const propsIn = (slot: Slot) => (Object.keys(CLANKER_PROPS) as (keyof typeof CLANKER_PROPS)[]).filter((p) => CLANKER_PROPS[p].slot === slot)

export const CHARACTERS = [...ADVENTURERS, ...(Object.keys(KAYKIT) as (keyof typeof KAYKIT)[])] as const
export type Character = (typeof CHARACTERS)[number]

/**
 * What a character's body is: its rig, its skinned body parts, what it wears unless a look says otherwise (its own head,
 * and the Clanker his exhausts), and the atlases its body may be painted in.
 */
export type Body = { rig: RigKind; atlas: Atlas; parts: string[]; wears: Partial<Record<Slot, string>> & { Head: string }; paints: Atlas[] }

const isAdventurer = (c: Character): c is Adventurer => (ADVENTURERS as readonly string[]).includes(c)

export function bodyOf(c: Character): Body {
  if (isAdventurer(c)) return { rig: 'medium', atlas: c, parts: BODY_PARTS.map((p) => `${c}_${p}`), wears: { Head: `${c}_Head` }, paints: [...ADVENTURERS] }
  const k: { rig: RigKind; atlas: Atlas; body?: readonly string[]; head: readonly string[]; wears?: Partial<Record<Slot, string>> } = KAYKIT[c]
  return {
    rig: k.rig,
    atlas: k.atlas,
    parts: [...BODY_PARTS, ...(k.body ?? [])].map((p) => `${c}_${p}`),
    wears: { Head: k.head[0], ...k.wears },
    paints: [k.atlas, ...ATLAS_NAMES.filter((a) => COLOURWAYS[a] === k.atlas)],
  }
}

/** Meshes drawn with a part wherever it is worn: a skull's jaw and eyes, a head's or a prop's glowing parts. */
export const DRAWN_WITH: Record<string, readonly string[]> = {
  ...Object.fromEntries(Object.values(KAYKIT).map((k) => [k.head[0], k.head.slice(1)])),
  ...Object.fromEntries(Object.entries(CLANKER_PROPS).flatMap(([p, { glows }]) => (glows ? [[p, [`${p}_Glow`]]] : []))),
}

/** Every mesh the characters beyond the Adventurers are packed with: their bodies, heads and slot parts, and the Clanker family's props. */
export const KAYKIT_PARTS = [
  ...(Object.keys(KAYKIT) as (keyof typeof KAYKIT)[]).flatMap((c) => [...bodyOf(c).parts, ...KAYKIT[c].head, ...Object.values(KAYKIT[c].slots as Partial<Record<Slot, readonly string[]>>).flat()]),
  ...Object.entries(CLANKER_PROPS).flatMap(([p, { glows }]) => [p, ...(glows ? [`${p}_Glow`] : [])]),
]

/**
 * What a look fills, part by part. A part made in parts/parts.blend is named after its slot (`Face_RoundGlasses`), and
 * joins the pack's parts of that slot: a whole head; on the head bone, a helm covering it, a hat on top of it or a face
 * piece; a cape on the chest; gear held in the right hand; a prop worn on any bone; an outfit skinned over the body.
 * The pieces of models/wear.py join `Hat` and `Face` (`HATS`, `FACES`).
 */
export const SLOTS = ['Head', 'Helm', 'Hat', 'Face', 'Cape', 'Gear', 'Prop', 'Outfit'] as const
export type Slot = (typeof SLOTS)[number]
export const slotOf = (part: string) => SLOTS.find((s) => part.startsWith(`${s}_`))
const kaykitIn = (slot: Slot) => [...Object.values(KAYKIT).flatMap((k) => [...((k.slots as Partial<Record<Slot, readonly string[]>>)[slot] ?? []), ...(slot === 'Head' ? [k.head[0]] : [])]), ...propsIn(slot)]
const ADVENTURER_SLOTS: Partial<Record<Slot, readonly string[]>> = { Head: HEADS, Helm: HELMS, Cape: CAPES, Gear: GEAR }
/** The packs' parts in each slot. */
export const PACK_SLOTS = Object.fromEntries(SLOTS.map((s) => [s, [...(ADVENTURER_SLOTS[s] ?? []), ...kaykitIn(s)]])) as Record<Slot, string[]>
/** The materials parts are painted with: an adventurer's atlas each, by name. */
export const ATLASES = ADVENTURERS.map((a) => `${a.toLowerCase()}_texture`)

/** KayKit's own clips on `Rig_Medium` (Character Animations 1.1) that poses play. */
export const CLIPS = [
  'Idle_A', 'Idle_B', 'Walking_A', 'Sit_Chair_Idle', 'Cheering', 'Waving', 'Jump_Idle', 'Interact', 'Use_Item', 'Working_A', 'Holding_A',
  'Sit_Chair_Down', 'Sit_Chair_StandUp', 'Ranged_Magic_Summon', 'Ranged_Magic_Spellcasting_Long', 'Hit_B', 'Lockpicking', 'Throw', 'Lie_Idle',
] as const
export type ClipName = (typeof CLIPS)[number]

/**
 * The bot (models/bot.py), modelled standing in the rig's rest pose (a T-pose, 2.2 units tall, facing +z): a pivot
 * per bone it rides, named as the bone, with `hat` and `face` under `head` for what it wears, and its status light. Parts
 * in its hue (`hue_own`) are optional.
 */
const BOT = { nodes: ['hips', 'chest', 'head', 'upperarml', 'lowerarml', 'upperarmr', 'lowerarmr', 'upperlegl', 'lowerlegl', 'footl', 'upperlegr', 'lowerlegr', 'footr', 'hat', 'face'], materials: ['bulb_glow_own'] }

/** A cat (models/catkit.py): pivots `head`, `tail` and its front paws, `paw_L` and `paw_R`, that its poses move. */
const CAT = { nodes: ['head', 'tail', 'paw_L', 'paw_R'], materials: [] }

export type Contract = { nodes: string[]; materials: string[] }

export const CONTRACT: Record<ModelName, Contract> = {
  bot: BOT,
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
