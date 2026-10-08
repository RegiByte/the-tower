import { fit, round, worldBox, turnXZ, type Catalog, type Model, type Vec3 } from './catalog.ts'
import type { Category } from './rules.ts'
import { local, type Flat } from './scene.ts'

/**
 * The mistakes a scene can make with this collection, found from data alone: unknown ids and parts, models sunk
 * below the floor (a wall-hung piece placed by its base: its origin is mid-height), models standing in the same spot,
 * wall runs meeting at a corner without a pillar to hide the overlap, and props left at furniture size.
 */

export type Issue = { level: 'error' | 'warn'; at: string; message: string }

/** Largest plausible dimension, meters, as placed: past it a prop was likely placed at room scale. */
export const SIZE_LIMITS: Partial<Record<Category, number>> = { food: 0.75, kitchenware: 0.8 }

/** Categories that are the ground itself: they may sit below y = 0 and under everything else. */
const GROUND: Category[] = ['floor', 'terrain', 'road']
const THIN = 0.06

type Placed = { item: Flat['items'][number]; from: string; model: Model; min: Vec3; max: Vec3; turn: number }

const scaleOf = (s: number | Vec3 | undefined): Vec3 => (Array.isArray(s) ? s : [s ?? 1, s ?? 1, s ?? 1])

function sunk(p: Placed): Issue[] {
  if (GROUND.includes(p.model.category) || p.min[1] > -0.02) return []
  const by = round(-p.min[1])
  const why = p.model.mount === 'wall' || p.model.pivot.y === 'center' ? ` (its origin is ${p.model.pivot.y === 'center' ? 'at mid-height' : 'not at its base'})` : ''
  return [{ level: 'warn', at: p.from, message: `${p.model.id} sinks ${by} m below the floor${why}: raise at[1] by ${by}` }]
}

function crowded(placed: Placed[]): Issue[] {
  const solid = placed.filter((p) => !GROUND.includes(p.model.category) && p.max[1] - p.min[1] > THIN)
  const vol = (min: Vec3, max: Vec3) => (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2])
  const out: Issue[] = []
  for (let a = 0; a < solid.length; a++)
    for (let b = a + 1; b < solid.length; b++) {
      const A = solid[a], B = solid[b]
      const lo = [0, 1, 2].map((k) => Math.max(A.min[k], B.min[k])) as Vec3
      const hi = [0, 1, 2].map((k) => Math.min(A.max[k], B.max[k])) as Vec3
      if (hi.some((v, k) => v - lo[k] <= 0.02)) continue
      const both = vol(lo, hi)
      const iou = both / (vol(A.min, A.max) + vol(B.min, B.max) - both)
      if (iou >= 0.25) out.push({ level: 'warn', at: A.from, message: `${A.model.id} and ${B.model.id} (${B.from}) stand in the same spot: their bounds overlap ${Math.round(iou * 100)}% (of their union)` })
    }
  return out
}

/** Where a wall's run starts and ends on the floor: its bounds' ends along its own X, at its middle in Z. */
function ends(p: Placed): [number, number][] {
  const f = fit(p.model), s = scaleOf(p.item.scale), zc = (f.min[2] + f.max[2]) / 2
  return [f.min[0], f.max[0]].map((x) => {
    const [dx, dz] = turnXZ(x * s[0], zc * s[2], p.turn)
    return [p.item.at[0] + dx, p.item.at[2] + dz]
  })
}

/** Wall modules overlap where two runs meet at a right angle: a pillar on the corner covers it. */
function corners(placed: Placed[]): Issue[] {
  const walls = placed.filter((p) => p.model.category === 'wall' && fit(p.model).size[0] >= 1.4)
  const pillars = placed.filter((p) => p.model.category === 'pillar')
  const out: Issue[] = []
  const seen: [number, number][] = []
  for (let a = 0; a < walls.length; a++)
    for (let b = a + 1; b < walls.length; b++) {
      const A = walls[a], B = walls[b]
      if (Math.abs(Math.sin(((A.turn - B.turn) * Math.PI) / 180)) < 0.9) continue
      for (const pa of ends(A)) for (const pb of ends(B)) {
        if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > 0.35) continue
        const c: [number, number] = [round((pa[0] + pb[0]) / 2), round((pa[1] + pb[1]) / 2)]
        if (seen.some((s) => Math.hypot(s[0] - c[0], s[1] - c[1]) < 0.5)) continue
        seen.push(c)
        const covered = pillars.some((p) => Math.hypot((p.min[0] + p.max[0]) / 2 - c[0], (p.min[2] + p.max[2]) / 2 - c[1]) < 0.45)
        const [lx, ly, lz] = local(A.item.frame, [c[0], 0, c[1]]).map(round)
        if (!covered) out.push({ level: 'warn', at: A.from, message: `${A.model.id} and ${B.model.id} (${B.from}) meet at a corner with no pillar (world ${c[0]}, ${c[1]}): add { "model": "restaurant/pillar_A", "at": [${lx}, ${ly}, ${lz}] } beside them` })
      }
    }
  return out
}

function oversized(p: Placed): Issue[] {
  const limit = SIZE_LIMITS[p.model.category]
  const biggest = Math.max(p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2])
  if (limit === undefined || biggest <= limit) return []
  return [{ level: 'warn', at: p.from, message: `${p.model.id} is ${round(biggest)} m across: a ${p.model.category} prop at room scale (its norm already sizes it at ${Math.max(...fit(p.model).size)} m)` }]
}

export function check(flat: Flat, catalog: Catalog): Issue[] {
  const byId = new Map(catalog.models.map((m) => [m.id, m]))
  const issues: Issue[] = []
  const placed: Placed[] = []
  for (const item of flat.items) {
    const model = byId.get(item.model)
    if (!model) {
      const name = item.model.split('/').at(-1)!.toLowerCase()
      const near = catalog.models.filter((m) => m.name.toLowerCase().includes(name) || name.includes(m.variant.base.toLowerCase())).slice(0, 5).map((m) => m.id)
      issues.push({ level: 'error', at: item.from, message: `no model "${item.model}"${near.length ? `: did you mean ${near.join(', ')}?` : ''}` })
      continue
    }
    for (const part of Object.keys(item.parts ?? {}))
      if (!model.parts.some((p) => p.name === part)) issues.push({ level: 'error', at: item.from, message: `${model.id} has no part "${part}" (its parts: ${model.parts.map((p) => p.name).join(', ') || 'none'})` })
    const f = fit(model)
    placed.push({ item, from: item.from, model, turn: item.turn ?? 0, ...worldBox(f.min, f.max, item.at, item.turn ?? 0, scaleOf(item.scale)) })
  }
  return [...issues, ...placed.flatMap(sunk), ...placed.flatMap(oversized), ...corners(placed), ...crowded(placed)]
}
