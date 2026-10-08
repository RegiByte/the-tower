import * as THREE from 'three'
import { act } from './acts.ts'
import { avatar, lookOf, pick, roll } from './avatar.ts'
import type { Desk } from './desk.ts'
import { DESK, WALL, carBox, colliders, coreFront, danceSpot, floorOfProject, levelY, partySpots, rateLimitBoxes, walkway, type Box, type Level, type Plan } from './layout.ts'
import type { Card } from './api.ts'
import { SOUNDS, type Sound } from './cards.ts'
import { instance, type Models } from './models.ts'

/**
 * Life in the building: three cats roaming its floors, workers walking in from the elevator and out to it, and the
 * sound of someone starting to wait on you.
 */

const WALK_SPEED = 1.6
export const CAT_SPEED = 2.2

export const walkPose = (body: THREE.Object3D, arms: THREE.Object3D[], t: number) => {
  body.position.y = Math.abs(Math.sin(t * 9)) * 0.06
  body.rotation.set(0, 0, Math.sin(t * 9) * 0.06)
  arms.forEach((a, i) => (a.rotation.x = Math.sin(t * 9 + i * Math.PI) * 0.7))
}

const standPose = (body: THREE.Object3D, arms: THREE.Object3D[]) => {
  body.position.y = 0
  body.rotation.set(0, 0, 0)
  arms.forEach((a) => (a.rotation.x = 0))
}

const headingOf = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z)

/** Where a walker is `d` along a path, facing its way; undefined past its end. */
function along(path: THREE.Vector3[], d: number) {
  for (let i = 1; i < path.length; i++) {
    const leg = path[i - 1].distanceTo(path[i])
    if (d <= leg) return { at: path[i - 1].clone().lerp(path[i], leg > 0 ? d / leg : 1), heading: headingOf(path[i - 1], path[i]) }
    d -= leg
  }
}

/** The walkway to a desk at `desk` (world space), at its level's height. */
const pathTo = (p: Plan, desk: THREE.Vector3) => walkway(p, desk.x, desk.z).map(({ x, z }) => new THREE.Vector3(x, desk.y, z))

/** A new worker on its way from the elevator to its chair: its desk's worker, walked in desk space. */
export type Arrival = { desk: Desk; path: THREE.Vector3[]; t: number }

export function arrival(p: Plan, desk: Desk): Arrival {
  return { desk, path: pathTo(p, desk.group.position).map((v) => v.sub(desk.group.position)), t: 0 }
}

/** Walks an arriving worker toward its seat; true once it sits. */
export function walkIn(a: Arrival, dt: number, t: number) {
  a.t += dt * WALK_SPEED
  const w = a.desk.worker
  const step = along(a.path, a.t)
  if (!step) {
    w.position.copy(a.path.at(-1)!)
    w.rotation.y = 0
    return true
  }
  w.position.copy(step.at)
  w.rotation.y = step.heading
  walkPose(a.desk.body, a.desk.arms, t)
  return false
}

/** A worker gone off duty, walking from its chair into the elevator on its level before it leaves the building. */
export type Leaver = { group: THREE.Group; body: THREE.Object3D; arms: THREE.Object3D[]; level: number; path: THREE.Vector3[]; t: number }

/** A leaver from the desk at `desk` on `level`, starting where its worker stands (both world space). */
export function leaver(p: Plan, id: string, level: number, desk: THREE.Vector3, from: THREE.Vector3, models: Models): Leaver {
  const w = avatar(models, lookOf(id))
  w.bulb.color.set('#3a4458')
  const group = new THREE.Group()
  group.add(w.root)
  const out = pathTo(p, desk).slice(0, -1).reverse()
  const car = out.at(-1)!.clone().setZ(coreFront(p) - 1.2)
  return { group, body: w.body, arms: w.arms, level, path: [from, ...out, car], t: 0 }
}

/** How far ahead of a leaver its elevator's doors open: they are open by the time it reaches them. */
const DOORS_AHEAD = 2.5

export const boarded = (l: Leaver) => !along(l.path, l.t)
export const nearDoors = (l: Leaver) => !along(l.path, l.t + DOORS_AHEAD)

/** Walks a leaver into the elevator, where it turns to face the doors; true once it stands inside. */
export function walkOut(l: Leaver, dt: number, t: number) {
  l.t += dt * WALK_SPEED
  const w = l.group.children[0]
  const step = along(l.path, l.t)
  if (!step) {
    w.position.copy(l.path.at(-1)!)
    w.rotation.y -= w.rotation.y * Math.min(1, dt * 6)
    standPose(l.body, l.arms)
    return true
  }
  w.position.copy(step.at)
  w.rotation.y = step.heading
  walkPose(l.body, l.arms, t)
  return false
}

/** The tower's cats, by coat. The first takes a waiter's desk when no cat is on the waiter's floor. */
export const CATS = ['tabby', 'calico', 'tuxedo'] as const
export type CatName = (typeof CATS)[number]

export type CatPose = 'walk' | 'sit' | 'groom' | 'nap'
const RESTS: CatPose[] = ['sit', 'sit', 'groom', 'nap', 'nap']

/**
 * Where a cat is on its schedule: its level, its spot on it (level space), which way it faces, what it does, and how
 * many seconds it has left on that level.
 */
export type CatPlace = { level: number; x: number; z: number; heading: number; pose: CatPose; left: number }

type Point = { x: number; z: number }
/** A walk along `path` starting `start` seconds into a visit, taking `walk` seconds, then a rest in `pose`. */
type Leg = { path: THREE.Vector3[]; start: number; walk: number; pose: CatPose }
/** A cat's stay on one level: out of the elevator, a few legs, back to the elevator by its end. */
type Visit = { legs: Leg[] }

const VISIT = 120
const ROAM_SPEED = 0.6
/** How far a cat keeps from what a walker bumps into. */
const CAT_ROOM = 0.35
/** The side of a cell of the grid a cat finds its way on. */
const CELL = 0.5

/** The landing just outside the elevator's doors, where a cat comes out and goes back in. */
const doorstep = (p: Plan): Point => ({ x: 0, z: coreFront(p) + 0.5 })

/**
 * Where a cat may stand on a level: away from its colliders and out of the elevator car, as a grid of cells. `shape`
 * is what it was worked out from: a board that moves nothing keeps it.
 */
type Ground = { shape: string; nx: number; open: boolean[]; center: (cell: number) => Point; cellOf: (pt: Point) => number }

function groundOf(p: Plan, boxes: Box[], shape: string): Ground {
  const halfW = p.width / 2 - WALL - CAT_ROOM
  const halfD = p.depth / 2 - WALL - CAT_ROOM
  const free = ({ x, z }: Point) =>
    Math.abs(x) < halfW && Math.abs(z) < halfD && !boxes.some((b) => x > b.minX - CAT_ROOM && x < b.maxX + CAT_ROOM && z > b.minZ - CAT_ROOM && z < b.maxZ + CAT_ROOM)
  const nx = Math.floor(p.width / CELL)
  const center = (cell: number) => ({ x: -p.width / 2 + ((cell % nx) + 0.5) * CELL, z: -p.depth / 2 + (Math.floor(cell / nx) + 0.5) * CELL })
  const cellOf = ({ x, z }: Point) => Math.floor((z + p.depth / 2) / CELL) * nx + Math.floor((x + p.width / 2) / CELL)
  return { shape, nx, open: Array.from({ length: nx * Math.floor(p.depth / CELL) }, (_, c) => free(center(c))), center, cellOf }
}

/**
 * The open cells reachable from `from`: each one's previous step on a shortest way from it (`from` is its own), and
 * how many steps away it is.
 */
function waysFrom(g: Ground, from: number) {
  const prev = new Map<number, number>([[from, from]])
  const steps = new Map<number, number>([[from, 0]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]
    const x = c % g.nx
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = c + dz * g.nx + dx
      if (x + dx < 0 || x + dx >= g.nx || n < 0 || n >= g.open.length || !g.open[n] || prev.has(n)) continue
      prev.set(n, c)
      steps.set(n, steps.get(c)! + 1)
      queue.push(n)
    }
  }
  return { prev, steps }
}

/** A straight walk from `a` to `b` stays on open cells. */
const clear = (g: Ground, a: Point, b: Point) => {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15)
  for (let i = 0; i <= n; i++) if (!g.open[g.cellOf({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n })]) return false
  return true
}

/** The way from `from` to `to` along the cells `prev` leads back through, its corners cut wherever the way is clear. */
function wayTo(g: Ground, { prev }: ReturnType<typeof waysFrom>, from: Point, to: number, end: Point = g.center(to)) {
  const cells = [to]
  while (prev.get(cells[0]) !== cells[0]) cells.unshift(prev.get(cells[0])!)
  const points = [from, ...cells.slice(1, -1).map(g.center), end]
  const way = [points[0]]
  for (let i = 0; i < points.length - 1; ) {
    let k = i + 1
    while (k + 1 < points.length && clear(g, points[i], points[k + 1])) k++
    way.push(points[k])
    i = k
  }
  return way.map(({ x, z }) => new THREE.Vector3(x, 0, z))
}

const lengthOf = (path: THREE.Vector3[]) => path.slice(1).reduce((sum, v, i) => sum + v.distanceTo(path[i]), 0)

/** The ground of each level as last worked out, by level: a new plan whose level has the same shape keeps it. */
const grounds = new Map<number, Ground>()
/** Each plan's grounds once looked up: a plan never changes, and a frame asks for a ground per cat. */
const groundsOf = new WeakMap<Plan, Map<number, Ground>>()

function groundAt(p: Plan, level: number) {
  const ofPlan = groundsOf.get(p) ?? new Map<number, Ground>()
  groundsOf.set(p, ofPlan)
  const known = ofPlan.get(level)
  if (known) return known
  const g = groundShaped(p, level)
  ofPlan.set(level, g)
  return g
}

function groundShaped(p: Plan, level: number) {
  const boxes = [...colliders(p, p.levels[level]), carBox(p)]
  const shape = JSON.stringify(boxes)
  const known = grounds.get(level)
  if (known?.shape === shape) return known
  const g = groundOf(p, boxes, shape)
  grounds.set(level, g)
  return g
}

function visitOf(name: CatName, e: number, g: Ground, p: Plan): Visit {
  const door = doorstep(p)
  const home = waysFrom(g, g.cellOf(door))
  const legs: Leg[] = []
  let from = door
  let start = 0
  for (let i = 0; ; i++) {
    const rest = 20 + roll(name, `${e} ${i} leg`) * 20
    const reach = (rest * ROAM_SPEED * 0.5) / CELL
    const ways = waysFrom(g, g.cellOf(from))
    const near = [...ways.steps].filter(([, n]) => n >= 2 && n <= reach).map(([c]) => c)
    if (!near.length) break
    const to = pick(near, roll(name, `${e} ${i} spot`))
    const path = wayTo(g, ways, from, to)
    const back = lengthOf(wayTo(g, home, door, to)) / ROAM_SPEED
    if (start + rest + back > VISIT) break
    legs.push({ path, start, walk: lengthOf(path) / ROAM_SPEED, pose: pick(RESTS, roll(name, `${e} ${i} pose`)) })
    from = g.center(to)
    start += rest
  }
  const way = wayTo(g, home, door, g.cellOf(from), from).reverse()
  const walk = lengthOf(way) / ROAM_SPEED
  legs.push({ path: way, start: VISIT - walk, walk, pose: 'walk' })
  return { legs }
}

/** Each cat's visit as last worked out: its legs are worked out once a visit, again only if its level's ground moves. */
const visits = new Map<CatName, { e: number; ground: Ground; visit: Visit }>()

function visitAt(name: CatName, e: number, level: number, p: Plan) {
  const ground = groundAt(p, level)
  const last = visits.get(name)
  if (last?.e === e && last.ground === ground) return last.visit
  const visit = visitOf(name, e, ground, p)
  visits.set(name, { e, ground, visit })
  return visit
}

/**
 * The level each cat visits on turn `e`, no two on the same one: the project floors first, in an order hashed from
 * the turn, then the lobby and the roof. The cats take them in an order hashed from the turn too.
 */
function levelsOn(e: number, p: Plan) {
  const shuffled = (levels: Level[]) =>
    levels.map((l) => ({ index: l.index, r: roll('levels', `${e} ${l.index} turn`) })).sort((a, b) => a.r - b.r).map((l) => l.index)
  const order = [...shuffled(p.levels.filter((l) => l.kind === 'floor')), ...shuffled(p.levels.filter((l) => l.kind !== 'floor'))]
  const cats = [...CATS].sort((a, b) => roll(a, `${e} turn`) - roll(b, `${e} turn`))
  return new Map(cats.map((name, i) => [name, order[i % order.length]]))
}

/**
 * Where cat `name` is at `t` (seconds) on its schedule: every two minutes all the cats move to other levels, which
 * level and what each does there hashed from the turn and its name, so every load at the same time puts it in the
 * same place.
 */
export function catAt(name: CatName, t: number, p: Plan): CatPlace {
  const e = Math.floor(t / VISIT)
  const level = levelsOn(e, p).get(name)!
  const { legs } = visitAt(name, e, level, p)
  const into = t - e * VISIT
  const left = VISIT - into
  const leg = legs.findLast((l) => l.start <= into) ?? legs[0]
  const step = along(leg.path, Math.max(0, into - leg.start) * ROAM_SPEED)
  if (step) return { level, x: step.at.x, z: step.at.z, heading: step.heading, pose: 'walk', left }
  const [a, b] = leg.path.length > 1 ? leg.path.slice(-2) : [leg.path[0], leg.path[0].clone().setZ(leg.path[0].z + 1)]
  return { level, x: b.x, z: b.z, heading: headingOf(a, b), pose: leg.pose, left }
}

/** The open cell nearest a point: the point's own when it is open. */
function nearestOpen(g: Ground, pt: Point) {
  const own = g.cellOf(pt)
  if (g.open[own]) return own
  const dist = (c: number) => Math.hypot(g.center(c).x - pt.x, g.center(c).z - pt.z)
  return g.open.reduce((best, open, c) => (open && (best < 0 || dist(c) < dist(best)) ? c : best), -1)
}

/** A walk on `level` from one point to another, around what a walker bumps into; either end may stand right against it. */
function route(p: Plan, level: number, from: Point, to: Point) {
  const g = groundAt(p, level)
  return wayTo(g, waysFrom(g, nearestOpen(g, from)), from, nearestOpen(g, to), to)
}

/** What a guest at the roof's party does: walks between legs, then dances, drinks at the bar or mingles. */
export type GuestPose = 'walk' | 'dance' | 'drink' | 'mingle'
/**
 * Where a guest is at a time: its spot on the roof and how high off it (on a bar stool), which way it faces, what it
 * does, and for how many seconds.
 */
export type GuestPlace = { x: number; y: number; z: number; heading: number; pose: GuestPose; since: number }
type GuestSpot = { x: number; z: number; heading: number; pose: Exclude<GuestPose, 'walk'> }

/** A party leg's mean length, how far each leg's start strays from it, and the most a guest lingers once one begins. */
const LEG = 20
const LEG_JITTER = 2.5
const LINGER = 4
const GUEST_SPEED = 1.4
/** How long a guest takes to get onto a bar stool, or off it. */
const HOP = 0.3
/** What a guest wants on a leg, as many times as it is likely. */
const WANTS = ['dance', 'dance', 'dance', 'drink', 'drink', 'mingle', 'mingle'] as const
/** How many guests mingle at one place, around it this far apart, and how far apart the places are. */
const CIRCLE = { size: 3, radius: 0.5, pitch: 2.4 }

/** When leg `n` begins, the same for every guest. */
const legStart = (n: number) => n * LEG + (roll('party', `${n} leg`) - 0.5) * 2 * LEG_JITTER

function legAt(t: number) {
  const n = Math.floor(t / LEG)
  return t < legStart(n) ? n - 1 : t >= legStart(n + 1) ? n + 1 : n
}

/** When a guest sets off on leg `n`. */
const departs = (id: string, n: number) => legStart(n) + roll(id, `${n} departs`) * LINGER

/** Where guests mingle: the plaza between the elevator and the rate limits, two places abreast. */
function plaza(p: Plan, limits: number): Point[] {
  const top = coreFront(p) + 3
  const bottom = Math.min(p.depth / 2, ...rateLimitBoxes(p, limits).map((b) => b.minZ)) - 1.5
  const rows = Math.max(1, Math.floor((bottom - top) / CIRCLE.pitch) + 1)
  return Array.from({ length: rows * 2 }, (_, i) => ({ x: (i % 2 ? 1 : -1) * 1.5, z: top + Math.floor(i / 2) * CIRCLE.pitch }))
}

/** The first of `count` places, from where `r` points and on around, that `free` takes; none when all are taken. */
function probe(count: number, r: number, free: (k: number) => boolean) {
  const start = Math.floor(r * count)
  for (let i = 0; i < count; i++) if (free((start + i) % count)) return (start + i) % count
}

/**
 * Where every guest spends leg `n`: in the order of their ids, each wants to dance, drink or mingle, hashed from the
 * leg, and takes the first free place it wants from a hashed start: a stool at the bar, a circle on the plaza,
 * a tile on its own project's floor. One wanting a full bar or plaza dances.
 */
function spotsOn(p: Plan, n: number): Map<string, GuestSpot> {
  const roof = p.levels.at(-1) as Extract<Level, { kind: 'roof' }>
  const { barSpots } = partySpots(p)
  const places = plaza(p, roof.limits.length)
  const atBar = new Set<number>()
  const circles = new Map<number, number>()
  const tiles = new Map<string, Set<number>>()
  const spots = new Map<string, GuestSpot>()
  for (const { card } of [...roof.guests].sort((a, b) => (a.card.id < b.card.id ? -1 : 1))) {
    const id = card.id
    const want = pick(WANTS, roll(id, `${n} wants`))
    const stool = want === 'drink' ? probe(barSpots.length, roll(id, `${n} stool`), (k) => !atBar.has(k)) : undefined
    if (stool !== undefined) {
      atBar.add(stool)
      spots.set(id, { ...barSpots[stool], heading: Math.PI, pose: 'drink' })
      continue
    }
    const place = want === 'mingle' ? probe(places.length, roll(id, `${n} place`), (k) => (circles.get(k) ?? 0) < CIRCLE.size) : undefined
    if (place !== undefined) {
      const i = circles.get(place) ?? 0
      circles.set(place, i + 1)
      const a = (i / CIRCLE.size) * Math.PI * 2 + roll('party', `${n} ${place} circle`) * Math.PI
      const x = places[place].x + Math.sin(a) * CIRCLE.radius
      const z = places[place].z + Math.cos(a) * CIRCLE.radius
      spots.set(id, { x, z, heading: a + Math.PI, pose: 'mingle' })
      continue
    }
    const floor = floorOfProject(roof.floors, card.project)
    const taken = tiles.get(floor.key) ?? new Set<number>()
    tiles.set(floor.key, taken)
    const count = floor.columns * floor.rows
    const tile = probe(count, roll(id, `${n} tile`), (k) => !taken.has(k)) ?? count + taken.size
    taken.add(tile)
    spots.set(id, { ...danceSpot(floor, tile), heading: roll(id, `${n} facing`) * Math.PI * 2, pose: 'dance' })
  }
  return spots
}

/** The legs worked out for a plan, each with its spots and the walks onto them, by leg; only the latest few are kept. */
const parties = new WeakMap<Plan, Map<number, { spots: Map<string, GuestSpot>; ways: Map<string, THREE.Vector3[]> }>>()

function partyOn(p: Plan, n: number) {
  const legs = parties.get(p) ?? new Map()
  parties.set(p, legs)
  if (!legs.has(n)) {
    legs.set(n, { spots: spotsOn(p, n), ways: new Map() })
    for (const k of legs.keys()) if (k < n - 2 || k > n + 2) legs.delete(k)
  }
  return legs.get(n)!
}

/**
 * Where guest `card` is at `t` (seconds) at the roof's party: the party runs in legs of 15 to 25 seconds, and on each
 * a guest sets off a few seconds after the leg begins, walks from where it spent the last one to where it spends this
 * one (`spotsOn`), hurrying when the walk is long, and does what it came for. The same time and plan always put it in
 * the same place.
 */
export function guestAt(card: Card, t: number, p: Plan): GuestPlace {
  const now = legAt(t)
  const n = t < departs(card.id, now) ? now - 1 : now
  const leg = partyOn(p, n)
  const to = leg.spots.get(card.id)!
  if (!leg.ways.has(card.id)) leg.ways.set(card.id, route(p, p.levels.length - 1, partyOn(p, n - 1).spots.get(card.id)!, to))
  const way = leg.ways.get(card.id)!
  const start = departs(card.id, n)
  const speed = Math.max(GUEST_SPEED, lengthOf(way) / (legStart(n + 1) - start - 1))
  const { barSeat } = partySpots(p)
  const step = along(way, (t - start) * speed)
  if (step) {
    const off = partyOn(p, n - 1).spots.get(card.id)!.pose === 'drink' ? barSeat * Math.max(0, 1 - (t - start) / HOP) : 0
    return { x: step.at.x, y: off, z: step.at.z, heading: step.heading, pose: 'walk', since: t - start }
  }
  const since = t - start - lengthOf(way) / speed
  return { ...to, y: to.pose === 'drink' ? barSeat * Math.min(1, since / HOP) : 0, since }
}

/**
 * Which cat keeps an eye on a waiter on `level`: the one whose schedule has it on that level, so the watch changes
 * hands with each turn; on a level no cat's turn brings one to, the one already watching `id`, else the first.
 */
export function watcherOf(cats: Iterable<Cat>, places: Map<CatName, CatPlace>, id: string, level: number): CatName {
  const all = [...cats]
  return all.find((c) => places.get(c.name)!.level === level)?.name ?? all.find((c) => c.watching === id)?.name ?? CATS[0]
}

/** How long before its turn on a level ends a cat stops following you, to make its way back to the elevator. */
const HOMEWARD = 20

/** The cat that follows you on `level`: the one whose schedule has it there, unless it is about to leave. */
export const followerOf = (places: Map<CatName, CatPlace>, level: number) =>
  CATS.find((name) => places.get(name)!.level === level && places.get(name)!.left > HOMEWARD)

/** A walk a cat is on, off its schedule: toward the open cell `to`, `d` along `path`. */
type Way = { to: number; path: THREE.Vector3[]; d: number }

/**
 * A cat: where it is and the level it's on, whose desk it sits on, whether it follows you, whether it is on its way
 * back to its schedule after either, and the walk it is on to get somewhere.
 */
export type Cat = {
  name: CatName
  root: THREE.Object3D
  head: THREE.Object3D
  tail: THREE.Object3D
  paws: [THREE.Object3D, THREE.Object3D]
  level: number
  watching?: string
  following: boolean
  returning: boolean
  way?: Way
}

export function makeCat(models: Models, name: CatName): Cat {
  const c = instance(models[name])
  act(c.root, { kind: 'cat', name, watching: undefined, following: false }, [])
  return { name, root: c.root, head: c.part('head'), tail: c.part('tail'), paws: [c.part('paw_L'), c.part('paw_R')], level: 0, following: false, returning: false }
}

/** Moves a cat's parts for `pose`; `y` is the floor it stands on. Napping, it lies on its side. */
function poseCat(cat: Cat, pose: CatPose, y: number, t: number) {
  const [left, right] = cat.paws
  const lying = pose === 'nap'
  cat.root.rotation.z = lying ? 1.35 : 0
  cat.root.position.y = y + (lying ? 0.12 : pose === 'walk' ? Math.abs(Math.sin(t * 10)) * 0.015 : 0)
  cat.root.scale.setScalar(lying ? 1 + Math.sin(t * 1.4) * 0.02 : 1)
  left.rotation.x = pose === 'walk' ? Math.sin(t * 10) * 0.5 : 0
  right.rotation.x = pose === 'walk' ? -Math.sin(t * 10) * 0.5 : pose === 'groom' ? -2 + Math.sin(t * 6) * 0.15 : 0
  cat.head.rotation.set(pose === 'groom' ? 0.35 + Math.sin(t * 6) * 0.08 : lying ? 0.2 : 0, pose === 'sit' ? Math.sin(t * 0.4) * 0.5 : 0, pose === 'groom' ? 0.25 : 0)
  cat.tail.rotation.z = pose === 'walk' ? Math.sin(t * 8) * 0.4 : lying ? 0.6 : Math.sin(t * 1.6) * 0.35
}

/** A cat on its schedule, at `place` on a level whose floor is at `y`. */
export function roam(cat: Cat, place: CatPlace, y: number, t: number) {
  cat.level = place.level
  cat.root.position.set(place.x, y, place.z)
  cat.root.rotation.y = place.heading
  poseCat(cat, place.pose, y, t)
}

/** A cat being petted, sitting on `y`: its head pushes up into the hand and tilts, its tail rises and sways slowly. */
export function leanIn(cat: Cat, reach: number, press: number, y: number, t: number) {
  poseCat(cat, 'sit', y, t)
  cat.head.rotation.set(-0.35 * reach - 0.1 * press, 0, 0.3 * reach)
  cat.tail.rotation.set(-0.5 * reach, 0, Math.sin(t * 1.2) * 0.25)
}

/** Marks which waiter a cat keeps an eye on, for what it offers when aimed at. */
export function keepEyeOn(cat: Cat, id: string | undefined) {
  if (cat.watching === id) return
  if (cat.watching && !id) cat.returning = true
  cat.watching = id
  cat.way = undefined
  act(cat.root, { kind: 'cat', name: cat.name, watching: id, following: cat.following }, [])
}

/** Marks whether a cat follows you; one that stops makes its way back to its schedule. */
export function keepUp(cat: Cat, on: boolean) {
  if (cat.following === on) return
  if (!on) cat.returning = true
  cat.following = on
  cat.way = undefined
  act(cat.root, { kind: 'cat', name: cat.name, watching: cat.watching, following: on }, [])
}

/** The open cell nearest `pt`. */
function openNear(g: Ground, pt: Point) {
  const own = g.cellOf(pt)
  if (g.open[own]) return own
  let best = own
  let far = Infinity
  g.open.forEach((open, c) => {
    if (!open) return
    const q = g.center(c)
    const d = (q.x - pt.x) ** 2 + (q.z - pt.z) ** 2
    if (d < far) (far = d, best = c)
  })
  return best
}

const turnTo = (cat: Cat, face: number, dt: number) => {
  const r = cat.root.rotation.y
  cat.root.rotation.y = r + Math.atan2(Math.sin(face - r), Math.cos(face - r)) * Math.min(1, dt * 4)
}

/**
 * Walks a cat along `level`'s grid toward `to` (level space) at `speed`, until it is `near` it, or near the open cell
 * nearest it when `to` stands where a cat can't. A cat on another level comes out of that level's elevator first.
 * True once it is there.
 */
export function steer(cat: Cat, p: Plan, level: number, to: Point, near: number, speed: number, dt: number, t: number) {
  const g = groundAt(p, level)
  const pos = cat.root.position
  const y = levelY(level)
  if (cat.level !== level) {
    const door = doorstep(p)
    cat.level = level
    cat.way = undefined
    pos.set(door.x, y, door.z)
  }
  const goal = openNear(g, to)
  const end = g.cellOf(to) === goal ? to : g.center(goal)
  if (Math.hypot(end.x - pos.x, end.z - pos.z) <= near) {
    cat.way = undefined
    return true
  }
  if (cat.way?.to !== goal) cat.way = { to: goal, path: wayTo(g, waysFrom(g, openNear(g, pos)), { x: pos.x, z: pos.z }, goal, end), d: 0 }
  cat.way.d += speed * dt
  const step = along(cat.way.path, cat.way.d)
  if (!step) {
    const last = cat.way.path.at(-1)!
    pos.x = last.x
    pos.z = last.z
    cat.way = undefined
    return false
  }
  pos.x = step.at.x
  pos.z = step.at.z
  cat.root.rotation.y = step.heading
  poseCat(cat, 'walk', THREE.MathUtils.lerp(pos.y, y, Math.min(1, dt * 6)), t)
  return false
}

/**
 * How far behind you the cat on your floor keeps, how much farther you get before it gets up to follow, and how fast
 * it runs to catch up.
 */
const TRAIL = 1
const TRAIL_SLACK = 0.4
const TRAIL_RUN = 6

/**
 * The cat on your floor at `me`: it walks after you, about a metre behind, faster the farther behind it falls, and
 * sits facing you when you stop.
 */
export function tagAlong(cat: Cat, p: Plan, me: Point & { level: number }, dt: number, t: number) {
  const pos = cat.root.position
  const far = Math.hypot(me.x - pos.x, me.z - pos.z)
  const resting = cat.level === me.level && !cat.way && far <= TRAIL + TRAIL_SLACK
  if (resting || steer(cat, p, me.level, me, TRAIL, Math.min(TRAIL_RUN, CAT_SPEED + 4 * (far - TRAIL)), dt, t)) {
    turnTo(cat, Math.atan2(me.x - pos.x, me.z - pos.z), dt)
    poseCat(cat, 'sit', levelY(me.level), t)
  }
}

/** Where a cat sits to keep an eye on the worker at `desk`: on its desk, beside the monitor, facing its chair. */
export const deskPerch = (desk: Desk) => desk.group.position.clone().add(new THREE.Vector3(0.45, DESK.height, 0.12))

/** How near the open cell beside a desk a cat comes before it hops, and how far short of its spot it lands. */
const TAKEOFF = 0.1
const LANDING = 0.2

/**
 * A cat going to sit at `at`, up on a desk on `level`, facing `face`: it walks the level's grid to the open cell
 * nearest the spot (in from the elevator from another level), then hops up. True once it is there.
 */
export function chase(cat: Cat, p: Plan, level: number, at: THREE.Vector3, face: number, dt: number, t: number) {
  const pos = cat.root.position
  const floorY = levelY(level)
  const g = groundAt(p, level)
  const foot = g.center(openNear(g, at))
  const leap = Math.hypot(at.x - foot.x, at.z - foot.z) + TAKEOFF
  const far = Math.hypot(at.x - pos.x, at.z - pos.z)
  if (cat.level !== level || far > leap) {
    steer(cat, p, level, foot, TAKEOFF, CAT_SPEED, dt, t)
    return false
  }
  if (far <= 0.02) {
    cat.root.rotation.y += (face - cat.root.rotation.y) * Math.min(1, dt * 4)
    poseCat(cat, 'sit', at.y, t)
    pos.set(at.x, at.y, at.z)
    return true
  }
  const flat = new THREE.Vector3(at.x - pos.x, 0, at.z - pos.z)
  cat.root.rotation.y = Math.atan2(flat.x, flat.z)
  const step = flat.normalize().multiplyScalar(Math.min(far, CAT_SPEED * dt))
  const hop = THREE.MathUtils.clamp(1 - (far - LANDING) / (leap - LANDING), 0, 1)
  poseCat(cat, 'walk', THREE.MathUtils.lerp(floorY, at.y, hop), t)
  pos.x += step.x
  pos.z += step.z
  pos.y += Math.sin(hop * Math.PI) * 0.35
  return false
}

let audio: AudioContext | undefined

/** Notes played one after another, `step` seconds apart, each ringing out. */
function notes(freqs: number[], wave: OscillatorType, step: number) {
  audio ??= new AudioContext()
  const now = audio.currentTime
  for (const [i, freq] of freqs.entries()) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = wave
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, now + i * step)
    gain.gain.linearRampToValueAtTime(0.12, now + i * step + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * step + 0.9)
    osc.connect(gain).connect(audio.destination)
    osc.start(now + i * step)
    osc.stop(now + i * step + 1)
  }
}

/** A wait's sound, as every renderer scores it (`SOUNDS`): a question to answer, or an answer to read. */
export const ring = (sound: Sound) => notes(SOUNDS[sound].notes, SOUNDS[sound].wave, SOUNDS[sound].step)
/** A worker holds up something it made for you: a rising major arpeggio. */
export const tada = () => notes([523.25, 659.25, 783.99, 1046.5], 'triangle', 0.09)

/**
 * A purr `seconds` long: a sawtooth at a cat's 26 Hz rumble through a lowpass, swelling on each breath in and out.
 */
export function purr(seconds: number) {
  audio ??= new AudioContext()
  const now = audio.currentTime
  const osc = audio.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = 26
  const low = audio.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 380
  const breath = audio.createOscillator()
  breath.frequency.value = 1.4
  const depth = audio.createGain()
  depth.gain.value = 0.4
  const swell = audio.createGain()
  swell.gain.value = 0.6
  const envelope = audio.createGain()
  envelope.gain.setValueAtTime(0, now)
  envelope.gain.linearRampToValueAtTime(0.16, now + 0.25)
  envelope.gain.setValueAtTime(0.16, now + seconds - 0.4)
  envelope.gain.linearRampToValueAtTime(0, now + seconds)
  breath.connect(depth).connect(swell.gain)
  osc.connect(low).connect(swell).connect(envelope).connect(audio.destination)
  for (const o of [osc, breath]) (o.start(now), o.stop(now + seconds))
}
