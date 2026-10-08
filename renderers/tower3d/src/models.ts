import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import barGlb from '../assets/bar.glb'
import beanGlb from '../assets/bean.glb'
import bookcaseGlb from '../assets/bookcase.glb'
import botGlb from '../assets/bot.glb'
import calicoGlb from '../assets/calico.glb'
import consoleGlb from '../assets/console.glb'
import couchGlb from '../assets/couch.glb'
import deskGlb from '../assets/desk.glb'
import djGlb from '../assets/dj.glb'
import handsGlb from '../assets/hands.glb'
import kioskGlb from '../assets/kiosk.glb'
import planeGlb from '../assets/plane.glb'
import puffGlb from '../assets/puff.glb'
import tabbyGlb from '../assets/tabby.glb'
import tvGlb from '../assets/tv.glb'
import tuxedoGlb from '../assets/tuxedo.glb'
import wearGlb from '../assets/wear.glb'
import type { ModelName } from './contract.ts'
import { glowing, toon } from './toon.ts'

/**
 * The Blender models (models/*.py), bundled as bytes and parsed once. A model speaks to the renderer through names:
 * a pivot's name for a part it moves, a material's name for how it's drawn: `glow` unlit, `own` a copy per instance
 * (for what's recolored), anything else toon-shaded in its color, shared with everything of that color.
 */

const BYTES: Record<ModelName, Uint8Array> = { bar: barGlb, bean: beanGlb, bookcase: bookcaseGlb, bot: botGlb, calico: calicoGlb, console: consoleGlb, couch: couchGlb, desk: deskGlb, dj: djGlb, hands: handsGlb, kiosk: kioskGlb, plane: planeGlb, puff: puffGlb, tabby: tabbyGlb, tv: tvGlb, tuxedo: tuxedoGlb, wear: wearGlb }
export type Models = Record<ModelName, THREE.Group>

const tokens = (m: THREE.Material) => new Set(m.name.split('_'))

const ownCopy = (m: THREE.Material, name: string) => Object.assign(m.clone(), { name, userData: {} })

function drawn(source: THREE.MeshStandardMaterial) {
  const t = tokens(source)
  const m = t.has('glow') ? glowing(source.color) : toon(source.color)
  if (t.has('own')) return ownCopy(m, source.name)
  if (t.has('glow')) m.userData.shared = true
  return m
}

async function parse(bytes: Uint8Array) {
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '')
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    o.geometry.userData.shared = true
    o.material = drawn(o.material)
  })
  return gltf.scene
}

export async function loadModels(): Promise<Models> {
  const entries = await Promise.all(Object.entries(BYTES).map(async ([name, bytes]) => [name, await parse(bytes)] as const))
  return Object.fromEntries(entries) as Models
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
