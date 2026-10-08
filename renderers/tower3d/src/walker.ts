import * as THREE from 'three'
import { step } from './collide.ts'
import type { Move, Turn } from './input.ts'
import { EYE, type Box } from './layout.ts'

/**
 * You, walking: where you stand, which way you face (`yaw` 0 faces +z), the level you're on, and how high off its
 * floor you are mid-jump (`y`, rising at `vy`). `walk`, `look`, `jump` and `fall` turn a move and a turn into the
 * next walker.
 */
export type Walker = { x: number; z: number; yaw: number; pitch: number; level: number; y: number; vy: number }

const WALK = 4.2
const RUN = 8
const LOOK = 0.0022
const PITCH = 1.45
const JUMP = 5.2
const GRAVITY = 16

export const look = (w: Walker, t: Turn): Walker =>
  t.x || t.y ? { ...w, yaw: w.yaw - t.x * LOOK, pitch: THREE.MathUtils.clamp(w.pitch - t.y * LOOK, -PITCH, PITCH) } : w

export function walk(w: Walker, m: Move, dt: number, boxes: Box[]): Walker {
  if (!m.ahead && !m.side) return w
  const speed = (m.run ? RUN : WALK) * dt
  const len = Math.hypot(m.ahead, m.side)
  const fx = Math.sin(w.yaw)
  const fz = Math.cos(w.yaw)
  const dx = ((m.ahead * fx - m.side * fz) / len) * speed
  const dz = ((m.ahead * fz + m.side * fx) / len) * speed
  return { ...w, ...step(boxes, w.x, w.z, dx, dz) }
}

/** Leaves the floor on a jump, if standing on it. */
export const jump = (w: Walker, m: Move): Walker => (w.y === 0 && m.jump ? { ...w, vy: JUMP } : w)

/** Gravity, until the walker lands. */
export function fall(w: Walker, dt: number): Walker {
  if (w.y === 0 && w.vy === 0) return w
  const vy = w.vy - GRAVITY * dt
  const y = w.y + vy * dt
  return y > 0 ? { ...w, y, vy } : { ...w, y: 0, vy: 0 }
}

/** The yaw and pitch that face `at` from eyes at `from`. */
export function facing(from: THREE.Vector3, at: THREE.Vector3) {
  const d = at.clone().sub(from)
  return { yaw: Math.atan2(d.x, d.z), pitch: THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -PITCH, PITCH) }
}

/** Puts the camera at the walker's eyes, `floor` being the height of the level under its feet. */
export function aim(camera: THREE.Camera, w: Walker, floor: number) {
  camera.position.set(w.x, floor + w.y + EYE, w.z)
  camera.rotation.set(w.pitch, w.yaw + Math.PI, 0, 'YXZ')
}
