import * as THREE from 'three'
import type { Sky } from '/lib/design.js'
import { rng } from './geo.ts'

/**
 * A few slow clouds high over the city, each a cluster of soft puffs facing the viewer, drifting along +x and wrapping
 * round a band `SPAN` wide. Where every puff is follows from sim time on the GPU (`time`), and their colour from the
 * sky's look (`tint`): white by day, pink at dusk, grey-blue at night. One instanced mesh, unlit and unfogged.
 */

const CLOUDS = 7
const PUFFS = 9
/** The band the clouds drift through (m): x wraps over `span`, z and y within their ranges. */
const BAND = { span: 900, z: [-340, 340], y: [150, 210] }
/** The light a cloud's colour takes from the horizon's, how much of it, and how much a full night darkens it. */
const TINT = { light: new THREE.Color('#c8d4f0'), share: 0.45, night: 0.75 }
/** Drift speed (m/s), a puff's radius (m), how much wider than tall it is, and how opaque its middle is. */
const CLOUD = { speed: [1.2, 2.4], radius: [18, 34], stretch: [2, 0.7], alpha: 0.32 }

const vertexShader = `
attribute vec4 puff;
attribute float speed;
uniform float time;
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec3 at = puff.xyz;
  at.x = mod( at.x + speed * time + ${BAND.span / 2}.0, ${BAND.span}.0 ) - ${BAND.span / 2}.0;
  vec4 view = viewMatrix * vec4( at, 1.0 );
  view.xy += position.xy * vec2( ${CLOUD.stretch[0]}, ${CLOUD.stretch[1]} ) * puff.w;
  gl_Position = projectionMatrix * view;
}`

const fragmentShader = `
uniform vec3 tint;
uniform float alpha;
varying vec2 vUv;
void main() {
  float d = dot( vUv, vUv );
  gl_FragColor = vec4( tint, alpha * exp( -3.0 * d ) * ( 1.0 - d ) * step( d, 1.0 ) );
  #include <colorspace_fragment>
}`

const uniforms = { time: { value: 0 }, tint: { value: new THREE.Color() }, alpha: { value: CLOUD.alpha } }

/** The clouds' puffs: centre and radius, and drift speed, each cloud from a seed of its own. */
function puffs() {
  const puff: number[] = []
  const speed: number[] = []
  for (let c = 0; c < CLOUDS; c++) {
    const r = rng(c * 4099 + 11)
    const centre = [(r() - 0.5) * BAND.span, BAND.y[0] + r() * (BAND.y[1] - BAND.y[0]), BAND.z[0] + r() * (BAND.z[1] - BAND.z[0])]
    const drift = CLOUD.speed[0] + r() * (CLOUD.speed[1] - CLOUD.speed[0])
    for (let p = 0; p < PUFFS; p++) {
      const radius = CLOUD.radius[0] + r() * (CLOUD.radius[1] - CLOUD.radius[0])
      puff.push(centre[0] + (r() - 0.5) * 120, centre[1] + (r() - 0.3) * 10, centre[2] + (r() - 0.5) * 50, radius)
      speed.push(drift)
    }
  }
  return { puff, speed }
}

/** The clouds: `tick` drifts them to sim time `t` (seconds), `tint` colours them under the sky's look at the hour. */
export function clouds() {
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(2, 2) as unknown as THREE.InstancedBufferGeometry)
  const { puff, speed } = puffs()
  geo.setAttribute('puff', new THREE.InstancedBufferAttribute(new Float32Array(puff), 4))
  geo.setAttribute('speed', new THREE.InstancedBufferAttribute(new Float32Array(speed), 1))
  geo.instanceCount = speed.length
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false })
  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false
  const tick = (t: number) => (uniforms.time.value = t)
  const tint = (look: Sky) => uniforms.tint.value.set(look.horizon).lerp(TINT.light, TINT.share).multiplyScalar(1 - TINT.night * look.stars)
  return { mesh, tick, tint }
}
