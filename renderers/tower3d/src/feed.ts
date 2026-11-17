import { readViewer } from '/lib/viewer.js'
import type { Board, ShelfSelf, Tower } from './api.ts'
import { boardErrorTitle } from './cards.ts'
import { idle } from './tv.ts'
import { checkWardrobe } from './closet.ts'
import type { Fixture } from './fixtures.ts'
import * as loading from './loading.ts'
import type { Archive } from './archive.ts'
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
export type FeedDeps = { tower: Tower; archive: Archive; stage: Stage; assets: Assets; port: Port; toasts: Toasts; world: World; spawn: Spawn; hud: Hud; panels: Panels; frames: Frames }

/** The boards the page is fed, and the promise the door's ready answers: `advance` delivers a fixture's next. */
export type Feed = { advance: () => void; ready: Promise<void> }

/**
 * What either feed does: the models taken in once they load, `onModels` then, a board sent into the building, a
 * failed start said, and `ready` once the first board is built.
 */
function feedOf(started: FeedDeps, onModels: () => void) {
  const { port } = started
  const { flyPlane } = started.stage
  const { toast } = started.toasts
  const { firstBuilt, landChairs } = started.world
  const { landHands } = started.frames

  let built: () => void

  let unbuilt: (err: Error) => void

  const ready = new Promise<void>((resolve, reject) => ((built = resolve), (unbuilt = reject)))

  /** `next` arrives: the building takes it once its floors' archives are read at its keys, planned then. */
  const boardArrived = (next: Board, self: ShelfSelf | undefined) => port.dispatch({ type: 'board/arrived', board: next, self })

  const failStart = (err: Error) => (toast(`start: ${err.message}`), loading.fail(`start: ${err.message}`), unbuilt(err))

  idle(started.tower.framed)

  started.assets.loaded.then(({ models: m, kept }) => {
    checkWardrobe(m.catalogue)
    landChairs(m)
    flyPlane(m.plane)
    landHands(m)
    port.dispatch({ type: 'kept/landed', muted: (kept as Kept | null)?.muted ?? false, meterShown: (kept as Kept | null)?.fps ?? false, seen: (kept as Kept | null)?.seen })
    onModels()
  }, failStart)

  firstBuilt.then(() => built())

  return { ready, boardArrived, failStart }
}

/** The live board and its errors, the first started under the loading screen once the models are in. */
export function startFeed(started: FeedDeps): Feed {
  const { tower, port } = started
  const { camera, renderer, scene } = started.stage
  const { boardNow } = nowOf(port)
  const { hiring } = started.spawn
  const { renderPanel } = started.panels
  const { beginDrawing, frameScene } = started.frames
  const { ready, boardArrived, failStart } = feedOf(started, onLoaded)

  /** The board's failure stays over the last board drawn, until the tower sends a board again. */
  function onBoardError(err: Error & { code: string }) {
    $('board-error').querySelector('b')!.textContent = boardErrorTitle(err.code)
    $('board-error').querySelector('span')!.textContent = err.message
    show('board-error', true)
    if (loading.shown()) loading.fail(`${boardErrorTitle(err.code)}: ${err.message}`)
    const lost = err.code === 'disconnected'
    port.dispatch({ type: 'lost', lost })
    if (lost) hiring.dispatch({ type: 'lost' })
    renderPanel()
  }

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

  /**
   * The first board under the loading screen: a paint so the screen shows each stage, the building, then every program
   * its first frame draws with compiled off the main thread (KHR_parallel_shader_compile), the scene set as that frame
   * sets it (the rig's lights and shadows are part of each program), and that frame drawn under the screen as it leaves.
   */
  async function startOn(next: Board, at: ShelfSelf | undefined) {
    loading.stage('building')
    await painted()
    await started.archive.settledArchives(next)
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

  /** How waits ring and what you dismissed are known before the first board, which may come long before the models. */
  readViewer(tower.store.get).then((viewer) => (port.dispatch({ type: 'stored', viewer }), tower.subscribe(onLiveBoard), tower.onBoardError(onBoardError)))

  const advance = () => {
    throw new Error('advance works on a fixture board: open the page with ?board=')
  }

  return { advance, ready }
}

/** What the fixture feed is started with: the feed's, and the fixture whose boards it delivers. */
export type FixtureFeedDeps = FeedDeps & { fixture: Fixture }

/** A fixture's boards, delivered by the door one after another (`advance`): the first once the models are in. */
export function startFixtureFeed(started: FixtureFeedDeps): Feed {
  const { port, fixture } = started
  started.frames.drawEachFrame()

  function onFixtureBoard(next: Board) {
    port.dispatch({ type: 'board', board: next })
    boardArrived(next, undefined)
  }

  const { ready, boardArrived } = feedOf(started, () => onFixtureBoard(fixture.delivered().board))

  return { advance: () => onFixtureBoard(fixture.advance()), ready }
}
