import { type CatNames } from './acts.ts'
import { readViewer } from '/lib/viewer.js'
import { tower, type Board, type ShelfSelf } from './api.ts'
import { boardErrorTitle } from './cards.ts'
import { fitHands, makeHands } from './hands.ts'
import { idle } from './tv.ts'
import { chairKit } from './chairs.ts'
import { checkWardrobe } from './closet.ts'
import { FIXTURE, fixtureBoards } from './fixtures.ts'
import * as loading from './loading.ts'
import { settledArchives } from './archive.ts'
import { s } from './state.ts'
import type { Assets } from './loads.ts'
import type { Toasts } from './toasts.ts'
import { $, show } from './dom.ts'
import { nowOf } from './now.ts'
import type { Kept } from './keeper.ts'
import type { World } from './building.ts'
import type { Spawn } from './spawn.ts'
import type { Hud } from './hud.ts'
import type { Panels } from './panels.ts'
import type { Frames } from './frames.ts'
import type { Stage } from './stage.ts'
import type { Port } from './port.ts'

/** What the feed resource is started with. */
export type FeedDeps = { stage: Stage; assets: Assets; port: Port; toasts: Toasts; world: World; spawn: Spawn; hud: Hud; panels: Panels; frames: Frames }

export type Feed = ReturnType<typeof startFeed>

/**
 * The boards the page is fed: the live board and its errors, or a fixture's boards one after another, the first started
 * under the loading screen once the models are in, and the promise the door's ready answers.
 */
export function startFeed(started: FeedDeps) {
  const { port } = started
  const { camera, flyPlane, renderer, scene } = started.stage
  const { boardNow } = nowOf(port)
  const { toast } = started.toasts
  const { firstBuilt, primeSeenAs } = started.world
  const { hiring } = started.spawn
  const { toggleFps } = started.hud
  const { renderPanel } = started.panels
  const { beginDrawing, frameScene } = started.frames

  /** The board's failure stays over the last board drawn, until the tower sends a board again. */
  function onBoardError(err: Error & { code: string }) {
    $('board-error').querySelector('b')!.textContent = boardErrorTitle(err.code)
    $('board-error').querySelector('span')!.textContent = err.message
    show('board-error', true)
    if (loading.shown()) loading.fail(`${boardErrorTitle(err.code)}: ${err.message}`)
    s.lost = err.code === 'disconnected'
    port.dispatch({ type: 'lost', lost: s.lost })
    if (s.lost) hiring.dispatch({ type: 'lost' })
    renderPanel()
  }

  /** `next` arrives: the building takes it once its floors' archives are read at its keys, planned then. */
  const boardArrived = (next: Board, self: ShelfSelf | undefined) => port.dispatch({ type: 'board/arrived', board: next, self })

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
    port.dispatch({ type: 'lost', lost: false })
    port.dispatch({ type: 'board', board: next })
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
    if (!port.state().building) throw new Error("the first board was not taken: its floors' archives were read before it was sent in, and no longer were when it arrived")
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
  if (FIXTURE === undefined) readViewer(tower.store.get).then((viewer) => (port.dispatch({ type: 'stored', viewer }), tower.subscribe(onLiveBoard), tower.onBoardError(onBoardError)))

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
    port.dispatch({ type: 'board', board: next })
    boardArrived(next, undefined)
  }

  let built: () => void

  let unbuilt: (err: Error) => void

  const ready = new Promise<void>((resolve, reject) => ((built = resolve), (unbuilt = reject)))

  firstBuilt.then(() => built())

  return { advance, ready }
}
