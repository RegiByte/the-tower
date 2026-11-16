import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { wallNow } from './clock.ts'
import { skyAt } from '/lib/design.js'
import { glowKit } from './kit.ts'
import { outside } from './outside.ts'

/**
 * The page's one renderer, scene and camera on its canvas, the sky outside following the wall clock, and the orbit used
 * from outside. `lit` is the lighting setting (light/setting.ts).
 */
export function startStage(lit: boolean) {
  const canvas = document.getElementById('scene') as HTMLCanvasElement
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  const city = outside(scene, renderer, lit)
  const tellTime = () => {
    const now = new Date(wallNow())
    const hours = now.getHours() + now.getMinutes() / 60
    city.setHour(hours)
    glowKit(skyAt(hours).windows)
  }
  tellTime()
  const telling = setInterval(tellTime, 60_000)
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900)
  const orbit = new OrbitControls(camera, canvas)
  orbit.enabled = false
  orbit.enableDamping = true
  orbit.maxPolarAngle = Math.PI * 0.49
  return {
    canvas,
    renderer,
    scene,
    camera,
    orbit,
    /** Moves the traffic and the plane outside to sim time `t` (seconds). */
    tickOutside: city.tick,
    /** Puts the plane on the airfield. */
    flyPlane: city.fly,
    stop: () => (clearInterval(telling), orbit.dispose(), renderer.dispose()),
  }
}

export type Stage = ReturnType<typeof startStage>
