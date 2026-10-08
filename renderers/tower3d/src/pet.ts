import * as THREE from 'three'
import { roll } from './avatar.ts'
import type { Stroke } from './hands.ts'
import type { Cat, CatName } from './life.ts'

/**
 * Petting a cat: the camera flies low beside it (`PET_IN` ms), the right hand strokes its back for `PET_MS`, hearts
 * rise off it, and the camera flies home. Everything drawn is a function of the time since `start`.
 */
export type Pet = {
  name: CatName
  start: number
  /** 1 when the view's right is toward the cat's tail, else -1: strokes run head to tail either way. */
  tailward: 1 | -1
  hearts: THREE.Group
}

export const PET_IN = 600
export const PET_MS = 2200
const STROKES = 3
const HEARTS = 5
const HEART_MS = 1100

/** Where the camera looks at a cat from: beside it on the side `eye` is on, a little above, looking down onto its back. */
export function petSpot(cat: Cat, eye: THREE.Vector3) {
  const at = cat.root.position.clone().add(new THREE.Vector3(0, 0.22, 0))
  const h = cat.root.rotation.y
  const right = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h))
  const side = right.dot(eye.clone().sub(cat.root.position)) >= 0 ? 1 : -1
  const from = cat.root.position.clone().addScaledVector(right, side * 0.5).add(new THREE.Vector3(0, 0.75, 0))
  const forward = new THREE.Vector3(Math.sin(h), 0, Math.cos(h))
  const viewRight = new THREE.Vector3().crossVectors(at.clone().sub(from), new THREE.Vector3(0, 1, 0)).normalize()
  return { from, at, tailward: (viewRight.dot(forward) < 0 ? 1 : -1) as 1 | -1 }
}

/** How far into its strokes a pet is, 0 to 1, at `now`; below 0 while the camera flies in. */
export const petProgress = (p: Pet, now: number) => (now - p.start - PET_IN) / PET_MS

/** The right hand's stroke at `k` into the strokes: it reaches in, runs head to tail pressing down and lifts back, three times, and lets go. */
export function strokeAt(k: number, tailward: 1 | -1): Stroke | undefined {
  if (k < 0 || k > 1) return undefined
  const reach = THREE.MathUtils.smoothstep(k, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(k, 0.88, 1))
  const phase = 2 * Math.PI * STROKES * k
  return { reach, along: -Math.cos(phase) * tailward, press: Math.max(0, Math.sin(phase)) }
}

let heartTexture: THREE.CanvasTexture | undefined

function heart() {
  if (heartTexture) return heartTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#ff5c8a'
  g.beginPath()
  g.moveTo(32, 56)
  g.bezierCurveTo(4, 36, 6, 10, 22, 10)
  g.bezierCurveTo(28, 10, 32, 15, 32, 20)
  g.bezierCurveTo(32, 15, 36, 10, 42, 10)
  g.bezierCurveTo(58, 10, 60, 36, 32, 56)
  g.fill()
  heartTexture = new THREE.CanvasTexture(c)
  heartTexture.colorSpace = THREE.SRGBColorSpace
  return heartTexture
}

/** The hearts a pet raises, hidden until their time: one group in the world, emptied with `dropHearts`. */
export function makeHearts() {
  const g = new THREE.Group()
  for (let i = 0; i < HEARTS; i++) g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: heart(), transparent: true, depthWrite: false })))
  return g
}

/** Each heart in turn floats up off the cat's head, drifting aside, growing and fading, at `k` into the strokes. */
export function placeHearts(p: Pet, cat: Cat, k: number) {
  const head = cat.root.position.clone().add(new THREE.Vector3(0, 0.38, 0))
  p.hearts.children.forEach((o, i) => {
    const sprite = o as THREE.Sprite
    const life = ((k - (0.1 + (i / HEARTS) * 0.7)) * PET_MS) / HEART_MS
    sprite.visible = life >= 0 && life <= 1
    if (!sprite.visible) return
    const dx = (roll(p.name, `heart ${i} x`) - 0.5) * 0.3
    const dz = (roll(p.name, `heart ${i} z`) - 0.5) * 0.3
    sprite.position.copy(head).add(new THREE.Vector3(dx * life, life * 0.35, dz * life))
    sprite.scale.setScalar(0.05 + 0.05 * Math.min(1, life * 3))
    sprite.material.opacity = 1 - THREE.MathUtils.smoothstep(life, 0.6, 1)
  })
}

export function dropHearts(p: Pet) {
  p.hearts.removeFromParent()
  for (const o of p.hearts.children) (o as THREE.Sprite).material.dispose()
}
