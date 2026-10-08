import * as THREE from 'three'
import { random } from './random.ts'

/**
 * Fireworks: a rocket climbs from the roof, bursts into sparks in its color, and the sparks fall and fade. Each
 * firework is its own Points, gone when its sparks are.
 */

const CLIMB = 1.3
const SPEED = 14
const SPARKS = 160
const LIFE = 2.4
const GRAVITY = 7

type Firework = { points: THREE.Points; velocities: Float32Array; age: number; burst: boolean }

const live: Firework[] = []

function sparkTexture() {
  const cv = Object.assign(document.createElement('canvas'), { width: 32, height: 32 })
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.25, '#ffffffcc')
  grad.addColorStop(1, '#ffffff00')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(cv)
}
const SPARK = sparkTexture()

export function launch(scene: THREE.Scene, from: THREE.Vector3, color: THREE.ColorRepresentation) {
  const positions = new Float32Array(SPARKS * 3)
  for (let i = 0; i < SPARKS; i++) positions.set([from.x, from.y, from.z], i * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), size: 0.4, map: SPARK, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)
  live.push({ points, velocities: new Float32Array(SPARKS * 3), age: 0, burst: false })
}

const sphere = (v: Float32Array, i: number) => {
  const u = random() * 2 - 1
  const a = random() * Math.PI * 2
  const speed = 7 + random() * 4
  const r = Math.sqrt(1 - u * u)
  v.set([Math.cos(a) * r * speed, u * speed, Math.sin(a) * r * speed], i * 3)
}

export function tickFireworks(scene: THREE.Scene, dt: number) {
  for (const f of [...live]) {
    f.age += dt
    const pos = f.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const p = pos.array as Float32Array
    const material = f.points.material as THREE.PointsMaterial
    if (!f.burst) {
      for (let i = 0; i < SPARKS; i++) p[i * 3 + 1] += SPEED * dt
      material.size = 0.4
      if (f.age >= CLIMB) {
        f.burst = true
        f.age = 0
        for (let i = 0; i < SPARKS; i++) sphere(f.velocities, i)
      }
    } else {
      const drag = Math.pow(0.35, dt)
      for (let i = 0; i < SPARKS; i++) {
        f.velocities[i * 3] *= drag
        f.velocities[i * 3 + 1] = f.velocities[i * 3 + 1] * drag - GRAVITY * dt
        f.velocities[i * 3 + 2] *= drag
        p[i * 3] += f.velocities[i * 3] * dt
        p[i * 3 + 1] += f.velocities[i * 3 + 1] * dt
        p[i * 3 + 2] += f.velocities[i * 3 + 2] * dt
      }
      material.size = 0.5
      material.opacity = Math.max(0, 1 - f.age / LIFE)
      if (f.age >= LIFE) {
        scene.remove(f.points)
        f.points.geometry.dispose()
        material.dispose()
        live.splice(live.indexOf(f), 1)
      }
    }
    pos.needsUpdate = true
  }
}
