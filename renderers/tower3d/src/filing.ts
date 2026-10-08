import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { act } from './acts.ts'
import { dayName, type Drawer } from './archive.ts'
import { WORLD } from './cards.ts'
import { FILING, filingSpot, type Level, type Plan } from './layout.ts'
import { fitted } from './sign.ts'
import { block, dispose, mesh, toon } from './toon.ts'

type FloorLevel = Extract<Level, { kind: 'floor' }>

/**
 * A floor's filing cabinet (src/layout.ts places it beside the Running board): its archive read, a drawer per day, the
 * latest at the top, a folder per worker that left the board, its callsign on the tab. Pulling a drawer slides it out
 * with its folders standing in it.
 */

/** The drawers' measures: how high each front is, the gap between fronts, how far one pulls out, the folders it shows standing. */
const DRAWER = { height: (FILING.height - 0.06) / FILING.drawers, gap: 0.012, pull: 0.38, folders: 12 }
const STEEL = '#7c8592'
const MANILA = '#e6cf98'

export type Filing = {
  group: THREE.Group
  key: string
  drawers: { group: THREE.Group; tray: THREE.Group; out: number; folders: string }[]
  /** Each drawer's day and folders, as the cabinet was built with them. */
  days: Drawer[]
}

/** What the cabinet shows: rebuilt only when this changes. */
export const filingKey = (p: Plan, level: FloorLevel, days: Drawer[] | undefined) =>
  JSON.stringify([filingSpot(p), level.y, days?.map((d) => [d.day, d.before, d.folders.map((c) => [c.id, c.callsign])])])

/** A drawer front's card holder: its day and how many workers it holds, or nothing yet. */
function labelOf(d: Drawer | undefined) {
  const cv = Object.assign(document.createElement('canvas'), { width: 256, height: 96 })
  const g = cv.getContext('2d')!
  g.fillStyle = '#f4f1ea'
  g.fillRect(0, 0, cv.width, cv.height)
  g.fillStyle = WORLD.ink
  g.textBaseline = 'middle'
  g.font = `800 34px ${type.display}`
  g.fillText(d ? dayName(d.day).toUpperCase() : '—', 10, 32)
  g.fillStyle = WORLD.muted
  g.font = `700 26px ${type.ui}`
  if (d) g.fillText(fitted(g, `${d.before ? 'and before · ' : ''}${d.folders.length} worker${d.folders.length === 1 ? '' : 's'}`, 236), 10, 72)
  const texture = new THREE.CanvasTexture(cv)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
}

/** A folder's tab: its worker's callsign. */
function tabOf(callsign: string) {
  const cv = Object.assign(document.createElement('canvas'), { width: 192, height: 48 })
  const g = cv.getContext('2d')!
  g.fillStyle = MANILA
  g.fillRect(0, 0, cv.width, cv.height)
  g.fillStyle = WORLD.ink
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.font = `800 26px ${type.display}`
  g.fillText(fitted(g, callsign, 180), cv.width / 2, cv.height / 2 + 2)
  const texture = new THREE.CanvasTexture(cv)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
}

/**
 * The cabinet in its own space, facing +z (turned to face +x where it stands): a steel body, and a drawer per day
 * stacked from the top, each a front with a handle and a card holder over a tray, its own `drawer` act. Days not
 * read yet, or not there, leave a drawer blank and offering nothing.
 */
export function buildFiling(p: Plan, level: FloorLevel, days: Drawer[] | undefined): Filing {
  const group = new THREE.Group()
  const { width: w, depth: d, height: h } = FILING
  const steel = toon(STEEL)
  group.add(block(w, 0.06, d, toon('#4a515c')))
  group.add(block(w, h - 0.06, d - 0.02, steel, 0, 0.06, -0.01))
  group.add(block(w + 0.02, 0.02, d + 0.02, steel, 0, h - 0.02, 0))
  const drawers = Array.from({ length: FILING.drawers }, (_, n) => {
    const day = days?.[n]
    const drawer = new THREE.Group()
    drawer.position.y = h - (n + 1) * DRAWER.height
    const tray = new THREE.Group()
    const front = block(w - 0.03, DRAWER.height - DRAWER.gap, 0.025, toon('#8b95a3'), 0, DRAWER.gap / 2, d / 2)
    const handle = block(0.18, 0.025, 0.03, toon('#c9ced6'), 0, DRAWER.height * 0.35, d / 2 + 0.03)
    const holder = mesh(new THREE.PlaneGeometry(0.16, 0.06), labelOf(day), 0, DRAWER.height * 0.7, d / 2 + 0.014)
    tray.add(block(w - 0.06, 0.01, d - 0.06, steel, 0, 0.03, 0))
    for (const side of [-1, 1]) tray.add(block(0.01, DRAWER.height * 0.6, d - 0.06, steel, side * (w / 2 - 0.035), 0.03, 0))
    drawer.add(front, handle, holder, tray)
    if (day) act(drawer, { kind: 'drawer', project: level.floor.id, n }, [])
    group.add(drawer)
    return { group: drawer, tray, out: 0, folders: '' }
  })
  const spot = filingSpot(p)
  group.position.set(spot.x, level.y, spot.z)
  group.rotation.y = Math.PI / 2
  return { group, key: filingKey(p, level, days), drawers, days: days ?? [] }
}

/** Fills a pulled drawer with its folders, standing front to back, tabs staggered; an empty tray once it is shut. */
function fileFolders(f: Filing, n: number, open: boolean) {
  const drawer = f.drawers[n]
  const want = open ? f.days[n].folders.slice(0, DRAWER.folders).map((c) => c.id).join(' ') : ''
  if (drawer.folders === want) return
  drawer.folders = want
  const old = drawer.tray.getObjectByName('folders')
  if (old) (drawer.tray.remove(old), dispose(old))
  if (!open) return
  const folders = new THREE.Group()
  folders.name = 'folders'
  const manila = toon(MANILA)
  const { width: w, depth: d } = FILING
  const shown = f.days[n].folders.slice(0, DRAWER.folders)
  const step = (d - 0.12) / Math.max(DRAWER.folders, shown.length)
  shown.forEach((c, i) => {
    const z = d / 2 - 0.08 - i * step
    const tall = DRAWER.height * 0.7
    folders.add(block(w - 0.1, tall, 0.008, manila, 0, 0.04, z))
    const tab = mesh(new THREE.PlaneGeometry(0.13, 0.035), tabOf(c.callsign), ((i % 3) - 1) * 0.12, 0.04 + tall + 0.0175, z + 0.005)
    tab.rotation.x = -0.25
    folders.add(tab)
  })
  folders.traverse((o) => (o.userData.act = drawer.group.userData.act))
  drawer.tray.add(folders)
}

/** Slides the open drawer (`open`, its index) out and every other in, by `dt` seconds. */
export function poseFiling(f: Filing, open: number | undefined, dt: number) {
  f.drawers.forEach((drawer, n) => {
    const target = n === open ? DRAWER.pull : 0
    if (drawer.out === target && (n === open) === Boolean(drawer.folders)) return
    if (n === open) fileFolders(f, n, true)
    drawer.out = drawer.out + (target - drawer.out) * Math.min(1, dt * 8)
    if (Math.abs(drawer.out - target) < 0.002) drawer.out = target
    if (drawer.out === 0 && n !== open) fileFolders(f, n, false)
    drawer.group.position.z = drawer.out
  })
}

