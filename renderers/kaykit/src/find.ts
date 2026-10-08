import { fit, type Catalog, type Model, type Mount, type Pack, type Vec3 } from './catalog.ts'
import type { Category } from './rules.ts'

/** A catalog query: every given field must hold. Sizes are in Tower meters, as placed; a NaN bound is no bound. */
export type Query = { text?: string; pack?: Pack[]; category?: Category[]; mount?: Mount[]; parts?: boolean; min?: Vec3; max?: Vec3 }

/** What an agent needs to place a model without opening it: its bounds as placed, relative to the origin `at` puts down. */
export type Found = {
  id: string
  category: Category
  mount: Mount
  size: Vec3
  min: Vec3
  max: Vec3
  parts: string[]
  tris: number
  colors: string[]
}

const words = (m: Model) => [m.id, m.category, m.mount, m.variant.base, ...Object.values(m.variant.axes)].join(' ').toLowerCase()

export function matches(m: Model, q: Query): boolean {
  const f = fit(m)
  const within = (bound: Vec3 | undefined, ok: (v: number, b: number) => boolean) => !bound || bound.every((b, k) => Number.isNaN(b) || ok(f.size[k], b))
  return (
    (!q.text || q.text.toLowerCase().split(/\s+/).filter(Boolean).every((w) => words(m).includes(w))) &&
    (!q.pack || q.pack.includes(m.pack)) &&
    (!q.category || q.category.includes(m.category)) &&
    (!q.mount || q.mount.includes(m.mount)) &&
    (q.parts === undefined || q.parts === m.parts.length > 1) &&
    within(q.min, (v, b) => v >= b) &&
    within(q.max, (v, b) => v <= b)
  )
}

export const found = (m: Model): Found => {
  const f = fit(m)
  return {
    id: m.id,
    category: m.category,
    mount: m.mount,
    size: f.size,
    min: f.min,
    max: f.max,
    parts: m.parts.length > 1 ? m.parts.map((p) => p.name) : [],
    tris: m.tris,
    colors: m.palette.slice(0, 3).map((p) => p.color),
  }
}

export const find = (catalog: Catalog, q: Query): Found[] => catalog.models.filter((m) => matches(m, q)).map(found)
