import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { act } from './acts.ts'
import { WORLD, base, onStatusColor, shelfPage, statusColor, statusName } from './cards.ts'
import type { Shell } from './api.ts'
import type { Level, Plan, ShelfSlot } from './layout.ts'
import { ROOM, SLAB, STOREY, WALL, consoleSpot, roomBox, roomDoor, shelfX, videoWallZ } from './layout.ts'
import { instance, type Models } from './models.ts'
import { tintOf, type FloorPalette } from './palette.ts'
import { OFFLINE, screenTexture } from './screens.ts'
import { block, glowing, mesh, plate, sprite, toon } from './toon.ts'

/**
 * A floor's control room, in level space (src/layout.ts places it): the walls, the console, the shell bench and the
 * shelf are built with the building; the video wall and the books change on their own.
 */

type FloorLevel = Extract<Level, { kind: 'floor' }>

const DOOR_HEIGHT = 2.5
const glass = new THREE.MeshPhysicalMaterial({ color: '#9cc4ff', transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })
glass.userData.shared = true

/** The shelf boards books stand on (src/models/bookcase.py), their inner width and the books' depth. */
const BOOK_SHELVES = [0.12, 0.62, 1.12, 1.62]
const BOOK_ROW = { width: 1.3, depth: 0.28, clearance: 0.44 }
const BOOK_COLORS = ['#b5523b', '#3b6fb5', '#4f9a5c', '#c9a227', '#7d4fb5', '#2f8f8f', '#c46a8a', '#5a6378', '#d17a2e']

/** A bookcase waiting for its files: books arrive once the shelf's file list does. */
export type Bookcase = { project: string; n: number; books: THREE.Group }

const hash = (s: string) => {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** A canvas picture: a label in the floor's color over a dark field, for a TV or a poster. */
export function picture(lines: [string, string], tint: string, w: number, h: number) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 512, height: Math.round((512 * h) / w) })
  const g = canvas.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, canvas.height)
  grad.addColorStop(0, '#101828')
  grad.addColorStop(1, '#05070d')
  g.fillStyle = grad
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.strokeStyle = tint
  g.lineWidth = 6
  g.strokeRect(14, 14, canvas.width - 28, canvas.height - 28)
  g.textAlign = 'center'
  g.fillStyle = tint
  g.font = `800 64px ${type.display}`
  g.fillText(lines[0], canvas.width / 2, canvas.height / 2 + 8, canvas.width - 60)
  g.fillStyle = '#7d8ba6'
  g.font = '500 28px ui-monospace, Menlo, monospace'
  g.fillText(lines[1], canvas.width / 2, canvas.height / 2 + 56, canvas.width - 60)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
}

const hostOf = (url: string) => URL.parse(url)?.host ?? url

function shelfPiece(slot: ShelfSlot, project: string, tint: string, models: Models, pickables: THREE.Object3D[], bookcases: Bookcase[]) {
  const g = new THREE.Group()
  const { entry, n } = slot
  if (slot.kind === 'md') {
    g.add(instance(models.bookcase).root)
    const books = new THREE.Group()
    g.add(books)
    bookcases.push({ project, n, books })
  }
  if (slot.kind === 'html' || slot.kind === 'url') {
    g.add(instance(models.tv).root)
    const where = 'url' in entry ? hostOf(entry.url) : 'html' in entry || 'item' in entry ? base(shelfPage(entry)) : 'renderer' in entry ? entry.renderer : ''
    g.add(mesh(new THREE.PlaneGeometry(1.3, 0.75), picture([entry.label, where], tint, 1.3, 0.75), 0, 1.45, 0.05))
  }
  if (slot.kind === 'link') {
    g.add(block(0.86, 1.2, 0.04, toon('#20242e'), 0, 0.95, 0))
    g.add(mesh(new THREE.PlaneGeometry(0.78, 1.12), picture([entry.label, '↗ new tab'], tint, 0.78, 1.12), 0, 1.55, 0.025))
  }
  const label = plate(entry.label, 0.2, { color: tint, bg: WORLD.enamel, px: 48 })
  label.position.set(0, slot.kind === 'link' ? 2.35 : 2.3, 0.1)
  g.add(label)
  g.position.z = slot.z
  return act(g, { kind: 'shelf', project, n }, pickables)
}

export const shellTitle = (shell: Shell) => `shell · ${base(shell.cwd)}\n${shell.activity}`

/** A kiosk's tag, drawn for its shell's title and kept by shell id so the title can change in place. */
export function shellTag(shell: Shell, tint: string) {
  const tag = sprite(shellTitle(shell), 0.2, { color: tint, bg: WORLD.enamel, px: 40 })
  tag.position.set(0, 2.45, 0.1)
  tag.userData.shellTag = { id: shell.id, title: shellTitle(shell), tint }
  return tag
}

function kiosk(shell: Shell, tint: string, models: Models, pickables: THREE.Object3D[]) {
  const g = new THREE.Group()
  g.add(instance(models.kiosk).root)
  g.add(mesh(new THREE.PlaneGeometry(1.4, 0.86), new THREE.MeshBasicMaterial({ map: screenTexture(`shell/${shell.id}`), toneMapped: false }), 0, 1.62, 0.16))
  g.add(shellTag(shell, tint))
  return act(g, { kind: 'shell', id: shell.id }, pickables)
}

export function buildRoom(p: Plan, level: FloorLevel, colors: FloorPalette, models: Models, pickables: THREE.Object3D[], bookcases: Bookcase[]) {
  const g = new THREE.Group()
  const tint = tintOf(level.floor)
  const r = roomBox(p)
  const door = roomDoor(p)
  const h = STOREY - SLAB
  const cx = (r.minX + r.maxX) / 2
  const wall = toon(colors.wall)
  const trim = glowing(tint)

  g.add(block(ROOM.width, h, WALL, toon('#141a26'), cx, 0, r.minZ + WALL / 2 + 0.02))
  g.add(block(ROOM.width - 0.6, 2.75, 0.06, toon('#0b0f18'), cx, 1.05, videoWallZ(p) - 0.05))
  g.add(block(ROOM.width - 0.6, 0.04, 0.03, trim, cx, 1.0, videoWallZ(p) - 0.02))
  const title = plate(`${String(level.index).padStart(2, '0')}  ·  ${level.name.toUpperCase()}  ·  CONTROL`, 0.22, { color: tint, px: 56 })
  title.position.set(cx, 0.7, videoWallZ(p))
  g.add(title)

  const side = (from: number, to: number) => block(WALL * 2, h, to - from, wall, r.maxX, 0, (from + to) / 2)
  g.add(side(r.minZ, door.minZ), side(door.maxZ, r.maxZ - WALL))
  g.add(block(WALL * 2, h - DOOR_HEIGHT, door.maxZ - door.minZ, wall, r.maxX, DOOR_HEIGHT, (door.minZ + door.maxZ) / 2))
  g.add(block(0.04, 0.05, door.maxZ - door.minZ + 0.1, trim, r.maxX + WALL + 0.01, DOOR_HEIGHT, (door.minZ + door.maxZ) / 2))
  g.add(block(0.04, 0.05, r.maxZ - r.minZ, trim, r.maxX - WALL - 0.01, 0.1, (r.minZ + r.maxZ) / 2))
  const sign = plate('CONTROL ROOM', 0.3, { color: tint, px: 64 })
  sign.position.set(r.maxX + WALL + 0.02, DOOR_HEIGHT + 0.5, (door.minZ + door.maxZ) / 2)
  sign.rotation.y = Math.PI / 2
  g.add(sign)

  const front = mesh(new THREE.PlaneGeometry(ROOM.width, h - 0.2), glass, cx, 0.1 + (h - 0.2) / 2, r.maxZ)
  g.add(front)
  for (let x = r.minX + 1.5; x < r.maxX; x += 1.5) g.add(block(0.06, h, 0.08, toon('#1d2433'), x, 0, r.maxZ))
  g.add(block(ROOM.width, 0.1, 0.12, toon('#1d2433'), cx, 0, r.maxZ), block(ROOM.width, 0.04, 0.13, trim, cx, 1.1, r.maxZ))

  const desk = instance(models.console)
  desk.material<THREE.MeshBasicMaterial>('tint_glow_own')!.color.set(tint)
  const spot = consoleSpot(p)
  desk.root.position.set(spot.x, 0, spot.z)
  g.add(act(desk.root, { kind: 'floor', id: level.floor.id }, pickables))

  for (const k of level.kiosks) {
    const piece = kiosk(k.shell, tint, models, pickables)
    piece.position.set(k.x, 0, k.z)
    piece.rotation.y = Math.PI / 2
    g.add(piece)
  }

  for (const slot of level.shelf) {
    const piece = shelfPiece(slot, level.floor.id, tint, models, pickables, bookcases)
    piece.position.x = shelfX(p) - 0.22
    piece.rotation.y = -Math.PI / 2
    g.add(piece)
  }
  return g
}

/** A bookcase's books, one per file in the shelf's order, filling the boards from the top. */
export function fillBooks(b: Bookcase, files: string[], pickables: THREE.Object3D[]) {
  b.books.clear()
  let row = BOOK_SHELVES.length - 1
  let x = -BOOK_ROW.width / 2
  for (const file of files) {
    const h = hash(file)
    const thick = 0.045 + (h % 5) * 0.012
    if (x + thick > BOOK_ROW.width / 2) {
      if (row === 0) break
      row -= 1
      x = -BOOK_ROW.width / 2
    }
    const tall = BOOK_ROW.clearance * (0.66 + ((h >> 3) % 5) * 0.06)
    const color = BOOK_COLORS[(h >> 7) % BOOK_COLORS.length]
    const book = block(thick - 0.006, tall, BOOK_ROW.depth, toon(color), x + thick / 2, BOOK_SHELVES[row] + 0.04, 0.02)
    const band = block(thick - 0.004, 0.025, 0.004, toon('#e8d9a8'), x + thick / 2, BOOK_SHELVES[row] + 0.04 + tall * 0.78, 0.02 + BOOK_ROW.depth / 2)
    const spine = new THREE.Group()
    spine.add(book, band)
    b.books.add(act(spine, { kind: 'book', project: b.project, n: b.n, file }, pickables))
    x += thick
  }
}

/** The video wall's tiles for a floor, in world space: every worker's screen, framed in its status. */
export type VideoWall = { group: THREE.Group; frames: { id: string; material: THREE.MeshBasicMaterial }[] }

export function buildVideoWall(p: Plan, level: FloorLevel): VideoWall {
  const group = new THREE.Group()
  const frames: VideoWall['frames'] = []
  const z = videoWallZ(p)
  for (const t of level.tiles) {
    const c = t.card
    const tile = new THREE.Group()
    const live = c.live
    const material = glowing(statusColor(c))
    frames.push({ id: c.id, material })
    tile.add(mesh(new THREE.PlaneGeometry(t.w + 0.08, t.h + 0.08), material, 0, 0, -0.01))
    tile.add(mesh(new THREE.PlaneGeometry(t.w, t.h), new THREE.MeshBasicMaterial({ map: live ? screenTexture(`screen/${c.id}`) : OFFLINE, toneMapped: false })))
    const label = plate(`${c.callsign}  ·  ${statusName(c)}`, Math.min(0.16, t.h * 0.12), { color: onStatusColor(c), bg: statusColor(c), px: 44 })
    label.position.set(0, -t.h / 2 + Math.min(0.16, t.h * 0.12) / 2 + 0.03, 0.01)
    tile.add(label)
    tile.position.set(t.x, level.y + t.y, z)
    group.add(act(tile, { kind: 'tile', id: c.id }, []))
  }
  return { group, frames }
}

/** What a video wall shows: rebuilt only when this changes. */
export const videoWallKey = (level: FloorLevel) =>
  JSON.stringify(level.tiles.map((t) => [t.card.id, t.x, t.y, t.w, t.card.status, t.card.attention, t.card.stranded, t.card.callsign]))
