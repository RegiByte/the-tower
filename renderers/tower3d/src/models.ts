import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ModelName } from './contract.ts'
import type { Catalogue } from './wardrobe.ts'
import { catalogueOf } from './catalogue.ts'
import { bytesOf, CAST_FILES, MODEL_FILES } from './files.ts'
import { loadCast, type Cast } from './rig.ts'
import { glowing, toon } from './toon.ts'

/**
 * The Blender models (models/*.py), fetched as files and parsed once. A model speaks to the renderer through names:
 * a pivot's name for a part it moves, a material's name for how it's drawn: `glow` unlit, `own` a copy per instance
 * (for what's recolored), anything else toon-shaded in its color, shared with everything of that color.
 */

/** The Blender models by name, the cast workers are made of, and the catalogue of what they wear. */
export type Models = Record<ModelName, THREE.Group> & { cast: Cast; catalogue: Catalogue }

const tokens = (m: THREE.Material) => new Set(m.name.split('_'))

const ownCopy = (m: THREE.Material, name: string) => Object.assign(m.clone(), { name, userData: {} })

function drawn(source: THREE.MeshStandardMaterial) {
  const t = tokens(source)
  const m = t.has('glow') ? glowing(source.color) : toon(source.color)
  if (t.has('own')) return ownCopy(m, source.name)
  if (t.has('glow')) m.userData.shared = true
  return m
}

async function parse(bytes: ArrayBuffer) {
  const gltf = await new GLTFLoader().parseAsync(bytes, '')
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    o.geometry.userData.shared = true
    o.material = drawn(o.material)
  })
  return gltf.scene
}

/**
 * Every file arrives before any is parsed, so the models parse in the same order on every load: materials are made as
 * they parse, and that order breaks ties in the draw order.
 */
export async function loadModels(): Promise<Models> {
  await Promise.all([...Object.values(MODEL_FILES), ...Object.values(CAST_FILES)].map(bytesOf))
  const [entries, cast] = await Promise.all([Promise.all(Object.entries(MODEL_FILES).map(async ([name, url]) => [name, await parse(await bytesOf(url))] as const)), loadCast()])
  const models = Object.fromEntries(entries) as Record<ModelName, THREE.Group>
  return { ...models, cast, catalogue: catalogueOf(cast, models.bot) }
}

/** A copy of a model, or a part of one, sharing its geometry and shared materials, with its `own` materials its own. */
export function instance(model: THREE.Object3D) {
  const root = model.clone(true)
  const own = new Map<string, THREE.Material>()
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !tokens(o.material).has('own')) return
    if (!own.has(o.material.name)) own.set(o.material.name, ownCopy(o.material, o.material.name))
    o.material = own.get(o.material.name)!
  })
  return {
    root,
    part: (name: string) => root.getObjectByName(name)!,
    material: <M extends THREE.Material>(name: string) => own.get(name) as M | undefined,
  }
}
