import * as THREE from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { skyAt } from '/lib/design.js'
import { wallNow } from '../clock.ts'
import { interiorOff } from './rig.ts'

/**
 * The night's bloom, drawn while the lighting setting is on (setting.ts): over the scene rendered to the canvas as
 * ever, tone mapped, it draws the scene again with every light off and only what is marked to glow lit, blooms it over
 * three's mip chain and adds it to the canvas, as strong as the night is dark. It only ever adds light to the frame
 * ACES made, so what is drawn `toneMapped: false` (screens, neon) keeps its colour.
 */

const quad = new FullScreenQuad()
const size = new THREE.Vector2()

/** Bloom at full night: how strong, how wide, and the glow (linear, before tone mapping) a pixel blooms from. */
const BLOOM = { strength: 0.6, radius: 0.45, threshold: 0.15 }

const add = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse;\nvarying vec2 vUv;\nvoid main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }',
  depthTest: false,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
})
/** Frames between two glow passes: the bloom is soft enough that a frame-old one doesn't show. */
const GLOW_EVERY = 2
let glow: { pass: UnrealBloomPass; lit: THREE.WebGLRenderTarget; frame: number } | undefined

/** How dark the sky is at the wall clock's hour: its stars, 0 by day, 1 at full night. */
function nightNow() {
  const now = new Date(wallNow())
  return skyAt(now.getHours() + now.getMinutes() / 60).stars
}

const black = new THREE.MeshBasicMaterial({ color: 0x000000 })
const blackBothSides = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })

const tagged = (m: THREE.Material | THREE.Material[]) => (Array.isArray(m) ? m : [m]).some((x) => x.userData.glow)

/**
 * Leaves lit only what is marked to glow (`glows` in toon.ts): every other opaque mesh draws black, to occlude, and
 * every other transparent mesh, label, line or point is hidden. Answers how to undo it.
 */
function onlyGlows(scene: THREE.Scene) {
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
  const hidden: THREE.Object3D[] = []
  scene.traverseVisible((o) => {
    const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (!material || tagged(material)) return
    const first = Array.isArray(material) ? material[0] : material
    if (o instanceof THREE.Mesh && !first.transparent) {
      swapped.push([o, material])
      o.material = first.side === THREE.FrontSide ? black : blackBothSides
    } else hidden.push(o)
  })
  for (const o of hidden) o.visible = false
  return () => {
    for (const [o, m] of swapped) o.material = m
    for (const o of hidden) o.visible = true
  }
}

/**
 * Draws `scene` into `target` with every light off and only what glows left lit: screens, neon, lamps, signs, lit
 * windows and the kit's emissive parts, occluded by everything else.
 */
function glowing(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget) {
  const lights: [THREE.Light, number][] = []
  scene.traverse((o) => o instanceof THREE.Light && lights.push([o, o.intensity]))
  for (const [l] of lights) l.intensity = 0
  const interior = interiorOff()
  const restore = onlyGlows(scene)
  const fog = scene.fog as THREE.Fog | null
  const fogColor = fog?.color.clone()
  fog?.color.setScalar(0)
  const background = scene.background
  scene.background = null
  renderer.setRenderTarget(target)
  renderer.setClearColor(0x000000, 1)
  renderer.clear()
  renderer.render(scene, camera)
  scene.background = background
  if (fog) fog.color.copy(fogColor!)
  restore()
  interior()
  for (const [l, i] of lights) l.intensity = i
}

/** Adds the night's glow to the canvas, as strong as the night is dark; nothing by day. */
export function bloom(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const night = nightNow()
  if (night < 0.05) return
  renderer.getDrawingBufferSize(size)
  const half = size.clone().multiplyScalar(0.5).floor()
  if (!glow || glow.lit.width !== half.x || glow.lit.height !== half.y) {
    glow = { pass: new UnrealBloomPass(half, BLOOM.strength, BLOOM.radius, BLOOM.threshold), lit: new THREE.WebGLRenderTarget(half.x, half.y, { type: THREE.HalfFloatType }), frame: 0 }
  }
  const { pass, lit } = glow
  const clear = renderer.getClearColor(new THREE.Color())
  const alpha = renderer.getClearAlpha()
  if (glow.frame++ % GLOW_EVERY === 0) {
    glowing(renderer, scene, camera, lit)
    pass.strength = BLOOM.strength * night
    pass.render(renderer, null as never, lit, 0, false)
  }
  add.uniforms.tDiffuse.value = pass.renderTargetsHorizontal[0].texture
  quad.material = add
  renderer.setRenderTarget(null)
  renderer.setClearColor(clear, alpha)
  const autoClear = renderer.autoClear
  renderer.autoClear = false
  quad.render(renderer)
  renderer.autoClear = autoClear
}
