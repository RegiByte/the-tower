import { z } from 'zod'
import { ATLAS_NAMES, BONES, CHARACTERS, SLOTS, bodyOf, type Atlas, type Bone, type Character, type RigKind, type Slot } from './contract.ts'
import { nameIn } from '../../../src/shared/callsign.ts'
import { rendezvous, roll, weighted } from './hashed.ts'

/**
 * The wardrobe: how workers are dressed, as one document (renderers/tower3d/wardrobe.json) over the catalogue of parts.
 * `fits` move, turn and scale a worn part over where it was made to sit, by default and per part worn with it;
 * `outfits` are named looks; `mix` is how a worker's session id is dressed: a bot or a character, maybe an outfit,
 * and for everything an outfit leaves open, a roll per slot and the part of the slot's pool it scores highest for
 * (`rendezvous`), so a part, outfit, body or colour added re-dresses only the wearers it wins. Imports no three: Node reads it, and
 * Tower 3D and the dresser call the same functions.
 */

const vec3 = z.tuple([z.number(), z.number(), z.number()])
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a #rrggbb colour')
const character = z.enum(CHARACTERS)
const atlas = z.enum(ATLAS_NAMES)
const build = z.object({ width: z.number(), height: z.number() })
const shape = z.partialRecord(z.enum(BONES), z.union([z.number(), vec3])).describe('times each bone scale over what its pose sets, along its own axes (y runs along the bone)')

export const Fit = z.object({
  at: vec3.optional().describe('added to the part made position, rig units in its bone space'),
  turn: vec3.optional().describe('degrees about the bone axes (XYZ), about the part own origin'),
  scale: z.union([z.number(), vec3]).optional().describe('times the part made scale, along its own axes'),
})

export const Rule = z.object({
  chance: z.number().min(0).max(1).describe('of wearing something in the slot'),
  group: z.string().optional().describe('slots of one group share a roll, stacked in SLOTS order: at most one of them is worn'),
  seed: z.string().optional().describe('what the roll (without a group) and the choice hash under; the slot in lowercase by default. Changing it re-dresses the slot'),
  pool: z.array(z.string()).optional().describe('only these parts; every part of the slot by default'),
  except: z.array(z.string()).optional().describe('never these parts'),
  unless: z.array(z.string()).optional().describe('the slot stays bare on a look that, as rolled, wears any of these'),
})

export const Outfit = z.object({
  body: character.optional(),
  paint: atlas.optional().describe('the atlas its body is painted in: one of the body paints'),
  skin: colour.optional(),
  hair: colour.optional(),
  wear: colour.optional().describe('the colour of what it wears painted `wear_own`'),
  build: build.optional(),
  shape: shape.optional(),
  slots: z.partialRecord(z.enum(SLOTS), z.string().nullable()).optional().describe('a part, or null for bare; a slot left out is hashed from the mix'),
})

const slotRules = z.partialRecord(z.enum(SLOTS), Rule)

export const Mix = z.object({
  bot: z.object({ share: z.number().min(0).max(1), slots: slotRules }),
  named: z.record(z.string(), z.string()).describe('the outfit a worker wears whose callsign has this name (CLANKER for CLANKER-07), whatever its session id rolls'),
  outfits: z.object({
    share: z.number().min(0).max(1),
    except: z.array(z.string()).optional().describe('outfits only worn by name or by body'),
    bodies: z.partialRecord(character, z.array(z.string()).min(1)).optional().describe('the outfits a worker the mix gives this body wears, one by rendezvous'),
  }),
  bodies: z
    .partialRecord(character, z.number().positive())
    .refine((b) => Object.keys(b).length > 0, 'at least one body')
    .describe('the characters the mix dresses from, each with its weight: their bodies, and the parts of their packs the slots draw'),
  repaint: z.number().min(0).max(1).describe('the chance a body is painted in another of its paints'),
  skins: z.array(colour).min(1),
  hairs: z.array(colour).min(1),
  wears: z.array(colour).min(1),
  build: z.object({ width: z.tuple([z.number(), z.number()]), height: z.tuple([z.number(), z.number()]) }).describe('the range of each, a roll over it'),
  slots: slotRules.describe('Head: the chance of a head other than the body own'),
})

export const Wardrobe = z.object({
  fits: z.record(z.string(), z.record(z.string(), Fit)).describe('fits[part]["*"], or fits[part][a part worn with it, or "bot"]'),
  outfits: z.record(z.string(), Outfit),
  mix: Mix,
})

export type Vec3 = z.infer<typeof vec3>
export type Fit = z.infer<typeof Fit>
export type Rule = z.infer<typeof Rule>
export type Outfit = z.infer<typeof Outfit>
export type Mix = z.infer<typeof Mix>
export type Wardrobe = z.infer<typeof Wardrobe>
export type Build = z.infer<typeof build>
export type Shape = z.infer<typeof shape>

/** Where a rigid part sits in its bone's space, as three composes it: position, then rotation, then scale. */
export type Placement = { at: Vec3; quaternion: [number, number, number, number]; scale: Vec3 }

/**
 * A part as the files hold it (catalogue.ts derives it at load). Skinned parts ride the rig's skin; rigid ones hang on
 * a bone at their made placement, or, the pieces of models/wear.py, at an anchor of the wearer's head (`anchors`).
 */
export type CataloguePart = {
  name: string
  slot: Slot | 'Body'
  from: 'adventurers' | 'kaykit' | 'parts' | 'wear'
  /** The character whose pack it comes with: the mix draws it while that character is one of its bodies. */
  character?: Character
  /** The skeleton it is made on; a piece hung at an anchor fits on any. */
  rig?: RigKind
  /** Painted in an atlas, or in its own materials (`wear_own` in the worker's wear colour). */
  atlas?: Atlas
  /** Meshes drawn with it: a skull's jaw and glowing eyes. */
  with?: readonly string[]
  attach: { skinned: true } | { bone: Bone; made: Placement } | { bone: 'head'; anchor: Anchor }
}
export type Anchor = 'hat' | 'face'
export type Catalogue = {
  parts: Record<string, CataloguePart>
  /** Each slot's parts, in the order the files hold them. */
  slots: Record<Slot, string[]>
  /** Where the wearers on each skeleton, and the bot, have their hat and face anchors, on the head bone. */
  anchors: Record<RigKind | 'bot', Record<Anchor, Placement>>
}

/**
 * A look: what a worker wears. `parts` are the slot parts worn, in `SLOTS` order; a character's body parts follow from
 * `body` and `paint`, and its `shape` scales its bones.
 */
export type Look =
  | { species: 'character'; outfit?: string; body: Character; paint: Atlas; parts: string[]; skin: string; hair: string; wear: string; build: Build; shape?: Shape }
  | { species: 'bot'; hue: string; parts: string[]; wear: string; build: Build }

export const bodyParts = (body: Character) => bodyOf(body).parts

/** The skeleton a look stands on: its body's, the bot's Rig_Medium. */
export const rigOfLook = (look: Look): RigKind => (look.species === 'bot' ? 'medium' : bodyOf(look.body).rig)

/** Whether a part fits a body on `rig`: made on that skeleton, or hung at an anchor. */
export const fitsRig = (c: Catalogue, part: string, rig: RigKind) => (c.parts[part].rig ?? rig) === rig

/** A worker's own hue in degrees, hashed from its session id: who it is. */
export const hueOf = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 360
}
/** A colour as #rrggbb from its hue (degrees), saturation and lightness taken in linear light, as three's `setHSL` takes them. */
const hex = (h: number, s: number, l: number) => {
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    const srgb = c < 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const seedOf = (slot: Slot, rule: Rule) => rule.seed ?? slot.toLowerCase()

/** What a body may wear from the mix: parts made on its skeleton, and heads painted in one of its paints. */
type Wearer = { rig: RigKind; paints: readonly Atlas[] }

/**
 * The parts of a slot the mix may draw for `wearer`: its rule's pool, or every part of the slot whose character, if
 * any, is one of the mix's bodies; of those, what the wearer may wear (`Wearer`).
 */
const poolOf = (c: Catalogue, slot: Slot, rule: Rule, wearer: Wearer, bodies: readonly string[]) =>
  (rule.pool ?? c.slots[slot].filter((p) => c.parts[p].character === undefined || bodies.includes(c.parts[p].character!)))
    .filter((p) => fitsRig(c, p, wearer.rig) && (slot !== 'Head' || wearer.paints.includes(c.parts[p].atlas!)) && !rule.except?.includes(p))

/**
 * The slot parts `id` wears by `rules`: each slot's roll (its group's, shared and stacked in `SLOTS` order) against its
 * chance, then its pool's part (`poolOf`); then any slot whose `unless` names a part worn is left bare. `fixed` slots
 * (an outfit's) take its part or stay bare, untouched by the rules; `wearing` is worn besides (the body).
 */
function rolled(id: string, rules: Partial<Record<Slot, Rule>>, c: Catalogue, fixed: Partial<Record<Slot, string | null>>, wearing: string[], wearer: Wearer, bodies: readonly string[]) {
  const stacked = new Map<string, number>()
  const worn = new Map<Slot, string>()
  const hashed = new Set<Slot>()
  for (const slot of SLOTS) {
    if (slot in fixed) {
      if (fixed[slot]) worn.set(slot, fixed[slot])
      continue
    }
    const rule = rules[slot]
    if (!rule) continue
    const seed = seedOf(slot, rule)
    const from = rule.group === undefined ? 0 : (stacked.get(rule.group) ?? 0)
    if (rule.group !== undefined) stacked.set(rule.group, from + rule.chance)
    const pool = poolOf(c, slot, rule, wearer, bodies)
    if (!pool.length) continue
    const r = roll(id, rule.group ?? seed)
    if (r < from || r >= from + rule.chance) continue
    worn.set(slot, rendezvous(id, seed, pool))
    hashed.add(slot)
  }
  const all = new Set([...wearing, ...worn.values()])
  for (const slot of hashed) if (rules[slot]!.unless?.some((p) => all.has(p))) worn.delete(slot)
  return worn
}

const within = ([lo, hi]: [number, number], r: number) => lo + r * (hi - lo)

/** A look for `id` in `outfit`, or from the mix alone: whatever the outfit leaves open is hashed. */
function dressed(id: string, outfit: Outfit, name: string | undefined, w: Wardrobe, c: Catalogue): Look {
  const { mix } = w
  const r = (what: string) => roll(id, what)
  const body = outfit.body ?? weighted(id, 'body', mix.bodies as Record<Character, number>)
  const own = bodyOf(body)
  const paint = outfit.paint ?? (r('repaint') < mix.repaint ? rendezvous(id, 'paint', own.paints) : own.atlas)
  const slots = rolled(id, mix.slots, c, outfit.slots ?? {}, own.parts, own, Object.keys(mix.bodies))
  for (const [slot, part] of Object.entries(own.wears) as [Slot, string][]) if (!slots.has(slot) && !(outfit.slots && slot in outfit.slots)) slots.set(slot, part)
  return {
    species: 'character',
    ...(name !== undefined && { outfit: name }),
    body,
    paint,
    parts: SLOTS.flatMap((s) => (slots.has(s) ? [slots.get(s)!] : [])),
    skin: outfit.skin ?? rendezvous(id, 'skin', mix.skins),
    hair: outfit.hair ?? rendezvous(id, 'hair', mix.hairs),
    wear: outfit.wear ?? rendezvous(id, 'wear', mix.wears),
    build: outfit.build ?? { width: within(mix.build.width, r('width')), height: within(mix.build.height, r('height')) },
    ...(outfit.shape && { shape: outfit.shape }),
  }
}

/**
 * A worker's look, hashed from its session id: the same on every board and every reload. A bot by the mix's share,
 * wearing what its slots roll; else a character, in an outfit by the outfits' share (the one of those not kept
 * `except` that scores highest for it), or else in the one of its body's outfits (`outfits.bodies`) that scores
 * highest for it, with everything the outfit leaves open hashed from the mix.
 */
export function lookOf(id: string, w: Wardrobe, c: Catalogue): Look {
  const { mix } = w
  if (roll(id, 'species') < mix.bot.share) {
    const parts = rolled(id, mix.bot.slots, c, {}, [], { rig: 'medium', paints: [] }, Object.keys(mix.bodies))
    return {
      species: 'bot',
      hue: hex(hueOf(id), 0.55, 0.62),
      parts: SLOTS.flatMap((s) => (parts.has(s) ? [parts.get(s)!] : [])),
      wear: rendezvous(id, 'wear', mix.wears),
      build: { width: within(mix.build.width, roll(id, 'width')), height: within(mix.build.height, roll(id, 'height')) },
    }
  }
  const names = Object.keys(w.outfits).filter((n) => !mix.outfits.except?.includes(n))
  const shared = names.length && roll(id, 'outfit') < mix.outfits.share ? rendezvous(id, 'outfit', names) : undefined
  const ofBody = mix.outfits.bodies?.[weighted(id, 'body', mix.bodies as Record<Character, number>)]
  const name = shared ?? (ofBody && rendezvous(id, 'outfit', ofBody))
  return dressed(id, name === undefined ? {} : w.outfits[name], name, w, c)
}

/** A worker's look: the outfit the mix's `named` gives its callsign's name, what that leaves open hashed from its id; else `lookOf`. */
export function lookOfWorker(id: string, callsign: string, w: Wardrobe, c: Catalogue): Look {
  const outfit = w.mix.named[nameIn(callsign)]
  return outfit === undefined ? lookOf(id, w, c) : dressed(id, w.outfits[outfit], outfit, w, c)
}

/** A named outfit's look: what it leaves open hashed from its name. */
export const lookNamed = (name: string, w: Wardrobe, c: Catalogue): Look => dressed(name, w.outfits[name], name, w, c)

/** Every part a look wears, its body parts included, and `bot` on a bot: what a fit's override may be keyed by. */
export const wornBy = (look: Look) => (look.species === 'bot' ? ['bot', ...look.parts] : [...bodyParts(look.body), ...look.parts])

/**
 * Whose override of a part's fit wins, by the slot of the part it is keyed by: a look wears one part per slot, so at
 * most one override per slot matches. The first in this list wins each field it sets, then the next, then `*`.
 */
export const FIT_PRECEDENCE = ['bot', 'Head', 'Outfit', 'Body', 'Helm', 'Hat', 'Face', 'Cape', 'Prop', 'Gear'] as const

const precedenceOf = (key: string, c: Catalogue) => FIT_PRECEDENCE.indexOf(key === 'bot' ? 'bot' : c.parts[key].slot)

type Field = keyof Fit

/**
 * The fit of `part` on a look wearing `worn` (`wornBy`): its `*`, under the overrides keyed by what it is worn with,
 * and where each field comes from (`*`, or the part, or `bot`, whose override set it).
 */
export function fitFrom(w: Wardrobe, c: Catalogue, part: string, worn: readonly string[]): { fit: Fit; from: Partial<Record<Field, string>> } {
  const fits = w.fits[part] ?? {}
  const keys = Object.keys(fits)
    .filter((k) => k === '*' || (k !== part && worn.includes(k)))
    .sort((a, b) => (a === '*' ? -1 : b === '*' ? 1 : precedenceOf(b, c) - precedenceOf(a, c)))
  const fit: Fit = {}
  const from: Partial<Record<Field, string>> = {}
  for (const k of keys) for (const f of Object.keys(fits[k]) as Field[]) if (fits[k][f] !== undefined) Object.assign(fit, { [f]: fits[k][f] }), (from[f] = k)
  return { fit, from }
}

export const fitOf = (w: Wardrobe, c: Catalogue, part: string, worn: readonly string[]) => fitFrom(w, c, part, worn).fit

/** The outfits Tower 3D dresses by name, the roof's bartender and DJ: locked in the dresser, and kept out of the mix. */
export const STAFF = ['bartender', 'dj'] as const
export type Staff = (typeof STAFF)[number]

/**
 * The wardrobe's problems against the catalogue, each at its path: an outfit Tower 3D dresses by name missing or in the
 * mix, names it holds that no part has, and fits it cannot apply.
 */
export function problems(w: Wardrobe, c: Catalogue): string[] {
  const out: string[] = []
  for (const n of STAFF) {
    if (!(n in w.outfits)) out.push(`outfits/${n}: Tower 3D dresses the ${n} by name`)
    else if (!w.mix.outfits.except?.includes(n)) out.push(`mix/outfits/except: the ${n} is worn only by name`)
  }
  const known = (name: string, at: string) => name in c.parts || out.push(`${at}: no part ${name}`)
  for (const [part, fits] of Object.entries(w.fits)) {
    if (!known(part, `fits/${part}`)) continue
    if ('skinned' in c.parts[part].attach) out.push(`fits/${part}: ${part} is skinned; fits move rigid parts`)
    for (const key of Object.keys(fits)) if (key !== '*' && key !== 'bot') known(key, `fits/${part}/${key}`)
  }
  for (const [name, o] of Object.entries(w.outfits)) {
    if (o.body && o.paint && !bodyOf(o.body).paints.includes(o.paint)) out.push(`outfits/${name}/paint: ${o.body} is not painted in ${o.paint}`)
    for (const [slot, part] of Object.entries(o.slots ?? {})) {
      if (!part || !known(part, `outfits/${name}/slots/${slot}`)) continue
      if (c.parts[part].slot !== slot) out.push(`outfits/${name}/slots/${slot}: ${part} is a ${c.parts[part].slot} part`)
      else if (o.body && !fitsRig(c, part, bodyOf(o.body).rig)) out.push(`outfits/${name}/slots/${slot}: ${part} is made on another skeleton than ${o.body}`)
    }
  }
  for (const n of w.mix.outfits.except ?? []) if (!(n in w.outfits)) out.push(`mix/outfits/except: no outfit ${n}`)
  for (const [body, names] of Object.entries(w.mix.outfits.bodies ?? {})) {
    for (const n of names) {
      if (!(n in w.outfits)) out.push(`mix/outfits/bodies/${body}: no outfit ${n}`)
      else if ((w.outfits[n].body ?? body) !== body) out.push(`mix/outfits/bodies/${body}: ${n} dresses a ${w.outfits[n].body}`)
    }
  }
  for (const [name, n] of Object.entries(w.mix.named)) if (!(n in w.outfits)) out.push(`mix/named/${name}: no outfit ${n}`)
  for (const [where, rules] of [['mix/bot/slots', w.mix.bot.slots], ['mix/slots', w.mix.slots]] as const) {
    for (const [slot, rule] of Object.entries(rules)) {
      for (const field of ['pool', 'except', 'unless'] as const) for (const p of rule[field] ?? []) known(p, `${where}/${slot}/${field}`)
    }
  }
  return out
}

/** A wardrobe's errors as one message per problem, each with its path in the document. */
export function parseWardrobe(json: unknown, name: string): Wardrobe {
  const r = Wardrobe.safeParse(json)
  if (r.success) return r.data
  throw new Error(`${name} is not a wardrobe:\n${r.error.issues.map((i) => `  ${i.path.join('/') || '(root)'}: ${i.message}`).join('\n')}`)
}

const ordered = <T extends object>(o: T, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((k) => k in o && (o as Record<string, unknown>)[k] !== undefined).map((k) => [k, (o as Record<string, unknown>)[k]]))
const sortedKeys = (o: object, first: string[] = []) => [...first.filter((k) => k in o), ...Object.keys(o).filter((k) => !first.includes(k)).sort()]
const RULE_KEYS = Object.keys(Rule.shape)
const rulesOrdered = (rules: Partial<Record<Slot, Rule>>) => Object.fromEntries(SLOTS.filter((s) => rules[s]).map((s) => [s, ordered(rules[s]!, RULE_KEYS)]))

/**
 * The wardrobe as its file holds it: keys in a fixed order (fits and outfits by name, `*` first; everything else as the
 * schema lists it), two spaces, a list of numbers or names on one line. Saving through it keeps diffs to what changed.
 */
export function formatWardrobe(w: Wardrobe): string {
  const doc = {
    fits: Object.fromEntries(sortedKeys(w.fits).map((p) => [p, Object.fromEntries(sortedKeys(w.fits[p], ['*']).map((k) => [k, ordered(w.fits[p][k], Object.keys(Fit.shape))]))])),
    outfits: Object.fromEntries(
      sortedKeys(w.outfits).map((n) => {
        const o = w.outfits[n]
        return [n, { ...ordered(o, Object.keys(Outfit.shape)), ...(o.slots && { slots: ordered(o.slots, SLOTS) }) }]
      }),
    ),
    mix: { ...ordered(w.mix, Object.keys(Mix.shape)), bot: { share: w.mix.bot.share, slots: rulesOrdered(w.mix.bot.slots) }, slots: rulesOrdered(w.mix.slots) },
  }
  doc.mix = ordered(doc.mix, Object.keys(Mix.shape)) as typeof doc.mix
  return `${JSON.stringify(doc, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner: string) => `[${inner.split(/,\s+/).join(', ')}]`)}\n`
}
