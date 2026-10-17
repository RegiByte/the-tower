import * as THREE from 'three'
import { fit, type Catalog, type Model, type Pack } from './catalog.ts'
import { atlasTexture, glowTexture, type Atlases } from './atlas.ts'
import { drawLabels } from './labels.ts'
import type { ModelMesh } from './meshes.ts'
import { isBoxGuide, layTheme, type Camera, type Flat, type ModelItem, type Theme } from './scene.ts'

/**
 * A flat scene made into a three.js scene. Every model is one mesh (or a few named parts) sampling its pack's atlas,
 * so all of a pack's models go into one BatchedMesh with one material: the whole collection is a handful of draw calls.
 * Each node of each placement is an instance; a part's pose is in its instance's matrix.
 */

export type Assets = { catalog: Catalog; byId: Map<string, Model>; meshes: Map<string, ModelMesh>; atlases: Atlases }

export type Built = {
  scene: THREE.Scene
  bounds: THREE.Box3
  /** The item a ray hits first, by its index in the flat scene. */
  pick(ray: THREE.Raycaster): number | undefined
  triangles: number
}

const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat)
  t.minFilter = t.magFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
})()

const UP = new THREE.Vector3(0, 1, 0)
const SKY = { day: '#d8d2c4', night: '#121828' }
const DEG = Math.PI / 180

function material(pack: Pack, theme: Theme, flat: Flat, assets: Assets) {
  const m = new THREE.MeshToonMaterial({ map: atlasTexture(assets.atlases, pack, theme), gradientMap: RAMP })
  const glow = flat.light === 'night' ? glowTexture(pack, assets.atlases.get(`${pack}/base`)!) : null
  if (glow) Object.assign(m, { emissiveMap: glow, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.4 })
  return m
}

const GLASS = new THREE.MeshToonMaterial({ color: '#cfe3ee', gradientMap: RAMP, transparent: true, opacity: 0.3, depthWrite: false })

/** Each node's matrix in the model's frame, its pose applied about its own pivot. */
export function nodeMatrices(mesh: ModelMesh, parts: ModelItem['parts']) {
  const out: THREE.Matrix4[] = []
  for (const n of mesh.nodes) {
    const q = new THREE.Quaternion(...n.r)
    const pose = parts?.[n.name]
    if (pose) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pose[0] * DEG, pose[1] * DEG, pose[2] * DEG)))
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...n.t), q, new THREE.Vector3(...n.s))
    out.push(n.parent < 0 ? local : out[n.parent].clone().multiply(local))
  }
  return out
}

/** Where an item's model frame sits in the world: its placement, then the catalog's norms. */
export function itemMatrix(item: ModelItem, model: Model) {
  const f = fit(model)
  const s = Array.isArray(item.scale) ? item.scale : [item.scale ?? 1, item.scale ?? 1, item.scale ?? 1]
  const place = new THREE.Matrix4().compose(new THREE.Vector3(...item.at), new THREE.Quaternion().setFromAxisAngle(UP, (item.turn ?? 0) * DEG), new THREE.Vector3(...s))
  return place.multiply(new THREE.Matrix4().makeTranslation(0, f.lift, 0)).multiply(new THREE.Matrix4().makeScale(f.scale, f.scale, f.scale))
}

function batches(flat: Flat, assets: Assets, scene: THREE.Scene) {
  type Job = { item: number; geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }
  const jobs = new Map<string, Job[]>()
  const looks = new Map<string, { pack: Pack; theme: Theme }>()
  flat.items.forEach((item, i) => {
    const model = assets.byId.get(item.model)
    if (!model) throw new Error(`${item.from}: no model "${item.model}"`)
    const mesh = assets.meshes.get(item.model)!
    for (const part of Object.keys(item.parts ?? {})) if (!mesh.nodes.some((n) => n.name === part)) throw new Error(`${item.from}: ${item.model} has no part "${part}"`)
    const base = itemMatrix(item, model)
    const theme = layTheme(flat.theme, item.theme)
    const look = JSON.stringify([model.pack, theme.atlas?.[model.pack] ?? 'base', theme.swaps?.[model.pack] ?? []])
    looks.set(look, { pack: model.pack, theme })
    nodeMatrices(mesh, item.parts).forEach((m, k) => {
      for (const prim of mesh.nodes[k].prims) {
        const key = prim.glass ? 'glass' : look
        if (!jobs.has(key)) jobs.set(key, [])
        jobs.get(key)!.push({ item: i, geometry: prim.geometry, matrix: base.clone().multiply(m) })
      }
    })
  })
  const owners = new Map<THREE.BatchedMesh, number[]>()
  let triangles = 0
  for (const [key, list] of jobs) {
    const unique = [...new Set(list.map((j) => j.geometry))]
    const verts = unique.reduce((n, g) => n + g.attributes.position.count, 0)
    const indices = unique.reduce((n, g) => n + g.index!.count, 0)
    const batch = new THREE.BatchedMesh(list.length, verts, indices, key === 'glass' ? GLASS : material(looks.get(key)!.pack, looks.get(key)!.theme, flat, assets))
    const ids = new Map(unique.map((g) => [g, batch.addGeometry(g)]))
    const owner: number[] = []
    for (const j of list) {
      const id = batch.addInstance(ids.get(j.geometry)!)
      batch.setMatrixAt(id, j.matrix)
      owner[id] = j.item
      triangles += j.geometry.index!.count / 3
    }
    batch.castShadow = key !== 'glass'
    batch.receiveShadow = true
    owners.set(batch, owner)
    scene.add(batch)
  }
  return { owners, triangles }
}

/** The scene's boxes, each mesh knowing its box's index in `flat.boxes` (`userData.box`). */
function boxes(flat: Flat) {
  return flat.boxes.map((b, i) => {
    const mat = b.glow
      ? new THREE.MeshBasicMaterial({ color: b.color, toneMapped: false })
      : new THREE.MeshToonMaterial({ color: b.color, gradientMap: RAMP })
    if (b.opacity !== undefined) Object.assign(mat, { transparent: true, opacity: b.opacity, depthWrite: false })
    const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size), mat)
    m.position.set(b.at[0], b.at[1] + b.size[1] / 2, b.at[2])
    m.rotation.y = (b.turn ?? 0) * DEG
    m.castShadow = b.opacity === undefined && !b.glow
    m.receiveShadow = true
    m.userData.box = i
    return m
  })
}

const GHOST = '#3d8fd6'
const ghost = (opacity: number) => new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity, depthWrite: false })

/** Box guides as ghosts: what the host draws itself, to place against. */
function guides(flat: Flat) {
  return (flat.guides ?? []).filter(isBoxGuide).map((g) => {
    const geometry = new THREE.BoxGeometry(...g.size)
    const m = new THREE.Mesh(geometry, ghost(0.1))
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: GHOST, transparent: true, opacity: 0.45 })))
    m.position.set(g.at[0], g.at[1] + g.size[1] / 2, g.at[2])
    m.rotation.y = (g.turn ?? 0) * DEG
    m.userData.guide = g.name
    return m
  })
}

/** A person's height standing and sitting (a chair's base to the top of the head), meters, at size 1. */
export const FIGURE = { stand: 1.75, sit: 1.3, across: 0.45 }

/**
 * Slots as markers: a pawn as tall as a person in its pose for a person's place, a flat tile for a thing's, each with
 * a tick toward where it faces and its name above.
 */
function slots(flat: Flat) {
  const group = new THREE.Group()
  group.name = 'slots'
  for (const slot of flat.slots) {
    const g = new THREE.Group()
    const h = slot.pose ? FIGURE[slot.pose] * slot.size : 0.02
    const r = (slot.pose ? FIGURE.across / 2 : 0.1) * slot.size
    const body = slot.pose ? new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(h - 2 * r, 0.01), 4, 12), ghost(0.35)) : new THREE.Mesh(new THREE.BoxGeometry(r * 2, h, r * 2), ghost(0.5))
    body.position.y = h / 2
    const tick = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r, 12), ghost(0.8))
    tick.rotation.x = Math.PI / 2
    tick.position.set(0, slot.pose ? h * 0.75 : h, r * 1.2)
    g.add(body, tick)
    g.position.set(...slot.at)
    g.rotation.y = slot.turn * DEG
    group.add(g)
  }
  group.add(drawLabels(flat.slots.map((s) => ({ text: s.name, at: [s.at[0], s.at[1] + (s.pose ? FIGURE[s.pose] * s.size : 0.05) + 0.05, s.at[2]], turn: s.turn, height: 0.07, color: '#ffffff', bg: GHOST }))))
  return group
}

function ground(kind: Flat['ground'], bounds: THREE.Box3) {
  const g = new THREE.Group()
  if (!kind) return g
  const c = bounds.getCenter(new THREE.Vector3())
  const half = Math.ceil(Math.max(bounds.max.x - c.x, bounds.max.z - c.z, 1) + 2)
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, half * 2),
    kind === 'plain' ? new THREE.MeshToonMaterial({ color: '#cfc8b8', gradientMap: RAMP }) : new THREE.ShadowMaterial({ opacity: 0.18 }),
  )
  plane.rotation.x = -Math.PI / 2
  plane.position.set(Math.round(c.x), kind === 'plain' ? -0.03 : 0, Math.round(c.z))
  plane.receiveShadow = true
  g.add(plane)
  if (kind === 'grid') {
    const pts: number[] = []
    for (let i = -half; i <= half; i++) pts.push(-half, 0, i, half, 0, i, i, 0, -half, i, 0, half)
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: '#9c9585', transparent: true, opacity: 0.55 }))
    lines.position.set(Math.round(c.x), 0.001, Math.round(c.z))
    g.add(lines)
  }
  return g
}

/** The lighting preset: a warm sun with shadows fitted to the scene, a sky and fill; night dims them all. */
function lights(flat: Flat, bounds: THREE.Box3) {
  const night = flat.light === 'night'
  const sphere = bounds.getBoundingSphere(new THREE.Sphere())
  const r = Math.max(sphere.radius, 1)
  const hemi = new THREE.HemisphereLight('#fff5e6', '#8a7660', 1.9 * (night ? 0.18 : 1))
  const fill = new THREE.AmbientLight('#ffffff', 0.35 * (night ? 0.18 : 1))
  const sun = new THREE.DirectionalLight('#fff1d6', 1.8 * (night ? 0.08 : 1))
  sun.position.copy(sphere.center).add(new THREE.Vector3(-0.45, 1, 0.55).normalize().multiplyScalar(r * 2))
  sun.target.position.copy(sphere.center)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.1, far: r * 4 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  const lamps = (flat.lamps ?? []).map((l) => {
    const p = new THREE.PointLight(l.color ?? '#ffd9a0', l.intensity ?? 6, l.distance ?? 8, 2)
    p.position.set(...l.at)
    return p
  })
  return [hemi, fill, sun, sun.target, ...lamps]
}

export function build(flat: Flat, assets: Assets): Built {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(flat.sky ?? SKY[flat.light ?? 'day'])
  const { owners, triangles } = batches(flat, assets, scene)
  for (const b of boxes(flat)) scene.add(b)
  const labels = drawLabels(flat.labels ?? [])
  scene.add(labels, ...guides(flat), slots(flat))
  const bounds = new THREE.Box3().setFromObject(scene)
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1))
  scene.add(ground(flat.ground, bounds), ...lights(flat, bounds))
  return {
    scene,
    bounds,
    triangles,
    pick(ray) {
      const hit = ray.intersectObjects([...owners.keys()], false).find((h) => h.batchId !== undefined)
      return hit && owners.get(hit.object as THREE.BatchedMesh)![hit.batchId!]
    },
  }
}

const VIEW_ANGLES = { front: [0, 12], high: [0, 45], back: [180, 12], left: [-90, 12], right: [90, 12], iso: [35, 32], top: [0, 89.5] } as const

/** A camera from its spec: placed as written, or backed off along a view until every corner of the box is in frame. */
export function cameraFor(spec: Camera, bounds: THREE.Box3, aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(spec.fov ?? 40, aspect, 0.05, 5000)
  if ('pos' in spec) {
    cam.position.set(...spec.pos)
    cam.lookAt(...spec.look)
    return cam
  }
  const box = spec.frame ? new THREE.Box3(new THREE.Vector3(...spec.frame.min), new THREE.Vector3(...spec.frame.max)) : bounds
  const center = box.getCenter(new THREE.Vector3())
  const [az, el] = VIEW_ANGLES[spec.view].map((d) => d * DEG)
  const back = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
  cam.position.copy(center).add(back)
  cam.lookAt(center)
  cam.updateMatrixWorld()
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
  const tanV = Math.tan((cam.fov * DEG) / 2), tanH = tanV * aspect
  let dist = 0
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const rel = new THREE.Vector3(x, y, z).sub(center)
    const toward = rel.dot(back)
    dist = Math.max(dist, Math.abs(rel.dot(right)) / tanH + toward, Math.abs(rel.dot(up)) / tanV + toward)
  }
  cam.position.copy(center).addScaledVector(back, dist * (spec.pad ?? 1.04))
  cam.lookAt(center)
  return cam
}
