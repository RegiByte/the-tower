import * as THREE from 'three'
import { FACES, HATS } from './contract.ts'
import { instance, type Models } from './models.ts'

/**
 * How workers look. Every worker model (models/bean.py, puff.py, bot.py) keeps the worker contract (contract.ts),
 * and what it wears (models/wear.py) hangs on its anchors.
 */

export type Species = 'bean' | 'puff' | 'bot'
/** The puff turns up most. */
const SPECIES: Species[] = ['puff', 'puff', 'puff', 'bean', 'bean', 'bot', 'bot']
const WEAR_COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#f78c6c', '#f4f1ea', '#2b2d42']

export type Look = { species: Species; hue: THREE.Color; wear: THREE.Color; hat?: string; face?: string; build: { width: number; height: number } }

const hash = (s: string) => {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}
/** A number in [0, 1) for `id`, its own for each `what`. */
export const roll = (id: string, what: string) => hash(`${id}#${what}`) / 2 ** 32
export const pick = <T>(xs: readonly T[], r: number) => xs[Math.floor(r * xs.length)]

/** A worker's own color, hashed from its session id: who it is. Its status shows on its bulb, bubble and pose. */
export const hueOf = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.62)
}

/** A worker's look, hashed from its session id: the same on every board and every reload. */
export const lookOf = (id: string): Look => ({
  species: pick(SPECIES, roll(id, 'species')),
  hue: hueOf(id),
  wear: new THREE.Color(pick(WEAR_COLORS, roll(id, 'wear'))),
  hat: roll(id, 'hat') < 0.55 ? pick(HATS, roll(id, 'which hat')) : undefined,
  face: roll(id, 'face') < 0.3 ? pick(FACES, roll(id, 'which face')) : undefined,
  build: { width: 0.92 + roll(id, 'width') * 0.16, height: 0.94 + roll(id, 'height') * 0.12 },
})

export type Avatar = { root: THREE.Object3D; body: THREE.Object3D; arms: THREE.Object3D[]; hand: THREE.Object3D; bulb: THREE.MeshBasicMaterial }

/** A worker dressed in its look, its seat at the origin, facing +z. */
export function avatar(models: Models, look: Look): Avatar {
  const w = instance(models[look.species])
  w.material<THREE.MeshToonMaterial>('hue_own')?.color.copy(look.hue)
  const body = w.part('body')
  body.scale.set(look.build.width, look.build.height, look.build.width)
  for (const [anchor, name] of [['hat', look.hat], ['face', look.face]] as const) {
    if (!name) continue
    const piece = instance(models.wear.getObjectByName(name)!)
    piece.material<THREE.MeshToonMaterial>('wear_own')?.color.copy(look.wear)
    piece.root.position.set(0, 0, 0)
    w.part(anchor).add(piece.root)
  }
  return { root: w.root, body, arms: [w.part('arm_L'), w.part('arm_R')], hand: w.part('hand_R'), bulb: w.material<THREE.MeshBasicMaterial>('bulb_glow_own')! }
}
