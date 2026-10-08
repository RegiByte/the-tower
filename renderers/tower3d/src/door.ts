import * as THREE from 'three'
import { HELD, HOLD_MS, holdFill, type Act, type Held, type Offer, type Verb } from './acts.ts'
import { EYE } from './layout.ts'
import { levelsShown, showLevels } from './levels.ts'
import { drive, type Move } from './input.ts'
import { SEED } from './random.ts'
import { petProgress } from './pet.ts'
import { pictured } from './showing.ts'
import { camera, canvas, scene } from './stage.ts'
import { s, type Standing, type View } from './state.ts'
import type { CatName } from './life.ts'
import { aim, facing, type Walker } from './walker.ts'

/**
 * `window.tower3d`: the way an agent drives and sees Tower 3D. It injects the same intents the keyboard and mouse
 * produce, and steps the same clock the screen's frames do.
 *
 *   await tower3d.ready()                  the first board is built and its pictures read (on a stepped page, people
 *                                          and cats take their places on the first step)
 *   tower3d.capture()                      walk as if the mouse were locked (headless Chrome never grants the lock)
 *   tower3d.teleport({ level: 1, x, z })   stand somewhere at once
 *   tower3d.acts('station')                every thing in the world of a kind, as it is aimed at (all without a kind)
 *   tower3d.locate({ kind: 'desk', id })   where a thing stands: its level and its center; teleport within reach
 *   tower3d.aimAt({ kind: 'desk', id })    turn to face a thing on your level; answers what is aimed after
 *   tower3d.press('use')                   run a verb the aimed thing offers; held verbs need { hold: true }
 *   tower3d.key('KeyN')                    a building key (N, V, M, H, 0–9, R, P, B, Escape, Backquote)
 *   tower3d.drive({ ahead: 1 })            hold a move until the next drive; drive() hands it back to the keyboard
 *   tower3d.step(60)                       stop the clock and run 60 frames of 1/60 s; play() lets it run again
 *                                          (open the page with ?stepped to start stopped, ?seed=<n> for its chance and
 *                                          ?at=<ISO time> for its wall clock: the same frames every load, any day)
 *   tower3d.advance()                      a fixture's next board, as if the tower had sent it (?board=busy has three: a new showing, then nobody waits)
 *   await tower3d.pictured()               every picture being read is painted (one a later board brought too)
 *   tower3d.state()                        where you are, what you aim at, what's open, frame times, what the last frame drew and counters
 *   tower3d.shot()                         the scene alone as a PNG data URL (no DOM panels: use CDP for those)
 */
export type Door = {
  ready(): Promise<void>
  pictured(): Promise<void>
  capture(): void
  release(): void
  teleport(spot: Pick<Walker, 'level' | 'x' | 'z'> & Partial<Pick<Walker, 'yaw' | 'pitch'>>): void
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
  update(dt: number): void
  render(): void
  /** Real frames run again, from now. */
  play(): void
  onKey(code: string, repeat: boolean): void
  run(a: Act, verb: Verb): void
  place(level: number, spot: Standing): void
  leaveOverview(): void
  captured(): boolean
  captureChanged(): void
  pick(x: number, y: number): Act | undefined
  showPrompt(a: Act | undefined): void
  startHold(a: Act, o: Offer, by: string): void
  floorY(): number
  pickables(): THREE.Object3D[]
  /** Delivers a fixture's next board. */
  advance(): void
}

const STEP = 1 / 60

/** An act's identity, whatever order its fields were written in. */
const actKey = (a: Act) => JSON.stringify(Object.entries(a).sort(([x], [y]) => x.localeCompare(y)))

export function installDoor(e: Engine) {
  /**
   * The outermost object standing for `target`, among everything pickable that is drawn on its level (a desk's second
   * monitor is hidden until its worker shows something); a level you are not on still counts.
   */
  function objectOf(target: Act) {
    const key = actKey(target)
    let found: THREE.Object3D | undefined
    for (const root of e.pickables()) {
      root.traverseVisible((o) => {
        if (!found && o.userData.act && actKey(o.userData.act) === key) found = o
      })
      if (found) return found
    }
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
    showLevels(levelsShown(s))
    scene.updateMatrixWorld()
  }

  function centerOf(target: Act) {
    current()
    const o = objectOf(target)
    if (!o) throw new Error(`nothing in the world stands for ${JSON.stringify(target)}`)
    return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
  }

  const panelOf = (): DoorState['panel'] => {
    if (s.panel?.kind === 'logbook') return { kind: s.panel.kind, id: s.panel.card.id, on: s.panel.on, read: s.panel.threads !== undefined }
    if (s.panel?.kind === 'draft') return { kind: s.panel.kind, project: s.draft?.project, id: s.draft?.id }
    if (s.panel?.kind === 'desk') return { ...s.panel, tab: s.deskTab, ...(s.replay?.id === s.panel.id && { replay: s.replay.session }) }
    return s.panel
  }

  const state = (): DoorState => ({
    seed: SEED, time: s.simNow, stepped: s.stepped, captured: e.captured(), view: s.view,
    panel: panelOf(), carrying: s.carrying,
    walker: { ...s.me }, riding: s.ride !== undefined, flying: s.flight !== undefined,
    petting: s.pet && { name: s.pet.name, progress: petProgress(s.pet, s.simNow) },
    aimed: s.aimed, offers: s.offers, marked: s.marked, holding: s.hold && { verb: s.hold.verb, fill: holdFill(s.hold.start, s.simNow) },
    fps: s.meter.fps, frameMs: s.meter.frameMs, drawn: { calls: s.meter.calls, triangles: s.meter.triangles },
    counts: { boards: s.boards, rebuilds: s.rebuilds, desks: s.desks.size, stations: s.stations.size, guests: s.guests.size, walls: s.walls.size, notes: s.notes.size, pictures: s.pictures.size, leavers: s.leavers.size, arrivals: s.arrivals.size },
  })

  window.tower3d = {
    ready: () => e.ready,
    pictured,
    capture() {
      s.doorMode = true
      s.doorHeld = s.view === 'walk' && !s.panel
      e.captureChanged()
    },
    release() {
      s.doorMode = s.doorHeld = false
      drive(undefined)
      e.captureChanged()
    },
    teleport({ level, x, z, yaw = s.me.yaw, pitch = 0 }) {
      if (!s.plan.levels[level]) throw new Error(`no level ${level}: the tower has ${s.plan.levels.length}`)
      if (s.view === 'overview') e.leaveOverview()
      e.place(level, { x, z, yaw, pitch })
    },
    acts: (kind) => everyAct(kind),
    locate(target) {
      const at = centerOf(target)
      return { level: s.plan.levels.findLast((l) => l.y <= at.y)!.index, x: at.x, y: at.y, z: at.z }
    },
    aimAt(target) {
      if (s.view !== 'walk') throw new Error(`aimAt works while walking; the view is ${s.view}`)
      const at = centerOf(target)
      s.me = { ...s.me, ...facing(new THREE.Vector3(s.me.x, e.floorY() + s.me.y + EYE, s.me.z), at) }
      aim(camera, s.me, e.floorY())
      camera.updateMatrixWorld()
      s.aimed = e.pick(0, 0)
      e.showPrompt(s.aimed)
      return s.aimed
    },
    press(verb, { hold: held = false } = {}) {
      if (!s.aimed) throw new Error('nothing is aimed at: aimAt a thing first')
      const o = s.offers.find((o) => o.verb === verb)
      if (!o) throw new Error(`${verb} is not offered; offered: ${s.offers.map((o) => o.verb).join(', ') || 'nothing'}`)
      if (HELD.has(verb) && !held) throw new Error(`${verb} runs on a hold: press('${verb}', { hold: true }), then step past ${HOLD_MS} ms`)
      if (!HELD.has(verb) && held) throw new Error(`${verb} runs on a press, not a hold`)
      if (held) return e.startHold(s.aimed, o, 'door')
      e.run(s.aimed, verb)
    },
    key(code) {
      if (!s.board) throw new Error('no board yet: await ready()')
      e.onKey(code, false)
    },
    drive(m) {
      drive(m && { ahead: 0, side: 0, run: false, jump: false, ...m })
    },
    step(frames = 1, dt = STEP) {
      s.stepped = true
      for (let i = 0; i < frames; i++) e.update(dt)
      e.render()
      return state()
    },
    play() {
      s.stepped = false
      e.play()
    },
    advance: () => e.advance(),
    state,
    shot() {
      e.render()
      return canvas.toDataURL('image/png')
    },
  }
}
