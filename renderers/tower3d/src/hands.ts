import * as THREE from 'three'
import { NOTE_PX, noteTexture } from './cork.ts'
import { instance, type Models } from './models.ts'
import { mug } from './party.ts'
import type { Walker } from './walker.ts'

/**
 * Your own hands in first person (models/hands.py). They live in a scene of their own, lit and seen by a camera of
 * their own at the origin looking down -z, drawn over the world after its depth is cleared, so they never poke into
 * a desk or a wall.
 */
export type Hands = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Left then right, each with where its pivot rests. */
  arms: { pivot: THREE.Object3D; side: -1 | 1; rest: THREE.Vector3 }[]
  /** The note held low in both hands: what it shows, and how far up it has come (0 below view, 1 held). */
  note: { holder: THREE.Group; face: THREE.Mesh; shown: HeldNote | undefined; wanted: boolean; k: number }
  /** The beer in the right hand, and how far up it has come (0 below view, 1 held). */
  beer: { holder: THREE.Group; wanted: boolean; k: number }
}

/** What a held note shows: its title on paper, under a pin in its floor's colour. */
export type HeldNote = { title: string; tag: string; tint: string }

/** A petting stroke's shape at one instant: how far the right hand is reached out (0–1), where along the cat's back it is (-1 head to 1 tail), how hard it presses (0–1). */
export type Stroke = { reach: number; along: number; press: number }

export function makeHands(models: Models): Hands {
  const scene = new THREE.Scene()
  const sun = new THREE.DirectionalLight('#fff1d6', 1.6)
  sun.position.set(-0.6, 1.4, 0.9)
  scene.add(new THREE.HemisphereLight('#fff5e6', '#8a7660', 1.6), new THREE.AmbientLight('#ffffff', 0.4), sun)
  const model = instance(models.hands)
  scene.add(model.root)
  const arms = (['hand_L', 'hand_R'] as const).map((name, i) => {
    const pivot = model.part(name)
    return { pivot, side: (i === 0 ? -1 : 1) as -1 | 1, rest: pivot.position.clone() }
  })
  const holder = new THREE.Group()
  holder.rotation.x = NOTE_TIP
  holder.visible = false
  const paper = new THREE.MeshBasicMaterial({ color: '#e8e2d2', toneMapped: false })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(NOTE_SIZE, (NOTE_SIZE * NOTE_PX.height) / NOTE_PX.width), new THREE.MeshBasicMaterial({ toneMapped: false }))
  const back = new THREE.Mesh(face.geometry, paper)
  back.rotation.y = Math.PI
  back.position.z = -0.002
  face.position.z = 0.002
  holder.add(face, back)
  const beer = mug()
  beer.visible = false
  scene.add(holder, beer)
  return { scene, camera: new THREE.PerspectiveCamera(60, 1, 0.01, 5), arms, note: { holder, face, shown: undefined, wanted: false, k: 0 }, beer: { holder: beer, wanted: false, k: 0 } }
}

/** A held note's width in metres, and how far it is tipped back so its front faces you. */
const NOTE_SIZE = 0.18
const NOTE_TIP = -0.35

/**
 * Puts a note in both hands, or takes it away (`undefined`). It comes up from below on the next poses and, once
 * let go, drops out of view. A note already held is drawn again only when its title, tag or tint changed.
 */
export function holdNote(h: Hands, note: HeldNote | undefined) {
  const held = h.note
  held.wanted = note !== undefined
  if (!note || (held.shown?.title === note.title && held.shown.tag === note.tag && held.shown.tint === note.tint)) return
  const face = held.face.material as THREE.MeshBasicMaterial
  face.map?.dispose()
  face.map = noteTexture(note.title, note.tag, note.tint)
  face.needsUpdate = true
  held.shown = { ...note }
}

/** Puts a beer in the right hand, or takes it away; it comes up from below, and drops out of view once let go. */
export const holdBeer = (h: Hands, held: boolean) => void (h.beer.wanted = held)

/** Where the beer sits from the right hand's palm, where a sip brings that hand, and how often and how long a sip is. */
const BEER_AT = new THREE.Vector3(-0.035, 0.05, -0.02)
const SIP_AT = new THREE.Vector3(0.12, -0.1, -0.36)
const SIP = { every: 10, takes: 1.4 }

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = THREE.MathUtils.clamp

/** Where the right hand strokes a cat seen from beside it at the pet camera, relative to the middle of the view. */
const STROKE_AT = new THREE.Vector3(0.02, -0.05, -0.42)

/**
 * Poses the hands for one frame. From how far you moved and turned between `was` and `now`: the arms swing and bob
 * with your pace, lag behind a turn and lift while you're in the air; `stroke` reaches the right one out to pet a
 * cat. Each pivot eases toward its pose, so starting, stopping and letting go of the mouse never jump.
 */
export function poseHands(h: Hands, was: Walker, now: Walker, stroke: Stroke | undefined, dt: number, t: number) {
  if (dt === 0) return
  const pace = clamp(Math.hypot(now.x - was.x, now.z - was.z) / dt / 8, 0, 1)
  const swayX = clamp((wrap(now.yaw - was.yaw) / dt) * 0.012, -0.05, 0.05)
  const swayY = clamp((-(now.pitch - was.pitch) / dt) * 0.01, -0.04, 0.04)
  const air = now.y > 0 ? 1 : 0
  const ease = Math.min(1, dt * 12)
  const step = Math.sin(t * 9)
  const held = h.note
  held.k += ((held.wanted ? 1 : 0) - held.k) * ease
  if (!held.wanted && held.k < 0.02) held.k = 0
  held.holder.visible = held.k > 0
  const carry = held.k
  const beer = h.beer
  beer.k += ((beer.wanted && !stroke ? 1 : 0) - beer.k) * ease
  if (beer.k < 0.02 && !(beer.wanted && !stroke)) beer.k = 0
  beer.holder.visible = beer.k > 0
  const cycle = t % SIP.every
  const sip = cycle < SIP.takes ? Math.sin((cycle / SIP.takes) * Math.PI) * beer.k : 0
  held.holder.position.set(swayX + step * 0.008 * pace, swayY + Math.sin(t * 1.7) * 0.004 + Math.abs(step) * 0.012 * pace + air * 0.04 - 0.13 - 0.3 * (1 - carry), -0.5)
  for (const { pivot, side, rest } of h.arms) {
    const to = rest.clone()
    to.x += swayX + step * 0.008 * pace
    to.y += swayY + Math.sin(t * 1.7) * 0.004 + Math.abs(step) * 0.012 * pace + air * 0.04
    to.z += side * step * 0.025 * pace
    const turn = new THREE.Euler(0.45 + air * 0.2, side * 0.55, side * -0.2)
    to.x -= side * 0.08 * carry
    to.z -= 0.03 * carry
    turn.z += side * 0.35 * carry
    if (stroke && side === 1) {
      const reached = STROKE_AT.clone().add(new THREE.Vector3(stroke.along * 0.08, -stroke.press * 0.025, 0))
      to.lerp(reached, stroke.reach)
      turn.set(turn.x + 0.45 * stroke.reach, turn.y - 0.3 * stroke.reach, turn.z + 0.15 * stroke.reach)
    }
    if (stroke && side === -1) to.y -= 0.07 * stroke.reach
    if (side === 1) {
      to.y += 0.03 * beer.k
      to.lerp(SIP_AT, sip)
      turn.x -= 0.35 * sip
    }
    pivot.position.lerp(to, ease)
    pivot.quaternion.slerp(new THREE.Quaternion().setFromEuler(turn), ease)
    if (side === 1) {
      beer.holder.position.copy(pivot.position).add(BEER_AT).setY(pivot.position.y + BEER_AT.y - 0.3 * (1 - beer.k))
      beer.holder.rotation.set(sip * 0.8, 0, 0)
    }
  }
}

/** Draws the hands over what the renderer last drew, with the depth cleared. */
export function drawHands(renderer: THREE.WebGLRenderer, h: Hands) {
  renderer.autoClear = false
  renderer.clearDepth()
  renderer.render(h.scene, h.camera)
  renderer.autoClear = true
}

export function fitHands(h: Hands, aspect: number) {
  h.camera.aspect = aspect
  h.camera.updateProjectionMatrix()
}
