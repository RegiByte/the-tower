import * as THREE from 'three'
import { atlasTexture, glowTexture, type Atlases } from '../../kaykit/src/atlas.ts'
import type { Model, Pack } from '../../kaykit/src/catalog.ts'
import { itemMatrix, nodeMatrices } from '../../kaykit/src/draw.ts'
import { meshesFrom, type ModelMesh } from '../../kaykit/src/meshes.ts'
import type { ModelItem, Theme } from '../../kaykit/src/scene.ts'
import { toonMapped, toonOwn } from './toon.ts'
import packed from '../out/kaykit/kit.kaykit'
import { kitLayout, type KitFile } from './kitfile.ts'
import type { Level } from './layout.ts'
import type { Prefabs } from './zones.ts'

/**
 * The KayKit models the office draws, on the playground's path: measured and packed by the playground's own build
 * (`scripts/tower3d-kit.ts` into `out/kaykit/kit.kaykit`, embedded in the bundle), placed as the playground's scene items (`at`, `turn`, `scale` on top
 * of the catalog's norms) and drawn as the playground draws them: every model of a pack in one BatchedMesh, toon-shaded
 * over the pack's atlas as a theme paints it (an alternate atlas, hue swaps), so a layer costs a draw call per pack and
 * theme however many models and placements it holds.
 */

export type Kit = { models: Map<string, Model>; meshes: Map<string, ModelMesh>; atlases: Atlases; prefabs: Prefabs }

/** An atlas from its PNG's bytes, through a blob URL of this page's own, so WebGL takes it framed too. */
async function atlasOf(png: Uint8Array<ArrayBuffer>) {
  const img = new Image()
  img.src = URL.createObjectURL(new Blob([png], { type: 'image/png' }))
  await img.decode()
  return img
}

/** The kit embedded in the bundle: its catalog, meshes, atlases and prefabs. */
export async function loadKit(): Promise<Kit> {
  const length = new DataView(packed.buffer, packed.byteOffset).getUint32(0, true)
  const header = JSON.parse(new TextDecoder().decode(packed.subarray(4, 4 + length))) as KitFile
  const at = kitLayout(length, header)
  const meshes = meshesFrom(header.meshes, packed.slice(at.meshes.from, at.meshes.to).buffer)
  const atlases = new Map(await Promise.all(at.atlases.map(async ({ key, from, to }) => [key, await atlasOf(packed.subarray(from, to))] as const)))
  return { models: new Map(header.catalog.models.map((m) => [m.id, m])), meshes, atlases, prefabs: header.prefabs }
}

/** A model placed in a frame (a desk, a level): the item as a scene document writes it, and the theme its pack draws in. */
export type Placed = { item: ModelItem; frame: THREE.Matrix4; theme?: Theme }

/** Glass: the one part in the kit sampling no atlas. */
const GLASS = 'glass'

type Batch = { mesh: THREE.BatchedMesh; geometries: Map<THREE.BufferGeometry, number>; used: number }
export type KitLayer = { group: THREE.Group; batches: Map<string, Batch> }

export const makeLayer = (): KitLayer => ({ group: new THREE.Group(), batches: new Map() })

const materials = new Map<string, THREE.Material>()

/** How lit the kit's glowing parts are: the skyline windows' share, set with the sky by the clock (`glowKit`). */
let glow = 0
/** Emissive strength per unit of the sky's window light: lantern glass and City windows read lit at night, faint by day. */
const GLOW = 2.4

/** Lights the kit's glowing parts (lantern glass, City windows) to the sky's window light at this hour. */
export function glowKit(windows: number) {
  glow = windows
  for (const m of materials.values()) if (m instanceof THREE.MeshToonMaterial && m.emissiveMap) m.emissiveIntensity = glow * GLOW
}

/** What a pack draws with under a theme: its batch's key, the same for every theme that paints the pack alike. */
const keyOf = (pack: Pack, theme: Theme | undefined) => JSON.stringify([pack, theme?.atlas?.[pack] ?? 'base', theme?.swaps?.[pack] ?? []])

function materialFor(kit: Kit, key: string) {
  let m = materials.get(key)
  if (!m) {
    if (key === GLASS) m = Object.assign(toonOwn('#cfe3ee'), { transparent: true, opacity: 0.3, depthWrite: false })
    else {
      const [pack, atlas, swaps] = JSON.parse(key) as [Pack, string, NonNullable<Theme['swaps']>[Pack]]
      const toon = toonMapped(atlasTexture(kit.atlases, pack, { atlas: { [pack]: atlas }, swaps: { [pack]: swaps } }))
      const lit = glowTexture(pack, kit.atlases.get(`${pack}/base`)!)
      if (lit) Object.assign(toon, { emissiveMap: lit, emissive: new THREE.Color('#ffffff'), emissiveIntensity: glow * GLOW })
      m = toon
    }
    materials.set(key, m)
  }
  return m
}

/** Every geometry a batch may draw: all prims of the kit's models of its pack, or all glass. */
function geometriesFor(kit: Kit, key: string) {
  const pack = key === GLASS ? undefined : (JSON.parse(key) as [Pack])[0]
  return [...kit.models.values()]
    .filter((m) => key === GLASS || m.pack === pack)
    .flatMap((m) => kit.meshes.get(m.id)!.nodes.flatMap((n) => n.prims.filter((p) => p.glass === (key === GLASS)).map((p) => p.geometry)))
}

function makeBatch(kit: Kit, key: string, instances: number): Batch {
  const unique = [...new Set(geometriesFor(kit, key))]
  const verts = unique.reduce((n, g) => n + g.attributes.position.count, 0)
  const indices = unique.reduce((n, g) => n + g.index!.count, 0)
  const mesh = new THREE.BatchedMesh(instances, verts, indices, materialFor(kit, key))
  return { mesh, geometries: new Map(unique.map((g) => [g, mesh.addGeometry(g)])), used: 0 }
}

/** Each placement's prims, by the batch that draws them, with the matrix each one is drawn at. */
function jobsOf(kit: Kit, placed: Placed[]) {
  const jobs = new Map<string, { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[]>()
  for (const { item, frame, theme } of placed) {
    const model = kit.models.get(item.model)
    if (!model) throw new Error(`no KayKit model ${item.model} in the kit: list it in PROPS, CITY_MODELS or a PREFABS scene and run npm run tower3d`)
    const mesh = kit.meshes.get(item.model)!
    const base = frame.clone().multiply(itemMatrix(item, model))
    nodeMatrices(mesh, item.parts).forEach((m, k) => {
      for (const prim of mesh.nodes[k].prims) {
        const key = prim.glass ? GLASS : keyOf(model.pack, theme)
        if (!jobs.has(key)) jobs.set(key, [])
        jobs.get(key)!.push({ geometry: prim.geometry, matrix: base.clone().multiply(m) })
      }
    })
  }
  return jobs
}

/**
 * Draws exactly `placed` in the layer: each batch keeps its geometries and instances across calls, reusing an
 * instance per placement and hiding the rest, and grows when a call holds more than it fits.
 */
export function fillLayer(kit: Kit, layer: KitLayer, placed: Placed[]) {
  const jobs = jobsOf(kit, placed)
  for (const [key, list] of jobs) {
    if (!layer.batches.has(key)) {
      const batch = makeBatch(kit, key, Math.max(16, list.length * 2))
      layer.batches.set(key, batch)
      layer.group.add(batch.mesh)
    }
    const batch = layer.batches.get(key)!
    if (list.length > batch.mesh.maxInstanceCount) batch.mesh.setInstanceCount(list.length * 2)
  }
  for (const [key, batch] of layer.batches) {
    const list = jobs.get(key) ?? []
    list.forEach(({ geometry, matrix }, i) => {
      const id = batch.geometries.get(geometry)!
      if (i < batch.used) batch.mesh.setGeometryIdAt(i, id).setVisibleAt(i, true)
      else batch.mesh.addInstance(id)
      batch.mesh.setMatrixAt(i, matrix)
    })
    for (let i = list.length; i < batch.used; i++) batch.mesh.setVisibleAt(i, false)
    batch.used = Math.max(batch.used, list.length)
    batch.mesh.computeBoundingBox()
    batch.mesh.computeBoundingSphere()
  }
}

const UP = new THREE.Vector3(0, 1, 0)

/** Every model of a level's zones, each prefab's items in the frame its zone stands in. */
export function zonesPlaced(kit: Kit, level: Level): Placed[] {
  return level.zones.flatMap((z) => {
    const frame = new THREE.Matrix4().compose(new THREE.Vector3(z.x, level.y, z.z), new THREE.Quaternion().setFromAxisAngle(UP, (z.turn * Math.PI) / 180), new THREE.Vector3(z.stretch ?? 1, 1, 1))
    return kit.prefabs[z.prefab].items.map((item) => ({ item, frame, theme: z.theme }))
  })
}

/** Frees a layer's batches; the materials and atlases are the kit's, shared by every layer. */
export function disposeLayer(layer: KitLayer) {
  for (const { mesh } of layer.batches.values()) (mesh.removeFromParent(), mesh.dispose())
  layer.batches.clear()
}
