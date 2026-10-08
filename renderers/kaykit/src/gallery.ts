import { fit, PACKS, ROOM_PACKS, round, type Catalog, type Model, type Pack, type Vec3 } from './catalog.ts'
import { CATEGORIES } from './rules.ts'
import type { Box, Label, ModelItem, Scene } from './scene.ts'

/**
 * The whole collection as a scene, derived from the catalog: a hall per pack side by side along +X, and within each
 * hall a block of rows per category, models of a family next to each other. Every model stands on the floor on its
 * own bounds (whatever its pivot) with a plaque in front: its name, its size in Tower meters and how it mounts.
 * The viewer starts at +Z looking down the halls.
 */

export const PACK_COLORS: Record<Pack, string> = {
  furniture: '#2b6f87', restaurant: '#b5523b', prototype: '#5a6378', halloween: '#d17a2e', city: '#4f9a5c', space: '#7d4fb5',
}

const GAP = 0.45
const PLAQUE = 0.085
const HALL_GAP = 6
/** A category's first row opens with its name. */
const HEADER = 0.45

/** About how wide a label sets: the display face runs 0.5 em a character, mono 0.6. */
const labelWidth = (text: string, h: number) => Math.max(...text.split('\n').map((l, i) => l.length * h * (i === 0 ? 0.55 : 0.62))) + h * 0.5

export const plaque = (m: Model) => {
  const f = fit(m)
  const facts = [`${f.size.map((v) => v.toFixed(2)).join(' × ')} m`, m.mount, m.parts.length > 1 ? `${m.parts.length} parts` : ''].filter(Boolean)
  return `${m.name}\n${facts.join(' · ')}`
}

type Cell = { model: Model; w: number; d: number }

/** One hall: cells laid in rows no wider than `width`, a new row per category. Returns its contents and its depth. */
function hall(models: Model[], x0: number, width: number) {
  const items: ModelItem[] = [], labels: Label[] = []
  let z = 0
  const byCategory = Object.groupBy(models, (m) => m.category)
  for (const category of CATEGORIES) {
    const list = byCategory[category]
    if (!list) continue
    const cells: Cell[] = list
      .sort((a, b) => a.variant.base.localeCompare(b.variant.base) || a.name.localeCompare(b.name))
      .map((model) => {
        const f = fit(model)
        return { model, w: Math.max(f.size[0], labelWidth(plaque(model), PLAQUE)) + GAP, d: f.size[2] }
      })
    const header = `${category}\n${list.length}`
    const lead = labelWidth(header, HEADER) + GAP
    labels.push({ text: header, at: [round(x0 + lead / 2), 0, round(z - 0.1)], height: HEADER, tilt: 20 })
    rows(cells, lead, width).forEach((row, r) => {
      let cx = x0 + (r === 0 ? lead : 0)
      for (const c of row) {
        const f = fit(c.model)
        items.push({ model: c.model.id, at: [round(cx + c.w / 2 - (f.min[0] + f.max[0]) / 2), round(-f.min[1]), round(z - 0.35 - f.max[2])] })
        labels.push({ text: plaque(c.model), at: [round(cx + c.w / 2), 0, round(z - 0.05)], height: PLAQUE, tilt: 55 })
        cx += c.w
      }
      z -= Math.max(...row.map((c) => c.d)) + 1.25
    })
    z -= 0.6
  }
  return { items, labels, depth: -z }
}

/** Cells split into rows no wider than `width`, the first already `lead` in. */
function rows(cells: Cell[], lead: number, width: number) {
  const out: Cell[][] = [[]]
  let x = lead
  for (const c of cells) {
    if (out.at(-1)!.length && x + c.w > width) (out.push([]), (x = 0))
    out.at(-1)!.push(c)
    x += c.w
  }
  return out
}

/** How wide a pack's hall is: about square, from the floor its cells cover. */
function hallWidth(models: Model[]) {
  const area = models.reduce((a, m) => {
    const f = fit(m)
    return a + (Math.max(f.size[0], labelWidth(plaque(m), PLAQUE)) + GAP) * (f.size[2] + 1.25)
  }, 0)
  return Math.max(14, Math.sqrt(area) * 1.15)
}

export function gallery(catalog: Catalog): Scene {
  const items: ModelItem[] = [], labels: Label[] = [], boxes: Box[] = []
  const halls: Record<string, { x: number; width: number; depth: number }> = {}
  let x = 0
  for (const pack of PACKS) {
    const models = catalog.models.filter((m) => m.pack === pack)
    const width = hallWidth(models)
    const h = hall(models, x, width)
    items.push(...h.items)
    labels.push(...h.labels)
    const scale = ROOM_PACKS.includes(pack) ? 'room pack, × 0.75' : 'diorama pack, × 1'
    labels.push({ text: `${pack}\n${models.length} models · ${scale} · atlases: ${catalog.packs[pack].atlases.join(', ')}`, at: [round(x + width / 2), 0, 2.2], height: 0.7, tilt: 25, color: PACK_COLORS[pack] })
    boxes.push({ size: [round(width + 2), 0.04, round(h.depth + 4.5)], at: [round(x + width / 2), -0.05, round(-h.depth / 2 + 1.25)], color: tint(PACK_COLORS[pack]) })
    halls[pack] = { x, width, depth: h.depth }
    x += width + HALL_GAP
  }
  const cameras = Object.fromEntries(
    Object.entries(halls).map(([pack, h]) => [pack, { view: 'high' as const, frame: { min: [round(h.x), 0, round(-h.depth)] as Vec3, max: [round(h.x + h.width), 1, 3] as Vec3 } }]),
  )
  return {
    title: 'KayKit gallery',
    note: 'Every model of the bundle, derived from the catalog: a hall per pack, rows per category, in Tower meters.',
    ground: 'plain',
    items,
    labels,
    boxes,
    cameras: { overview: { view: 'iso', fov: 40 }, ...cameras },
  }
}

/** A pack colour washed toward the floor's paper. */
function tint(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return '#' + c.map((v) => Math.round(v * 0.25 + 0xe4 * 0.75).toString(16).padStart(2, '0')).join('')
}
