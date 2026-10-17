import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { transformControls } from './gizmo.ts'
import { loadAtlases } from '../../kaykit/src/atlas.ts'
import { fit, type Catalog, type Vec3 } from '../../kaykit/src/catalog.ts'
import { build, cameraFor, type Assets, type Built } from '../../kaykit/src/draw.ts'
import { find } from '../../kaykit/src/find.ts'
import { formatScene } from '../../kaykit/src/format.ts'
import type { DocEntry } from '../../kaykit/src/listing.ts'
import { loadMeshes } from '../../kaykit/src/meshes.ts'
import { flatten, groupsOf, isModelGuide, parseScene, POSES, type Box, type Camera, type Flat, type FlatSlot, type Item, type ModelGuide, type ModelItem, type Scene, type Slot } from '../../kaykit/src/scene.ts'
import { avatar, seatedAt } from './avatar.ts'
import { CHAIR } from './chair.ts'
import { MODEL_NAMES, type ModelName } from './contract.ts'
import { WARDROBE } from './closet.ts'
import { instance, loadModels, type Models } from './models.ts'
import { pose } from './rig.ts'
import { dispose, sprite } from './toon.ts'
import { lookOf, type Look } from './wardrobe.ts'

/**
 * The prefab editor (editor.html): a scene document drawn as the KayKit playground draws it, its models, prefabs and
 * slots placed by hand. Click to select (a prefab as a whole; Enter goes inside it), T/R/S to move, turn or scale with
 * the gizmo (a box resized along each axis on its own), G to snap (5 cm, 15°), F to drop onto what is below, Delete to remove, ⌘Z to undo. The states picker
 * draws the document in a state of each of its groups (`groupsOf`: one at a time in a document without groups); the
 * state picked last is the one edited: while it is shown, edits of what the document shares go to it (`set`, `remove`)
 * or to every state, as the scope says, and what is added goes to it. A slot for a person is drawn as a Tower 3D worker
 * at its size in its pose, translucent, sitting in a desk chair as Tower 3D seats it; a slot for a thing as a tile; a guide naming one of Tower 3D's
 * models as that model, where Tower 3D draws it, and any other guide as a ghost. Saving shows
 * what changed against the files on disk, line by line, and writes them through `tool:editor serve`. Open lists every
 * scene the serve reaches (its states and slots, who places it, whether Tower 3D reads it) and opens one at `?scene=`,
 * once unsaved changes are given up.
 *
 *   await editor.ready()                        the catalog, the models and the document are loaded
 *   await editor.open(path, states?)            open a scene file (repo-relative), in a state: the page's ?scene= and
 *                                               ?states= say the same, so a reload opens it again
 *   await editor.docs()                         every scene the serve reaches, as the Open list shows them
 *   editor.info()                               the document, its states and groups, the states shown, the one edited,
 *                                               the selection and the scope
 *   await editor.state(name | undefined)        show a state in place of its group's, and edit it; or the shared scene
 *   await editor.unstate(group)                 show none of a group's states
 *   editor.scope('shared' | 'state')            where edits of shared things go while a state is shown
 *   await editor.select(src | undefined)        select by where the document writes it: items/3, slots/0, boxes/2,
 *                                               states/idle/add/items/0
 *   await editor.place(src, { at?, turn?, scale?, size? })   size: a box's
 *   await editor.add(model, at?) · editor.addSlot(name, pose?, at?) · editor.remove(src)
 *   await editor.enter(src) · editor.up()       edit inside a placed prefab; back to the scene placing it
 *   await editor.undo() · editor.redo()
 *   editor.find(words)                          catalog ids matching
 *   editor.changes() · await editor.save()      what saving would change, file by file; write it
 *   editor.look(camera) · editor.shot({ camera?, w?, h? })
 *                                               move the view; a PNG data URL of it, without the gizmo
 */

type Ref = string
type Place = { at?: Vec3; turn?: number; scale?: number | Vec3; size?: Vec3 }
/** What a document places: a model or a prefab, a slot, or a box. */
type Element = Item | Slot | Box
const isBox = (e: Element): e is Box => 'size' in e && 'color' in e
type Info = {
  path: string; trail: string[]; states: string[]; groups: Record<string, string[]>; shown: string[]; edited?: string; scope: 'shared' | 'state'; selected?: Ref; element?: unknown
  dirty: string[]
}

declare global {
  interface Window {
    editor: {
      ready(): Promise<void>
      open(path: string, states?: string[]): Promise<Info>
      docs(): Promise<DocEntry[]>
      info(): Info
      state(name: string | undefined): Promise<Info>
      unstate(group: string): Promise<Info>
      scope(to: 'shared' | 'state'): Info
      select(src: Ref | undefined): Promise<Info>
      place(src: Ref, to: Place): Promise<Info>
      add(model: string, at?: Vec3): Promise<Info>
      addSlot(name: string, pose?: Slot['pose'], at?: Vec3): Promise<Info>
      remove(src: Ref): Promise<Info>
      enter(src: Ref): Promise<Info>
      up(): Promise<Info>
      undo(): Promise<Info>
      redo(): Promise<Info>
      find(words: string): string[]
      changes(): { path: string; lines: string[] }[]
      save(): Promise<string[]>
      look(camera: Camera): void
      shot(opts?: { camera?: Camera; w?: number; h?: number }): string
    }
  }
}

const KAYKIT = 'kaykit'
const DEG = Math.PI / 180
const GHOST = '#3d8fd6'

const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 500)
const orbit = new OrbitControls(camera, canvas)
const gizmo = transformControls(camera, canvas)
gizmo.setSize(0.8)
gizmo.addEventListener('dragging-changed', (e) => (orbit.enabled = !e.value))
const panel = document.getElementById('panel')!
const bar = document.getElementById('bar')!

let assets: Assets
let models: Models
/** Every document read, as its file holds it, by repo-relative path: what is edited. */
let docs = new Map<string, Scene>()
/** Every document's text on disk, as last read or written: what saving changes is measured against it. */
const disk = new Map<string, string>()
/** Each state of the documents an edit left, for undo: `docs` is always `history[at]`. */
let history: Map<string, Scene>[] = []
let at = 0
/** The documents entered, outermost first: the last one is edited, in the states its placement asks for. */
let trail: { path: string; states: string[] }[] = []
/** The states drawn, at most one of each group, in the document's order, and the one edited: the one picked last. */
let shown: string[] = []
let edited: string | undefined
let scopeTo: 'shared' | 'state' = 'state'
let selected: Ref | undefined
let snapping = false
let query = ''
let confirming: { path: string; lines: string[] }[] | undefined
let message = ''
/** The scenes listed while one is being picked to open, and the words narrowing them. */
let picking: DocEntry[] | undefined
let filter = ''

/** What is drawn now: the document flattened, the drawing of all but the selection, the selection under the gizmo. */
let flat: Flat
let built: Built | undefined
const proxy = new THREE.Group()
let ghosts: THREE.Group[] = []
/** The models and boxes drawn, in the drawing's order: what a pick's index names. */
let drawn: Flat['items'] = []
let drawnBoxes: Flat['boxes'] = []
let drawing = 0

const current = () => trail.at(-1)!
const doc = () => docs.get(current().path)!
const states = () => Object.keys(doc().states ?? {})
const showing = (names: string[]) => {
  shown = states().filter((n) => names.includes(n))
  edited = names.findLast((n) => shown.includes(n))
}
const key = (src: Ref) => `${current().path}#${src}`

/** A path relative to the file naming it, as a repo-relative path. */
const relative = (ref: string, from: string) => new URL(ref, `file:///${from}`).pathname.slice(1)

async function readDoc(path: string) {
  if (!docs.has(path)) {
    const r = await fetch(`doc?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(await r.text())
    const text = await r.text()
    const raw = JSON.parse(text) as Scene
    parseScene(raw, path)
    disk.set(path, text)
    docs.set(path, raw)
    history = history.map((h) => new Map(h).set(path, raw))
  }
  return docs.get(path)!
}

const read = async (ref: string, from: string) => {
  const name = relative(ref, from)
  return { scene: parseScene(await readDoc(name), name), name }
}

/** The element a document writes at `src` (items/3, states/idle/add/slots/0), and the list holding it. */
function located(scene: Scene, src: Ref) {
  const parts = src.split('/')
  const index = Number(parts.pop())
  let list: unknown = scene
  for (const p of parts) list = (list as Record<string, unknown>)?.[p]
  if (!Array.isArray(list) || !(index in list)) throw new Error(`${current().path} has nothing at ${src}`)
  return { list: list as unknown[], index, element: list[index] as Element }
}

/** An edit: a copy of the edited document changed by `change`, kept for undo. */
async function edit(change: (scene: Scene) => void) {
  const next = structuredClone(doc())
  change(next)
  parseScene(next, current().path)
  docs = new Map(docs).set(current().path, next)
  history = [...history.slice(0, at + 1), docs]
  at = history.length - 1
  await redraw()
  renderPanel()
}

const stateOwn = (src: Ref) => shown.some((n) => src.startsWith(`states/${n}/add/`))
/** Where an edit of a shared thing goes while a state is edited: into that state, else into what every state shares. */
const intoState = (src: Ref) => edited !== undefined && scopeTo === 'state' && !stateOwn(src) && !src.startsWith('states/')

const nameOf = (e: Element) => ('name' in e ? e.name : e.id)

/** A shared thing's id, given one from its model or scene if it has none, unique in the document. */
function idFor(scene: Scene, element: Item | Box) {
  if (element.id) return element.id
  const base = isBox(element) ? 'box' : ('model' in element ? element.model : element.scene).split('/').at(-1)!.replace(/\.json$/, '')
  const taken = new Set(JSON.stringify(scene).match(/"(id|name)":"[^"]*"/g)?.map((m) => m.split(':')[1].slice(1, -1)))
  let n = 1
  while (taken.has(n === 1 ? base : `${base}_${n}`)) n++
  element.id = n === 1 ? base : `${base}_${n}`
  return element.id
}

const round = (v: number, d: number) => Number(v.toFixed(d)) + 0
const tidy = (to: Place): Place => ({
  ...(to.at && { at: to.at.map((v) => round(v, 3)) as Vec3 }),
  ...(to.turn !== undefined && { turn: round(to.turn, 1) }),
  ...(to.scale !== undefined && { scale: Array.isArray(to.scale) ? (to.scale.map((v) => round(v, 3)) as Vec3) : round(to.scale, 3) }),
  ...(to.size && { size: to.size.map((v) => round(v, 3)) as Vec3 }),
})

async function place(src: Ref, to: Place) {
  const fields = tidy(to)
  await edit((scene) => {
    const { element } = located(scene, src)
    if (!intoState(src)) return void Object.assign(element, fields)
    const state = scene.states![edited!]
    const name = 'name' in element ? element.name : idFor(scene, element)
    state.set = { ...state.set, [name]: { ...state.set?.[name], ...fields } }
  })
  return info()
}

async function remove(src: Ref) {
  selected = undefined
  await edit((scene) => {
    const { list, index, element } = located(scene, src)
    if (!intoState(src)) return void list.splice(index, 1)
    const state = scene.states![edited!]
    state.remove = [...(state.remove ?? []), 'name' in element ? element.name : idFor(scene, element)]
  })
  return info()
}

/** The list new things go into: the state edited, or what every state shares. */
function addTo(scene: Scene, kind: 'items' | 'slots') {
  if (edited === undefined) return (scene[kind] ??= []) as unknown[]
  const state = scene.states![edited]
  state.add ??= {}
  return (state.add[kind] ??= []) as unknown[]
}
const srcOfNew = (scene: Scene, kind: 'items' | 'slots') => `${edited === undefined ? '' : `states/${edited}/add/`}${kind}/${addTo(scene, kind).length - 1}`

async function add(model: string, where?: Vec3) {
  const m = assets.byId.get(model)
  if (!m) throw new Error(`no model "${model}"`)
  const spot = where ?? surfaceAhead()
  const item: ModelItem = { model, at: tidy({ at: [spot[0], spot[1] - fit(m).min[1], spot[2]] }).at! }
  let src = ''
  await edit((scene) => {
    addTo(scene, 'items').push(item)
    src = srcOfNew(scene, 'items')
  })
  return select(src)
}

async function addSlot(name: string, pose?: Slot['pose'], where?: Vec3) {
  const slot: Slot = { name, ...(pose && { pose }), at: tidy({ at: where ?? surfaceAhead() }).at! }
  let src = ''
  await edit((scene) => {
    addTo(scene, 'slots').push(slot)
    src = srcOfNew(scene, 'slots')
  })
  return select(src)
}

/** The next name of a series: seat_1, seat_2 … after the highest the document has. */
function nextInSeries(base: string) {
  const names = JSON.stringify(doc()).match(new RegExp(`"name":"${base}_(\\d+)"`, 'g')) ?? []
  return `${base}_${Math.max(0, ...names.map((n) => Number(/_(\d+)"$/.exec(n)![1]))) + 1}`
}

/** Where the view's centre meets a surface: the first model or guide hit, else the floor. */
function surfaceAhead(): Vec3 {
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2(0, 0), camera)
  const hit = surfaceHit(ray)
  const p = hit?.point ?? ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()) ?? orbit.target
  return [p.x, p.y, p.z]
}

const solids = () => (built ? built.scene.children.filter((o) => o instanceof THREE.BatchedMesh || o.userData.guide !== undefined) : [])

/** The first surface a ray meets: a face of a model or a guide, never a guide's edge lines (three.js hits a line within a metre of it). */
const surfaceHit = (ray: THREE.Raycaster) => ray.intersectObjects(solids(), true).find((h) => h.object instanceof THREE.Mesh)

/** The selection dropped onto the first surface below it: its base resting there. */
async function drop() {
  if (!selected) return info()
  proxy.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(proxy)
  const from = new THREE.Vector3(proxy.position.x, Math.max(box.max.y, proxy.position.y) + 0.01, proxy.position.z)
  const ray = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0))
  const hit = surfaceHit(ray)
  const floor = hit?.point.y ?? 0
  const base = box.isEmpty() ? proxy.position.y : box.min.y
  return place(selected, { at: [proxy.position.x, proxy.position.y + floor - base, proxy.position.z] })
}

/** The document's frame is the world while it is edited: placing it in an outer scene is the outer scene's to draw. */
async function redraw() {
  const mine = ++drawing
  const next = await flatten(doc(), current().path, read, shown)
  if (mine !== drawing) return
  flat = next
  const hidden = selected && key(selected)
  const withModels = flat.slots.flatMap((s) => withOf(s).map((it) => ({ ...it, from: s.from, via: s.via, frame: { at: s.at, turn: s.turn, scale: 1 } })))
  drawn = [...flat.items, ...withModels].filter((it) => (it.via[0] ?? it.from) !== hidden)
  drawnBoxes = flat.boxes.filter((b) => (b.via[0] ?? b.from) !== hidden)
  const was = built
  built = build({ ...flat, items: drawn, boxes: drawnBoxes }, assets)
  built.scene.getObjectByName('slots')?.removeFromParent()
  if (was) disposeBuilt(was)
  for (const g of ghosts) dispose(g)
  ghosts = flat.slots.filter((s) => (s.via[0] ?? s.from) !== hidden).map((s) => {
    const g = ghost(s)
    g.position.set(...s.at)
    g.rotation.y = s.turn * DEG
    g.userData.src = (s.via[0] ?? s.from).split('#')[1]
    return g
  })
  built.scene.add(...(flat.guides ?? []).filter(isModelGuide).map(hostModel), ...ghosts, proxy, gizmo.getHelper())
  await dressProxy()
  render()
}

function disposeBuilt(b: Built) {
  b.scene.traverse((o) => {
    if ((o instanceof THREE.Mesh || o instanceof THREE.BatchedMesh) && !o.geometry.userData.shared) o.geometry.dispose()
  })
}

/** A guide naming one of Tower 3D's own models, drawn as Tower 3D draws it: a surface to snap and drop onto, never selected. */
function hostModel(g: ModelGuide) {
  if (!(MODEL_NAMES as readonly string[]).includes(g.model)) throw new Error(`guide "${g.name}": Tower 3D has no model "${g.model}" (its models: ${MODEL_NAMES.join(', ')})`)
  const { root } = instance(models[g.model as ModelName])
  root.position.set(...g.at)
  root.rotation.y = (g.turn ?? 0) * DEG
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true
  })
  root.userData.guide = g.name
  root.userData.host = g.model
  return root
}

/** A slot's `with` models in world meters, placed in its frame. */
function withOf(s: FlatSlot): ModelItem[] {
  return (s.with ?? []).map((it) => {
    const c = Math.cos(s.turn * DEG), n = Math.sin(s.turn * DEG)
    return { ...it, at: [s.at[0] + it.at[0] * c + it.at[2] * n, s.at[1] + it.at[1], s.at[2] - it.at[0] * n + it.at[2] * c] as Vec3, turn: s.turn + (it.turn ?? 0) }
  })
}

/** The look every ghost wears: the first person (not a bot) the wardrobe dresses from a seed. */
let ghostLook: Look
const personLook = () => {
  for (let n = 0; ; n++) {
    const look = lookOf(`ghost-${n}`, WARDROBE, models.catalogue)
    if (look.species === 'character') return look
  }
}

/** A ghost's look: translucent, casting no shadow. */
function fade(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const faded = (m: THREE.Material) => Object.assign(m.clone(), { transparent: true, opacity: 0.55 })
    o.material = Array.isArray(o.material) ? o.material.map(faded) : faded(o.material)
    o.castShadow = false
  })
  return root
}

/** A slot as Tower 3D fills it: a worker at its size in its pose, translucent, seated in a desk chair, or a tile for a thing; its name above. */
function ghost(slot: Pick<Slot, 'name' | 'pose' | 'size'>) {
  const g = new THREE.Group()
  const size = slot.size ?? 1
  let top = 0.05
  if (slot.pose) {
    const a = avatar(models, ghostLook, WARDROBE)
    a.root.scale.setScalar(size)
    if (a.gear) a.gear.visible = false
    if (slot.pose === 'sit') a.body.position.copy(seatedAt(models.cast, a, CHAIR))
    pose(models.cast, a.rig, { layers: [{ clip: slot.pose === 'sit' ? 'Sit_Chair_Idle' : 'Idle_A', at: 0.5 }] }, 0.5)
    g.add(fade(a.root))
    if (slot.pose === 'sit') {
      const chair = fade(instance(models.desk).part('chair'))
      chair.position.set(0, 0, 0)
      g.add(chair)
    }
    top = (slot.pose === 'sit' ? 1.3 : 1.8) * size
  } else {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.29), new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: 0.6 }))
    tile.position.y = 0.01
    g.add(tile)
  }
  const tag = sprite(slot.name, slot.pose && size > 0.5 ? 0.07 : 0.035, { color: '#fff', bg: GHOST, px: 40 })
  tag.position.y = top + 0.06
  g.add(tag)
  return g
}

/** The selection, drawn alone under the gizmo at its place: a model, a placed prefab, or a slot's ghost. */
async function dressProxy() {
  for (const c of [...proxy.children]) (proxy.remove(c), dispose(c))
  if (!selected) return void gizmo.detach()
  const { element } = located(doc(), selected)
  const shownEl = elementShown(selected) ?? element
  const at = shownEl.at
  proxy.position.set(...at)
  proxy.rotation.set(0, (shownEl.turn ?? 0) * DEG, 0)
  const s = 'name' in shownEl || isBox(shownEl) ? 1 : shownEl.scale ?? 1
  if (Array.isArray(s)) proxy.scale.set(...s)
  else proxy.scale.setScalar(s)
  if (isBox(shownEl)) proxy.add(...build({ items: [], boxes: [{ ...shownEl, at: [0, 0, 0], turn: 0, from: '', via: [] }], slots: [] }, assets).scene.children.filter((o) => o.userData.box !== undefined))
  else if ('name' in shownEl) {
    const g = ghost(shownEl)
    proxy.add(g)
    if (shownEl.with?.length) proxy.add(...soloOf(await flatten({ items: shownEl.with }, current().path, read, [])))
  } else {
    const one: Item = { ...shownEl, at: [0, 0, 0], turn: 0, scale: 1 }
    proxy.add(...soloOf(await flatten({ items: [one] }, current().path, read, 'scene' in shownEl ? shownEl.states ?? [] : [])))
  }
  if (gizmo.object !== proxy) gizmo.attach(proxy)
}

/** A selection's element as the states shown draw it: a shared thing with each state's `set` laid over it in turn. */
function elementShown(src: Ref) {
  const { element } = located(doc(), src)
  const name = nameOf(element)
  if (name === undefined) return element
  return shown.reduce((e, n) => ({ ...e, ...doc().states?.[n]?.set?.[name] }), element) as Element
}

const soloOf = (f: Flat) => build(f, assets).scene.children.filter((o) => o instanceof THREE.BatchedMesh)

async function select(src: Ref | undefined) {
  if (src !== undefined) located(doc(), src)
  selected = src
  await redraw()
  renderPanel()
  return info()
}

/** A click: the slot's ghost, the model or the box nearest along the ray, as what the edited document writes; nothing behind the host's own models. */
function pick(x: number, y: number): Ref | undefined {
  if (!built) return
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1), camera)
  const host = ray.intersectObjects(built.scene.children.filter((o) => o.userData.host), true)[0]?.distance ?? Infinity
  const g = ray.intersectObjects(ghosts, true)[0]
  const m = ray.intersectObjects(built.scene.children.filter((o) => o instanceof THREE.BatchedMesh), false)[0]
  const b = ray.intersectObjects(built.scene.children.filter((o) => o.userData.box !== undefined), false)[0]
  if (Math.min(g?.distance ?? Infinity, m?.distance ?? Infinity, b?.distance ?? Infinity) > host) return
  if (b && b.distance < Math.min(g?.distance ?? Infinity, m?.distance ?? Infinity)) {
    const box = drawnBoxes[b.object.userData.box as number]
    return (box.via[0] ?? box.from).split('#')[1]
  }
  if (g && (!m || g.distance < m.distance)) {
    let o: THREE.Object3D | null = g.object
    while (o && o.userData.src === undefined) o = o.parent
    return o?.userData.src
  }
  const i = built.pick(ray)
  if (i === undefined) return
  return (drawn[i].via[0] ?? drawn[i].from).split('#')[1]
}

/**
 * The proxy's place as the gizmo left it, in the edited document's frame. Its turn is the yaw it faces (an Euler's y
 * alone reads a turn past 90° folded back), written as the element's own turn plus the shortest way round to it.
 */
function proxyPlace(): Place {
  const s = proxy.scale
  const element = elementShown(selected!)
  const scale = 'name' in element || isBox(element) ? undefined : s.x === s.y && s.y === s.z ? s.x : ([s.x, s.y, s.z] as Vec3)
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(proxy.quaternion)
  const was = element.turn ?? 0
  const by = (((Math.atan2(facing.x, facing.z) / DEG - was) % 360) + 540) % 360 - 180
  return {
    at: [proxy.position.x, proxy.position.y, proxy.position.z],
    turn: was + by,
    ...(scale !== undefined && { scale }),
    ...(isBox(element) && { size: [element.size[0] * s.x, element.size[1] * s.y, element.size[2] * s.z] as Vec3 }),
  }
}

/**
 * Ends a gizmo drag the browser did not end with a pointer up on the canvas (a lost pointer capture, a cancelled
 * pointer, a release outside the window): a drag never outlives the button that started it.
 */
function endDrag() {
  if (gizmo.dragging) gizmo.pointerUp(null)
}

let scaleFrom = new THREE.Vector3()
gizmo.addEventListener('mouseDown', () => scaleFrom.copy(proxy.scale))
gizmo.addEventListener('objectChange', () => {
  if (gizmo.mode !== 'scale' || (selected && isBox(elementShown(selected)))) return
  const d = proxy.scale.clone().divide(scaleFrom)
  const k = [d.x, d.y, d.z].reduce((a, b) => (Math.abs(b - 1) > Math.abs(a - 1) ? b : a))
  proxy.scale.copy(scaleFrom).multiplyScalar(k)
})
gizmo.addEventListener('mouseUp', () => {
  if (selected) void place(selected, proxyPlace()).then(renderPanel, fail)
})

function setMode(mode: 'translate' | 'rotate' | 'scale') {
  gizmo.setMode(mode)
  gizmo.setSpace(mode === 'translate' ? 'world' : 'local')
  gizmo.showX = gizmo.showZ = mode !== 'rotate'
  renderBar()
}

function setSnap(on: boolean) {
  snapping = on
  gizmo.setTranslationSnap(on ? 0.05 : null)
  gizmo.setRotationSnap(on ? 15 * DEG : null)
  gizmo.setScaleSnap(on ? 0.05 : null)
  renderBar()
}

async function enter(src: Ref) {
  const { element } = located(doc(), src)
  if (!('scene' in element)) throw new Error(`${src} places a model, not a prefab`)
  const path = relative(element.scene, current().path)
  await readDoc(path)
  trail = [...trail, { path, states: element.states ?? [] }]
  showing(element.states ?? [])
  selected = undefined
  await redraw()
  frame()
  renderPanel()
  return info()
}

async function up() {
  if (trail.length < 2) return info()
  trail = trail.slice(0, -1)
  showing(current().states)
  selected = undefined
  await redraw()
  frame()
  renderPanel()
  return info()
}

async function travel(by: number) {
  const to = at + by
  if (to < 0 || to >= history.length) return info()
  at = to
  docs = history[at]
  if (selected && !locatable(selected)) selected = undefined
  showing(edited ? [...shown, edited] : shown)
  await redraw()
  renderPanel()
  return info()
}

const locatable = (src: Ref) => {
  try {
    return (located(doc(), src), true)
  } catch {
    return false
  }
}

async function open(path: string, states: string[] = []) {
  docs = new Map()
  disk.clear()
  history = [docs]
  at = 0
  await readDoc(path)
  history = [docs]
  trail = [{ path, states }]
  showing(states)
  selected = undefined
  picking = undefined
  window.history.replaceState(null, '', `?scene=${encodeURIComponent(path)}${states.length ? `&states=${states.map(encodeURIComponent).join(',')}` : ''}`)
  await redraw()
  frame()
  renderPanel()
  return info()
}

const docsListed = async () => (await fetch('docs', { cache: 'no-store' })).json() as Promise<DocEntry[]>

async function showDocs() {
  picking = await docsListed()
  renderPanel()
}

/** Opens a scene from the list, once unsaved changes to the one open are given up. */
function openPicked(path: string) {
  const unsaved = trail.length ? changes() : []
  if (unsaved.length && !confirm(`Discard the unsaved changes to ${unsaved.map((c) => c.path).join(', ')}?`)) return
  run(open(path))
}

const groupOf = (name: string) => Object.entries(groupsOf(doc())).find(([, names]) => names.includes(name))![0]

/** Shows a state in place of its group's, edited from now on; `undefined` shows the shared scene alone. */
async function showState(name: string | undefined) {
  if (name !== undefined && !(name in (doc().states ?? {}))) throw new Error(`${current().path} has no state "${name}" (its states: ${states().join(', ') || 'none'})`)
  if (name === undefined) showing([])
  else {
    const group = groupsOf(doc())[groupOf(name)]
    showing([...shown.filter((n) => !group.includes(n)), name])
  }
  return reshown()
}

/** Shows none of a group's states. */
async function unstate(group: string) {
  const names = groupsOf(doc())[group]
  if (!names) throw new Error(`${current().path} has no group "${group}" (its groups: ${Object.keys(groupsOf(doc())).join(', ') || 'none'})`)
  showing([...shown.filter((n) => !names.includes(n) && n !== edited), ...(edited && !names.includes(edited) ? [edited] : [])])
  return reshown()
}

async function reshown() {
  if (selected && selected.startsWith('states/') && !stateOwn(selected)) selected = undefined
  await redraw()
  renderPanel()
  return info()
}

/** A new state, in `group` when the document has groups, shown and edited. */
async function addState(name: string, group: string) {
  if (!name || name in (doc().states ?? {})) throw new Error(`a state needs a new name`)
  await edit((scene) => {
    scene.states = { ...scene.states, [name]: {} }
    if (scene.groups && group in scene.groups) scene.groups = { ...scene.groups, [group]: [...scene.groups[group], name] }
  })
  return showState(name)
}

/** What saving would write, file by file: each document whose formatted text differs from its file. */
function changes() {
  return [...docs].flatMap(([path, scene]) => {
    const text = formatScene(scene)
    return text === disk.get(path) ? [] : [{ path, lines: lineDiff(disk.get(path)!, text) }]
  })
}

/** The lines removed and added between two texts, each with its sign, by their longest common run. */
function lineDiff(before: string, after: string) {
  const a = before.split('\n'), b = after.split('\n')
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: string[] = []
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) (i++, j++)
    else if (i < a.length && (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])) out.push(`- ${a[i++]}`)
    else out.push(`+ ${b[j++]}`)
  }
  return out
}

async function save() {
  const written: string[] = []
  for (const { path } of changes()) {
    const text = formatScene(docs.get(path)!)
    const r = await fetch(`doc?path=${encodeURIComponent(path)}`, { method: 'PUT', body: text })
    if (!r.ok) throw new Error(await r.text())
    disk.set(path, text)
    written.push(path)
  }
  confirming = undefined
  message = written.length ? `saved ${written.join(', ')}` : 'nothing to save'
  renderPanel()
  return written
}

function info(): Info {
  if (!trail.length) return { path: '', trail: [], states: [], groups: {}, shown: [], scope: scopeTo, dirty: [] }
  return {
    path: current().path,
    trail: trail.map((t) => t.path),
    states: states(),
    groups: groupsOf(doc()),
    shown,
    edited,
    scope: scopeTo,
    selected,
    element: selected && elementShown(selected),
    dirty: changes().map((c) => c.path),
  }
}

/**
 * Frames the document from where a worker sits: behind -z, raised, a little to the right, so a desk's top, its monitor's
 * face and the floor round it all show.
 */
const SEATED_VIEW = { az: 200, el: 38 }
function frame() {
  if (!built) return
  const c = built.bounds.getCenter(new THREE.Vector3())
  const r = built.bounds.getBoundingSphere(new THREE.Sphere()).radius
  const [az, el] = [SEATED_VIEW.az * DEG, SEATED_VIEW.el * DEG]
  const d = (r / Math.tan((40 * DEG) / 2)) * 0.8
  look({ pos: [c.x + d * Math.cos(el) * Math.sin(az), c.y + d * Math.sin(el), c.z + d * Math.cos(el) * Math.cos(az)], look: [c.x, c.y, c.z], fov: 40 })
}

function look(spec: Camera) {
  if (!built) return
  const cam = cameraFor(spec, built.bounds, canvas.clientWidth / canvas.clientHeight)
  camera.position.copy(cam.position)
  camera.fov = cam.fov
  camera.updateProjectionMatrix()
  const target = 'look' in spec ? new THREE.Vector3(...spec.look) : built.bounds.getCenter(new THREE.Vector3())
  orbit.target.copy(target)
  orbit.update()
}

function shot({ camera: spec, w = 1600, h = 1000 }: { camera?: Camera; w?: number; h?: number } = {}) {
  const helper = gizmo.getHelper()
  const was = helper.visible
  helper.visible = false
  const cam = spec ? cameraFor(spec, built!.bounds, w / h) : camera.clone()
  cam.aspect = w / h
  cam.updateProjectionMatrix()
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  renderer.render(built!.scene, cam)
  const data = canvas.toDataURL('image/png')
  helper.visible = was
  resize()
  return data
}

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  camera.aspect = canvas.clientWidth / canvas.clientHeight
  camera.updateProjectionMatrix()
}

function render() {
  if (built) renderer.render(built.scene, camera)
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const num = (v: number) => String(round(v, 3))

function describe(e: Element) {
  if (isBox(e)) return `box <b>${e.size.map(num).join(' × ')}</b>${e.opacity !== undefined ? ' · glass' : ''}${e.id ? ` · ${esc(e.id)}` : ''}`
  if ('name' in e) return `${e.pose ? `${e.pose}ting person` : 'thing'} · slot <b>${esc(e.name)}</b>`
  if ('model' in e) return `<b>${esc(e.model)}</b>${e.id ? ` · ${esc(e.id)}` : ''}`
  return `prefab <b>${esc(e.scene)}</b>${e.states?.length ? ` in ${esc(e.states.join(', '))}` : ''}${e.id ? ` · ${esc(e.id)}` : ''}`
}

function renderPicker(docs: DocEntry[]) {
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shownDocs = docs.filter((d) => words.every((w) => `${d.path} ${'title' in d ? d.title ?? '' : ''}`.toLowerCase().includes(w)))
  const badges = (d: DocEntry) =>
    'error' in d
      ? `can't be read: ${d.error}`
      : [d.states && `${d.states} state${d.states > 1 ? 's' : ''}`, d.slots && `${d.slots} slot${d.slots > 1 ? 's' : ''}`, d.usedBy.length && `used by ${d.usedBy.length}`, d.tower3d && 'Tower 3D']
          .filter(Boolean)
          .join(' · ')
  const name = (d: DocEntry) => ('title' in d && d.title) || d.path.split('/').at(-1)!
  panel.innerHTML = `
    <div class="row"><h1>Open a scene</h1>${trail.length ? '<button data-act="close-docs">back</button>' : ''}</div>
    <input type="text" id="filter" placeholder="filter: desk, meeting, roof" value="${esc(filter)}">
    <div class="docs">${shownDocs.map((d) => `<button data-open="${esc(d.path)}" ${'error' in d ? 'disabled' : ''} title="${esc('note' in d ? d.note ?? '' : '')}${d.usedBy.length ? `\nused by ${esc(d.usedBy.join(', '))}` : ''}" class="${trail[0]?.path === d.path ? 'on' : ''}"><b>${esc(name(d))}</b><small>${esc(d.path.replace(/^renderers\/kaykit\/scenes\//, ''))}</small>${badges(d) ? `<em>${badges(d)}</em>` : ''}</button>`).join('')}</div>
    ${message ? `<div class="muted">${esc(message)}</div>` : ''}
  `
}

/** A row per group, its states to pick one of (the edited one marked) and none; a document without groups has one row. */
function statesPicker() {
  const grouped = !!doc().groups
  return Object.entries(groupsOf(doc())).map(([group, names]) => `
    <div class="group states">${grouped ? `<span class="muted">${esc(group)}</span><button data-unstate="${esc(group)}" class="${names.some((n) => shown.includes(n)) ? '' : 'on'}" title="none of ${esc(group)}">–</button>` : ''}
      ${names.map((n) => `<button data-state="${esc(n)}" class="${shown.includes(n) ? 'on' : ''} ${edited === n ? 'edited' : ''}" title="${edited === n ? 'shown, edited' : shown.includes(n) ? 'shown: click to edit it' : 'show it'}">${esc(n)}</button>`).join('')}
      ${grouped && doc().groups![group] ? `<button data-act="new-state" data-group="${esc(group)}" title="a new state of ${esc(group)}">+</button>` : ''}
    </div>`).join('')
}

function renderPanel() {
  if (picking) return renderPicker(picking)
  if (!trail.length) return void (panel.innerHTML = `<h1>Open a scene</h1><div class="muted">${message ? esc(message) : 'reading the scenes…'}</div>`)
  const e = selected ? elementShown(selected) : undefined
  const hits = query.trim() ? find(assets.catalog, { text: query }).slice(0, 14) : []
  const pending = changes()
  panel.innerHTML = `
    <div class="row"><h1>Prefab editor</h1><button data-act="docs">open…</button></div>
    <div class="crumbs">${trail.map((t, i) => `<span>${i ? '› ' : ''}${esc(t.path.split('/').at(-1)!)}</span>`).join(' ')}${trail.length > 1 ? ' <button data-act="up">up</button>' : ''}</div>
    <div class="muted">${esc(doc().title ?? '')}</div>
    <h3>State</h3>
    <div class="group"><button data-state="" class="${shown.length ? '' : 'on'}">shared</button>${doc().groups ? '' : '<button data-act="new-state" data-group="" title="a new state">+</button>'}</div>
    ${statesPicker()}
    ${edited ? `<label class="row"><span>shared edits</span><select id="scope"><option value="state" ${scopeTo === 'state' ? 'selected' : ''}>${esc(edited)} only</option><option value="shared" ${scopeTo === 'shared' ? 'selected' : ''}>every state</option></select></label>` : ''}
    <h3>Selected</h3>
    ${e && selected ? `
      <div>${describe(e)}</div>
      <div class="from">${esc(selected)}</div>
      <div class="axes"><b>at</b>${e.at.map((v, i) => `<input type="number" step="0.01" data-at="${i}" value="${num(v)}">`).join('')}</div>
      <div class="axes"><b>turn</b><input type="number" step="1" id="turn" value="${num(e.turn ?? 0)}">${'name' in e || isBox(e) ? '' : `<b>scale</b><input type="number" step="0.05" id="scale" value="${Array.isArray(e.scale) ? '' : num(e.scale ?? 1)}" ${Array.isArray(e.scale) ? 'disabled' : ''}>`}</div>
      ${isBox(e) ? `<div class="axes"><b>size</b>${e.size.map((v, i) => `<input type="number" step="0.05" data-size="${i}" value="${num(v)}">`).join('')}</div>` : ''}
      ${'name' in e ? `<label class="row"><span>pose</span><select id="pose"><option value="">thing</option>${POSES.map((p) => `<option ${e.pose === p ? 'selected' : ''}>${p}</option>`).join('')}</select><span>size</span><input type="number" step="0.05" id="size" value="${num(e.size ?? 1)}"></label>` : ''}
      <div class="row">${'scene' in e ? '<button data-act="enter">edit inside ↵</button>' : ''}<button data-act="drop">drop F</button><button data-act="delete">delete ⌫</button><button data-act="none">deselect</button></div>
    ` : '<div class="muted">click a model, a prefab, a box or a slot</div>'}
    <h3>Add</h3>
    <input type="text" id="find" placeholder="search the catalog: mug, lamp, cactus" value="${esc(query)}">
    <div class="hits">${hits.map((h) => `<button data-add="${esc(h.id)}">${esc(h.id)} <small>${h.size.map((v) => v.toFixed(2)).join('×')}</small></button>`).join('')}</div>
    <div class="row"><input type="text" id="slot-name" placeholder="slot: seat, twin, logbook"><select id="slot-pose"><option value="sit">sit</option><option value="stand">stand</option><option value="">thing</option></select><button data-act="add-slot">+ slot</button></div>
    <h3>Save</h3>
    ${confirming ? `<div class="confirm"><b>Write ${confirming.length} file${confirming.length > 1 ? 's' : ''}?</b>${confirming.map((c) => `<div class="from">${esc(c.path)}</div><pre>${c.lines.map(esc).join('\n')}</pre>`).join('')}<div class="row"><button data-act="write" class="on">Write</button><button data-act="cancel">Cancel</button></div></div>` : `<div class="row"><button data-act="save" class="on" ${pending.length ? '' : 'disabled'}>Save…</button><span class="muted">${pending.length ? `${pending.length} file${pending.length > 1 ? 's' : ''} changed` : 'as saved'}</span></div>`}
    ${message ? `<div class="muted">${esc(message)}</div>` : ''}
  `
  renderBar()
}

function renderBar() {
  const mode = gizmo.mode
  bar.innerHTML = `
    <div class="group">
      <button data-mode="translate" class="${mode === 'translate' ? 'on' : ''}">move <kbd>T</kbd></button>
      <button data-mode="rotate" class="${mode === 'rotate' ? 'on' : ''}">turn <kbd>R</kbd></button>
      <button data-mode="scale" class="${mode === 'scale' ? 'on' : ''}">scale <kbd>S</kbd></button>
      <button data-act="snap" class="${snapping ? 'on' : ''}">snap <kbd>G</kbd></button>
    </div>
    <div class="group"><button data-act="undo" ${at > 0 ? '' : 'disabled'}>undo <kbd>⌘Z</kbd></button><button data-act="redo" ${at < history.length - 1 ? '' : 'disabled'}>redo</button></div>
    <span class="keys">click selects · <kbd>↵</kbd> inside a prefab · <kbd>Esc</kbd> deselect, then up · <kbd>F</kbd> drop · <kbd>⌫</kbd> delete</span>
  `
}

function fail(e: Error) {
  message = e.message
  renderPanel()
}

const run = (p: Promise<unknown>) => void p.then(renderPanel, fail)

panel.addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest('button')
  if (!t) return
  const d = t.dataset
  if (d.open) return openPicked(d.open)
  if (d.act === 'docs') return run(showDocs())
  if (d.act === 'close-docs') return ((picking = undefined), renderPanel())
  if (d.state !== undefined) return run(showState(d.state || undefined))
  if (d.unstate !== undefined) return run(unstate(d.unstate))
  if (d.add) return run(add(d.add))
  if (d.act === 'up') return run(up())
  if (d.act === 'enter' && selected) return run(enter(selected))
  if (d.act === 'drop') return run(drop())
  if (d.act === 'delete' && selected) return run(remove(selected))
  if (d.act === 'none') return run(select(undefined))
  if (d.act === 'new-state') return run(addState(prompt('name of the new state') ?? '', d.group ?? ''))
  if (d.act === 'add-slot') {
    const base = (document.getElementById('slot-name') as HTMLInputElement).value.trim()
    const pose = (document.getElementById('slot-pose') as HTMLSelectElement).value as Slot['pose'] | ''
    if (!base) return fail(new Error('a slot needs a name'))
    return run(addSlot(/_\d+$/.test(base) || !/^[a-z]+$/.test(base) ? base : nextInSeries(base), pose || undefined))
  }
  if (d.act === 'save') return ((confirming = changes()), renderPanel())
  if (d.act === 'write') return run(save())
  if (d.act === 'cancel') return ((confirming = undefined), renderPanel())
})

panel.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement
  if (t.id === 'scope') return ((scopeTo = t.value as 'shared' | 'state'), renderPanel())
  if (!selected) return
  const e = elementShown(selected)
  if (t.dataset.at !== undefined) return run(place(selected, { at: e.at.map((v, i) => (i === Number(t.dataset.at) ? Number(t.value) : v)) as Vec3 }))
  if (t.id === 'turn') return run(place(selected, { turn: Number(t.value) }))
  if (t.id === 'scale') return run(place(selected, { scale: Number(t.value) }))
  if (t.dataset.size !== undefined && isBox(e)) return run(place(selected, { size: e.size.map((v, i) => (i === Number(t.dataset.size) ? Number(t.value) : v)) as Vec3 }))
  if (t.id === 'pose' || t.id === 'size') {
    const src = selected
    const value = t.id === 'size' ? Number(t.value) : t.value || undefined
    return run(edit((scene) => {
      const { element } = located(scene, src)
      Object.assign(element, { [t.id]: value })
    }))
  }
})

panel.addEventListener('input', (ev) => {
  const t = ev.target as HTMLInputElement
  if (t.id !== 'find' && t.id !== 'filter') return
  if (t.id === 'find') query = t.value
  else filter = t.value
  renderPanel()
  const box = document.getElementById(t.id) as HTMLInputElement
  box.focus()
  box.setSelectionRange(t.value.length, t.value.length)
})

bar.addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest('button')
  if (!t) return
  if (t.dataset.mode) return setMode(t.dataset.mode as 'translate' | 'rotate' | 'scale')
  if (t.dataset.act === 'snap') return setSnap(!snapping)
  if (t.dataset.act === 'undo') return run(travel(-1))
  if (t.dataset.act === 'redo') return run(travel(1))
})

/** Where the button went down, unless the gizmo took the press: a press of the gizmo's never re-picks on release. */
let down: { x: number; y: number } | undefined
canvas.addEventListener('pointerdown', (e) => (down = gizmo.dragging ? undefined : { x: e.clientX, y: e.clientY }))
canvas.addEventListener('pointermove', (e) => e.buttons === 0 && endDrag())
canvas.addEventListener('lostpointercapture', endDrag)
canvas.addEventListener('pointercancel', endDrag)
canvas.addEventListener('pointerup', (e) => {
  if (!down || gizmo.dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
  const r = canvas.getBoundingClientRect()
  run(select(pick(e.clientX - r.left, e.clientY - r.top)))
})
canvas.addEventListener('dblclick', () => selected && located(doc(), selected).element && 'scene' in located(doc(), selected).element && run(enter(selected)))

addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select, textarea')) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') return (e.preventDefault(), run(travel(e.shiftKey ? 1 : -1)))
  if (e.metaKey || e.ctrlKey) return
  const k = e.key.toLowerCase()
  if (k === 't') return setMode('translate')
  if (k === 'r') return setMode('rotate')
  if (k === 's') return setMode('scale')
  if (k === 'g') return setSnap(!snapping)
  if (k === 'f' && selected) return run(drop())
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) return run(remove(selected))
  if (e.key === 'Enter' && selected && 'scene' in located(doc(), selected).element) return run(enter(selected))
  if (e.key === 'Escape') return run(selected ? select(undefined) : up())
})

addEventListener('resize', resize)

const ready = (async () => {
  const catalog = (await fetch(`${KAYKIT}/catalog.json`).then((r) => r.json())) as Catalog
  const [meshes, atlases, m] = await Promise.all([loadMeshes(KAYKIT), loadAtlases(KAYKIT, catalog.packs), loadModels()])
  assets = { catalog, byId: new Map(catalog.models.map((x) => [x.id, x])), meshes, atlases }
  models = m
  ghostLook = personLook()
  resize()
  const q = new URLSearchParams(location.search)
  const start: string = q.get('scene') ?? (await (await fetch('start')).text())
  if (start) await open(start, q.get('states')?.split(',').filter(Boolean) ?? [])
  else await showDocs()
})()

addEventListener('beforeunload', (e) => {
  if (trail.length && changes().length) e.preventDefault()
})
ready.catch(fail)

window.editor = {
  ready: () => ready,
  open,
  docs: docsListed,
  info,
  state: showState,
  unstate,
  scope: (to) => ((scopeTo = to), renderPanel(), info()),
  select,
  place,
  add,
  addSlot,
  remove,
  enter,
  up,
  undo: () => travel(-1),
  redo: () => travel(1),
  find: (words) => find(assets.catalog, { text: words }).map((h) => h.id),
  changes,
  save,
  look,
  shot,
}

renderer.setAnimationLoop(() => {
  orbit.update()
  render()
})

