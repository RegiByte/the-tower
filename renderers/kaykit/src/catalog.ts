import type { Category } from './rules.ts'

/**
 * The composition vocabulary: every KayKit model as measured from its glTF (`out/catalog.json`, written by
 * `npm run tool:kaykit -- build`), and the norms that bring each one into Tower meters. The catalog holds what was
 * measured, as shipped; what a model measures once placed is derived from it by `fit`, so a change of norm is a change
 * of this file and nothing else.
 */

export type Vec3 = [number, number, number]

export const PACKS = ['furniture', 'restaurant', 'prototype', 'halloween', 'city', 'space'] as const
export type Pack = (typeof PACKS)[number]

/** Where a model's origin sits on each axis, as shipped: on a face, centred, or somewhere else. */
export type Pivot = { x: 'min' | 'center' | 'max' | 'offset'; y: 'bottom' | 'center' | 'top' | 'offset'; z: 'min' | 'center' | 'max' | 'offset' }

/** floor: origin at its base; wall: origin on its back face; tile: origin on its top face; hanging: origin above it. */
export type Mount = 'floor' | 'wall' | 'tile' | 'hanging' | 'free'

export type Model = {
  id: string
  pack: Pack
  name: string
  category: Category
  variant: { base: string; axes: Record<string, string>; siblings: string[] }
  /** Bounds as shipped, in the glTF's meters, through the node hierarchy. */
  size: Vec3
  min: Vec3
  max: Vec3
  pivot: Pivot
  mount: Mount
  tris: number
  /** Named sub-objects, posable by name: their pivot is where they turn. */
  parts: { name: string; pivot: Vec3 }[]
  /** The atlas colours it is painted with, by share of its vertices: what a theme swap can reach. */
  palette: { color: string; share: number }[]
  source: string
}

export type PackInfo = { dir: string; count: number; atlases: string[] }

export type Catalog = { bundle: string; license: string; unit: string; packs: Record<Pack, PackInfo>; models: Model[] }

export const ROOM_PACKS: Pack[] = ['furniture', 'restaurant', 'prototype', 'halloween']

/**
 * A rule over the catalog: every rule a model matches applies, scales multiply. The diorama packs (city, space) match
 * none and keep the vendor's scale (a 2 m tile, a 1.65 m three-storey building): a scene scales them per use.
 */
export type Norm = { why: string; pack?: Pack[]; category?: Category[]; maxHeight?: number; scale?: number; surface?: true }

export const NORMS: Norm[] = [
  {
    why: 'Room packs are modelled about 1.33× real size, on a 4 m grid: ×0.75 lands them on Tower meters (desk 0.75, door 2.1, wall 3, grid 3).',
    pack: ROOM_PACKS,
    scale: 0.75,
  },
  {
    why: 'Restaurant and Halloween food and kitchenware are modelled at furniture scale (a burger is 0.95 m, a plate 0.95 m): a further ×0.4 makes them table props as chunky as the Furniture pack\'s mugs (plate 0.29, burger 0.29).',
    pack: ['restaurant', 'halloween'],
    category: ['food', 'kitchenware'],
    scale: 0.4,
  },
  {
    why: 'Floor tiles put their walking surface at y = 0: Restaurant tiles ship with their top on the origin, Prototype tiles with their bottom.',
    category: ['floor'],
    maxHeight: 0.6,
    surface: true,
  },
]

const matches = (n: Norm, m: Model) =>
  (!n.pack || n.pack.includes(m.pack)) && (!n.category || n.category.includes(m.category)) && (n.maxHeight === undefined || m.size[1] <= n.maxHeight)

/** A model as placed at scale 1: the scale and lift applied to the shipped mesh, and the bounds that result, in meters. */
export type Fit = { scale: number; lift: number; size: Vec3; min: Vec3; max: Vec3 }

export function fit(m: Model): Fit {
  const norms = NORMS.filter((n) => matches(n, m))
  const scale = norms.reduce((s, n) => s * (n.scale ?? 1), 1)
  const lift = norms.some((n) => n.surface) ? -m.max[1] * scale : 0
  const at = (v: Vec3): Vec3 => [round(v[0] * scale), round(v[1] * scale + lift), round(v[2] * scale)]
  return { scale, lift, size: m.size.map((v) => round(v * scale)) as Vec3, min: at(m.min), max: at(m.max) }
}

/**
 * Atlas regions that light up at night, in atlas pixels (every pack's atlas is 1024², swatches 128 × 256):
 * [x0, y0, x1, y1, colour]. A fact about the art: the city's window swatches, the Halloween lantern glass.
 */
export const GLOW: Partial<Record<Pack, [number, number, number, number, string][]>> = {
  city: [[0, 768, 256, 1024, '#ffcf7a']],
  halloween: [[256, 768, 384, 1024, '#ffb347']],
}

export const round = (v: number) => Math.round(v * 1000) / 1000

/** Rotates (x, z) by `turn` degrees about +Y, the way three.js turns an object. */
export function turnXZ(x: number, z: number, turn: number): [number, number] {
  const a = (turn * Math.PI) / 180
  return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)]
}

/** The world bounds of a box `min..max` scaled, turned about Y and moved to `at`. */
export function worldBox(min: Vec3, max: Vec3, at: Vec3, turn: number, scale: Vec3): { min: Vec3; max: Vec3 } {
  const xs: number[] = [], zs: number[] = []
  for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) {
    const [rx, rz] = turnXZ(x * scale[0], z * scale[2], turn)
    xs.push(at[0] + rx)
    zs.push(at[2] + rz)
  }
  return {
    min: [Math.min(...xs), at[1] + min[1] * scale[1], Math.min(...zs)],
    max: [Math.max(...xs), at[1] + max[1] * scale[1], Math.max(...zs)],
  }
}
