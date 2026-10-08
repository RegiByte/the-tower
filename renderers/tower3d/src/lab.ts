import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CONTRACT, MODEL_NAMES, missing, type ModelName } from './contract.ts'
import { loadModels, instance, type Models } from './models.ts'
import { block, toon } from './toon.ts'

/**
 * The model lab (lab.html): one Blender model on a stand, drawn as the renderer draws it, with what it costs (draw
 * calls, triangles) and the names it holds against its contract. `?model=<name>` picks one; `window.lab` drives it:
 *
 *   await lab.ready()      the models are parsed
 *   lab.show('desk')       put a model on the stand
 *   lab.turn(0.8)          stop the turntable at an angle, radians
 *   lab.state()            the model, its cost, its names and what its contract misses
 */

type LabState = { model: ModelName; calls: number; triangles: number; nodes: string[]; materials: string[]; missing: string[] }

declare global {
  interface Window {
    lab: { ready(): Promise<void>; show(name: ModelName): LabState; turn(angle: number): void; state(): LabState }
  }
}

const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
const scene = new THREE.Scene()
scene.background = new THREE.Color('#1b2120')
const sun = new THREE.DirectionalLight('#dfe6ff', 1.6)
sun.position.set(4, 8, 6)
scene.add(new THREE.HemisphereLight('#b9c8ff', '#2a2430', 1.9), sun, new THREE.AmbientLight('#ffffff', 0.35))
const plinth = block(2.4, 0.08, 2.4, toon('#3a4442'), 0, -0.08, 0)
scene.add(plinth)
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100)
const orbit = new OrbitControls(camera, canvas)
const stand = new THREE.Group()
scene.add(stand)

let models: Models
let shown: ModelName = 'desk'
let spinning = true

function names(root: THREE.Object3D) {
  const nodes = new Set<string>()
  const materials = new Set<string>()
  root.traverse((o) => {
    if (o.name) nodes.add(o.name)
    if (o instanceof THREE.Mesh && o.material.name) materials.add(o.material.name)
  })
  return { nodes: [...nodes].sort(), materials: [...materials].sort() }
}

/** Drawn without the plinth, so the cost is the model's alone. */
function state(): LabState {
  plinth.visible = false
  renderer.render(scene, camera)
  plinth.visible = true
  const held = names(stand)
  return { model: shown, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ...held, missing: missing(CONTRACT[shown], held) }
}

function frame(model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3()).length()
  const center = box.getCenter(new THREE.Vector3())
  camera.position.copy(center).add(new THREE.Vector3(0.9, 0.6, 1.2).multiplyScalar(size))
  orbit.target.copy(center)
  orbit.update()
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

function renderPanel() {
  const s = state()
  document.getElementById('models')!.innerHTML = MODEL_NAMES.map((n) => `<button class="${n === shown ? 'on' : ''}" data-model="${n}">${n}</button>`).join('')
  document.getElementById('facts')!.innerHTML = `
    <div class="row"><b>${s.calls}</b> draw calls · <b>${s.triangles.toLocaleString()}</b> triangles</div>
    <div class="${s.missing.length ? 'bad' : 'good'}">${s.missing.length ? `contract misses ${esc(s.missing.join(', '))}` : 'keeps its contract'}</div>
    <h3>Nodes</h3><div class="names">${s.nodes.map((n) => `<code class="${CONTRACT[shown].nodes.includes(n) ? 'kept' : ''}">${esc(n)}</code>`).join('')}</div>
    <h3>Materials</h3><div class="names">${s.materials.map((m) => `<code class="${CONTRACT[shown].materials.includes(m) ? 'kept' : ''}">${esc(m)}</code>`).join('')}</div>`
}

function show(name: ModelName) {
  if (!MODEL_NAMES.includes(name)) throw new Error(`no model "${name}": ${MODEL_NAMES.join(', ')}`)
  shown = name
  stand.clear()
  const model = instance(models[name]).root
  stand.add(model)
  frame(model)
  history.replaceState(null, '', `?model=${name}`)
  renderPanel()
  return state()
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

document.getElementById('models')!.addEventListener('click', (e) => {
  const name = (e.target as HTMLElement).closest<HTMLElement>('[data-model]')?.dataset.model
  if (name) show(name as ModelName)
})

const ready = loadModels().then((m) => {
  models = m
  show((new URLSearchParams(location.search).get('model') as ModelName | null) ?? 'desk')
})

window.lab = {
  ready: () => ready,
  show,
  turn(angle) {
    spinning = false
    stand.rotation.y = angle
  },
  state,
}

let last = performance.now()
renderer.setAnimationLoop((now) => {
  if (spinning) stand.rotation.y += ((now - last) / 1000) * 0.5
  last = now
  orbit.update()
  renderer.render(scene, camera)
})
