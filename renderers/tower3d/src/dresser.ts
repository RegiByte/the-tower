import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { CHARACTERS, CLIPS, SLOTS, bodyOf, type ClipName, type Slot } from './contract.ts'
import { avatar, fitted, place, seatedAt, type Avatar } from './avatar.ts'
import { CHAIR } from './chair.ts'
import { WARDROBE } from './closet.ts'
import { instance, loadModels, type Models } from './models.ts'
import { pose, type ClipKey, type Pose } from './rig.ts'
import { block, dispose, toon } from './toon.ts'
import { fitFrom, fitOf, fitsRig, formatWardrobe, lookNamed, lookOf, parseWardrobe, problems, rigOfLook, STAFF, wornBy, type Catalogue, type Fit, type Look, type Outfit, type Placement, type Vec3, type Wardrobe } from './wardrobe.ts'

/**
 * The dresser (dresser.html): a worker on a stand, dressed by the wardrobe as Tower 3D dresses it. Start from a body
 * or a random look, change a part or a colour (or roll one), pose it, and fit its rigid pieces head by head: the
 * line-up puts the look on every head, a click makes a head the one fitted, and an edit is saved as that head's
 * override of the piece's fit. Looks are kept as outfits. Edits change a copy of the wardrobe; saving shows what
 * changed against the file and writes it through `tool:dresser serve`, else the JSON is copied. `window.dresser`:
 *
 *   await dresser.ready()                       the models are parsed
 *   dresser.look('random' | { body } | { id } | { outfit } | { look })
 *                                               a random look, a body as it starts (Knight…, bot), a session id
 *                                               hashed, an outfit, or fields laid over the look on the stand
 *   dresser.head(name) · dresser.wear(part)     make a head the one worn and fitted; wear a part in its slot
 *   dresser.select(part) · dresser.fit(part, fit | null, key?)
 *                                               fit a piece: `key` is the head worn (or `bot`) unless named
 *   dresser.pose('sit', 1.2) · dresser.view('face') · dresser.heads(true)
 *                                               a pose, or any clip of the contract's CLIPS on its own
 *   dresser.outfit(name) · dresser.rename(from, to) · dresser.unkeep(name)
 *   await dresser.changes()                     what saving would change in the file on disk, line by line
 *   await dresser.save() · dresser.wardrobe()   write it (answers the file written); the edited wardrobe as its file holds it
 *   dresser.state() · dresser.cost()            the look, its pieces' fits and their sources; its draw calls and triangles
 *   dresser.where(part | head)                  a worn piece or a line-up head on screen, CSS pixels
 *   await dresser.shot({ w, h })                a PNG data URL of the stand, without the gizmo
 */

const POSES = ['stand', 'sit', 'type', 'walk', 'wave', 'cheer', 'dance'] as const
/** A pose, or any packed clip played on its own: those starting `Sit_Chair` in the chair. */
type PoseName = (typeof POSES)[number] | ClipName
const isClip = (name: string): name is ClipName => (CLIPS as readonly string[]).includes(name)
const seatedIn = (name: PoseName) => name === 'sit' || name === 'type' || name.startsWith('Sit_Chair')
const DANCE_MOVES: ClipKey[] = ['Cheering', 'Jump_Idle', 'Waving', 'Cheering:arms']
/** How long the scrubber reaches, seconds. */
const LOOP = 8

/** A pose at sim time `t`, as Tower 3D poses it: at a desk (sit, type), on the floor (walk), at the party (wave, cheer, dance). */
function poseAt(name: PoseName, t: number): Pose {
  if (isClip(name)) return { layers: [{ clip: name, at: t }] }
  if (name === 'stand') return { layers: [{ clip: 'Idle_A', at: t }] }
  if (name === 'sit') return { layers: [{ clip: 'Sit_Chair_Idle', at: t }] }
  if (name === 'type') return { layers: [{ clip: 'Sit_Chair_Idle:rest', at: t }, { clip: 'Type', at: t }] }
  if (name === 'walk') return { layers: [{ clip: 'Walking_A', at: t }] }
  if (name === 'wave') return { layers: [{ clip: 'Waving', at: t }] }
  if (name === 'cheer') return { layers: [{ clip: 'Cheering', at: t }] }
  const move = DANCE_MOVES[Math.floor(t / 2) % DANCE_MOVES.length]
  return { layers: move.endsWith(':arms') ? [{ clip: 'Jump_Idle:rest', at: t }, { clip: move, at: t }] : [{ clip: move, at: t }] }
}

const VIEWS = { front: [0, 0, 1], side: [1, 0, 0], face: [0, 0, 1], 'three-quarter': [0.75, 0.25, 1] } as const
type View = keyof typeof VIEWS
const BASES = [...CHARACTERS, 'bot'] as const
type Base = (typeof BASES)[number]

const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.toneMapping = THREE.ACESFilmicToneMapping
const scene = new THREE.Scene()
scene.background = new THREE.Color('#1b2120')
const sun = new THREE.DirectionalLight('#dfe6ff', 1.6)
sun.position.set(-4, 8, 6)
scene.add(new THREE.HemisphereLight('#b9c8ff', '#2a2430', 1.9), sun, new THREE.AmbientLight('#ffffff', 0.35))
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100)
const orbit = new OrbitControls(camera, canvas)
const gizmo = new TransformControls(camera, canvas)
gizmo.setSpace('local')
gizmo.setSize(0.7)
scene.add(gizmo.getHelper())
gizmo.addEventListener('dragging-changed', (e) => (orbit.enabled = !e.value))
const stand = new THREE.Group()
const floor = new THREE.Group()
scene.add(stand, floor)
const tags = document.getElementById('tags')!

let models: Models
let cat: Catalogue
let wardrobe: Wardrobe = WARDROBE
/** The wardrobe in the file, as last read or written: what saving changes is measured against it. */
let disk: Wardrobe = WARDROBE
let look: Look
/** The outfit the look was loaded from or kept as, if any. */
let outfit: string | undefined
let shown: PoseName = 'stand'
let t = 0
let playing = true
let lineUp = false
let view: View = 'three-quarter'
let selected: string | undefined
/** Whether `tool:dresser serve` is behind the page, to read and write the file. */
let server = false
let note = ''
let mixOpen = false
let jsonOpen = false
/** What saving would change, shown to confirm before writing. */
let confirming: string[] | undefined
let renaming: string | undefined

/** A worker on the stand: its look, avatar and chair, and the head it wears in the line-up. */
type Figure = { group: THREE.Group; avatar: Avatar; chair: THREE.Object3D; look: Look; head?: string }
let figures: Figure[] = []

const partIn = (l: Look, slot: Slot) => l.parts.find((p) => cat.parts[p].slot === slot)
const withPart = (l: Look, slot: Slot, part: string | undefined): Look => {
  const rest = l.parts.filter((p) => cat.parts[p].slot !== slot)
  const parts = part === undefined ? rest : [...rest, part]
  return { ...l, parts: SLOTS.flatMap((s) => parts.filter((p) => cat.parts[p].slot === s)) }
}
/** A slot's parts a look can wear: those made on its skeleton, and the pieces hung at an anchor. */
const partsFor = (l: Look, slot: Slot) => cat.slots[slot].filter((p) => fitsRig(cat, p, rigOfLook(l)))
/** The slots a species fills: a bot wears only the pieces of models/wear.py, on its own anchors. */
const slotsOf = (l: Look): readonly Slot[] => (l.species === 'bot' ? SLOTS.filter((s) => s === 'Hat' || s === 'Face') : SLOTS)
const headOf = (l: Look) => (l.species === 'character' ? partIn(l, 'Head') : undefined)
/** The key an edit of a piece's fit is saved under: the head worn, or `bot`. */
const keyOf = (l: Look) => headOf(l) ?? 'bot'

const anyOf = <T>(xs: readonly T[], not?: T) => {
  const pool = xs.length > 1 ? xs.filter((x) => x !== not) : xs
  return pool[Math.floor(Math.random() * pool.length)]
}
const randomHue = () => `#${new THREE.Color().setHSL(Math.random(), 0.55, 0.62).getHexString()}`

/** A body as it starts: its own head and paint and nothing else worn, in the look's colours where it has them. */
function based(base: Base): Look {
  const { mix } = wardrobe
  const wear = look?.wear ?? mix.wears[0]
  const build = { width: 1, height: 1 }
  if (base === 'bot') return { species: 'bot', hue: look?.species === 'bot' ? look.hue : randomHue(), parts: [], wear, build }
  const was = look?.species === 'character' ? look : undefined
  const body = bodyOf(base)
  return { species: 'character', body: base, paint: body.atlas, parts: SLOTS.flatMap((s) => body.wears[s] ?? []), skin: was?.skin ?? mix.skins[1], hair: was?.hair ?? mix.hairs[1], wear, build }
}

/** An outfit that dresses exactly this look: every slot set, a part or bare. */
function outfitOf(l: Extract<Look, { species: 'character' }>): Outfit {
  return { body: l.body, paint: l.paint, skin: l.skin, hair: l.hair, wear: l.wear, build: l.build, ...(l.shape && { shape: l.shape }), slots: Object.fromEntries(SLOTS.map((s) => [s, partIn(l, s) ?? null])) }
}

const DEG = Math.PI / 180
const round = (v: number, digits: number) => Number(v.toFixed(digits)) + 0
const rounded = (xs: number[], digits: number) => xs.map((x) => round(x, digits)) as Vec3

/** The fit that carries a made placement to where an object stands now: `fitted`'s inverse. */
function fitOfObject(made: Placement, o: THREE.Object3D): Required<Fit> {
  const turn = new THREE.Euler().setFromQuaternion(o.quaternion.clone().multiply(new THREE.Quaternion().fromArray(made.quaternion).invert()))
  const scale = rounded(o.scale.toArray().map((s, i) => s / made.scale[i]), 3)
  return {
    at: rounded(o.position.toArray().map((p, i) => p - made.at[i]), 4),
    turn: rounded([turn.x / DEG, turn.y / DEG, turn.z / DEG], 1),
    scale: scale.every((s) => s === scale[0]) ? scale[0] : scale,
  }
}

function refit(f: Figure) {
  const worn = wornBy(f.look)
  for (const [part, { object, made }] of f.avatar.worn) place(object, fitted(made, fitOf(wardrobe, cat, part, worn)))
}

function figure(l: Look, head?: string): Figure {
  const a = avatar(models, l, wardrobe)
  const chair = instance(models.desk).part('chair')
  chair.position.set(0, 0, 0)
  const group = new THREE.Group()
  group.add(chair, a.root)
  return { group, avatar: a, chair, look: l, head }
}

const SPACING = 0.8

/** The worker fitted: the one on the stand, or in the line-up the one wearing the look's head. */
const active = () => figures.find((f) => f.head === headOf(look)) ?? figures[0]

/** The stand dressed in the look: one worker, or the look on every head side by side in the catalogue's order. */
function restage() {
  gizmo.detach()
  for (const f of figures) dispose(f.group, (map) => map.userData.shared)
  stand.clear()
  floor.clear()
  const heads: (string | undefined)[] = lineUp && look.species === 'character' ? partsFor(look, 'Head') : [undefined]
  figures = heads.map((head) => figure(head === undefined ? look : withPart(look, 'Head', head), head))
  figures.forEach((f, i) => {
    f.group.position.x = (i - (heads.length - 1) / 2) * SPACING
    stand.add(f.group)
  })
  floor.add(block((heads.length - 1) * SPACING + 1.6, 0.06, 1.6, toon('#3a4442'), 0, -0.06, 0))
  if (selected && !active().avatar.worn.has(selected)) selected = undefined
  animate()
  attach()
  drawTags()
}

function redress() {
  restage()
  renderPanels()
}

function animate() {
  const seated = seatedIn(shown)
  for (const f of figures) {
    const { avatar: a } = f
    f.chair.visible = seated
    if (a.gear) a.gear.visible = !seated
    a.body.position.copy(seated ? seatedAt(models.cast, a, CHAIR) : new THREE.Vector3(0, shown === 'dance' ? Math.abs(Math.sin(t * Math.PI)) * 0.06 : 0, 0))
    pose(models.cast, a.rig, poseAt(shown, t), t)
  }
}

/** The width the side panels take while they show, CSS pixels. */
const PANELS = 2 * 312

/** Points the camera at the stand from `view`, filling the `free` share of the canvas's width: the face close-up at the heads. */
function frame(free = Math.max(0.3, (innerWidth - PANELS) / innerWidth)) {
  stand.updateMatrixWorld(true)
  const box = new THREE.Box3()
  if (view === 'face') {
    for (const f of figures) box.expandByPoint(f.avatar.rig.bone('head').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)))
    box.expandByScalar(0.45)
  } else for (const f of figures) box.expandByObject(f.avatar.root).union(f.chair.visible ? new THREE.Box3().setFromObject(f.chair) : new THREE.Box3())
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const dir = new THREE.Vector3(...VIEWS[view]).normalize()
  const tan = Math.tan((camera.fov * DEG) / 2)
  const fit = Math.max(size.y / 2 / tan, size.x / 2 / tan / camera.aspect / free)
  camera.position.copy(center).addScaledVector(dir, fit * 1.15 + size.z)
  orbit.target.copy(center)
  orbit.update()
}

/** Brings the camera close to the selected piece, looking at it from where it looks now. */
function frameSelected() {
  const piece = selected && active().avatar.worn.get(selected)
  if (!piece) return
  const at = piece.object.getWorldPosition(new THREE.Vector3())
  const dir = camera.position.clone().sub(orbit.target).normalize()
  camera.position.copy(at).addScaledVector(dir, 0.75)
  orbit.target.copy(at)
  orbit.update()
}

function attach() {
  const piece = selected === undefined ? undefined : active().avatar.worn.get(selected)
  if (piece) gizmo.attach(piece.object)
  else gizmo.detach()
}

function select(part: string | undefined) {
  selected = part
  attach()
  drawTags()
  renderPanels()
}

/** Makes `head` the one the look wears, and so the one fitted. */
function setHead(head: string) {
  if (look.species !== 'character') throw new Error('a bot has no head to fit on')
  if (!cat.slots.Head.includes(head)) throw new Error(`no head "${head}": ${cat.slots.Head.join(', ')}`)
  look = withPart(look, 'Head', head)
  redress()
  return state()
}

function wear(part: string) {
  if (!(part in cat.parts) || cat.parts[part].slot === 'Body') throw new Error(`no slot part "${part}"`)
  change(withPart(look, cat.parts[part].slot as Slot, part))
  return state()
}

/** How a piece is fitted on a head (or a bot): its own override, the default for every head, or as it was made. */
function fitState(part: string, key: string) {
  const fits = wardrobe.fits[part] ?? {}
  return key in fits ? 'own' : '*' in fits ? 'default' : 'made'
}
const STATE_WORDS = { own: '✓ fitted', default: 'default', made: 'as made' }

/** A tag at the feet of each worker of the line-up: its head, and how the selected piece is fitted on it. */
function drawTags() {
  tags.innerHTML = lineUp && look.species === 'character'
    ? figures.map((f) => {
        const s = selected ? fitState(selected, f.head!) : undefined
        return `<div class="tag ${f === active() ? 'active' : ''} ${s === 'own' ? 'fitted' : ''}" data-head="${f.head}">${f.head!.replace(/_Head/, '').replace(/_/g, ' ')}${s ? `<small>${STATE_WORDS[s]}</small>` : ''}</div>`
      }).join('')
    : ''
}

function placeTags() {
  for (const el of tags.children as HTMLCollectionOf<HTMLElement>) {
    const f = figures.find((g) => g.head === el.dataset.head)
    if (!f) continue
    const p = f.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0.45)).project(camera)
    el.style.left = `${((p.x + 1) / 2) * innerWidth}px`
    el.style.top = `${((1 - p.y) / 2) * innerHeight}px`
  }
}

/** Writes the selected piece's fit from the gizmo, on the head fitted: only the field the gizmo's mode moves. */
gizmo.addEventListener('objectChange', () => {
  if (!selected) return
  const { object, made } = active().avatar.worn.get(selected)!
  const field = gizmo.mode === 'translate' ? 'at' : gizmo.mode === 'rotate' ? 'turn' : 'scale'
  const key = keyOf(look)
  setFit(selected, { ...wardrobe.fits[selected]?.[key], [field]: fitOfObject(made, object)[field] }, key)
})

function writeFit(part: string, fit: Fit | null, under: string) {
  const keys = { ...wardrobe.fits[part] }
  if (fit === null || Object.keys(fit).length === 0) delete keys[under]
  else keys[under] = fit
  const fits = { ...wardrobe.fits }
  if (Object.keys(keys).length) fits[part] = keys
  else delete fits[part]
  wardrobe = { ...wardrobe, fits }
  for (const f of figures) refit(f)
}

function setFit(part: string, fit: Fit | null, under = keyOf(look)) {
  writeFit(part, fit, under)
  drawTags()
  renderPanels()
  return state()
}

/** The piece's fit as worn now becomes the default for every head, and this head follows it. */
function asDefault(part: string) {
  const { fit } = fitFrom(wardrobe, cat, part, wornBy(look))
  writeFit(part, fit, '*')
  return setFit(part, null, keyOf(look))
}

function keepOutfit(name: string) {
  if (look.species !== 'character') throw new Error('an outfit dresses a character: a bot is dressed by the mix alone')
  if (!name) throw new Error('an outfit needs a name')
  wardrobe = { ...wardrobe, outfits: { ...wardrobe.outfits, [name]: outfitOf(look) } }
  outfit = name
  look = { ...look, outfit: name }
  renderPanels()
  return state()
}

/** An outfit under another name, in the mix's `except` too. */
const locked = (name: string) => (STAFF as readonly string[]).includes(name)

function renameOutfit(from: string, to: string) {
  if (!(from in wardrobe.outfits)) throw new Error(`no outfit "${from}"`)
  if (locked(from)) throw new Error(`Tower 3D dresses the ${from} by name: it keeps its name`)
  if (!to) throw new Error('an outfit needs a name')
  if (to !== from && to in wardrobe.outfits) throw new Error(`there is an outfit "${to}" already`)
  const outfits = Object.fromEntries(Object.entries(wardrobe.outfits).map(([n, o]) => [n === from ? to : n, o]))
  const except = wardrobe.mix.outfits.except?.map((n) => (n === from ? to : n))
  wardrobe = { ...wardrobe, outfits, mix: { ...wardrobe.mix, outfits: { ...wardrobe.mix.outfits, except } } }
  if (outfit === from) outfit = to
  renaming = undefined
  renderPanels()
  return state()
}

function unkeepOutfit(name: string) {
  if (locked(name)) throw new Error(`Tower 3D dresses the ${name} by name: it stays`)
  const { [name]: _, ...outfits } = wardrobe.outfits
  const except = wardrobe.mix.outfits.except?.filter((n) => n !== name)
  wardrobe = { ...wardrobe, outfits, mix: { ...wardrobe.mix, outfits: { ...wardrobe.mix.outfits, except } } }
  if (outfit === name) outfit = undefined
  renderPanels()
  return state()
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const keyWords = (k: string) => (k === '*' ? 'every head' : k === 'bot' ? 'bots' : k)

/** What turns wardrobe `from` into `to`, one line per kind: the fits by piece and key, the outfits, the mix. */
function changesOf(from: Wardrobe, to: Wardrobe): string[] {
  const fits = [...new Set([...Object.keys(from.fits), ...Object.keys(to.fits)])].sort().flatMap((part) => {
    const a = from.fits[part] ?? {}
    const b = to.fits[part] ?? {}
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k]))
    return keys.length ? [`${part} on ${keys.map((k) => `${k in b ? '' : '− '}${keyWords(k)}`).join(', ')}`] : []
  })
  const gone = Object.keys(from.outfits).filter((n) => !(n in to.outfits))
  const added = Object.keys(to.outfits).filter((n) => !(n in from.outfits))
  const renamed = gone.flatMap((g) => added.filter((a) => same(from.outfits[g], to.outfits[a])).slice(0, 1).map((a) => [g, a]))
  const outfits = [
    ...renamed.map(([g, a]) => `renamed ${g} → ${a}`),
    ...added.filter((a) => !renamed.some(([, r]) => r === a)).map((a) => `+ ${a}`),
    ...Object.keys(to.outfits).filter((n) => n in from.outfits && !same(from.outfits[n], to.outfits[n])).map((n) => `changed ${n}`),
    ...gone.filter((g) => !renamed.some(([r]) => r === g)).map((g) => `− ${g}`),
  ]
  const mix = (Object.keys(to.mix) as (keyof Wardrobe['mix'])[]).filter((k) => !same(from.mix[k], to.mix[k]))
  return [
    ...(fits.length ? [`fits: ${fits.join(' · ')}`] : []),
    ...(outfits.length ? [`outfits: ${outfits.join(', ')}`] : []),
    ...(mix.length ? [`mix: ${mix.join(', ')}`] : []),
  ]
}

/** The wardrobe in the file now, when the server is behind the page; else the one the page was built with. */
async function readDisk(): Promise<Wardrobe> {
  if (!server) return disk
  const res = await fetch('wardrobe', { cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  return parseWardrobe(await res.json(), 'renderers/tower3d/wardrobe.json')
}

/** The edited wardrobe, checked as Tower 3D checks it when it loads. */
function checked() {
  const wrong = problems(wardrobe, cat)
  if (wrong.length) throw new Error(`the wardrobe has problems:\n${wrong.join('\n')}`)
  return formatWardrobe(wardrobe)
}

async function changes() {
  disk = await readDisk()
  return changesOf(disk, wardrobe)
}

async function save() {
  const text = checked()
  if (!server) throw new Error('no tool:dresser server behind this page: copy the JSON into renderers/tower3d/wardrobe.json')
  const res = await fetch('wardrobe', { method: 'PUT', body: text })
  if (!res.ok) throw new Error(await res.text())
  disk = wardrobe
  confirming = undefined
  renderPanels()
  return res.text()
}

/** What the worker fitted costs to draw: a call per visible mesh, and its triangles; and the selected piece's triangles. */
function cost() {
  let calls = 0
  let triangles = 0
  const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3
  const seen = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
    return true
  }
  active().avatar.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !seen(o)) return
    calls++
    triangles += tris(o.geometry)
  })
  let piece = 0
  const worn = selected && active().avatar.worn.get(selected)
  if (worn) worn.object.traverse((o) => o instanceof THREE.Mesh && (piece += tris(o.geometry)))
  return { calls, triangles, piece }
}

const say = (text: string) => ((note = text), renderFit())
const run = (act: () => unknown) => {
  try {
    const r = act()
    if (r instanceof Promise) r.catch((e: Error) => say(`!${e.message}`))
  } catch (e) {
    say(`!${(e as Error).message}`)
  }
}

function applyMix(text: string) {
  wardrobe = parseWardrobe({ ...wardrobe, mix: JSON.parse(text) }, 'the mix')
  checked()
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const options = (xs: readonly string[], on: string | undefined, bare?: string) =>
  (bare === undefined ? '' : `<option value="">${bare}</option>`) + xs.map((x) => `<option ${x === on ? 'selected' : ''}>${esc(x)}</option>`).join('')
const DIE = `<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5.3" cy="5.3" r="1.3"/><circle cx="10.7" cy="5.3" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="5.3" cy="10.7" r="1.3"/><circle cx="10.7" cy="10.7" r="1.3"/></svg>`
const die = (data: string) => `<button class="die" title="roll" aria-label="roll" ${data}>${DIE}</button>`
const swatches = (field: string, xs: readonly string[], on: string) =>
  `<label class="row"><span>${field[0].toUpperCase()}${field.slice(1)}</span><span class="swatches">${xs.map((c) => `<i data-swatch="${field}" data-value="${c}" class="${c === on ? 'on' : ''}" style="background:${c}" title="${c}"></i>`).join('')}</span>${die(`data-roll-colour="${field}"`)}</label>`

function renderLook() {
  const { mix } = wardrobe
  const adv = look.species === 'character' ? look : undefined
  const base = adv ? adv.body : 'bot'
  const names = Object.keys(wardrobe.outfits).sort()
  const kept = outfit !== undefined && adv && same(outfitOf(adv), wardrobe.outfits[outfit])
  document.getElementById('look')!.innerHTML = `
    <h1>Dresser</h1>
    <h3>Start from</h3>
    <div class="bodies">${BASES.map((b) => `<button data-base="${b}" class="${b === base ? 'on' : ''}">${b}</button>`).join('')}</div>
    <button class="big" data-act="random">${DIE} Randomize the whole look</button>
    <h3>Parts</h3>
    ${slotsOf(look).map((s) => `<label class="row"><span>${s}</span><select data-slot="${s}">${options(partsFor(look, s), partIn(look, s), s === 'Head' ? undefined : '— bare —')}</select>${die(`data-roll-slot="${s}"`)}</label>`).join('')}
    ${adv ? `<label class="row"><span>Paint</span><select data-paint>${options(bodyOf(adv.body).paints, adv.paint)}</select></label>` : ''}
    <h3>Colours</h3>
    ${adv ? swatches('skin', mix.skins, adv.skin) + swatches('hair', mix.hairs, adv.hair) : `<label class="row"><span>Hue</span><span class="swatches"><i class="on" style="background:${look.species === 'bot' ? look.hue : ''}"></i></span>${die('data-roll-colour="hue"')}</label>`}
    ${swatches('wear', mix.wears, look.wear)}
    <h3>Outfits</h3>
    <div class="outfits">${names.map((n) =>
      renaming === n
        ? `<div class="row"><input type="text" id="rename" value="${esc(n)}"><button data-rename-to="${esc(n)}">✓</button><button data-act="rename-cancel">✕</button></div>`
        : `<div class="row"><button class="name ${n === outfit ? 'on' : ''}" data-outfit="${esc(n)}" title="${mix.outfits.except?.includes(n) ? 'worn only by name' : 'in the mix'}">${esc(n)}</button>${locked(n) ? '<span class="muted" title="Tower 3D dresses it by name">locked</span>' : `<button data-rename="${esc(n)}" title="rename">✎</button><button data-unkeep="${esc(n)}" title="delete">✕</button>`}</div>`).join('')}</div>
    ${adv ? `<div class="row"><input type="text" id="outfit-name" placeholder="a name for this look"><button data-act="keep">Keep as new</button></div>
    ${outfit && !kept ? `<button data-act="update">Update “${esc(outfit)}” to this look</button>` : ''}
    <div class="muted">An outfit keeps every slot as shown, bare ones too.</div>` : '<div class="muted">Outfits dress characters.</div>'}
    <details><summary>Advanced</summary>
      <div class="row"><input type="text" id="who" placeholder="a session id or CALLSIGN"><button data-act="who">Load worker</button></div>
      ${(['width', 'height'] as const).map((d) => `<label class="row"><span>${d[0].toUpperCase()}${d.slice(1)}</span><input type="range" min="0.85" max="1.15" step="0.01" data-build="${d}" value="${look.build[d]}"><code>${look.build[d].toFixed(2)}</code></label>`).join('')}
    </details>`
}

function renderFit() {
  const f = active()
  const pieces = [...f.avatar.worn.keys()]
  const piece = selected ? f.avatar.worn.get(selected) : undefined
  const key = keyOf(look)
  const resolved = selected ? fitFrom(wardrobe, cat, selected, wornBy(look)) : undefined
  const now = piece ? fitOfObject(piece.made, piece.object) : undefined
  const scale3 = now ? (typeof now.scale === 'number' ? [now.scale, now.scale, now.scale] : now.scale) : []
  const axes = (field: keyof Fit, values: number[], step: number) => `<b>${field}</b>${values.map((v, i) => `<input type="number" step="${step}" data-field="${field}" data-axis="${i}" value="${v}">`).join('')}`
  const state = selected ? fitState(selected, key) : undefined
  const where = look.species === 'bot' ? 'bots' : key
  const c = cost()
  const unsaved = formatWardrobe(wardrobe) !== formatWardrobe(disk)
  document.getElementById('fit')!.innerHTML = `
    <h1>Fit</h1>
    <div class="cost">this worker <b>${c.calls}</b> draw calls · <b>${c.triangles.toLocaleString()}</b> triangles${selected ? `<br>${esc(selected)} <b>${c.piece.toLocaleString()}</b> triangles` : ''}</div>
    <button data-act="heads" class="big ${lineUp ? 'on' : ''}" ${look.species === 'bot' ? 'disabled' : ''}>${lineUp ? 'Every head: click one to fit on it' : 'Line up every head'}</button>
    <div class="muted">Click a piece the worker wears, or pick it:</div>
    <div class="worn">${pieces.length ? pieces.map((p) => `<button data-select="${esc(p)}" class="${p === selected ? 'on' : ''}">${esc(p)}<small>${cat.parts[p].slot}</small></button>`).join('') : '<span class="muted">nothing rigid worn</span>'}</div>
    ${selected && now && resolved && state ? `
      <div class="state">Fitting <b>${esc(selected)}</b> on <b>${esc(where)}</b>: ${state === 'own' ? '✓ fitted here' : state === 'default' ? 'follows the default for every head' : 'as made'}. Changes save to ${esc(where)}.</div>
      <div class="group">${(['translate', 'rotate', 'scale'] as const).map((m) => `<button data-mode="${m}" class="${gizmo.mode === m ? 'on' : ''}">${m} <kbd>${m[0].toUpperCase()}</kbd></button>`).join('')}</div>
      <label class="row"><span>Size</span><input type="range" min="0.3" max="2" step="0.01" data-size value="${scale3[0]}"><code>${scale3[0].toFixed(2)}</code></label>
      <div class="axes">${axes('at', now.at, 0.005)}${axes('turn', now.turn, 1)}${axes('scale', scale3, 0.01)}</div>
      <div class="group">${state === 'own' ? `<button data-act="reset">Reset ${esc(where)}</button>` : ''}${look.species === 'character' ? `<button data-act="default">Set as default for every head</button>` : ''}</div>
      <div class="keys"><kbd>Esc</kbd> deselect · <kbd>F</kbd> frame the piece</div>
      <details><summary>Where each value comes from</summary>
        <div class="from">${(['at', 'turn', 'scale'] as const).map((field) => `${field} ← ${esc(keyWords(resolved.from[field] ?? 'made'))}`).join(' · ')}</div>
        <div class="from">${Object.entries(wardrobe.fits[selected] ?? {}).map(([k, v]) => `${esc(keyWords(k))}: ${esc(JSON.stringify(v))}`).join('<br>') || 'no fits: as made'}</div>
      </details>` : ''}
    <h3>Wardrobe</h3>
    ${confirming ? `<div class="confirm"><b>Write these changes to wardrobe.json?</b><ul>${confirming.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><div class="row"><button data-act="write" class="on">Write</button><button data-act="cancel">Cancel</button></div></div>` : ''}
    <div class="row">${server ? `<button data-act="save" ${unsaved ? '' : 'disabled'}>Save…</button>` : ''}<button data-act="json" class="${jsonOpen ? 'on' : ''}">Copy JSON</button><button data-act="mix" class="${mixOpen ? 'on' : ''}">Mix</button></div>
    <div class="muted">${unsaved ? 'unsaved changes' : 'as saved'}${server ? '' : ' · no server: copy the JSON into renderers/tower3d/wardrobe.json'}</div>
    ${note ? `<div class="${note.startsWith('!') ? 'warn' : 'muted'}">${esc(note.replace(/^!/, ''))}</div>` : ''}
    ${jsonOpen ? `<textarea readonly>${esc(formatWardrobe(wardrobe))}</textarea>` : ''}
    ${mixOpen ? `<div class="muted">The palettes are the swatches: add a colour to skins, hairs or wears to offer it.</div><textarea id="mix">${esc(JSON.stringify(wardrobe.mix, null, 1))}</textarea><button data-act="apply-mix">Apply mix</button>` : ''}`
}

function renderBar() {
  document.getElementById('bar')!.innerHTML = `
    <div class="group">${POSES.map((p) => `<button data-pose="${p}" class="${p === shown ? 'on' : ''}">${p}</button>`).join('')}</div>
    <select data-clip style="flex: none; width: 150px"><option value="">clip…</option>${CLIPS.map((c) => `<option ${c === shown ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <button data-act="play">${playing ? 'Pause' : 'Play'}</button>
    <input type="range" id="scrub" min="0" max="${LOOP}" step="0.01" value="${t % LOOP}">
    <span id="clock">${(t % LOOP).toFixed(2)} s</span>
    <div class="group">${(Object.keys(VIEWS) as View[]).map((v) => `<button data-view="${v}" class="${v === view ? 'on' : ''}">${v}</button>`).join('')}</div>`
}

function renderPanels() {
  renderLook()
  renderFit()
  renderBar()
}

function change(next: Look) {
  look = next
  redress()
}

/** The look with a colour from the panel. */
const coloured = (field: string, value: string): Look => ({ ...look, [field]: value }) as Look

function rollColour(field: string) {
  const { mix } = wardrobe
  if (field === 'hue') return change(coloured('hue', randomHue()))
  const palette = field === 'skin' ? mix.skins : field === 'hair' ? mix.hairs : mix.wears
  change(coloured(field, anyOf(palette, (look as Record<string, unknown>)[field] as string)))
}

async function loadWorker(who: string) {
  const id = server && /^[A-Z]+-\d+$/.test(who) ? await fetch(`who/${who}`).then(async (r) => (r.ok ? r.text() : Promise.reject(new Error(await r.text())))) : who
  setLook({ id })
}

const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim()

document.body.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button,[data-swatch]')
  if (!el) return
  const d = el.dataset
  if (d.base) setLook({ body: d.base as Base })
  if (d.outfit) setLook({ outfit: d.outfit })
  if (d.rollSlot) change(withPart(look, d.rollSlot as Slot, anyOf(partsFor(look, d.rollSlot as Slot), partIn(look, d.rollSlot as Slot))))
  if (d.rollColour) rollColour(d.rollColour)
  if (d.swatch) change(coloured(d.swatch, d.value!))
  if (d.pose) setPose(d.pose as PoseName)
  if (d.view) setView(d.view as View)
  if (d.select) select(d.select)
  if (d.mode) (gizmo.setMode(d.mode as 'translate'), renderFit())
  if (d.rename) ((renaming = d.rename), renderLook())
  if (d.renameTo) run(() => renameOutfit(d.renameTo!, value('rename')))
  if (d.unkeep) unkeepOutfit(d.unkeep)
  if (d.act === 'random') setLook('random')
  if (d.act === 'who') run(() => loadWorker(value('who')))
  if (d.act === 'rename-cancel') ((renaming = undefined), renderLook())
  if (d.act === 'keep') run(() => keepOutfit(value('outfit-name')))
  if (d.act === 'update' && outfit) run(() => keepOutfit(outfit!))
  if (d.act === 'play') ((playing = !playing), renderBar())
  if (d.act === 'heads') setHeads(!lineUp)
  if (d.act === 'reset' && selected) setFit(selected, null)
  if (d.act === 'default' && selected) asDefault(selected)
  if (d.act === 'save') run(() => changes().then((lines) => (lines.length ? ((confirming = lines), renderFit()) : say('nothing to save: the file already holds this wardrobe'))))
  if (d.act === 'write') run(() => save().then((file) => say(`saved ${file}: \`npm run tower3d\` puts it in Tower 3D`)))
  if (d.act === 'cancel') ((confirming = undefined), renderFit())
  if (d.act === 'json') run(() => ((jsonOpen = !jsonOpen), jsonOpen && navigator.clipboard.writeText(checked()).then(() => say('copied'), () => say('the clipboard refused: copy it from below')), renderFit()))
  if (d.act === 'mix') ((mixOpen = !mixOpen), renderFit())
  if (d.act === 'apply-mix') run(() => (applyMix((document.getElementById('mix') as HTMLTextAreaElement).value), redress(), say('mix applied')))
})

document.body.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement
  const d = el.dataset
  if (el.id === 'scrub') {
    playing = false
    t = Number(el.value)
    animate()
    document.getElementById('clock')!.textContent = `${t.toFixed(2)} s`
    return
  }
  if (d.size !== undefined && selected) writeFit(selected, { ...wardrobe.fits[selected]?.[keyOf(look)], scale: Number(el.value) }, keyOf(look))
  if (d.build) ((look = { ...look, build: { ...look.build, [d.build]: Number(el.value) } }), restage())
  const label = el.nextElementSibling
  if (el.type === 'range' && label?.tagName === 'CODE') label.textContent = Number(el.value).toFixed(2)
})

document.body.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement | HTMLInputElement
  const d = el.dataset
  if (d.slot) change(withPart(look, d.slot as Slot, el.value || undefined))
  if (d.paint !== undefined) change({ ...look, paint: el.value } as Look)
  if (d.clip !== undefined && isClip(el.value)) setPose(el.value)
  if (el.type === 'range') (drawTags(), renderPanels())
  if (d.field && selected) {
    const inputs = [...document.querySelectorAll<HTMLInputElement>(`[data-field="${d.field}"]`)].map((i) => Number(i.value)) as Vec3
    setFit(selected, { ...wardrobe.fits[selected]?.[keyOf(look)], [d.field]: d.field === 'scale' && inputs.every((v) => v === inputs[0]) ? inputs[0] : inputs })
  }
})

addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || !selected) return
  const mode = ({ t: 'translate', r: 'rotate', s: 'scale' } as const)[e.key.toLowerCase() as 't' | 'r' | 's']
  if (mode) (gizmo.setMode(mode), renderFit())
  else if (e.key === 'Escape') select(undefined)
  else if (e.key.toLowerCase() === 'f') frameSelected()
  else return
  e.preventDefault()
})

/** What a click on the stand hit: the figure, and the piece of it worn there, if any. */
function picked(x: number, y: number) {
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera)
  const hit = ray.intersectObjects(figures.map((f) => f.avatar.root), true)[0]
  if (!hit) return undefined
  const within = (o: THREE.Object3D, of: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === of) return true
    return false
  }
  const f = figures.find((g) => within(hit.object, g.avatar.root))!
  const piece = [...f.avatar.worn].find(([, w]) => within(hit.object, w.object))?.[0]
  return { figure: f, piece }
}

let down: { x: number; y: number } | undefined
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }))
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || gizmo.dragging) return
  const hit = picked(e.clientX, e.clientY)
  if (!hit) return
  if (hit.figure.head && hit.figure !== active()) {
    if (hit.piece) selected = hit.piece
    setHead(hit.figure.head)
  } else if (hit.piece) select(hit.piece)
})

function setPose(name: PoseName, at?: number) {
  if (!(POSES as readonly string[]).includes(name) && !isClip(name)) throw new Error(`no pose "${name}": ${POSES.join(', ')}, or a clip: ${CLIPS.join(', ')}`)
  shown = name
  for (const f of figures) f.avatar.rig.last = f.avatar.rig.fade = undefined
  if (at !== undefined) ((t = at), (playing = false))
  animate()
  frame()
  renderBar()
  return state()
}

function setView(v: View) {
  if (!(v in VIEWS)) throw new Error(`no view "${v}": ${Object.keys(VIEWS).join(', ')}`)
  view = v
  frame()
  renderBar()
}

function setHeads(on: boolean) {
  lineUp = on
  redress()
  frame()
  return state()
}

type LookSpec = 'random' | { body: Base } | { id: string } | { outfit: string } | { look: Partial<Look> }

function lookFrom(spec: LookSpec): Look {
  if (spec === 'random') return lookOf(Math.random().toString(36).slice(2), wardrobe, cat)
  if ('body' in spec) {
    if (!BASES.includes(spec.body)) throw new Error(`no body "${spec.body}": ${BASES.join(', ')}`)
    return based(spec.body)
  }
  if ('id' in spec) return lookOf(spec.id, wardrobe, cat)
  if ('outfit' in spec) {
    if (!(spec.outfit in wardrobe.outfits)) throw new Error(`no outfit "${spec.outfit}": ${Object.keys(wardrobe.outfits).join(', ')}`)
    return lookNamed(spec.outfit, wardrobe, cat)
  }
  return { ...look, ...spec.look } as Look
}

function setLook(spec: LookSpec) {
  look = lookFrom(spec)
  outfit = look.species === 'character' ? look.outfit : undefined
  redress()
  frame()
  return state()
}

function state() {
  const worn = wornBy(look)
  return {
    look,
    outfit,
    pose: shown,
    t,
    view,
    heads: figures.length,
    selected,
    fitting: selected ? { part: selected, on: keyOf(look), state: fitState(selected, keyOf(look)) } : undefined,
    worn: [...active().avatar.worn.keys()].map((part) => ({ part, slot: cat.parts[part].slot, ...fitFrom(wardrobe, cat, part, worn) })),
    unsaved: formatWardrobe(wardrobe) !== formatWardrobe(disk),
    problems: problems(wardrobe, cat),
  }
}

/** A worn piece of the worker fitted, or a head of the line-up, on screen in CSS pixels. */
function where(target: string) {
  const piece = active().avatar.worn.get(target)
  const f = figures.find((g) => g.head === target)
  if (!piece && !f) throw new Error(`"${target}" is neither a rigid piece worn (${[...active().avatar.worn.keys()].join(', ')}) nor a head in the line-up`)
  const p = (piece ? piece.object.getWorldPosition(new THREE.Vector3()) : f!.avatar.rig.bone('head').getWorldPosition(new THREE.Vector3())).project(camera)
  return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight }
}

async function shot({ w = 1200, h = 900 }: { w?: number; h?: number } = {}) {
  const helper = gizmo.getHelper()
  const was = helper.visible
  helper.visible = false
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  frame(1)
  renderer.render(scene, camera)
  const data = canvas.toDataURL('image/png')
  helper.visible = was
  resize()
  frame()
  return data
}

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

const ready = Promise.all([
  loadModels(),
  fetch('wardrobe', { cache: 'no-store' }).then((r) => (r.ok && r.headers.get('content-type')?.startsWith('application/json') ? r.json() : undefined), () => undefined),
]).then(([m, file]) => {
  models = m
  cat = m.catalogue
  server = file !== undefined
  if (server) wardrobe = disk = parseWardrobe(file, 'renderers/tower3d/wardrobe.json')
  const q = new URLSearchParams(location.search)
  look = lookFrom(q.get('outfit') ? { outfit: q.get('outfit')! } : q.get('id') ? { id: q.get('id')! } : { body: 'Knight' })
  outfit = look.species === 'character' ? look.outfit : undefined
  if (q.get('pose')) shown = q.get('pose') as PoseName
  if (q.get('view')) view = q.get('view') as View
  redress()
  frame()
})

declare global {
  interface Window {
    dresser: {
      ready(): Promise<void>
      look(spec: LookSpec): ReturnType<typeof state>
      head(name: string): ReturnType<typeof state>
      wear(part: string): ReturnType<typeof state>
      pose(name: PoseName, at?: number): ReturnType<typeof state>
      fit(part: string, fit: Fit | null, key?: string): ReturnType<typeof state>
      outfit(name: string): ReturnType<typeof state>
      rename(from: string, to: string): ReturnType<typeof state>
      unkeep(name: string): ReturnType<typeof state>
      changes(): Promise<string[]>
      wardrobe(): string
      save(): Promise<string>
      select(part: string | undefined): void
      heads(on: boolean): ReturnType<typeof state>
      view(v: View): void
      state(): ReturnType<typeof state>
      cost(): ReturnType<typeof cost>
      where(target: string): { x: number; y: number }
      shot(size?: { w?: number; h?: number }): Promise<string>
    }
  }
}

window.dresser = {
  ready: () => ready.then(() => undefined),
  look: setLook,
  head: setHead,
  wear,
  pose: setPose,
  fit: setFit,
  outfit: keepOutfit,
  rename: renameOutfit,
  unkeep: unkeepOutfit,
  changes,
  wardrobe: () => formatWardrobe(wardrobe),
  save,
  select,
  heads: setHeads,
  view: setView,
  state,
  cost,
  where,
  shot,
}

let last = performance.now()
renderer.setAnimationLoop((now) => {
  if (playing && models) {
    t += (now - last) / 1000
    animate()
    const scrub = document.getElementById('scrub') as HTMLInputElement | null
    if (scrub) scrub.value = String(t % LOOP)
    const clock = document.getElementById('clock')
    if (clock) clock.textContent = `${(t % LOOP).toFixed(2)} s`
  }
  last = now
  orbit.update()
  placeTags()
  renderer.render(scene, camera)
})
