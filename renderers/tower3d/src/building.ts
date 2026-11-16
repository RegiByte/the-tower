import * as THREE from 'three'
import { reachOf, type Act, type Carried } from './acts.ts'
import { sessionWhen } from '/lib/brief.js'
import { reducedMotion } from '/lib/viewer.js'
import { defaultLimits } from '/lib/board.js'
import { shelfFiles, type Board, type Card, type Tower } from './api.ts'
import { cardsOf, heededWaits, findCard, shownTitle, shownKey } from './cards.ts'
import { type Building, type AppEvent, type Quat, type Ride, type Vec3 } from './app.ts'
import { hueOf } from './avatar.ts'
import { besideOf, deskSlots, dressBinder, dressPapers, dressSide, holdUp, monitorOf, showOnMonitor } from './desk.ts'
import { launch } from './fireworks.ts'
import { CATS, makeCat, tada } from './life.ts'
import { tintOf } from './palette.ts'
import { CABINET, cabinetOf, collidersOn, coreFront, deskOf, emptyChairs, loungeSpots, levelHeight, levelY, plan, solids, type Box, type Plan } from './layout.ts'
import { makeChairs, placeChairs } from './chairs.ts'
import { fillLayer, zonesPlaced, type Placed } from './kit.ts'
import { hangOn, onLevel } from './levels.ts'
import { DESK_DRESS, dress, pickOf } from './dress.ts'
import { cityModel, furnish, type PrefabItem } from './zones.ts'
import { stateKey } from './prefab.ts'
import { standingIn } from './breaks.ts'
import { TABLE, meetingKit } from './meetings.ts'
import { isScreenTexture, isStillScreen, keepScreens, replayTexture, screenPathOf } from './screens.ts'
import { isPosterTexture, keepPosters, pictured, type Shown } from './showing.ts'
import { dispose } from './toon.ts'
import { fillBooks } from './room.ts'
import { keymapSheetHtml } from '/lib/keys.js'
import { random } from './random.ts'
import { wallNow } from './clock.ts'
import { historyOf, type Archive, type Archived } from './archive.ts'
import { buildingSeats } from './seating.ts'
import { galleryOf } from './showings.ts'
import { ARCADE_SIGNS, cabinetsOf, DANCE, filingsOf, GUESTS, notesOf, pigeonholesOf, STATIONS, WALLS, desksAfter, galleryAfter, reconcile as reconcileLayer, runningOn, slotsAt, type Layer as SceneLayer } from './layers.ts'
import { SCREEN } from './arcade.ts'
import { NO_PLAN, s } from './state.ts'
import { eyes, type Walker } from './walker.ts'
import { layerAt, type Layer } from './floorplan.ts'
import { boardFace, buildWorld, paintDirectory, setLimits, setShellTitles } from './world.ts'
import type { Toasts } from './toasts.ts'
import { $, show } from './dom.ts'
import { sheetKeys } from './keymap-here.ts'
import { nowOf } from './now.ts'
import type { Clients } from './clients.ts'
import type { Stage } from './stage.ts'
import type { Port } from './port.ts'
import type { Titles } from './titles.ts'

/** What the world is started with. */
export type WorldDeps = { tower: Tower; clients: Clients; titles: Titles; archive: Archive; stage: Stage; port: Port; toasts: Toasts }

export type World = ReturnType<typeof startWorld>

/**
 * The building in the scene: its plan, what stands on each level, every keyed layer reconciled against the board the
 * app took, the caches of what can be seen, bumped into and picked, and the camera's flights.
 */
export function startWorld(started: WorldDeps) {
  const { tower } = started
  const { draftItem, draftsOf, cardReviews, floorThreadsOf, keepsThreads: floorKeepsThreads, reviewerOf } = started.clients
  const { camera, scene } = started.stage
  const { noteTitle, pruneNoteTitles, pruneKeptTitles, gameTitle, pruneGameTitles } = started.titles
  const { readArchives, drawersAt } = started.archive
  const { port } = started
  const { toast } = started.toasts
  const { buildingNow, boardNow, captured, viewNow, motionNow, replayNow, heed } = nowOf(started.port)

  const directory = boardFace(640, 480)

  const statsBoard = boardFace(640, 400)

  /**
   * Where each stream's monitors stand in what can be seen, in world space: a worker's screen is on its desk and on the
   * control room's video wall. Your level's, or every level's over the city.
   */
  let screensAt: { plan?: Plan; level: number; overview: boolean; spots: Map<string, THREE.Vector3[]> } = { level: -1, overview: false, spots: new Map() }

  function screensHere() {
    const overview = viewNow() === 'overview'
    if (screensAt.plan === planNow() && screensAt.level === s.me.level && screensAt.overview === overview) return screensAt.spots
    const spots = new Map<string, THREE.Vector3[]>()
    const levels = overview ? [...s.levels.map((l) => l.group), ...s.world!.levels] : [s.levels[s.me.level]?.group, s.world!.levels[s.me.level]]
    for (const group of levels) {
      group?.traverse((o) => {
        const map = o instanceof THREE.Mesh ? (o.material as THREE.MeshBasicMaterial).map : undefined
        const path = map && screenPathOf(map)
        if (path) spots.set(path, [...(spots.get(path) ?? []), o.getWorldPosition(new THREE.Vector3())])
      })
    }
    screensAt = { plan: planNow(), level: s.me.level, overview, spots }
    return spots
  }

  const screenDistance = (path: string) => {
    const at = screensHere().get(path)
    return at && Math.min(...at.map((p) => p.distanceTo(camera.position)))
  }

  /** What the walker bumps into on its level and layer. */
  let boxesAt: { plan?: Plan; level: number; layer?: Layer; boxes: Box[] } = { level: -1, boxes: [] }

  function boxesHere() {
    const layer = layerAt(s.me.y)
    if (boxesAt.plan === planNow() && boxesAt.level === s.me.level && boxesAt.layer === layer) return boxesAt.boxes
    boxesAt = { plan: planNow(), level: s.me.level, layer, boxes: collidersOn(planNow(), here(), layer) }
    return boxesAt.boxes
  }

  const here = () => planNow().levels[s.me.level]

  const keepTexture = (t: THREE.Texture) => isScreenTexture(t) || isStillScreen(t) || isPosterTexture(t) || t === directory.texture || t === statsBoard.texture

  const discard = (o: THREE.Object3D) => (o.removeFromParent(), dispose(o, keepTexture))

  /** Puts `o` on level `index` of the building, out of wherever it hung before. */
  const hang = (index: number, o: THREE.Object3D) => hangOn(scene, index, o)

  /** Brings `layer`'s items in `items` in step with the plan as it stands now. */
  const reconcile = <S, T>(layer: SceneLayer<S, T>, items: Map<string, T>) => reconcileLayer(layer, items, planNow(), hang, discard)

  const pigeonholes = pigeonholesOf(cardReviews)
  const notes = notesOf(noteTitle)
  const cabinets = cabinetsOf(gameTitle)
  const filings = filingsOf(drawersAt)

  /** What changes the building's shape: shell titles and limit readings are redrawn on their own. */
  const structureKey = (pl: Plan, b: Board) => JSON.stringify([
    pl.width, pl.depth, b.hostUp, new Date(wallNow()).getMonth(),
    pl.levels.map((l) => [l.kind, l.name, l.kind === 'floor' ? [l.floor.color, l.floor.shelf, l.kiosks.map((k) => k.shell.id), Boolean(l.cork), Boolean(l.arcade?.cabinets.length)] : 0]),
    defaultLimits(b).rateLimits.map((r) => r.kind),
  ])

  const limitsKey = (b: Board) => JSON.stringify([defaultLimits(b).rateLimits, b.today])

  function rebuildWorld() {
    if (s.world) discard(s.world.group)
    s.rebuilds++
    s.world = buildWorld(planNow(), boardNow()!, directory, statsBoard, s.models!, draftsOf)
    scene.add(s.world.group)
    for (const level of planNow().levels) fillLayer(s.kit!, onLevel(scene, level.index).zones, zonesPlaced(s.kit!, level))
    for (const root of s.levels.slice(planNow().levels.length)) fillLayer(s.kit!, root.zones, [])
    const built = s.world
    for (const b of s.world.bookcases) {
      shelfFiles(tower, b.project, b.n).then((files) => s.world === built && fillBooks(b, files, built.pickables), (err: Error) => toast(`shelf: ${err.message}`))
    }
  }

  /** A firework over the roof party for each of `cards`, a turn finished, in its worker's color: over its project's dance floor, else the roof's middle. */
  function celebrate(cards: { id: string; project: string }[]) {
    const roof = planNow().levels.at(-1)!
    const floors = roof.kind === 'roof' ? roof.floors : []
    for (const c of cards) {
      const at = floors.find((f) => f.projects.includes(c.project)) ?? { x: 0, z: 0 }
      launch(scene, new THREE.Vector3(at.x + (random() - 0.5) * 8, roof.y + 1, at.z + (random() - 0.5) * 6), hueOf(c.id))
    }
  }

  /** Nothing seen was kept (a first visit): what is shown already counts as seen, and only what comes after is new. */
  let primeSeen = false
  /** What was kept tells whether anything seen was: `prime` when nothing was. */
  const primeSeenAs = (prime: boolean) => void (primeSeen = prime)

  const everyShown = (b: Board) => cardsOf(b).flatMap((c) => c.shown.map((sh) => ({ c, sh, key: shownKey(sh) })))

  const isFresh = (c: Card, sh: Shown) => !s.seenShown.has(shownKey(sh))

  /** The showings you have yet to open, of workers at a desk, newest first. */
  const freshShown = () => everyShown(boardNow()!).filter(({ c, sh }) => deskOf(planNow(), c.id) && isFresh(c, sh)).sort((a, b) => b.sh.at - a.sh.at)

  /**
   * Each desk's second monitor, its worker's latest showing, ribboned while any of its showings is new to you; and every
   * gallery, its pictures ribboned while new, a showing `was` didn't hold flying in.
   */
  function dressSides(was: Board | undefined) {
    for (const desk of s.desks.values()) dressSide(desk, desk.card.shown.at(-1), desk.card.shown.some((sh) => isFresh(desk.card, sh)))
    reconcile(galleryAfter(was), s.pictures)
    keepPosters(new Set([...[...s.desks.values()].flatMap((d) => d.card.shown.slice(-1).map((sh) => shownKey(sh))), ...s.pictures.keys()]))
  }

  /** The review notes new to each worker, stacked on its own desk, beside its logbook; a reviewer beside its author has neither. */
  function dressAllPapers() {
    for (const desk of s.desks.values()) {
      dressPapers(desk, desk.side ? (cardReviews(desk.card)?.unseen ?? 0) : 0)
      dressBinder(desk, desk.card.lineage.length)
    }
  }

  /** The replayed past session on its worker's monitor, every other monitor on its own screen. */
  function dressReplays() {
    const replaying = replayNow()
    for (const desk of s.desks.values()) {
      const session = replaying?.id === desk.card.id ? desk.card.lineage.find((l) => l.id === replaying.session) : undefined
      showOnMonitor(desk, session ? replayTexture(`screen/${session.id}`, `REPLAY · ${sessionWhen(session.startedAt)}`) : monitorOf(desk.card))
    }
    screensAt = { ...screensAt, plan: undefined }
  }

  /**
   * What Tower 3D derives from each floor's history, its archive as `archived` holds it: every seated worker's seat and
   * each floor's gallery. A floor whose archive can't be read has neither: its workers on duty have no desks.
   */
  function historyReads(board: Board, archived: Archived) {
    const histories = new Map(board.floors.flatMap((f) => {
      const history = historyOf(f, archived)
      return history ? [[f.id, history] as const] : []
    }))
    return { seats: buildingSeats(histories), galleries: new Map([...histories].map(([id, history]) => [id, galleryOf(history)])) }
  }

  /**
   * The plan last derived, and what from. The building takes a fresh archive snapshot with every board and a fresh
   * instant with every board and replan, so the plan is derived once for each of those and reused by every read until the next.
   */
  let planned: { board: Board; archived: Archived; at: number; plan: Plan } | undefined

  /**
   * The building for its board at the wall time `at`, each floor's history from its archive as `archived` holds it: who
   * sits where, who is on a break or in a meeting, the galleries, the party, furnished from the kit.
   */
  function planOf({ board, archived, at }: Building): Plan {
    if (planned?.board === board && planned.archived === archived && planned.at === at) return planned.plan
    const prefabs = s.kit!.prefabs
    const reads = { draftsOf, keepsThreads: floorKeepsThreads, floorThreadsOf, ...historyReads(board, archived) }
    const p = furnish(plan(board, at, (author) => besideOf(slotsAt(author)), meetingKit(prefabs), (room) => standingIn(room, prefabs), reads), prefabs, tintsOf(board), new Date(at).getMonth())
    planned = { board, archived, at, plan: p }
    return p
  }

  /** The plan the building stands on: its board's, as planned when the building took it. */
  function planNow() {
    const b = buildingNow()
    return b ? planOf(b) : NO_PLAN
  }

  /** A showing new since the last board: its worker holds it up, and you hear it; away from its desk, you're told. */
  function shownArrives(id: string, target: string, atItsDesk: boolean) {
    const c = findCard(boardNow()!, id)!
    const sh = c.shown.find((sh) => sh.target === target)!
    const desk = s.desks.get(c.id)
    if (desk) holdUp(desk, sh, s.simNow / 1000)
    tada()
    if (!atItsDesk) toast(`${c.callsign} showed you “${shownTitle(sh)}” · V to look`)
  }

  /** Every project's colour as `#rrggbb`, by id. */
  const tintsOf = (b: Board) => Object.fromEntries(b.floors.map((f) => [f.id, tintOf(f)]))

  /** The lobby's frame: level space at the ground. */
  const LOBBY = new THREE.Matrix4()

  /** A workstation's models in its desk's frame. */
  function inDesk(desk: THREE.Object3D, items: PrefabItem[]): Placed[] {
    desk.updateMatrix()
    return items.map((item) => ({ item, frame: desk.matrix, theme: item.theme }))
  }

  /** A model's frame on a level: at (x, z) over the level's floor at `y`, turned `turn` degrees about +y. */
  const frameAt = (x: number, y: number, z: number, turn: number) => new THREE.Matrix4().makeRotationY((turn * Math.PI) / 180).setPosition(x, y, z)

  /**
   * Every level's workstations in their KayKit models (a worker's dressing on its own, also while it is in a meeting
   * room), the meeting rooms' long tables in their states, and the city model in the lobby.
   */
  function dressLevels(board: Board) {
    const month = new Date(wallNow()).getMonth()
    const placed = planNow().levels.map((level): Placed[] => {
      if (level.kind === 'lobby') return cityModel(planNow(), tintsOf(board)).map(({ item, theme }) => ({ item, frame: LOBBY, theme }))
      if (level.kind === 'roof') return []
      return [
        ...level.desks.filter((slot) => !slot.beside && !slot.meeting).flatMap((slot) => {
          const pick = pickOf(slot.card, month, s.kit!.prefabs[DESK_DRESS])
          return inDesk(s.desks.get(slot.card.id)!.group, dress(slot.card, pick.items, deskSlots(pick.slots).trophies, s.kit!.models))
        }),
        ...level.free.flatMap((slot) => inDesk(s.stations.get(`${level.floor.id}/${slot.n}`)!.group, s.kit!.prefabs[DESK_DRESS].items)),
        ...level.away.flatMap((slot) => {
          const pick = pickOf(slot.card, month, s.kit!.prefabs[DESK_DRESS])
          return inDesk(s.stations.get(`${level.floor.id}/${slot.n}`)!.group, dress(slot.card, pick.items, deskSlots(pick.slots).trophies, s.kit!.models))
        }),
        ...level.tables.flatMap((t) => {
          const frame = frameAt(t.x, level.y, t.z, t.turn)
          return s.kit!.prefabs[TABLE].states[stateKey([t.state])].items.map((item) => ({ item, frame, theme: item.theme }))
        }),
      ]
    })
    placed.forEach((list, i) => fillLayer(s.kit!, onLevel(scene, i).dressing, list))
    for (const root of s.levels.slice(placed.length)) fillLayer(s.kit!, root.dressing, [])
  }

  /** Every level's empty meeting chairs, instanced on its root. */
  function seatChairs() {
    const levels = Math.max(planNow().levels.length, s.chairs.length)
    for (let i = 0; i < levels; i++) {
      const level = planNow().levels[i]
      const at = level?.kind === 'floor' ? emptyChairs(level).map((pl) => ({ x: pl.x, y: level.y, z: pl.z, turn: pl.turn })) : []
      s.chairs[i] ??= makeChairs()
      hang(i, s.chairs[i].group)
      placeChairs(s.chairs[i], s.chairKit!, at)
    }
  }

  /**
   * The world takes the board the building took once its archives are read (`board/arrived`), `was` the board before: rebuilt when its shape
   * changed, every layer reconciled against the plan, and what it shows outside the panels written. It dispatches nothing.
   * In two steps, the hires told of the board between them (`world/apply`): the building and its desks first, then
   * every other layer, which the workstations open for a hire are.
   */
  function worldRebuilt(was: Board | undefined) {
    const next = boardNow()!
    const sheet = keymapSheetHtml(sheetKeys(next))
    if ($('keys-sheet').innerHTML !== sheet) $('keys-sheet').innerHTML = sheet
    s.boards++
    const key = structureKey(planNow(), next)
    if (key !== s.worldKey) (s.worldKey = key, s.limitsKey = limitsKey(next), rebuildWorld())
    if (limitsKey(next) !== s.limitsKey) (s.limitsKey = limitsKey(next), setLimits(s.world!, planNow(), defaultLimits(next).rateLimits, next.today))
    setShellTitles(s.world!, next.shells)
    reconcile(desksAfter(was, hang, reviewerOf), s.desks)
  }

  function worldFurnished(was: Board | undefined) {
    const next = boardNow()!
    reconcile(STATIONS, s.stations)
    dressLevels(next)
    seatChairs()
    reconcile(WALLS, s.walls)
    reconcile(runningOn(next), s.running)
    reconcile(pigeonholes, s.pigeonholes)
    reconcile(ARCADE_SIGNS, s.arcadeSigns)
    syncFilings()
    readArchives(next)
    dressAllPapers()
    reconcile(DANCE, s.dance)
    reconcile(GUESTS, s.guests)
    if (!was && primeSeen) for (const { key } of everyShown(next)) s.seenShown.add(key)
    dressSides(was)
    pruneNoteTitles(next.floors)
    pruneKeptTitles(next.floors)
    syncNotes()
    pruneGameTitles(next.floors)
    syncCabinets()
    if (s.carrying && !draftItem(next.floors, s.carrying.project, s.carrying.id)) (toast('The draft in your hand is gone'), drop())
    const replaying = replayNow()
    keepScreens(new Set([
      ...planNow().levels.flatMap((l) => (l.kind === 'floor' ? l.desks.filter((d) => d.card.live).map((d) => `screen/${d.card.id}`) : [])),
      ...next.shells.map((sh) => `shell/${sh.id}`),
      ...(replaying ? [`screen/${replaying.session}`] : []),
    ]))
    dressReplays()
    paintDirectory(directory, planNow(), heededWaits(next, heed()))
    if (!was) {
      for (const name of CATS) {
        const cat = makeCat(s.models!, name)
        s.cats.set(name, cat)
      }
      s.me = { x: 0, z: coreFront(planNow()) + 10.5, yaw: Math.PI, pitch: -0.05, level: 0, y: 0, vy: 0, ...s.saved }
      if (location.hash === '#tv') {
        const couch = loungeSpots(planNow()).couch
        s.me = { ...s.me, level: 0, x: couch.x, z: couch.z - 1.4, yaw: Math.PI, pitch: 0.12 }
        history.replaceState(null, '', location.pathname)
      }
      show('paused', !captured())
    }
    if (s.me.level >= planNow().levels.length) s.me = { ...s.me, level: 0 }
    if (!was) pictured().then(firstPictured)
  }

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

  const eyeQuaternion = (w: Walker) => new THREE.Quaternion().setFromEuler(new THREE.Euler(w.pitch, w.yaw + Math.PI, 0, 'YXZ'))

  const lookQuaternion = (from: THREE.Vector3, at: THREE.Vector3) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from, at, camera.up))

  const vec3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z]

  const quat = (q: THREE.Quaternion): Quat => [q.x, q.y, q.z, q.w]

  function flyTo(to: THREE.Vector3, toQ: THREE.Quaternion, ms = 700, then?: AppEvent) {
    port.dispatch({ type: 'fly', flight: { from: vec3(camera.position), to: vec3(to), fromQ: quat(camera.quaternion), toQ: quat(toQ), start: s.simNow, ms: reducedMotion() ? 0 : ms, then } })
  }

  const flyHome = () => flyTo(eyes(s.me, floorY(), new THREE.Vector3()), eyeQuaternion(s.me), 600)

  /** Frames a face `size` wide in the middle of the view, straight out from it: the camera stays in front, never in a wall. */
  function frameOn(point: THREE.Vector3, normal: THREE.Vector3, size: number) {
    const span = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
    const from = point.clone().addScaledVector(normal, size / 0.7 / span).add(new THREE.Vector3(0, 0.08, 0))
    flyTo(from, lookQuaternion(from, point))
  }

  /** Frames a face `size` wide straight on, in the middle of the view's left half: the right half holds a panel. */
  function frameAside(point: THREE.Vector3, normal: THREE.Vector3, size: number) {
    const span = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
    const distance = size / 0.7 / (span / 2)
    const right = normal.clone().negate().cross(camera.up).normalize()
    const from = point.clone().addScaledVector(normal, distance).addScaledVector(right, (distance * span) / 4)
    flyTo(from, lookQuaternion(from, from.clone().sub(normal)))
  }

  /** The camera on the game's cabinet, in the left half of the view. */
  function frameCabinet({ cabinet, level }: NonNullable<ReturnType<typeof cabinetOf>>) {
    const front = new THREE.Vector3(cabinet.x, level.y + SCREEN.y, cabinet.z - CABINET.depth / 2)
    frameAside(front, new THREE.Vector3(0, 0, -1), 2 * CABINET.width)
  }

  /** How long the car has been riding, in seconds. */
  const riddenFor = (ride: Ride) => (s.simNow - ride.start) / 1000

  const DOORS_SHUT = 0.55

  /** The car's ride: the seconds it takes to get going and stop, its speed in metres a second, and the longest a ride takes. */
  const RIDE = { start: 0.9, speed: 14, most: 3.5 }

  function floorY() {
    const { ride } = motionNow()
    if (!ride) return levelY(s.me.level)
    const k = ease(THREE.MathUtils.clamp((riddenFor(ride) - DOORS_SHUT) / ride.move, 0, 1))
    return THREE.MathUtils.lerp(levelY(ride.from), levelY(ride.to), k)
  }

  const raycaster = new THREE.Raycaster()

  /** Whether `o` is drawn: it and every parent visible. Rays hit hidden objects too. */
  const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent))

  const pickables = () => [
    ...(s.world?.pickables ?? []),
    ...[...s.desks.values()].map((d) => d.group),
    ...[...s.stations.values()].map((st) => st.group),
    ...[...s.walls.values()].map((w) => w.wall.group),
    ...[...s.running.values()].map((r) => r.group),
    ...[...s.pigeonholes.values()].map((r) => r.group),
    ...[...s.filings.values()].map((f) => f.group),
    ...[...s.guests.values()].map((g) => g.group),
    ...[...s.notes.values()].map((n) => n.group),
    ...[...s.cabinets.values()].map((c) => c.group),
    ...[...s.pictures.values()].map((p) => p.group),
    ...[...s.cats.values()].map((c) => c.root),
  ]

  let occluders: { plan?: Plan; level: number; boxes: THREE.Box3[] } = { level: -1, boxes: [] }

  /** What stops a look across the level, as boxes in the world, rebuilt when the plan or your level changes. */
  function occludersHere() {
    if (occluders.plan === planNow() && occluders.level === s.me.level) return occluders.boxes
    const y = levelY(s.me.level)
    const boxes = solids(planNow(), here()).map((b) => new THREE.Box3(new THREE.Vector3(b.minX, y + b.bottom, b.minZ), new THREE.Vector3(b.maxX, y + b.top, b.maxZ)))
    occluders = { plan: planNow(), level: s.me.level, boxes }
    return boxes
  }

  /** Things hung on a wall stand within this of its face and still count as in front of it. */
  const ON_THE_WALL = 0.15

  const hitPoint = new THREE.Vector3()

  /** Whether a wall or a shut landing door stands between the ray's origin and `distance`. */
  function blocked(distance: number): boolean {
    const doors = [...(s.world?.doors.values() ?? [])].flatMap((d) => [d.left, d.right])
    const nearest = Math.min(
      ...occludersHere().map((b) => (raycaster.ray.intersectBox(b, hitPoint) ? hitPoint.distanceTo(raycaster.ray.origin) : Infinity)),
      ...raycaster.intersectObjects(doors.filter((d) => shown(d)), true).map((h) => h.distance),
    )
    return nearest < distance - ON_THE_WALL
  }

  /**
   * What's under the screen point (x, y in -1..1): within its reach and on your level while walking, anywhere from outside.
   * Walking, a wall or a shut door in front of it hides it; glass included.
   */
  function pick(x: number, y: number): Act | undefined {
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
    raycaster.far = viewNow() === 'overview' ? Infinity : 9
    const floor = floorY()
    const hit = raycaster.intersectObjects(pickables(), true).find((h) => {
      if (!shown(h.object) || !h.object.userData.act) return false
      return viewNow() === 'overview' || (h.point.y > floor - 0.2 && h.point.y < floor + levelHeight(s.me.level))
    })
    const a: Act | undefined = hit?.object.userData.act
    if (!a || viewNow() === 'overview') return a
    return hit!.distance <= reachOf(a) && !blocked(hit!.distance) ? a : undefined
  }

  const floorOf = (project: string) => boardNow()!.floors.find((f) => f.id === project)!

  /** The note in your hand, titled as its text shows it now. */
  function carried(): Carried | undefined {
    const held = s.carrying
    const item = held && boardNow() && draftItem(boardNow()!.floors, held.project, held.id)
    return item && { ...held!, title: noteTitle(held!.project, item), tag: item.tag }
  }

  /** The note in your hand, drawn by your hands; its draft stays pinned, hidden, until it is handed over. */
  function carry(project: string, id: string) {
    s.carrying = { project, id }
    s.beer = false
    syncNotes()
  }

  /** Empty hands: the note goes back on its board. */
  function drop() {
    s.carrying = undefined
    syncNotes()
  }

  const syncNotes = () => boardNow() && reconcile(notes, s.notes)

  const syncCabinets = () => boardNow() && reconcile(cabinets, s.cabinets)

  /** Each floor's filing cabinet in step with its archive's drawers. */
  const syncFilings = () => reconcile(filings, s.filings)

  /** Settles once the first board's building is pictured, the start's last wait (`ready`). */
  let firstPictured: () => void
  const firstBuilt = new Promise<void>((resolve) => (firstPictured = resolve))

  return { directory, screenDistance, boxesHere, here, discard, hang, reconcile, celebrate, isFresh, freshShown, dressSides, dressReplays, planOf, planNow, shownArrives, worldRebuilt, worldFurnished, ease, lookQuaternion, vec3, flyTo, flyHome, frameOn, frameCabinet, riddenFor, DOORS_SHUT, RIDE, floorY, pickables, pick, floorOf, carried, carry, drop, syncNotes, syncCabinets, syncFilings, firstBuilt, primeSeenAs }
}
