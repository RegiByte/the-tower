import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type } from '../../../src/shared/design.ts'
import { draftsOf } from '../../../src/shared/drafts.ts'
import type { Board, Shell, Today } from './api.ts'
import { duration, hours, usd } from '../../../src/shared/panels.ts'
import { WEEKLY } from '../../../src/bridge/stats.ts'
import { buildCork } from './cork.ts'
import { buildWall } from './gallery.ts'
import { WORLD, clockAt, weekElapsed } from './cards.ts'
import { wallNow } from './clock.ts'
import type { Level, Plan } from './layout.ts'
import { act } from './acts.ts'
import { CORE, DOOR_WIDTH, LOBBY_HEIGHT, SLAB, STOREY, WALL, bigScreens, coreFront, levelHeight, loungeSpots, rateLimitBoxes, receptionBox, type BigScreen } from './layout.ts'
import { instance, type Models } from './models.ts'
import { buildParty, type Party } from './party.ts'
import { floorPalette, tintOf } from './palette.ts'
import { buildRoom, shellTag, shellTitle, type Bookcase } from './room.ts'
import { block, dispose, glowing, mesh, plate, sprite, toon } from './toon.ts'
import { screenMaterial } from './tv.ts'
import { LOBBY_BAND, paintSign, signOf, signPlate } from './sign.ts'

export type Doors = { left: THREE.Object3D; right: THREE.Object3D }
type RateLimit = Board['rateLimits'][number]

/** The building around the desks: rebuilt when its shape changes, the desks living on through it. */
export type World = {
  group: THREE.Group
  /** Each level's own part of the building (its floor, ceiling, glass, rooms and landing), by level index. */
  levels: THREE.Group[]
  /** Each level's landing doors, by level index. */
  doors: Map<number, Doors>
  car: THREE.Group
  /** The lamp over each floor's elevator doors, lit while someone there waits on you. */
  waitLamps: Map<number, THREE.MeshBasicMaterial>
  beacon: THREE.MeshBasicMaterial
  directory: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }
  /** The face of the roof's stats board, painted with today's numbers as they move. */
  statsBoard: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }
  /** The control rooms' bookcases, to fill once their shelves' files arrive. */
  bookcases: Bookcase[]
  party: Party
  pickables: THREE.Object3D[]
  /** The roof's rate-limit columns, redrawn on their own as the limits and today's numbers move. */
  limits: THREE.Group
  /** Each kiosk's tag by shell id, redrawn on its own as the shell's title changes. */
  shellTags: Map<string, THREE.Sprite>
}

const DOOR_HEIGHT = 2.5
const PANE = 3

const glass = new THREE.MeshPhysicalMaterial({ color: '#9cc4ff', transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide })
glass.userData.shared = true

/** The curtain wall round a level: glass and mullions every PANE. */
function facade(p: Plan, height: number) {
  const g = new THREE.Group()
  const w = p.width / 2
  const d = p.depth / 2
  const sides: [number, number, number, number][] = [[0, d, p.width, 0], [0, -d, p.width, Math.PI], [w, 0, p.depth, Math.PI / 2], [-w, 0, p.depth, -Math.PI / 2]]
  const mullions: THREE.BufferGeometry[] = []
  for (const [x, z, len, rot] of sides) {
    const pane = mesh(new THREE.PlaneGeometry(len, height - 0.6), glass, x, 0.3 + (height - 0.6) / 2, z)
    pane.rotation.y = rot
    g.add(pane)
    const along = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot))
    for (let u = -len / 2; u <= len / 2 + 0.01; u += PANE) {
      const m = new THREE.BoxGeometry(0.08, height, 0.12)
      m.translate(x + along.x * u, height / 2, z + along.z * u)
      mullions.push(m)
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(mullions), toon('#1d2433')))
  return g
}

/**
 * A level's foot on the outside: the spandrel round its slab and a strip in its colour, the roof's slab, or the
 * ground the building stands on. It stands out of the glass, so it is seen from the levels over it too.
 */
function foot(p: Plan, level: Level) {
  const g = new THREE.Group()
  g.position.y = level.y
  if (level.kind === 'lobby') g.add(block(p.width + 8, 0.2, p.depth + 8, toon('#262b36'), 0, -0.2, 0))
  if (level.kind === 'roof') return g.add(block(p.width + 0.3, SLAB, p.depth + 0.3, toon('#1b212d'), 0, -SLAB, 0))
  const { band: tint, spandrel } = level.kind === 'floor' ? floorPalette(tintOf(level.floor)) : { band: LOBBY_BAND, spandrel: '#141a26' }
  const w = p.width / 2
  const d = p.depth / 2
  const band = (y: number, h: number, mat: THREE.Material) => {
    g.add(block(p.width + 0.3, h, 0.3, mat, 0, y, d), block(p.width + 0.3, h, 0.3, mat, 0, y, -d))
    g.add(block(0.3, h, p.depth + 0.3, mat, w, y, 0), block(0.3, h, p.depth + 0.3, mat, -w, y, 0))
  }
  band(-SLAB, SLAB + 0.3, toon(spandrel))
  band(-0.06, 0.05, glowing(tint))
  return g
}

/** The shaft's walls, the full height of the building and a storey over the roof. */
function shaft(p: Plan, top: number) {
  const g = new THREE.Group()
  const back = -p.depth / 2
  const front = coreFront(p)
  const half = CORE.width / 2
  const concrete = toon('#2a303c')
  g.add(block(WALL * 2, top, CORE.depth, concrete, -half, 0, (back + front) / 2))
  g.add(block(WALL * 2, top, CORE.depth, concrete, half, 0, (back + front) / 2))
  g.add(block(CORE.width + WALL * 2, top, WALL * 2, concrete, 0, 0, back))
  g.add(block(CORE.width + WALL * 2, 0.4, CORE.depth + WALL * 2, toon('#1c212c'), 0, top, (back + front) / 2))
  return g
}

/** A level's slice of the core's front: jambs, the header over the doors, and the doors. */
function landing(p: Plan, level: Level, tint: string, facingColor: THREE.ColorRepresentation) {
  const g = new THREE.Group()
  const front = coreFront(p)
  const half = CORE.width / 2
  const h = levelHeight(level.index)
  const jambW = half - DOOR_WIDTH / 2
  const facing = toon(facingColor)
  g.add(block(jambW, h, WALL * 2, facing, -(DOOR_WIDTH / 2 + jambW / 2), 0, front))
  g.add(block(jambW, h, WALL * 2, facing, DOOR_WIDTH / 2 + jambW / 2, 0, front))
  g.add(block(DOOR_WIDTH, h - DOOR_HEIGHT, WALL * 2, facing, 0, DOOR_HEIGHT, front))
  g.add(block(DOOR_WIDTH + 0.16, 0.06, 0.06, glowing(tint), 0, DOOR_HEIGHT, front + WALL + 0.02))
  const steel = toon('#8a93a6')
  const door = (sx: number) => {
    const panel = block(DOOR_WIDTH / 2, DOOR_HEIGHT, 0.06, steel, 0, 0, 0)
    const holder = new THREE.Group()
    holder.add(panel)
    holder.position.set((sx * DOOR_WIDTH) / 4, 0, front + WALL + 0.04)
    holder.userData.closedX = (sx * DOOR_WIDTH) / 4
    holder.userData.side = sx
    g.add(holder)
    return holder
  }
  return { group: g, doors: { left: door(-1), right: door(1) } }
}

/** The car: its own walls, floor and ceiling light, riding in the shaft. */
function car(p: Plan) {
  const g = new THREE.Group()
  const back = -p.depth / 2 + WALL
  const front = coreFront(p) - WALL
  const half = CORE.width / 2 - WALL - 0.04
  const d = front - back
  const zMid = (back + front) / 2
  const panel = toon('#5b6478')
  g.add(block(half * 2, 0.06, d, toon('#3a3f4c'), 0, -0.06, zMid))
  g.add(block(0.05, 2.7, d, panel, -half, 0, zMid), block(0.05, 2.7, d, panel, half, 0, zMid))
  g.add(block(half * 2, 2.7, 0.05, panel, 0, 0, back))
  g.add(block(half * 2, 0.05, d, toon('#20242e'), 0, 2.7, zMid))
  g.add(block(half * 1.4, 0.03, d * 0.6, glowing('#fff4d6'), 0, 2.66, zMid))
  g.add(block(half * 2 - 0.2, 0.05, 0.05, toon('#c0c8d8'), 0, 0.95, back + 0.06))
  return g
}

/** The ceiling's underside, `h` over the floor. */
function ceiling(p: Plan, h: number, color: THREE.ColorRepresentation) {
  const c = mesh(new THREE.PlaneGeometry(p.width, p.depth), toon(color), 0, h - 0.005, 0)
  c.rotation.x = Math.PI / 2
  return c
}

function ceilingLights(p: Plan, h: number, color: THREE.ColorRepresentation) {
  const panels: THREE.BufferGeometry[] = []
  for (let x = -p.width / 2 + 4; x <= p.width / 2 - 4; x += 5.8) {
    for (let z = coreFront(p) + 2; z <= p.depth / 2 - 2; z += 4.8) {
      const panel = new THREE.BoxGeometry(2.2, 0.04, 0.6)
      panel.translate(x, h - 0.03, z)
      panels.push(panel)
    }
  }
  return new THREE.Mesh(mergeGeometries(panels), glowing(color))
}

/** The landing in front of the elevator: a rug in the floor's color with its number painted on, garage-style. */
function landingRug(p: Plan, number: string, tint: string, color: string) {
  const g = new THREE.Group()
  const z = coreFront(p) + 2.4
  g.add(block(CORE.width + 1.6, 0.012, 3.4, toon(color), 0, 0, z))
  const paint = plate(number, 1.7, { color: tint, px: 160 })
  paint.material.opacity = 0.55
  paint.rotation.set(-Math.PI / 2, 0, Math.PI)
  paint.position.set(0, 0.02, z)
  g.add(paint)
  return g
}

function floorLevel(p: Plan, level: Extract<Level, { kind: 'floor' }>, models: Models, pickables: THREE.Object3D[], bookcases: Bookcase[]) {
  const g = new THREE.Group()
  const tint = tintOf(level.floor)
  const colors = floorPalette(tint)
  g.add(block(p.width, SLAB, p.depth, toon('#161b26'), 0, -SLAB, 0))
  g.add(block(p.width - 0.4, 0.01, p.depth - 0.4, toon(colors.carpet), 0, 0, 0))
  g.add(ceiling(p, STOREY - SLAB, colors.ceiling), ceilingLights(p, STOREY - SLAB, colors.light))
  g.add(facade(p, STOREY))
  const number = String(level.index).padStart(2, '0')
  g.add(landingRug(p, number, tint, colors.rug))
  const outside = signPlate(signOf(level, tint), 1)
  outside.position.set(-p.width / 2 + 2 + outside.geometry.parameters.width / 2, STOREY / 2, p.depth / 2 + 0.2)
  g.add(outside)
  g.add(buildRoom(p, level, colors, models, pickables, bookcases))
  g.add(buildWall(level.wall, colors.facing, tint))
  if (level.cork) g.add(buildCork(level.cork, level.floor.id, draftsOf(level.floor)!.label, tint, pickables))
  return g
}

/** A big screen in its frame, `n` of `bigScreens`: on a wall, or standing on legs. */
function bigScreen(s: BigScreen, n: number, mount: 'wall' | 'legs', pickables: THREE.Object3D[]) {
  const g = new THREE.Group()
  const frame = toon('#15181f')
  g.add(block(s.w + 0.3, s.h + 0.3, 0.18, frame, s.x, s.y - (s.h + 0.3) / 2, s.z - 0.1))
  g.add(mesh(new THREE.PlaneGeometry(s.w, s.h), screenMaterial, s.x, s.y, s.z + 0.002))
  g.add(block(s.w * 0.6, 0.04, 0.04, glowing('#ffb547'), s.x, s.y - s.h / 2 - 0.12, s.z + 0.01))
  if (mount === 'legs') {
    for (const side of [-1, 1]) g.add(block(0.22, s.y - s.h / 2, 0.22, frame, s.x + side * (s.w / 2 - 0.8), 0, s.z - 0.1))
    g.add(block(s.w - 1, 0.12, 0.8, frame, s.x, 0, s.z - 0.1))
  }
  return act(g, { kind: 'tv', n }, pickables)
}

/** The lobby lounge: a paneled wall with the big screen, a couch facing it, a table, a rug and a lamp. */
function lounge(p: Plan, models: Models, pickables: THREE.Object3D[]) {
  const g = new THREE.Group()
  const s = bigScreens(p)[0]
  const spots = loungeSpots(p)
  g.add(block(s.w + 2.4, LOBBY_HEIGHT - SLAB, 0.15, toon('#3a2c26'), s.x, 0, s.z - 0.25))
  g.add(bigScreen(s, 0, 'wall', pickables))
  g.add(block(5.4, 0.015, 4.6, toon('#2f4858'), s.x, 0, (spots.table.z + spots.couch.z) / 2 - 0.4))
  const couch = instance(models.couch).root
  couch.position.set(spots.couch.x, 0, spots.couch.z)
  couch.rotation.y = Math.PI
  g.add(couch)
  const wood = toon('#6b4a35')
  g.add(block(1.6, 0.06, 0.8, wood, spots.table.x, 0.36, spots.table.z))
  for (const [dx, dz] of [[-0.7, -0.32], [0.7, -0.32], [-0.7, 0.32], [0.7, 0.32]]) g.add(block(0.06, 0.36, 0.06, wood, spots.table.x + dx, 0, spots.table.z + dz))
  g.add(block(0.18, 0.12, 0.18, toon('#f4f1ea'), spots.table.x + 0.4, 0.42, spots.table.z))
  const lampX = spots.couch.x + 1.9
  g.add(block(0.3, 0.04, 0.3, toon('#20242e'), lampX, 0, spots.couch.z), block(0.04, 1.6, 0.04, toon('#20242e'), lampX, 0, spots.couch.z))
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.32, 16, 1, true), glowing('#ffd9a0'), lampX, 1.72, spots.couch.z))
  return g
}

/** "The Tower" in display caps on an enamel plate: the building's name, its only mark. */
const brandPlate = (height: number) => plate('THE TOWER', height, { color: WORLD.panel, bg: WORLD.enamel, px: 96, weight: 900, shape: 'card', tracking: 0.06 })

function lobbyLevel(p: Plan, directory: World['directory'], models: Models, pickables: THREE.Object3D[]) {
  const g = new THREE.Group()
  g.add(block(p.width - 0.4, 0.01, p.depth - 0.4, toon('#3a3f4a'), 0, 0, 0))
  g.add(ceiling(p, LOBBY_HEIGHT - SLAB, '#323949'), ceilingLights(p, LOBBY_HEIGHT - SLAB, '#fff1d0'))
  g.add(facade(p, LOBBY_HEIGHT))
  const r = receptionBox(p)
  const desk = block(r.maxX - r.minX, 1.1, r.maxZ - r.minZ, toon('#3b4152'), (r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2)
  const top = block(r.maxX - r.minX + 0.2, 0.06, r.maxZ - r.minZ + 0.2, toon('#d8c9a8'), (r.minX + r.maxX) / 2, 1.1, (r.minZ + r.maxZ) / 2)
  g.add(act(desk, { kind: 'directory' }, pickables), act(top, { kind: 'directory' }, pickables))
  const help = sprite('Reception · E for the directory', 0.2, { color: WORLD.ink, bg: WORLD.panel, px: 40, weight: 700, face: 'ui', shape: 'card' })
  help.position.set((r.minX + r.maxX) / 2, 2.1, (r.minZ + r.maxZ) / 2)
  g.add(help)
  const name = brandPlate(0.9)
  name.position.set(0, DOOR_HEIGHT + 1.6, coreFront(p) + WALL + 0.02)
  g.add(name)
  const board = mesh(new THREE.PlaneGeometry(3.2, 2.4), new THREE.MeshBasicMaterial({ map: directory.texture, toneMapped: false }), -CORE.width / 2 - 2.4, 1.9, coreFront(p) + 0.05)
  g.add(act(board, { kind: 'directory' }, pickables))
  const entrance = brandPlate(1.4)
  entrance.position.set(0, LOBBY_HEIGHT - 1, p.depth / 2 + 0.25)
  g.add(entrance)
  return g
}

function roofLevel(p: Plan, level: Extract<Level, { kind: 'roof' }>, hostUp: boolean) {
  const g = new THREE.Group()
  g.add(block(p.width - 0.4, 0.02, p.depth - 0.4, toon('#2b313d'), 0, 0, 0))
  const parapet = toon('#141a26')
  g.add(block(p.width + 0.3, 1.05, 0.3, parapet, 0, 0, p.depth / 2), block(p.width + 0.3, 1.05, 0.3, parapet, 0, 0, -p.depth / 2))
  g.add(block(0.3, 1.05, p.depth, parapet, p.width / 2, 0, 0), block(0.3, 1.05, p.depth, parapet, -p.width / 2, 0, 0))
  const crown = brandPlate(1.6)
  crown.position.set(0, STOREY + 1.3, coreFront(p) + WALL + 0.05)
  g.add(crown)
  if (!hostUp) {
    const down = sprite('HOST DOWN', 1.2, { color: '#fff', bg: WORLD.broken })
    down.position.set(0, 3.2, 0)
    g.add(down)
  }
  return g
}

/**
 * Rate-limit columns filled to the share used, a weekly one collared where an even pace through the week would be and
 * tagged with what the week has left at its pace so far.
 */
function limitColumns(p: Plan, limits: RateLimit[], today: Today) {
  const g = new THREE.Group()
  const boxes = rateLimitBoxes(p, limits.length)
  const now = wallNow()
  const height = (pct: number) => (pct / 100) * 3.6
  limits.forEach((r, i) => {
    const b = boxes[i]
    const x = (b.minX + b.maxX) / 2
    const z = (b.minZ + b.maxZ) / 2
    const color = r.percentUsed > 85 ? WORLD.needs : r.percentUsed > 60 ? WORLD.working : WORLD.quiet
    g.add(block(1.6, 0.2, 1.6, toon('#20242e'), x, 0, z))
    g.add(mesh(new THREE.BoxGeometry(1.4, 3.8, 1.4), glass, x, 0.2 + 1.9, z))
    g.add(block(1.2, 0.15 + height(r.percentUsed), 1.2, glowing(color), x, 0.2, z))
    const elapsed = weekElapsed(r, now)
    if (elapsed !== undefined) g.add(block(1.52, 0.06, 1.52, glowing('#fff'), x, 0.2 + 0.15 + height(elapsed), z))
    const resets = r.resetsAt ? `\nresets ${clockAt(Date.parse(r.resetsAt), now)}` : ''
    const left = r.kind === WEEKLY && today.budget?.usdLeft !== undefined ? `\n≈ ${usd(today.budget.usdLeft)} left` : ''
    const tag = sprite(`${r.kind.replaceAll('_', ' ')} ${r.percentUsed}%${resets}${left}`, 0.42, { color: r.percentUsed > 85 ? '#fff' : WORLD.enamel, bg: color, px: 44 })
    tag.position.set(x, 4.6, z)
    g.add(tag)
  })
  return g
}

export function setLimits(world: World, p: Plan, limits: RateLimit[], today: Today) {
  for (const old of [...world.limits.children]) (world.limits.remove(old), dispose(old))
  world.limits.add(limitColumns(p, limits, today))
  paintStatsBoard(world.statsBoard, today)
}

/** The stats board's frame on two legs, last in the row of rate-limit columns, its face to the elevator. */
function statsStand(p: Plan, limits: number, face: World['statsBoard'], pickables: THREE.Object3D[]) {
  const b = rateLimitBoxes(p, limits)[limits]
  const x = (b.minX + b.maxX) / 2
  const z = (b.minZ + b.maxZ) / 2
  const g = new THREE.Group()
  const frame = toon('#15181f')
  for (const side of [-1, 1]) g.add(block(0.12, 1.2, 0.12, frame, x + side * 0.9, 0, z))
  g.add(block(2.3, 1.6, 0.14, frame, x, 1.15, z))
  const screen = mesh(new THREE.PlaneGeometry(2.1, 1.4), new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false }), x, 1.95, z - 0.075)
  screen.rotation.y = Math.PI
  g.add(screen)
  return act(g, { kind: 'stats' }, pickables)
}

/** Today's numbers on the stats board: what was spent, the work done, how long workers waited on you, the week left. */
export function paintStatsBoard(face: World['statsBoard'], today: Today) {
  const g = face.canvas.getContext('2d')!
  const { width: W, height: H } = face.canvas
  g.fillStyle = WORLD.panel
  g.fillRect(0, 0, W, H)
  g.fillStyle = WORLD.ink
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  g.font = `800 30px ${type.display}`
  g.letterSpacing = `${30 * 0.06}px`
  g.fillText('TODAY', 28, 54)
  g.letterSpacing = '0px'
  g.font = `400 22px ${type.ui}`
  g.fillStyle = WORLD.muted
  g.textAlign = 'right'
  g.fillText(new Date(today.since).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), W - 28, 52)
  g.fillStyle = WORLD.line
  g.fillRect(28, 68, W - 56, 2)
  const rows: [string, string][] = [
    [usd(today.spend), 'spent'],
    [hours(today.agentHours), 'agent-hours'],
    [today.waits.n ? duration(today.waits.p50) : '–', today.waits.n ? `waiting on you, median of ${today.waits.n}` : 'waiting on you'],
    [today.budget?.usdLeft === undefined ? '–' : `≈ ${usd(today.budget.usdLeft)}`, 'left this week'],
  ]
  rows.forEach(([value, label], i) => {
    const y = 128 + i * 66
    g.textAlign = 'left'
    g.fillStyle = WORLD.ink
    g.font = `700 40px ${type.ui}`
    g.fillText(value, 28, y)
    g.fillStyle = WORLD.muted
    g.font = `400 24px ${type.ui}`
    g.fillText(label, 250, y)
  })
  g.fillStyle = WORLD.faint
  g.font = `400 20px ${type.ui}`
  g.fillText("E · every floor's stats", 28, H - 22)
  face.texture.needsUpdate = true
}

export function setShellTitles(world: World, shells: Shell[]) {
  for (const shell of shells) {
    const old = world.shellTags.get(shell.id)
    if (!old || old.userData.shellTag.title === shellTitle(shell)) continue
    const tag = shellTag(shell, old.userData.shellTag.tint)
    old.parent!.add(tag)
    old.parent!.remove(old)
    dispose(old)
    world.shellTags.set(shell.id, tag)
  }
}

/** A canvas to paint and the texture that shows it. */
export function boardFace(width: number, height: number) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return { canvas, texture }
}

/** The lobby's directory board: a floor sign per floor, top floor first, with who's on duty and who waits. */
export function paintDirectory(dir: World['directory'], p: Plan) {
  const g = dir.canvas.getContext('2d')!
  const { width: W, height: H } = dir.canvas
  g.fillStyle = WORLD.panel
  g.fillRect(0, 0, W, H)
  g.fillStyle = WORLD.ink
  g.font = `800 30px ${type.display}`
  g.letterSpacing = `${30 * 0.06}px`
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  g.fillText('DIRECTORY', 28, 54)
  g.letterSpacing = '0px'
  g.fillStyle = WORLD.line
  g.fillRect(28, 68, W - 56, 2)
  const floors = p.levels.filter((l) => l.kind === 'floor').reverse()
  const row = Math.min(48, (H - 100) / Math.max(1, floors.length))
  const h = row * 0.82
  floors.forEach((l, i) => {
    const y = 86 + i * row
    const waiting = l.desks.filter((d) => d.card.waiting).length
    const aside = waiting ? `${waiting} waiting` : `${l.desks.length} on duty`
    g.font = `700 ${Math.round(h * 0.42)}px ${type.ui}`
    const asideW = g.measureText(aside).width + h * 0.6
    paintSign(g, 28, y, W - 56, h, signOf(l, tintOf(l.floor)), asideW + h * 0.2)
    g.font = `700 ${Math.round(h * 0.42)}px ${type.ui}`
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    const cx = W - 28 - h * 0.2 - asideW / 2
    if (waiting) {
      g.fillStyle = WORLD.needs
      g.beginPath()
      g.roundRect(cx - asideW / 2, y + h * 0.2, asideW, h * 0.6, h * 0.3)
      g.fill()
    }
    g.fillStyle = waiting ? '#fff' : WORLD.muted
    g.fillText(aside, cx, y + h / 2 + h * 0.03)
  })
  dir.texture.needsUpdate = true
}

/** The car's panel: a floor sign per level, roof at the top, on enamel. */
function elevatorPanel(p: Plan) {
  const levels = [...p.levels].reverse()
  const W = 400
  const row = 56
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: 24 + levels.length * row })
  const g = cv.getContext('2d')!
  g.fillStyle = WORLD.enamel
  g.fillRect(0, 0, cv.width, cv.height)
  levels.forEach((l, i) => paintSign(g, 16, 16 + i * row, W - 32, row - 10, signOf(l, l.kind === 'floor' ? tintOf(l.floor) : LOBBY_BAND)))
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return { material: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), aspect: cv.width / cv.height }
}

export function buildWorld(p: Plan, board: Board, directory: World['directory'], statsBoard: World['statsBoard'], models: Models): World {
  const group = new THREE.Group()
  const pickables: THREE.Object3D[] = []
  const bookcases: Bookcase[] = []
  const doors = new Map<number, Doors>()
  const waitLamps = new Map<number, THREE.MeshBasicMaterial>()
  const roof = p.levels.at(-1)!
  group.add(shaft(p, roof.y + STOREY))
  let beacon = glowing('#ff3b3b')
  const { group: partyGroup, party } = buildParty(p, models, pickables)
  const limits = new THREE.Group()
  const levels: THREE.Group[] = []
  for (const level of p.levels) {
    const g = new THREE.Group()
    g.position.y = level.y
    const tint = level.kind === 'floor' ? tintOf(level.floor) : LOBBY_BAND
    const facing = level.kind === 'floor' ? floorPalette(tint).facing : '#343c4c'
    if (level.kind === 'lobby') g.add(lobbyLevel(p, directory, models, pickables), lounge(p, models, pickables))
    if (level.kind === 'floor') {
      g.add(floorLevel(p, level, models, pickables, bookcases))
      const lamp = glowing('#2a2f3a')
      g.add(mesh(new THREE.SphereGeometry(0.12, 12, 10), lamp, 0, DOOR_HEIGHT + 0.25, coreFront(p) + WALL + 0.1))
      waitLamps.set(level.index, lamp)
    }
    if (level.kind === 'roof') {
      g.add(roofLevel(p, level, board.hostUp), limits, statsStand(p, level.limits.length, statsBoard, pickables), partyGroup, bigScreen(bigScreens(p)[1], 1, 'legs', pickables))
      g.add(block(0.15, 6, 0.15, toon('#2a3142'), p.width / 2 - 2, 0, -p.depth / 2 + 2))
      beacon = glowing('#ff3b3b')
      g.add(mesh(new THREE.SphereGeometry(0.35, 16, 12), beacon, p.width / 2 - 2, 6.3, -p.depth / 2 + 2))
    }
    const { group: front, doors: d } = landing(p, level, tint, facing)
    const sign = signPlate(signOf(level, tint), 0.42)
    sign.position.set(0, DOOR_HEIGHT + 0.6, coreFront(p) + WALL + 0.02)
    g.add(front, sign)
    doors.set(level.index, d)
    levels.push(g)
    group.add(g, foot(p, level))
  }
  const carGroup = car(p)
  const face = elevatorPanel(p)
  const panelH = Math.min(1.5, 0.5 / face.aspect)
  const panelX = CORE.width / 2 - WALL - 0.1
  const panel = block(0.05, panelH + 0.06, 0.56, toon(WORLD.enamel), panelX, 1.7 - panelH / 2 - 0.03, coreFront(p) - 0.9)
  const faceMesh = mesh(new THREE.PlaneGeometry(panelH * face.aspect, panelH), face.material, panelX - 0.026, 1.7, coreFront(p) - 0.9)
  faceMesh.rotation.y = -Math.PI / 2
  carGroup.add(act(panel, { kind: 'elevator' }, pickables), faceMesh)
  group.add(carGroup)
  const shellTags = new Map<string, THREE.Sprite>()
  group.traverse((o) => o.userData.shellTag && shellTags.set(o.userData.shellTag.id, o as THREE.Sprite))
  const world = { group, levels, doors, car: carGroup, waitLamps, beacon, directory, statsBoard, bookcases, party, pickables, limits, shellTags }
  setLimits(world, p, board.rateLimits, board.today)
  return world
}

/** Slides a level's doors: 0 shut, 1 open. */
export function setDoors(d: Doors, open: number) {
  for (const holder of [d.left, d.right]) holder.position.x = holder.userData.closedX + holder.userData.side * open * (DOOR_WIDTH / 2 - 0.05)
}
