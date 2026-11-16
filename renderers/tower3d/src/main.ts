import { type CatNames } from './acts.ts'
import { readViewer } from '/lib/viewer.js'
import { tower, type Board, type ShelfSelf } from './api.ts'
import { boardErrorTitle } from './cards.ts'
import { fitHands, makeHands } from './hands.ts'
import { idle } from './tv.ts'
import { chairKit } from './chairs.ts'
import { checkWardrobe } from './closet.ts'
import { installDoor } from './door.ts'
import { FIXTURE, fixtureBoards } from './fixtures.ts'
import * as loading from './loading.ts'
import { settledArchives } from './archive.ts'
import { s, type Spot, type Standing } from './state.ts'
import { type Walker } from './walker.ts'
import type { Shell } from './shell.ts'
import type { Music } from './music.ts'
import type { Term } from './term.ts'
import type { Assets } from './loads.ts'
import type { Toasts } from './toasts.ts'
import type { Events } from './events.ts'
import { $, show } from './dom.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'
import type { Views } from './views.ts'
import type { Spawn } from './spawn.ts'

import type { Hud } from './hud.ts'

import type { Navigation } from './navigation.ts'

import type { Panels } from './panels.ts'

import type { AppLoop } from './app-loop.ts'

import type { Controls } from './controls.ts'

import type { Frames } from './frames.ts'

/** The resources the page reads as it starts: the leaves' binding (`Shell`), and those only the page reads. */
export type Main = Shell & { music: Music; terminal: Term; assets: Assets; toasts: Toasts; events: Events; world: World; views: Views; spawn: Spawn; hud: Hud; navigation: Navigation; panels: Panels; app: AppLoop; controls: Controls; frames: Frames }

/**
 * The page: what it draws, the listeners and timers it keeps, and the loops it runs, started by the `main` resource once
 * every resource it reads has (system.ts).
 */
export function startMain(started: Main) {
  const { camera, flyPlane, renderer, scene } = started.stage
  const { toast } = started.toasts
  const { events } = started
  const { hiring } = started.spawn
  const { planNow, floorY, pickables, pick, firstBuilt, primeSeenAs } = started.world
  const { boardNow, captured, viewNow, motionNow } = nowOf(started.port)
  const { toggleFps } = started.hud
  const { leaveOverview, offersNow, aimAt, startHold } = started.navigation
  const { renderPanel, run, drawPending } = started.panels
  const { app } = started.app
  const { onKey } = started.controls
  const { beginDrawing, play, render, frameScene, update } = started.frames










  /** Where you stood, kept by the tower for this page so a reload puts you back, with the music on or off and what you've seen shown. */
  type Kept = { spot: Spot; muted: boolean; fps?: boolean; seen?: string[] }
  /** How many showings opened are kept: enough to cover every worker on duty. */
  const SEEN_KEPT = 300



  const spotOf = ({ level, x, z, yaw, pitch, y }: Walker): Spot => ({ level, x, z, yaw, pitch, y })


  /** The board's failure stays over the last board drawn, until the tower sends a board again. */
  function onBoardError(err: Error & { code: string }) {
    $('board-error').querySelector('b')!.textContent = boardErrorTitle(err.code)
    $('board-error').querySelector('span')!.textContent = err.message
    show('board-error', true)
    if (loading.shown()) loading.fail(`${boardErrorTitle(err.code)}: ${err.message}`)
    s.lost = err.code === 'disconnected'
    app.dispatch({ type: 'lost', lost: s.lost })
    if (s.lost) hiring.dispatch({ type: 'lost' })
    renderPanel()
  }

  /** `next` arrives: the building takes it once its floors' archives are read at its keys, planned then. */
  const boardArrived = (next: Board, self: ShelfSelf | undefined) => app.dispatch({ type: 'board/arrived', board: next, self })







  /** Standing at `spot` on `level` at once, out of any ride or flight. */
  const place = (level: number, spot: Standing) => app.dispatch({ type: 'place', level, spot })


























  /**
   * Boards that arrive while the models load or the first is built supersede one another: the latest is drawn once the
   * page has started. Each is seen by the attention machine as it arrives: the loads and the start wait on a shown tab
   * (an image's decode, a frame), and a hidden one still rings.
   */
  let loaded = false
  let starting = false
  let latest: Parameters<typeof boardArrived> | undefined
  function onLiveBoard(next: Board, at: ShelfSelf | undefined) {
    show('board-error', false)
    s.lost = false
    app.dispatch({ type: 'lost', lost: false })
    app.dispatch({ type: 'board', board: next })
    if (!loaded || starting) return void (latest = [next, at])
    if (boardNow()) return boardArrived(next, at)
    start(next, at)
  }

  /** The models are in: the board that waited for them, if one did, starts the page. */
  function onLoaded() {
    loaded = true
    if (!loading.failed()) loading.stage('board')
    if (!latest) return
    const [next, at] = latest
    latest = undefined
    start(next, at)
  }

  function start(next: Board, at: ShelfSelf | undefined) {
    starting = true
    startOn(next, at).then(() => {
      starting = false
      const waiting = latest
      latest = undefined
      if (waiting) boardArrived(...waiting)
    }, failStart)
  }

  const failStart = (err: Error) => (toast(`start: ${err.message}`), loading.fail(`start: ${err.message}`), unbuilt(err))

  /**
   * The first board under the loading screen: a paint so the screen shows each stage, the building, then every program
   * its first frame draws with compiled off the main thread (KHR_parallel_shader_compile), the scene set as that frame
   * sets it (the rig's lights and shadows are part of each program), and that frame drawn under the screen as it leaves.
   */
  async function startOn(next: Board, at: ShelfSelf | undefined) {
    loading.stage('building')
    await painted()
    await settledArchives(next)
    boardArrived(next, at)
    if (!app.state().building) throw new Error("the first board was not taken: its floors' archives were read before it was sent in, and no longer were when it arrived")
    loading.stage('lighting')
    await painted()
    frameScene()
    await renderer.compileAsync(scene, camera)
    beginDrawing()
    loading.leave()
  }

  const painted = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)))




















  idle(tower.framed)
  started.assets.loaded.then(({ models: m, kept, kit, declared: renderer }) => {
    s.declared = renderer ?? undefined
    checkWardrobe(m.catalogue)
    s.models = m
    s.chairKit = chairKit(m.desk.getObjectByName('chair')!)
    s.catNames = (renderer?.settings.cats ?? {}) as CatNames
    s.kit = kit
    flyPlane(m.plane)
    s.hands = makeHands(m)
    fitHands(s.hands, camera.aspect)
    s.saved = (kept as Kept | null)?.spot
    s.muted = (kept as Kept | null)?.muted ?? false
    s.seenShown = new Set((kept as Kept | null)?.seen)
    primeSeenAs((kept as Kept | null)?.seen === undefined)
    if ((kept as Kept | null)?.fps) toggleFps()
    if (fixture) onFixtureBoard(fixture[0])
    else onLoaded()
  }, failStart)
  /** How waits ring and what you dismissed are known before the first board, which may come long before the models. */
  if (FIXTURE === undefined) readViewer(tower.store.get).then((viewer) => (app.dispatch({ type: 'stored', viewer }), tower.subscribe(onLiveBoard), tower.onBoardError(onBoardError)))

  /** A fixture's boards, delivered by the door one after another: the first on load. */
  const fixture = fixtureBoards()
  let fixtureAt = 0
  function advance() {
    if (!fixture) throw new Error('advance works on a fixture board: open the page with ?board=')
    const next = fixture[fixtureAt + 1]
    if (!next) throw new Error(`the ${FIXTURE} fixture has ${fixture.length} board${fixture.length === 1 ? '' : 's'}, all delivered`)
    fixtureAt++
    onFixtureBoard(next)
  }

  function onFixtureBoard(next: Board) {
    app.dispatch({ type: 'board', board: next })
    boardArrived(next, undefined)
  }

  /** Kept only for a person: the door's walks would move their spot. */
  let keptKey = ''
  setInterval(() => {
    if (!boardNow() || viewNow() !== 'walk' || motionNow().ride || s.doorMode) return
    const kept: Kept = { spot: spotOf(s.me), muted: s.muted, fps: s.fpsShown, seen: [...s.seenShown].slice(-SEEN_KEPT) }
    const key = JSON.stringify(kept)
    if (key !== keptKey) (keptKey = key, tower.remember(kept))
  }, 1000)

  let built: () => void
  let unbuilt: (err: Error) => void
  const ready = new Promise<void>((resolve, reject) => ((built = resolve), (unbuilt = reject)))
  firstBuilt.then(() => built())

  installDoor({
    ready, update, render, onKey, run, place, plan: planNow, leaveOverview, captured, pick, aimAt, offers: offersNow, startHold, floorY, pickables, advance, app: app.state, dispatch: app.dispatch, drawPending,
    events: events.read,
    play,
  })
}
