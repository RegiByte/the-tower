import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { fit, PACKS, type Catalog } from './catalog.ts'
import { loadAtlases } from './atlas.ts'
import { build, cameraFor, type Assets, type Built } from './draw.ts'
import { find } from './find.ts'
import { gallery, PACK_COLORS } from './gallery.ts'
import { loadMeshes } from './meshes.ts'
import { flatten, parseScene, type Camera, type Flat, type Scene, type Theme } from './scene.ts'

/**
 * The KayKit playground: any scene drawn and flown through, the whole collection (the gallery) by default. A human
 * drives it with the panel and the mouse; an agent through `window.kaykit`, which the CLI (`npm run tool:kaykit`)
 * calls in headless Chrome. Both see the same drawing.
 *
 *   await kaykit.ready()                         the catalog, meshes and atlases are loaded
 *   await kaykit.show(scene, name?)              draw a scene document (its prefabs fetched relative to `name`),
 *                                                or 'gallery'; answers state()
 *   await kaykit.dress({ theme?, light? })       lay a theme and light over the scene's own, as the panel does
 *   kaykit.look(camera)                          move the view: { pos, look, fov? }, { view: 'iso' | … }, or a camera
 *                                                the scene names
 *   kaykit.shot({ camera?, w?, h? })             the view (or `camera`) as a PNG data URL, w × h pixels
 *   kaykit.state()                               the scene's title, counts, draw calls, bounds and the view
 *
 * `?scene=<path>` opens a scene file beside the page (scenes/desk_states.json); `#<id>` frames that model.
 */

type State = { title: string; cameras: string[]; items: number; triangles: number; calls: number; bounds: { min: number[]; max: number[] }; view: { pos: number[]; look: number[] } }

declare global {
  interface Window {
    kaykit: {
      ready(): Promise<void>
      show(scene: Scene | 'gallery', name?: string): Promise<State>
      dress(over: { theme?: Theme; light?: 'day' | 'night' }): Promise<State>
      look(camera: Camera | string): void
      shot(opts?: { camera?: Camera | string; w?: number; h?: number }): string
      state(): State
    }
  }
}

const OUT = 'out'
const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 5000)
const controls = new MapControls(camera, canvas)
controls.enableDamping = true
controls.screenSpacePanning = false
controls.maxPolarAngle = Math.PI / 2 - 0.02

let assets: Assets
/** What is drawn: the document as given, the theme and light the panel laid over it, and the scene built from both. */
let doc: { scene: Scene; name: string } = { scene: {}, name: 'gallery' }
let override: { theme: Theme; light?: 'day' | 'night' } = { theme: {} }
let flat: Flat
let built: Built
let picked: THREE.Box3Helper | undefined

const ready = (async () => {
  const catalog = (await fetch(`${OUT}/catalog.json`).then((r) => r.json())) as Catalog
  const [meshes, atlases] = await Promise.all([loadMeshes(OUT), loadAtlases(OUT, catalog.packs), document.fonts.ready])
  assets = { catalog, byId: new Map(catalog.models.map((m) => [m.id, m])), meshes, atlases }
})()

const readRelative = async (ref: string, from: string) => {
  const url = new URL(ref, new URL(from, location.href)).href
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${from}: no scene at ${ref}`)
  return { scene: parseScene(await r.json(), url), name: url }
}

/** The document with the panel's theme and light laid over it. */
const effective = (): Scene => ({
  ...doc.scene,
  light: override.light ?? doc.scene.light,
  theme: {
    atlas: { ...doc.scene.theme?.atlas, ...override.theme.atlas },
    swaps: { ...doc.scene.theme?.swaps, ...override.theme.swaps },
  },
})

/** Each draw is numbered: one that a later draw overtook while it fetched its prefabs is dropped. */
let draws = 0

async function redraw() {
  const mine = ++draws
  const drawn = await flatten(effective(), doc.name, readRelative)
  if (mine !== draws) return false
  flat = drawn
  const next = build(flat, assets)
  built?.scene.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.BatchedMesh) o.geometry.dispose()
  })
  built = next
  picked = undefined
  panel()
  return true
}

const resolveCamera = (c: Camera | string): Camera => {
  if (typeof c !== 'string') return c
  const named = flat.cameras?.[c]
  if (!named) throw new Error(`the scene has no camera "${c}" (it has: ${Object.keys(flat.cameras ?? {}).join(', ') || 'none'})`)
  return named
}

function look(c: Camera | string) {
  const cam = cameraFor(resolveCamera(c), built.bounds, canvas.clientWidth / canvas.clientHeight)
  camera.position.copy(cam.position)
  camera.fov = cam.fov
  camera.updateProjectionMatrix()
  const spec = resolveCamera(c)
  const box = 'frame' in spec && spec.frame ? new THREE.Box3(new THREE.Vector3(...spec.frame.min), new THREE.Vector3(...spec.frame.max)) : built.bounds
  controls.target.copy('look' in spec ? new THREE.Vector3(...spec.look) : box.getCenter(new THREE.Vector3()))
  controls.update()
}

async function show(scene: Scene | 'gallery', name = 'gallery') {
  await ready
  doc = scene === 'gallery' ? { scene: gallery(assets.catalog), name } : { scene: parseScene(scene, name), name }
  override = { theme: {} }
  if (await redraw()) look(flat.cameras?.overview ?? Object.values(flat.cameras ?? {})[0] ?? { view: 'iso' })
  return state()
}

function shot({ camera: c, w = 1600, h = 1000 }: { camera?: Camera | string; w?: number; h?: number } = {}) {
  const cam = c === undefined ? camera.clone() : cameraFor(resolveCamera(c), built.bounds, w / h)
  cam.aspect = w / h
  cam.updateProjectionMatrix()
  const size = renderer.getSize(new THREE.Vector2()), ratio = renderer.getPixelRatio()
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  if (picked) picked.visible = false
  renderer.render(built.scene, cam)
  const url = renderer.domElement.toDataURL('image/png')
  if (picked) picked.visible = true
  renderer.setPixelRatio(ratio)
  renderer.setSize(size.x, size.y, false)
  return url
}

function state(): State {
  renderer.render(built.scene, camera)
  return {
    title: flat.title ?? doc.name,
    cameras: Object.keys(flat.cameras ?? {}),
    items: flat.items.length,
    triangles: built.triangles,
    calls: renderer.info.render.calls,
    bounds: { min: built.bounds.min.toArray(), max: built.bounds.max.toArray() },
    view: { pos: camera.position.toArray().map(r2), look: controls.target.toArray().map(r2) },
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100

async function dress(over: { theme?: Theme; light?: 'day' | 'night' }) {
  override = { theme: over.theme ?? override.theme, light: over.light ?? override.light }
  await redraw()
  return state()
}

/** Set once the door is asked to show something: the page's own first scene then stays away. */
let driven = false

window.kaykit = { ready: () => ready, show: (scene, name) => ((driven = true), show(scene, name)), dress, look, shot, state }

function resize() {
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  camera.aspect = canvas.clientWidth / canvas.clientHeight
  camera.updateProjectionMatrix()
}

const keys = new Set<string>()
addEventListener('keydown', (e) => !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) && keys.add(e.code))
addEventListener('keyup', (e) => keys.delete(e.code))
addEventListener('blur', () => keys.clear())

/** WASD slides the view over the floor, Q and E lower and raise it; shift runs. Speed grows with height. */
function fly(dt: number) {
  const ahead = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
  const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
  const up = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0)
  if (!ahead && !side && !up) return
  const speed = Math.max(2, camera.position.y) * (keys.has('ShiftLeft') ? 3 : 1) * dt
  const fwd = new THREE.Vector3()
  camera.getWorldDirection(fwd)
  fwd.y = 0
  fwd.normalize()
  const right = new THREE.Vector3().crossVectors(fwd, camera.up)
  const move = fwd.multiplyScalar(ahead * speed).add(right.multiplyScalar(side * speed)).add(new THREE.Vector3(0, up * speed, 0))
  camera.position.add(move)
  controls.target.add(move)
}

let last = performance.now()
renderer.setAnimationLoop((now) => {
  if (!built) return
  if (canvas.width !== Math.floor(canvas.clientWidth * renderer.getPixelRatio())) resize()
  fly(Math.min(0.1, (now - last) / 1000))
  last = now
  controls.update()
  renderer.render(built.scene, camera)
})

/** Click without dragging: the item under the pointer, outlined, its facts in the panel. */
let down = { x: 0, y: 0 }
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }))
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return
  const rect = canvas.getBoundingClientRect()
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera)
  select(built.pick(ray))
})

function boundsOf(i: number) {
  const item = flat.items[i]
  const f = fit(assets.byId.get(item.model)!)
  const box = new THREE.Box3(new THREE.Vector3(...f.min), new THREE.Vector3(...f.max))
  const s = Array.isArray(item.scale) ? item.scale : [item.scale ?? 1, item.scale ?? 1, item.scale ?? 1]
  return box.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...item.at), new THREE.Quaternion().setFromAxisAngle(camera.up, ((item.turn ?? 0) * Math.PI) / 180), new THREE.Vector3(...s)))
}

let selected: number | undefined
function select(i: number | undefined) {
  if (picked) built.scene.remove(picked)
  selected = i
  picked = undefined
  if (i !== undefined) {
    picked = new THREE.Box3Helper(boundsOf(i), '#e5484d')
    built.scene.add(picked)
  }
  panel()
}

function frameItem(i: number) {
  const box = boundsOf(i)
  const c = box.getCenter(new THREE.Vector3())
  const r = Math.max(box.getSize(new THREE.Vector3()).length(), 1)
  controls.target.copy(c)
  camera.position.copy(c).add(new THREE.Vector3(0, r * 0.9, r * 1.6))
  controls.update()
  select(i)
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag)
  Object.assign(e, props)
  e.append(...kids)
  return e
}

let scenes: string[] = []
let query = ''

function panel() {
  const root = document.getElementById('panel')!
  const focused = document.activeElement?.id
  root.replaceChildren(
    el('h1', {}, 'KayKit playground'),
    el('div', { className: 'meta' }, `${flat.title ?? doc.name} · ${flat.items.length} models · ${built.triangles.toLocaleString()} ▲`),
    sceneRow(),
    el('h3', {}, 'Find'),
    searchBox(),
    results(),
    el('h3', {}, 'Theme'),
    themeRows(),
    el('h3', {}, 'Selected'),
    info(),
    el('div', { className: 'row' }, el('button', { onclick: () => copy(JSON.stringify(effective(), null, 1)) }, 'copy scene JSON')),
  )
  if (focused) (document.getElementById(focused) as HTMLInputElement | null)?.focus()
}

function sceneRow() {
  const sel = el('select', { id: 'pick-scene' }, el('option', { value: 'gallery' }, 'gallery: every model'), ...scenes.map((s) => el('option', { value: `scenes/${s}` }, s)))
  sel.value = doc.name.endsWith('gallery') ? 'gallery' : `scenes/${doc.name.split('/scenes/').at(-1)}`
  sel.onchange = () => open(sel.value)
  const night = el('button', { onclick: () => ((override.light = flat.light === 'night' ? 'day' : 'night'), redraw()) }, flat.light === 'night' ? '☀ day' : '☾ night')
  return el('div', { className: 'row' }, sel, night)
}

function searchBox() {
  const input = el('input', { id: 'search', type: 'search', placeholder: 'mug, desk large, wall window…', value: query })
  input.oninput = () => {
    query = input.value
    panel()
  }
  return input
}

function results() {
  if (!query.trim()) return el('div', { className: 'meta' }, 'type to search the catalog; click a model to fly to it')
  const hits = find(assets.catalog, { text: query })
  const box = el('div', { className: 'hits' })
  for (const h of hits.slice(0, 40)) {
    const i = flat.items.findIndex((it) => it.model === h.id)
    box.append(el('button', { className: i < 0 ? 'absent' : '', title: i < 0 ? 'not in this scene' : '', onclick: () => i >= 0 && frameItem(i) }, h.id))
  }
  return el('div', {}, el('div', { className: 'meta' }, `${hits.length} found`), box)
}

function themeRows() {
  const box = el('div', { className: 'theme' })
  const theme = effective().theme!
  for (const pack of PACKS) {
    const atlases = assets.catalog.packs[pack].atlases
    const swaps = theme.swaps?.[pack] ?? []
    const sel = el('select', {}, ...atlases.map((a) => el('option', { value: a }, a)))
    sel.value = theme.atlas?.[pack] ?? 'base'
    sel.disabled = atlases.length < 2
    sel.onchange = () => ((override.theme.atlas = { ...override.theme.atlas, [pack]: sel.value }), redraw())
    const from = el('input', { type: 'color', value: swaps[0]?.from ?? assets.catalog.models.find((m) => m.pack === pack)!.palette[0].color, title: 'atlas colour to swap' })
    const to = el('input', { type: 'color', value: swaps[0]?.to ?? PACK_COLORS[pack], title: 'swap it to' })
    const apply = el('button', { title: 'swap', onclick: () => ((override.theme.swaps = { ...override.theme.swaps, [pack]: [{ from: from.value, to: to.value, tol: 18 }] }), redraw()) }, '⇄')
    const clear = el('button', { title: 'no swap', disabled: !swaps.length, onclick: () => ((override.theme.swaps = { ...override.theme.swaps, [pack]: [] }), redraw()) }, '✕')
    box.append(el('div', { className: 'pack', style: `--p: ${PACK_COLORS[pack]}` }, el('b', {}, pack), sel, from, '→', to, apply, clear))
  }
  return box
}

function info() {
  if (selected === undefined) return el('div', { className: 'meta' }, 'click a model')
  const item = flat.items[selected]
  const m = assets.byId.get(item.model)!
  const f = fit(m)
  const placement = { model: item.model, at: item.at, ...(item.turn ? { turn: item.turn } : {}), ...(item.scale !== undefined ? { scale: item.scale } : {}), ...(item.parts ? { parts: item.parts } : {}) }
  return el(
    'div',
    { className: 'facts' },
    el('b', {}, m.id),
    el('div', {}, `${m.category} · ${m.mount} · ${m.tris} ▲ · ×${f.scale}`),
    el('div', {}, `size ${f.size.join(' × ')} m`),
    el('div', {}, `origin to bounds: ${f.min.join(', ')} … ${f.max.join(', ')}`),
    ...(m.parts.length > 1 ? [el('div', {}, `parts: ${m.parts.map((p) => p.name).join(', ')}`)] : []),
    el('div', { className: 'swatches' }, ...m.palette.map((p) => el('span', { title: `${p.color} · ${Math.round(p.share * 100)}%`, style: `background: ${p.color}` }))),
    el('div', { className: 'meta' }, `from ${item.from}`),
    el('button', { onclick: () => copy(JSON.stringify(placement)) }, 'copy placement'),
  )
}

const copy = (text: string) => void navigator.clipboard.writeText(text)

async function open(target: string) {
  if (target === 'gallery') return show('gallery')
  const { scene, name } = await readRelative(target, location.href)
  await show(scene, name)
  history.replaceState(null, '', `?scene=${encodeURIComponent(target)}${location.hash}`)
}

async function boot() {
  await ready
  scenes = await fetch(`${OUT}/scenes.json`).then((r) => r.json() as Promise<string[]>)
  const target = new URLSearchParams(location.search).get('scene')
  if (driven) return
  await (target ? open(target) : show('gallery'))
  const id = decodeURIComponent(location.hash.slice(1))
  const i = id ? flat.items.findIndex((it) => it.model === id) : -1
  if (i >= 0) frameItem(i)
}

void boot()
