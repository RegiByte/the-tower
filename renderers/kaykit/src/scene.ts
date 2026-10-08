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

export const ModelItem = z.object({
  model: z.string().describe('catalog id, e.g. furniture/desk'),
  at: vec3.describe('where the model origin goes, meters; the catalog says where the origin sits on the model'),
  turn,
  scale: z.union([z.number(), vec3]).optional().describe('on top of the catalog norms: 1 is Tower scale'),
  parts: z.record(z.string(), vec3).optional().describe('named parts posed by Euler angles in degrees, about their own pivot'),
})

export const SceneItem = z.object({
  scene: z.string().describe('path to another scene file, relative to this one'),
  at: vec3,
  turn,
  scale: z.number().optional(),
})

export const Item = z.union([ModelItem, SceneItem])

export const Box = z.object({
  size: vec3,
  at: vec3.describe('the centre of its base'),
  turn,
  color,
  glow: z.boolean().optional().describe('lit by nothing: a screen, a status strip'),
  opacity: z.number().min(0).max(1).optional(),
})

export const Label = z.object({
  text: z.string().describe('lines split on \\n'),
  at: vec3.describe('the centre of its bottom edge'),
  turn,
  height: z.number().optional().describe('one line of text, meters (0.12)'),
  tilt: z.number().optional().describe('degrees leaned back: 0 upright, 90 flat on the floor'),
  color: color.optional(),
  bg: color.optional(),
})

export const Lamp = z.object({ at: vec3, color: color.optional(), intensity: z.number().optional(), distance: z.number().optional() })

const Swap = z.object({ from: color, to: color, tol: z.number().optional().describe('hue tolerance, degrees (14)') })

export const Theme = z.object({
  atlas: z.partialRecord(z.enum(PACKS), z.string()).optional().describe('per pack: base, alt_A, alt_B, alt_C or alt (catalog packs[].atlases)'),
  swaps: z.partialRecord(z.enum(PACKS), z.array(Swap)).optional().describe('per pack: atlas hues near `from` take the hue of `to`, keeping their own shading'),
})

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
})

export type ModelItem = z.infer<typeof ModelItem>
export type SceneItem = z.infer<typeof SceneItem>
export type Item = z.infer<typeof Item>
export type Box = z.infer<typeof Box>
export type Label = z.infer<typeof Label>
export type Lamp = z.infer<typeof Lamp>
export type Theme = z.infer<typeof Theme>
export type Camera = z.infer<typeof Camera>
export type Scene = z.infer<typeof Scene>

/** Where a prefab's own frame sits in the world. */
export type Frame = { at: Vec3; turn: number; scale: number }

/**
 * A scene with every prefab placed: models, boxes, labels and lamps in world meters. Each model keeps `from`, where it
 * was written, and `frame`, the frame of the scene that wrote it.
 */
export type Flat = Omit<Scene, 'items'> & { items: (ModelItem & { from: string; frame: Frame })[] }

export const isModel = (it: Item): it is ModelItem => 'model' in it

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
 * Places every prefab, recursively: `read(ref, from)` answers the scene a reference names, relative to the scene
 * holding it. The outer scene keeps its own light, theme and cameras; a prefab's are dropped.
 */
export async function flatten(scene: Scene, name: string, read: (ref: string, from: string) => Promise<{ scene: Scene; name: string }>): Promise<Flat> {
  const out: Flat = { ...scene, items: [], boxes: [], labels: [], lamps: [] }
  const walk = async (s: Scene, from: string, f: Frame, path: string[]) => {
    for (const [i, it] of (s.items ?? []).entries()) {
      const where = `${from}#items/${i}`
      if (isModel(it)) {
        out.items.push({ ...it, from: where, frame: f, at: place(f, it.at), turn: f.turn + (it.turn ?? 0), scale: times(it.scale, f.scale) })
        continue
      }
      const child = await read(it.scene, from)
      if (path.includes(child.name)) throw new Error(`${where}: ${child.name} places itself`)
      await walk(child.scene, child.name, { at: place(f, it.at), turn: f.turn + (it.turn ?? 0), scale: f.scale * (it.scale ?? 1) }, [...path, child.name])
    }
    for (const b of s.boxes ?? []) out.boxes!.push({ ...b, at: place(f, b.at), turn: f.turn + (b.turn ?? 0), size: b.size.map((v) => v * f.scale) as Vec3 })
    for (const l of s.labels ?? []) out.labels!.push({ ...l, at: place(f, l.at), turn: f.turn + (l.turn ?? 0), height: (l.height ?? LABEL_HEIGHT) * f.scale })
    for (const l of s.lamps ?? []) out.lamps!.push({ ...l, at: place(f, l.at), distance: l.distance === undefined ? undefined : l.distance * f.scale })
  }
  await walk(scene, name, { at: [0, 0, 0], turn: 0, scale: 1 }, [name])
  return out
}

export const LABEL_HEIGHT = 0.12

/** A scene's errors as one message per problem, each with its path in the document. */
export function parseScene(json: unknown, name: string): Scene {
  const r = Scene.safeParse(json)
  if (r.success) return r.data
  throw new Error(`${name} is not a scene:\n${r.error.issues.map((i) => `  ${i.path.join('/') || '(root)'}: ${i.message}`).join('\n')}`)
}
