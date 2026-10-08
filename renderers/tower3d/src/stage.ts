import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { wallNow } from './clock.ts'
import { listen } from './input.ts'
import { skyAt } from '../../../src/shared/design.ts'
import { glowKit } from './kit.ts'
import { outside } from './outside.ts'

/** The page's one renderer, scene and camera, the sky outside following the wall clock, and the orbit used from outside. */
export const canvas = document.getElementById('scene') as HTMLCanvasElement
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
export const scene = new THREE.Scene()
const city = outside(scene)
/** Moves the traffic and the plane outside to sim time `t` (seconds). */
export const tickOutside = city.tick
/** Puts the plane on the airfield. */
export const flyPlane = city.fly
const tellTime = () => {
  const now = new Date(wallNow())
  const hours = now.getHours() + now.getMinutes() / 60
  city.setHour(hours)
  glowKit(skyAt(hours).windows)
}
tellTime()
setInterval(tellTime, 60_000)
export const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900)
export const orbit = new OrbitControls(camera, canvas)
orbit.enabled = false
orbit.enableDamping = true
orbit.maxPolarAngle = Math.PI * 0.49
listen(canvas)
