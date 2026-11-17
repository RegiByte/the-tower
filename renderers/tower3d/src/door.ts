import * as THREE from 'three'
import { HELD, HOLD_MS, holdFill, type Act, type Held, type Offer, type Verb } from './acts.ts'
import { levelsShown } from './levels.ts'
import type { Input, Move } from './input.ts'
import type { Plan } from './layout.ts'
import { SEED } from './random.ts'
import { petProgress } from './pet.ts'
import type { Pictures } from './showing.ts'
import { s, type Standing, type View } from './state.ts'
import { markedIn, type AppEvent, type Db } from './app.ts'
import type { CatName } from './life.ts'
import type { EventRecord } from './record.ts'
import { nowOf } from './now.ts'
import type { Port } from './port.ts'
import type { Stage } from './stage.ts'
import type { Events } from './events.ts'
import type { World } from './building.ts'
import type { Navigation } from './navigation.ts'
import type { Panels } from './panels.ts'
import type { AppLoop } from './app-loop.ts'
import type { Controls } from './controls.ts'
import type { Frames, Meter } from './frames.ts'
import type { Draft } from '../../../extensions/drafts/client/drafts.ts'
import type { Feed } from './feed.ts'
import type { Sim } from './sim.ts'
import { aim, eyes, facing, type Walker, type WalkerCell } from './walker.ts'

/**
 * `window.tower3d`: the way an agent drives and sees Tower 3D. It injects the same intents the keyboard and mouse
 * produce, and steps the same clock the screen's frames do.
 *
 *   await tower3d.ready()                  the first board is built and its pictures read; rejects with why a start failed (a file that would not load).
 *                                          The door is there from the page's first script, but until ready() resolves only ready is on it
 *   tower3d.capture()                      walk as if the mouse were locked (headless Chrome never grants the lock)
 *   tower3d.teleport({ level: 1, x, z })   stand somewhere at once (y: how high over its floor, on the deck)
 *   tower3d.acts('station')                every thing in the world of a kind, as it is aimed at (all without a kind)
 *   tower3d.locate({ kind: 'desk', id })   where a thing stands: its level and its center; teleport within reach
 *                                          (on a stepped clock, guests and cats stand somewhere once a step follows the board)
 *   tower3d.aimAt({ kind: 'desk', id })    turn to face a thing on your level; answers what is aimed after
 *   tower3d.press('use')                   run a verb the aimed thing offers; held verbs need { hold: true }
 *   tower3d.key('KeyN')                    a building key (N, V, M, H, 0–9, R, P, B, Escape, Backquote)
 *   tower3d.drive({ ahead: 1 })            hold a move until the next drive; drive() hands it back to the keyboard
 *   tower3d.step(60)                       stop the clock and run 60 frames of 1/60 s; play() lets it run again
 *                                          (open the page with ?stepped to start stopped, ?seed=<n> for its chance and
 *                                          ?at=<ISO time> for its wall clock: the same frames every load, any day)
 *   tower3d.advance()                      a fixture's next board, as if the tower had sent it (?board=busy has three: a new showing, then nobody waits; review three: the reviewer goes home, then comes back; leaving takes every subject a panel shows away and brings it back, seven times)
 *   await tower3d.pictured()               every picture being read is painted (one a later board brought too)
 *   tower3d.state()                        where you are, what you aim at, what's open, frame times, what the last frame drew and counters
 *   tower3d.shot()                         the scene alone as a PNG data URL (no DOM panels: use CDP for those)
 *   tower3d.events()                       the last 200 events Tower 3D's loops handled (seeing, hiring, spawning,
 *                                          statsPolling, archives), each with its effects and the simulated time it ran
 *                                          at, as plain data; events(n) only those after record n
 */
export type Door = {
  ready(): Promise<void>
  pictured(): Promise<void>
  capture(): void
  release(): void
  teleport(spot: Pick<Walker, 'level' | 'x' | 'z'> & Partial<Pick<Walker, 'yaw' | 'pitch' | 'y'>>): void
  acts(kind?: Act['kind']): Act[]
  locate(target: Act): { level: number; x: number; y: number; z: number }
  aimAt(target: Act): Act | undefined
  press(verb: Verb, opts?: { hold?: boolean }): void
  key(code: string): void
  drive(move?: Partial<Move>): void
  step(frames?: number, dt?: number): DoorState
  play(): void
  advance(): void
  state(): DoorState
  shot(): string
  events(after?: number): EventRecord[]
}

export type DoorState = {
  seed: number
  /** Simulated time, ms: advances with every frame, live or stepped. */
  time: number
  stepped: boolean
  captured: boolean
  view: View
  /** The open panel by what it shows: `{ kind: 'desk', id }`, `{ kind: 'doc', project, n, file }`, `{ kind: 'draft', project, id }`, … */
  panel: { kind: string; [field: string]: unknown } | undefined
  /** The draft in your hand. */
  carrying: Held | undefined
  walker: Walker
  riding: boolean
  flying: boolean
  /** The cat being petted, and how far into its strokes (below 0 while the camera flies in). */
  petting: { name: CatName; progress: number } | undefined
  aimed: Act | undefined
  offers: Offer[]
  marked: number
  holding: { verb: Verb; fill: number } | undefined
  /** Over the last second of real frames: frames per second, and ms spent in update and render per frame. */
  fps: number
  frameMs: number
  /** What the last rendered frame drew of the scene, your hands aside: draw calls and triangles. */
  drawn: { calls: number; triangles: number }
  counts: { boards: number; rebuilds: number; desks: number; stations: number; guests: number; walls: number; notes: number; pictures: number; leavers: number; arrivals: number }
}

declare global {
  interface Window {
    tower3d: Door
  }
}

/** What the door drives: the functions the page's own input and frames call. */
export type Engine = {
  ready: Promise<void>
  pictured: () => Promise<void>
  /** The plan the building stands on. */
  plan(): Plan
  update(dt: number): void
  render(): void
  /** Real frames run again, from now. */
  play(): void
  /** The simulated clock the door steps. */
  sim: Sim
  /** Where you stand, which `aimAt` turns you in. */
  walker: WalkerCell
  /** The building: its levels shown, its counts. */
  world: Pick<World, 'counts' | 'showLevels'>
  onKey(code: string, repeat: boolean): boolean
  /** Holds `move` as the walker's until the next drive; `undefined` hands it back to the keyboard. */
  drive(move: Move | undefined): void
  run(a: Act, verb: Verb): void
  place(level: number, spot: Standing): void
  leaveOverview(): void
  captured(): boolean
  pick(x: number, y: number): Act | undefined
  /** The crosshair on `a`, the prompt offering its verbs. */
  aimAt(a: Act | undefined): void
  /** What the prompt's act offers now. */
  offers(): Offer[]
  startHold(a: Act, o: Offer, by: string): void
  floorY(): number
  /** Real frames over the last second, and what the last frame drew. */
  meter(): Readonly<Meter>
  /** The draft open in the editor. */
  draft(): Draft | undefined
  /** The app's db: the panel open beside the world, the view, the desk's tab, a replay, motion, aim and capture. */
  app(): Db
  dispatch(event: AppEvent): void
  /** The panels drawn now, if a transition asked for a draw: a stepped frame draws as a real one does. */
  drawPending(): void
  pickables(): THREE.Object3D[]
  /** Delivers a fixture's next board. */
  advance(): void
  /** The events recorded after record `after`, as plain data (`record.ts`). */
  events(after: number): EventRecord[]
}

const STEP = 1 / 60

/** Whether `a` holds `o` somewhere below it. */
const isAncestor = (a: THREE.Object3D, o: THREE.Object3D): boolean => !!o.parent && (o.parent === a || isAncestor(a, o.parent))

/** An act's identity, whatever order its fields were written in. */
const actKey = (a: Act) => JSON.stringify(Object.entries(a).sort(([x], [y]) => x.localeCompare(y)))

/** Fills the door the entry opened (`boot.ts`), so whoever held it from the first script on now holds the whole door. */
export function installDoor(e: Engine, { camera, canvas, scene }: Pick<Stage, 'camera' | 'canvas' | 'scene'>) {
  /**
   * The outermost object standing for `target`, among everything pickable that is drawn on its level (a desk's second
   * monitor is hidden until its worker shows something); a level you are not on still counts. A thing drawn twice
   * (a tile on each face of a video wall) answers with the copy facing the camera, the nearest of those.
   */
  function objectOf(target: Act) {
    const key = actKey(target)
    const found: THREE.Object3D[] = []
    for (const root of e.pickables()) {
      root.traverseVisible((o) => {
        if (o.userData.act && actKey(o.userData.act) === key && !found.some((f) => isAncestor(f, o))) found.push(o)
      })
      if (found.length) break
    }
    const at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
    const turnedAway = (o: THREE.Object3D) => camera.position.clone().sub(at(o)).dot(o.getWorldDirection(new THREE.Vector3())) < 0
    const rank = (o: THREE.Object3D) => (turnedAway(o) ? 1e6 : 0) + at(o).distanceTo(camera.position)
    return found.reduce<THREE.Object3D | undefined>((a, o) => (!a || rank(o) < rank(a) ? o : a), undefined)
  }

  function everyAct(kind: Act['kind'] | undefined) {
    const found = new Map<string, Act>()
    for (const root of e.pickables()) {
      root.traverseVisible((o) => {
        const a: Act | undefined = o.userData.act
        if (a && (!kind || a.kind === kind)) found.set(actKey(a), a)
      })
    }
    return [...found.values()]
  }

  /**
   * The world as the next frame draws it: its levels shown or hidden, and every object where it stands. A frame does
   * this before it renders, so a door call made before one (a stepped page, a teleport) reads it the same.
   */
  function current() {
    e.world.showLevels(levelsShown(e.app().view, e.app().motion, e.walker.me().level))
    scene.updateMatrixWorld()
  }

  /** The boards taken when the clock last stepped. */
  let boardsStepped = 0
  /** Guests and cats are placed by a frame's ticks: on a stepped clock, one a board brought stands nowhere until a step. */
  const unplaced = (target: Act) => (target.kind === 'guest' || target.kind === 'cat') && e.sim.stepped() && boardsStepped !== e.world.counts().boards

  function centerOf(target: Act) {
    if (unplaced(target)) throw new Error(`${target.kind}s take their places on a frame, and none has run since the last board: step() first`)
    current()
    const o = objectOf(target)
    if (!o) throw new Error(`nothing in the world stands for ${JSON.stringify(target)}`)
    return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
  }

  const panelOf = (): DoorState['panel'] => {
    const { panel, deskTab, replay } = e.app()
    if (panel?.kind === 'logbook') return { kind: panel.kind, id: panel.card.id, tab: panel.tab, on: panel.on, read: panel.threads !== undefined }
    if (panel?.kind === 'draft') return { kind: panel.kind, project: e.draft()?.project, id: e.draft()?.id }
    if (panel?.kind === 'desk') return { ...panel, tab: deskTab, ...(replay && replay.id === panel.id && { replay: replay.session }) }
    return panel
  }

  const state = (): DoorState => {
    const { view, motion: { ride, flight, pet }, aim } = e.app()
    const offers = e.offers()
    return {
      seed: SEED, time: e.sim.now(), stepped: e.sim.stepped(), captured: e.captured(), view,
      panel: panelOf(), carrying: s.carrying,
      walker: { ...e.walker.me() }, riding: ride !== undefined, flying: flight !== undefined,
      petting: pet && { name: pet.name, progress: petProgress(pet, e.sim.now()) },
      aimed: aim.aimed, offers, marked: markedIn(aim, offers.length), holding: aim.hold && { verb: aim.hold.verb, fill: holdFill(aim.hold.start, e.sim.now()) },
      fps: e.meter().fps, frameMs: e.meter().frameMs, drawn: { calls: e.meter().calls, triangles: e.meter().triangles },
      counts: { ...e.world.counts(), desks: s.desks.size, stations: s.stations.size, guests: s.guests.size, walls: s.walls.size, notes: s.notes.size, pictures: s.pictures.size, leavers: s.leavers.size, arrivals: s.arrivals.size },
    }
  }

  Object.assign(window.tower3d, {
    ready: () => e.ready,
    pictured: e.pictured,
    capture() {
      s.doorMode = true
      e.dispatch({ type: 'capture', by: 'door', held: e.app().view === 'walk' && !e.app().panel })
    },
    release() {
      s.doorMode = false
      e.drive(undefined)
      e.dispatch({ type: 'capture', by: 'door', held: false })
    },
    teleport({ level, x, z, yaw = e.walker.me().yaw, pitch = 0, y = 0 }) {
      if (!e.plan().levels[level]) throw new Error(`no level ${level}: the tower has ${e.plan().levels.length}`)
      if (e.app().view === 'overview') e.leaveOverview()
      e.place(level, { x, z, yaw, pitch, y })
    },
    acts: (kind) => everyAct(kind),
    locate(target) {
      const at = centerOf(target)
      return { level: e.plan().levels.findLast((l) => l.y <= at.y)!.index, x: at.x, y: at.y, z: at.z }
    },
    aimAt(target) {
      if (e.app().view !== 'walk') throw new Error(`aimAt works while walking; the view is ${e.app().view}`)
      const at = centerOf(target)
      e.walker.set({ ...e.walker.me(), ...facing(eyes(e.walker.me(), e.floorY(), new THREE.Vector3()), at) })
      aim(camera, e.walker.me(), e.floorY())
      camera.updateMatrixWorld()
      e.aimAt(e.pick(0, 0))
      return e.app().aim.aimed
    },
    press(verb, { hold: held = false } = {}) {
      const { aimed } = e.app().aim
      if (!aimed) throw new Error('nothing is aimed at: aimAt a thing first')
      const offers = e.offers()
      const o = offers.find((o) => o.verb === verb)
      if (!o) throw new Error(`${verb} is not offered; offered: ${offers.map((o) => o.verb).join(', ') || 'nothing'}`)
      if (HELD.has(verb) && !held) throw new Error(`${verb} runs on a hold: press('${verb}', { hold: true }), then step past ${HOLD_MS} ms`)
      if (!HELD.has(verb) && held) throw new Error(`${verb} runs on a press, not a hold`)
      if (held) return e.startHold(aimed, o, 'door')
      e.run(aimed, verb)
    },
    key(code) {
      if (!e.app().building) throw new Error('no board yet: await ready()')
      e.onKey(code, false)
    },
    drive(m) {
      e.drive(m && { ahead: 0, side: 0, run: false, jump: false, ...m })
    },
    step(frames = 1, dt = STEP) {
      e.sim.stop()
      for (let i = 0; i < frames; i++) (e.update(dt), (boardsStepped = e.world.counts().boards))
      e.drawPending()
      e.render()
      return state()
    },
    play() {
      e.sim.run()
      e.play()
    },
    advance: () => e.advance(),
    state,
    shot() {
      e.render()
      return canvas.toDataURL('image/png')
    },
    events: (after = 0) => e.events(after),
  } satisfies Door)
}

/** What the door is started with: every resource whose functions it drives. */
export type DoorDeps = { sim: Sim; walker: WalkerCell; pictures: Pictures; stage: Stage; input: Input; port: Port; events: Events; world: World; navigation: Navigation; panels: Panels; app: AppLoop; controls: Controls; frames: Frames; feed: Feed }

/** The door filled, once every resource it drives has started (the `door` resource). */
export function startDoor(started: DoorDeps) {
  const { events } = started
  const { pictured } = started.pictures
  const { planNow, floorY, pickables, pick } = started.world
  const { captured } = nowOf(started.port)
  const { leaveOverview, offersNow, aimAt, startHold } = started.navigation
  const { run, drawPending } = started.panels
  const { app } = started.app
  const { onKey } = started.controls
  const { play, render, update, meter } = started.frames
  const { advance, ready } = started.feed

  /** Standing at `spot` on `level` at once, out of any ride or flight. */
  const place = (level: number, spot: Standing) => app.dispatch({ type: 'place', level, spot })

  installDoor({
    ready, pictured, update, render, onKey, run, place, plan: planNow, leaveOverview, captured, pick, aimAt, offers: offersNow, startHold, floorY, pickables, advance, app: app.state, dispatch: app.dispatch, drawPending,
    events: events.read,
    play,
    sim: started.sim,
    walker: started.walker,
    world: started.world,
    meter,
    draft: started.panels.draft,
    drive: started.input.drive,
  }, started.stage)
}
