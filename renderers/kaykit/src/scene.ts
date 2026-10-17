import { z } from 'zod'
import { PACKS, turnXZ, type Vec3 } from './catalog.ts'

/**
 * A scene: plain JSON, in Tower meters, +Y up, everything facing +Z at turn 0. The gallery, a single model shot and a
 * floor plan are all scenes, drawn by the same code. An item places a catalog model, or another scene: a scene is a
 * prefab, so a workstation composed once is placed by every floor that has one.
 */

const vec3 = z.tuple([z.number(), z.number(), z.number()])
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a #rrggbb colour')
/** Degrees about +Y, counter-clockwise seen from above. */
const turn = z.number().optional()
/** A name a state removes or changes it by, unique in its document among ids and slot names. */
const id = z.string().optional().describe('a name states remove or change it by, unique in its document')

const Swap = z.object({ from: color, to: color, tol: z.number().optional().describe('hue tolerance, degrees (14)') })

export const Theme = z.object({
  atlas: z.partialRecord(z.enum(PACKS), z.string()).optional().describe('per pack: base, alt_A, alt_B, alt_C or alt (catalog packs[].atlases)'),
  swaps: z.partialRecord(z.enum(PACKS), z.array(Swap)).optional().describe('per pack: atlas hues near `from` take the hue of `to`, keeping their own shading'),
})

export const ModelItem = z.object({
  id,
  model: z.string().describe('catalog id, e.g. furniture/desk'),
  at: vec3.describe('where the model origin goes, meters; the catalog says where the origin sits on the model'),
  turn,
  scale: z.union([z.number(), vec3]).optional().describe('on top of the catalog norms: 1 is Tower scale'),
  parts: z.record(z.string(), vec3).optional().describe('named parts posed by Euler angles in degrees, about their own pivot'),
  theme: Theme.optional().describe('laid over the theme the model is drawn in, for this model alone: a filing cabinet in grey'),
})

export const SceneItem = z.object({
  id: id.describe('also what its slots are named under: <id>/<slot>'),
  scene: z.string().describe('path to another scene file, relative to this one'),
  states: z.array(z.string()).optional().describe('the states of that scene drawn here, applied in its own order'),
  at: vec3,
  turn,
  scale: z.number().optional(),
})

export const Item = z.union([ModelItem, SceneItem])

export const Box = z.object({
  id,
  size: vec3,
  at: vec3.describe('the centre of its base'),
  turn,
  color,
  glow: z.boolean().optional().describe('lit by nothing: a screen, a status strip'),
  opacity: z.number().min(0).max(1).optional(),
})

export const Label = z.object({
  id,
  text: z.string().describe('lines split on \\n'),
  at: vec3.describe('the centre of its bottom edge'),
  turn,
  height: z.number().optional().describe('one line of text, meters (0.12)'),
  tilt: z.number().optional().describe('degrees leaned back: 0 upright, 90 flat on the floor'),
  color: color.optional(),
  bg: color.optional(),
})

export const Lamp = z.object({ id, at: vec3, color: color.optional(), intensity: z.number().optional(), distance: z.number().optional() })

export const POSES = ['sit', 'stand'] as const

export const Slot = z
  .object({
    name: z.string().describe('what the code that fills it asks for: twin, logbook; a trailing _<n> numbers a series, seat_1, seat_2'),
    at: vec3.describe('where a person stands or their chair stands, or where a thing rests: its base'),
    turn: turn.describe('the way it faces, degrees about +Y from +Z'),
    pose: z.enum(POSES).optional().describe('a place for a person, sitting or standing; without it, a place for a thing the renderer draws'),
    size: z.number().optional().describe('the figure\'s scale there (1)'),
    with: z.array(ModelItem).optional().describe('models in the slot\'s own frame, drawn only while it is filled: a chair'),
  })
  .describe('a named place, set by hand, that code fills from the board')

export const BoxGuide = z
  .object({ name: z.string(), size: vec3, at: vec3.describe('the centre of its base'), turn })
  .describe('a box standing for what the host draws itself, to place against: drawn as a ghost by the playground and the editor')

export const ModelGuide = z
  .object({ name: z.string(), model: z.string().describe('the host\'s own model by its name there: desk, one of Tower 3D\'s'), at: vec3.describe('where its origin goes'), turn })
  .describe('the model the host draws itself, drawn whole by a renderer that has it (the editor), by no other')

export const Guide = z.union([BoxGuide, ModelGuide]).describe('what the host draws itself, to place against: never placed into a parent')

const Additions = z.object({ items: z.array(Item).optional(), boxes: z.array(Box).optional(), labels: z.array(Label).optional(), lamps: z.array(Lamp).optional(), slots: z.array(Slot).optional() })

export const State = z
  .object({
    remove: z.array(z.string()).optional().describe('ids and slot names of the shared scene this state leaves out'),
    set: z.record(z.string(), z.record(z.string(), z.unknown())).optional().describe('by id or slot name, fields laid over it in this state'),
    add: Additions.optional().describe('what this state draws besides'),
  })
  .describe('what a state changes of the shared scene: removed first, then set, then added')

export const VIEWS = ['front', 'high', 'back', 'left', 'right', 'iso', 'top'] as const

export const Camera = z.union([
  z.object({ pos: vec3, look: vec3, fov: z.number().optional() }),
  z
    .object({ view: z.enum(VIEWS), frame: z.object({ min: vec3, max: vec3 }).optional(), fov: z.number().optional(), pad: z.number().optional() })
    .describe('framing the whole scene, or the box `frame`, from a side: front is level from +Z, high is from +Z at 45°, iso from front-right'),
])

export const Scene = z.object({
  title: z.string().optional(),
  note: z.string().optional(),
  light: z.enum(['day', 'night']).optional(),
  sky: color.optional(),
  ground: z.enum(['grid', 'plain']).optional(),
  theme: Theme.optional(),
  items: z.array(Item).optional(),
  boxes: z.array(Box).optional(),
  labels: z.array(Label).optional(),
  lamps: z.array(Lamp).optional(),
  cameras: z.record(z.string(), Camera).optional(),
  slots: z.array(Slot).optional(),
  guides: z.array(Guide).optional(),
  states: z.record(z.string(), State).optional().describe('named states over the shared scene: the board picks a list of them, applied in this order'),
  groups: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe('states that exclude each other, by group: a list of states picks at most one of each, a status, a season'),
}).superRefine((scene, ctx) => {
  const owner = new Map<string, string>()
  for (const [group, names] of Object.entries(scene.groups ?? {}))
    for (const name of names) {
      if (!(name in (scene.states ?? {}))) ctx.addIssue({ code: 'custom', path: ['groups', group], message: `no state "${name}"` })
      if (owner.has(name)) ctx.addIssue({ code: 'custom', path: ['groups', group], message: `"${name}" is in group ${owner.get(name)} too` })
      owner.set(name, group)
    }
})

export type ModelItem = z.infer<typeof ModelItem>
export type SceneItem = z.infer<typeof SceneItem>
export type Item = z.infer<typeof Item>
export type Box = z.infer<typeof Box>
export type Label = z.infer<typeof Label>
export type Lamp = z.infer<typeof Lamp>
export type Theme = z.infer<typeof Theme>
export type Camera = z.infer<typeof Camera>
export type Slot = z.infer<typeof Slot>
export type Guide = z.infer<typeof Guide>
export type BoxGuide = z.infer<typeof BoxGuide>
export type ModelGuide = z.infer<typeof ModelGuide>
export type State = z.infer<typeof State>
export type Scene = z.infer<typeof Scene>

/** Where a prefab's own frame sits in the world. */
export type Frame = { at: Vec3; turn: number; scale: number }

/** The lists of a scene a state changes, in the order they are drawn. */
export const KINDS = ['items', 'boxes', 'labels', 'lamps', 'slots'] as const
type Kind = (typeof KINDS)[number]
type Element<K extends Kind> = NonNullable<Scene[K]>[number]

/** An element of a resolved scene, with where its document writes it: `items/3`, `states/idle/add/items/0`. */
export type Sourced<T> = T & { src: string }

/** A scene in the states asked for: the shared scene with each state's changes applied, every element sourced. */
export type Resolved = Omit<Scene, 'states' | Kind> & Lists
type Lists = { [K in Kind]: Sourced<Element<K>>[] }

const SCHEMAS = { items: Item, boxes: Box, labels: Label, lamps: Lamp, slots: Slot }

/** What a state names an element by: a slot's name, anything else's id. */
export const keyOf = (e: { id?: string } | Slot) => ('name' in e ? e.name : e.id)

/**
 * The states of a scene by the group each excludes the others of: its `groups`, then each state outside them alone.
 * A scene without groups has one, named '', of all its states: it is drawn in one at a time.
 */
export function groupsOf(scene: Scene): Record<string, string[]> {
  const names = Object.keys(scene.states ?? {})
  if (!scene.groups) return names.length ? { '': names } : {}
  const grouped = new Set(Object.values(scene.groups).flat())
  return { ...scene.groups, ...Object.fromEntries(names.filter((n) => !grouped.has(n)).map((n) => [n, [n]])) }
}

/** Every list of states a scene can be drawn in: at most one of each group, the shared scene first. */
export const picks = (scene: Scene): string[][] =>
  Object.values(groupsOf(scene)).reduce<string[][]>((lists, group) => lists.flatMap((l) => [l, ...group.map((n) => [...l, n])]), [[]])

/**
 * The scene in the states `names`, applied in the document's own order of `states`: each removes, then sets fields
 * on, then adds. `doc` names the document in errors. A state the scene has not, two of one group, or a name nothing
 * answers to, is an error.
 */
export function resolve(scene: Scene, names: string[], doc: string): Resolved {
  const states = scene.states ?? {}
  for (const n of names) if (!(n in states)) throw new Error(`${doc}: no state "${n}" (its states: ${Object.keys(states).join(', ') || 'none'})`)
  for (const [group, members] of Object.entries(scene.groups ?? {})) {
    const picked = names.filter((n) => members.includes(n))
    if (picked.length > 1) throw new Error(`${doc}: ${picked.join(' and ')} are both of group ${group}: pick one`)
  }
  const { states: _, ...shared } = scene
  const sourced = (lists: Partial<{ [K in Kind]: Element<K>[] }>, prefix: string): Lists => {
    const tag = <K extends Kind>(k: K) => (lists[k] ?? []).map((e, i) => ({ ...e, src: `${prefix}${k}/${i}` })) as Sourced<Element<K>>[]
    return { items: tag('items'), boxes: tag('boxes'), labels: tag('labels'), lamps: tag('lamps'), slots: tag('slots') }
  }
  let out = sourced(scene, '')
  for (const [name, state] of Object.entries(states)) {
    if (!names.includes(name)) continue
    const at = `${doc}#states/${name}`
    const set = state.set ?? {}
    const known = new Set(KINDS.flatMap((k) => (out[k] as { id?: string }[]).map(keyOf)))
    for (const key of [...(state.remove ?? []), ...Object.keys(set)]) if (!known.has(key)) throw new Error(`${at}: nothing is named "${key}"`)
    const change = <K extends Kind>(k: K) => {
      const kept = (out[k] as Sourced<Element<K>>[]).filter((e) => !state.remove?.includes(keyOf(e)!))
      const changed = kept.map((e) => {
        const over = set[keyOf(e)!]
        if (!over) return e
        const r = SCHEMAS[k].safeParse({ ...e, ...over })
        if (!r.success) throw new Error(`${at}/set/${keyOf(e)}: ${r.error.issues.map((i) => `${i.path.join('/')}: ${i.message}`).join('; ')}`)
        return { ...e, ...over }
      })
      return [...changed, ...added[k]]
    }
    const added = sourced(state.add ?? {}, `states/${name}/add/`)
    out = { items: change('items'), boxes: change('boxes'), labels: change('labels'), lamps: change('lamps'), slots: change('slots') }
  }
  return { ...shared, ...out }
}

/**
 * A slot placed in the world: its name under the ids of the items that placed its scene, where it was written (`from`,
 * `via` as for models), `with` kept in its own frame.
 */
export type FlatSlot = Slot & { from: string; via: string[]; turn: number; size: number }

/**
 * A scene with every prefab placed: models, boxes, labels, lamps and slots in world meters, guides as the outer scene
 * writes them. Each model keeps `from`, where it was written, `via`, where each scene item placing it was written,
 * outermost first, and `frame`, the frame of the scene that wrote it.
 */
export type Flat = Omit<Scene, 'items' | 'slots' | 'states'> & { items: (ModelItem & { from: string; via: string[]; frame: Frame })[]; slots: FlatSlot[] }

export const isModel = (it: Item): it is ModelItem => 'model' in it

/** A theme laid over another: per pack, the atlas and the swaps `over` names win. */
export const layTheme = (under: Theme | undefined, over: Theme | undefined): Theme => ({
  atlas: { ...under?.atlas, ...over?.atlas },
  swaps: { ...under?.swaps, ...over?.swaps },
})
export const isBoxGuide = (g: Guide): g is BoxGuide => 'size' in g
export const isModelGuide = (g: Guide): g is ModelGuide => 'model' in g

const place = (f: Frame, p: Vec3): Vec3 => {
  const [x, z] = turnXZ(p[0] * f.scale, p[2] * f.scale, f.turn)
  return [f.at[0] + x, f.at[1] + p[1] * f.scale, f.at[2] + z]
}
/** A world point in a frame's own coordinates. */
export const local = (f: Frame, p: Vec3): Vec3 => {
  const [x, z] = turnXZ(p[0] - f.at[0], p[2] - f.at[2], -f.turn)
  return [x / f.scale, (p[1] - f.at[1]) / f.scale, z / f.scale]
}
const times = (s: number | Vec3 | undefined, k: number): number | Vec3 => (Array.isArray(s) ? (s.map((v) => v * k) as Vec3) : (s ?? 1) * k)

/**
 * Places every prefab, recursively, in the states each placement asks for (`states` for the outer scene):
 * `read(ref, from)` answers the scene a reference names, relative to the scene holding it. The outer scene keeps its
 * own light, theme, cameras and guides; a prefab's are dropped.
 */
export async function flatten(scene: Scene, name: string, read: (ref: string, from: string) => Promise<{ scene: Scene; name: string }>, states: string[]): Promise<Flat> {
  const outer = resolve(scene, states, name)
  const { states: _, ...rest } = scene
  const out: Flat = { ...rest, items: [], boxes: [], labels: [], lamps: [], slots: [] }
  const walk = async (s: Resolved, from: string, f: Frame, path: string[], via: string[], under: string) => {
    for (const it of s.items) {
      const where = `${from}#${it.src}`
      if (isModel(it)) {
        const { src: _, ...item } = it
        out.items.push({ ...item, from: where, via, frame: f, at: place(f, it.at), turn: f.turn + (it.turn ?? 0), scale: times(it.scale, f.scale) })
        continue
      }
      const child = await read(it.scene, from)
      if (path.includes(child.name)) throw new Error(`${where}: ${child.name} places itself`)
      const frame = { at: place(f, it.at), turn: f.turn + (it.turn ?? 0), scale: f.scale * (it.scale ?? 1) }
      await walk(resolve(child.scene, it.states ?? [], `${where}, placing ${child.name}`), child.name, frame, [...path, child.name], [...via, where], it.id ? `${under}${it.id}/` : under)
    }
    for (const { src: _, ...b } of s.boxes) out.boxes!.push({ ...b, at: place(f, b.at), turn: f.turn + (b.turn ?? 0), size: b.size.map((v) => v * f.scale) as Vec3 })
    for (const { src: _, ...l } of s.labels) out.labels!.push({ ...l, at: place(f, l.at), turn: f.turn + (l.turn ?? 0), height: (l.height ?? LABEL_HEIGHT) * f.scale })
    for (const { src: _, ...l } of s.lamps) out.lamps!.push({ ...l, at: place(f, l.at), distance: l.distance === undefined ? undefined : l.distance * f.scale })
    for (const { src, ...l } of s.slots) out.slots.push({ ...l, name: `${under}${l.name}`, from: `${from}#${src}`, via, at: place(f, l.at), turn: f.turn + (l.turn ?? 0), size: (l.size ?? 1) * f.scale })
  }
  await walk(outer, name, { at: [0, 0, 0], turn: 0, scale: 1 }, [name], [], '')
  return out
}

export const LABEL_HEIGHT = 0.12

/** A scene's errors as one message per problem, each with its path in the document. */
export function parseScene(json: unknown, name: string): Scene {
  const r = Scene.safeParse(json)
  if (r.success) return r.data
  throw new Error(`${name} is not a scene:\n${r.error.issues.map((i) => `  ${i.path.join('/') || '(root)'}: ${i.message}`).join('\n')}`)
}
