import * as THREE from 'three'
import type { Sky } from '../../../../src/shared/design.ts'

/**
 * A light rig that follows the clock, drawn while the lighting setting is on (setting.ts).
 *
 * - The key is the sun: it rises in the east (−x), stands in the south (+z) at half past noon and sets in the west,
 *   warm when low, near white when high. At night it is a dim, cool moon. It casts over everything the building is
 *   made of, slabs and ceilings included, so indoors it only lands where it comes in through the glass.
 * - The fill is the sky: a cool hemisphere, tinted by the horizon, never darker than a clear night's.
 * - Interiors have their own light from the ceiling: every lit material adds it inside the building's volume (under
 *   the party's lights over the roof, within the plan), banded by the toon ramp by how much a face looks up. The city
 *   never sees it. It pools under each ceiling panel, from the grid the panels hang on.
 */

/** Hours the sun is up, and its highest elevation (radians). */
const DAY = { rise: 6, set: 18.9, top: 1.0 }
const SUN = { low: new THREE.Color('#ffa860'), high: new THREE.Color('#fff2e0'), intensity: 3.2 }
const MOON = { color: new THREE.Color('#9fb4ff'), intensity: 1.1, direction: new THREE.Vector3(0.45, 0.8, -0.4).normalize() }
const SKY_FILL = { day: 1.5, night: 1.4, color: new THREE.Color('#b8c6ff'), tint: 0.3, ground: new THREE.Color('#3a3036') }
/** The interior's ceiling light: as strong at every hour, so a room never gets darker than its lamps. */
const INTERIOR = { color: new THREE.Color('#fff0dc'), strength: 1.7 }
/** How high over the roof the building's own light reaches (m): the party's lights, so the roof reads at night as well as a room. */
const ROOF_LIT = 8

/** Shadow map texels, how far past the building the sun's view reaches (m), and frames between two redraws of the map (at once when the view or the sun moves). */
const SHADOW = { size: 2048, margin: 6, every: 2 }

/**
 * The toon ramp under the rig, by the cosine between a face and its light: turned away (below −0.15) the dark band,
 * grazing the middle one, facing it (over 0.4) the lit one. Wider and darker than the default's thirds, so a box under
 * a low sun shows all three.
 */
const BANDS = [{ until: -0.15, value: 0.32 }, { until: 0.4, value: 0.68 }, { until: 1, value: 1 }]

export function rigRamp() {
  const n = 40
  const data = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    const cos = ((i + 0.5) / n) * 2 - 1
    const v = Math.round(BANDS.find((b) => cos <= b.until)!.value * 255)
    data.set([v, v, v, 255], i * 4)
  }
  return new THREE.DataTexture(data, n, 1, THREE.RGBAFormat)
}

/** Where the sun is at `hours`, toward it, and how much of the day's light it gives (0 under the horizon). */
export function sunAt(hours: number) {
  const k = (hours - DAY.rise) / (DAY.set - DAY.rise)
  const elevation = DAY.top * Math.sin(Math.PI * k)
  const azimuth = Math.PI * k
  const direction = new THREE.Vector3(-Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation))
  return { direction, elevation, up: THREE.MathUtils.smoothstep(elevation, -0.02, 0.12) }
}

const uniforms = {
  interiorMin: { value: new THREE.Vector3() },
  interiorMax: { value: new THREE.Vector3() },
  interiorLight: { value: new THREE.Color() },
  panelGrid: { value: new THREE.Vector4() },
  panelCount: { value: new THREE.Vector2() },
}

/**
 * Under each ceiling panel a pool: the interior's light is `low` of its strength between panels and rises to `high`
 * under one, over an ellipse `reach` m across (x, z), the panels being long in x.
 */
const POOL = { low: 0.7, high: 1.45, reach: [3.2, 2.4] }

/** Adds the interior's ceiling light to a lit material's shader: a fill inside the building's box, banded like the sun. */
function lightInside(m: THREE.Material) {
  const own = m.onBeforeCompile.bind(m)
  const ownKey = m.customProgramCacheKey()
  m.onBeforeCompile = (shader, renderer) => {
    own(shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vInterior;\nvoid main() {')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
  vec4 interiorAt = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    interiorAt = batchingMatrix * interiorAt;
  #endif
  #ifdef USE_INSTANCING
    interiorAt = instanceMatrix * interiorAt;
  #endif
  vInterior = ( modelMatrix * interiorAt ).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec3 vInterior;\nuniform vec3 interiorMin;\nuniform vec3 interiorMax;\nuniform vec3 interiorLight;\nuniform vec4 panelGrid;\nuniform vec2 panelCount;\nvoid main() {')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
  vec3 inside = step( interiorMin, vInterior ) * step( vInterior, interiorMax );
  float up = dot( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );
  #ifdef USE_GRADIENTMAP
    float band = texture2D( gradientMap, vec2( up * 0.5 + 0.5, 0.0 ) ).r;
  #else
    float band = 0.75 + 0.25 * up;
  #endif
  vec2 panel = panelGrid.xz + clamp( floor( ( vInterior.xz - panelGrid.xz ) / panelGrid.yw + 0.5 ), vec2( 0.0 ), panelCount - 1.0 ) * panelGrid.yw;
  vec2 offset = ( vInterior.xz - panel ) / vec2( ${POOL.reach[0] / 2}, ${POOL.reach[1] / 2} );
  float pool = mix( ${POOL.low.toFixed(3)}, ${POOL.high.toFixed(3)}, smoothstep( 0.2, 0.8, exp( -dot( offset, offset ) ) ) );
  reflectedLight.indirectDiffuse += inside.x * inside.y * inside.z * band * pool * interiorLight * material.diffuseColor;`,
      )
  }
  m.customProgramCacheKey = () => `interior|${ownKey}`
  m.needsUpdate = true
}

const lit = (m: THREE.Material) => m instanceof THREE.MeshToonMaterial || m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial || m instanceof THREE.MeshStandardMaterial

/** Things wider than this (m) are the city, the ground and the roads: they take the sun's shadows but cast none. */
const CITY = 80

/** Every new mesh: lit and opaque, it takes shadows and casts them unless it is the city or a material of it is `shadowless`; its material lights inside. */
function enlist(scene: THREE.Object3D) {
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.rigged) return
    o.userData.rigged = true
    if (o.userData.post) return
    const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material]
    const opaque = mats.every((m) => lit(m) && !m.transparent)
    for (const m of mats) if (lit(m) && !m.userData.interior) (m.userData.interior = true), lightInside(m)
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere()
    const across = 2 * o.geometry.boundingSphere!.radius * o.getWorldScale(new THREE.Vector3()).x
    o.receiveShadow = opaque
    o.castShadow = opaque && across < CITY && !mats.some((m) => m.userData.shadowless)
  })
}

type Lights = { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; ambient: THREE.AmbientLight }
let rig: (Lights & { toward: THREE.Vector3; renderer: THREE.WebGLRenderer; frame: number; seen: string }) | undefined

/** Takes over the outside's lights and the renderer's shadows. */
export function riseRig(scene: THREE.Scene, renderer: THREE.WebGLRenderer, lights: Lights) {
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  const { sun } = lights
  sun.castShadow = true
  sun.shadow.mapSize.set(SHADOW.size, SHADOW.size)
  sun.shadow.bias = -0.0003
  sun.shadow.normalBias = 0.03
  scene.add(sun.target)
  lights.ambient.intensity = 0
  rig = { ...lights, toward: new THREE.Vector3(0, 1, 0), renderer, frame: 0, seen: '' }
}

/** Sets the rig to `hours`, under `sky`. */
export function rigHour(hours: number, sky: Sky) {
  const { hemi, sun, toward } = rig!
  const day = sunAt(hours)
  const moon = 1 - THREE.MathUtils.smoothstep(day.elevation, -0.06, 0.04)
  const sunPart = SUN.intensity * day.up
  const moonPart = MOON.intensity * moon
  if (sunPart >= moonPart) {
    toward.copy(day.direction)
    sun.color.copy(SUN.low).lerp(SUN.high, THREE.MathUtils.smoothstep(day.elevation, 0.05, 0.7))
    sun.intensity = sunPart
  } else {
    toward.copy(MOON.direction)
    sun.color.copy(MOON.color)
    sun.intensity = moonPart
  }
  hemi.color.copy(SKY_FILL.color).lerp(new THREE.Color(sky.horizon), SKY_FILL.tint)
  hemi.groundColor.copy(SKY_FILL.ground)
  hemi.intensity = THREE.MathUtils.lerp(SKY_FILL.night, SKY_FILL.day, day.up)
  uniforms.interiorLight.value.copy(INTERIOR.color).multiplyScalar(INTERIOR.strength)
}

/**
 * Each frame: enlists what is new, fits the sun's shadow to what is seen (your level while walking, the whole building
 * from outside) and sets the interior's box to the building.
 */
export function rigFrame(scene: THREE.Scene, at: { width: number; depth: number; top: number; y: number; height: number; whole: boolean; panels: { x0: number; x1: number; dx: number; z0: number; z1: number; dz: number } }) {
  const { sun, toward } = rig!
  enlist(scene)
  uniforms.interiorMin.value.set(-at.width / 2 + 0.1, -0.5, -at.depth / 2 + 0.1)
  uniforms.interiorMax.value.set(at.width / 2 - 0.1, at.top + ROOF_LIT, at.depth / 2 - 0.1)
  const { x0, x1, dx, z0, z1, dz } = at.panels
  uniforms.panelGrid.value.set(x0, dx, z0, dz)
  uniforms.panelCount.value.set(Math.floor((x1 - x0) / dx + 1e-6) + 1, Math.floor((z1 - z0) / dz + 1e-6) + 1)
  const [low, high] = at.whole ? [0, at.top + 8] : [at.y, at.y + at.height]
  const center = new THREE.Vector3(0, (low + high) / 2, 0)
  const reach = Math.hypot(at.width / 2, at.depth / 2, (high - low) / 2) + SHADOW.margin
  sun.target.position.copy(center)
  sun.position.copy(center).addScaledVector(toward, reach + 60)
  sun.target.updateMatrixWorld()
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 2 * reach + 120 })
  sun.shadow.camera.updateProjectionMatrix()
  const seen = `${low}|${high}|${toward.toArray()}`
  rig!.renderer.shadowMap.needsUpdate = rig!.frame++ % SHADOW.every === 0 || seen !== rig!.seen
  rig!.seen = seen
}

/** Turns the interior's light off until the answer is called: for a pass that draws only what glows. */
export function interiorOff() {
  const was = uniforms.interiorLight.value.clone()
  uniforms.interiorLight.value.setScalar(0)
  return () => uniforms.interiorLight.value.copy(was)
}
