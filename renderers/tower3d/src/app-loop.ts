import { statsQuery } from '/lib/stats.js'
import { ask } from '/lib/chrome.js'
import { tower } from './api.ts'
import { findCard } from './cards.ts'
import { attending } from '/lib/attend.js'
import { appHandlers, startingDb, type AppEvent, type Arrival, type TabTo } from './app.ts'
import { loop, timers, type Executors, type TimerEffect } from '/lib/machine.js'
import { purr, ring } from './life.ts'
import { PET_MS } from './pet.ts'
import { cabinetOf } from './layout.ts'
import { clockMoves, wallNow } from './clock.ts'
import { archivedAt, archivesSettled, drawersAt, readArchives } from './archive.ts'
import { FILINGS, reconcile } from './layers.ts'
import { s, type Panel, type Standing } from './state.ts'
import { aim } from './walker.ts'
import type { Toasts } from './toasts.ts'
import type { Events } from './events.ts'
import { $ } from './dom.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'
import type { Views } from './views.ts'
import type { Spawn } from './spawn.ts'

import type { Hud } from './hud.ts'

import type { Navigation } from './navigation.ts'

import type { Panels } from './panels.ts'
import type { Clients } from './clients.ts'
import type { Stage } from './stage.ts'
import type { Input } from './input.ts'
import type { Port } from './port.ts'

/** What the app resource is started with. */
export type AppLoopDeps = { clients: Clients; stage: Stage; input: Input; port: Port; toasts: Toasts; events: Events; world: World; views: Views; spawn: Spawn; hud: Hud; navigation: Navigation; panels: Panels }

export type AppLoop = ReturnType<typeof startAppLoop>

/**
 * The page's app loop (app.ts's handlers) with the executors that carry its effects out, attached to the port, and the
 * window's focus and visibility it is told of.
 */
export function startAppLoop(started: AppLoopDeps) {
  const { port } = started
  const { draftsOf, floorThreadsOf } = started.clients
  const { camera, orbit } = started.stage
  const { releaseKeys } = started.input
  const { boardNow, panelAs } = nowOf(port)
  const { toast } = started.toasts
  const { events } = started
  const { discard, celebrate, dressReplays, planOf, planNow, shownArrives, worldRebuilt, worldFurnished, flyHome, frameCabinet, floorY, syncNotes, syncCabinets } = started.world
  const { desk } = started.views
  const { hiring } = started.spawn
  const { renderHud, renderElevator, showPaused, lock, unlocked, keepViewer, sawDesk } = started.hud
  const { toDesk, toShell, goToAsk } = started.navigation
  const { display, focusDesk, mountDeskScreen, focusShell, LEAVE, ENTER, TAB_LEAVE, TAB_ENTER, drawPending, rereadViewer, freshLogbooks, followDraft, askDraw } = started.panels

  /** You stand at `spot` on `level`, the camera at your eyes. */
  function stand(level: number, spot: Standing) {
    s.me = { ...s.me, pitch: 0, ...spot, level, y: spot.y ?? 0, vy: 0 }
    aim(camera, s.me, floorY())
    renderHud()
    renderElevator()
  }

  /** What arriving somewhere does that only the building can say: whether the desk or the kiosk still stands, the mouse, the orbit, a purr. */
  const ARRIVED: { [K in Exclude<Arrival, { kind: 'ask' }>['kind']]: (at: Extract<Arrival, { kind: K }>) => void } = {
    desk: ({ id }) => s.desks.has(id) && focusDesk(id),
    shell: ({ id }) => focusShell(id),
    level: () => lock(),
    overview: ({ center }) => {
      orbit.target.fromArray(center)
      orbit.enabled = true
    },
    pet: () => s.muted || purr(PET_MS / 1000),
  }

  /** Notifications are the tower page's; the door rings nothing, nor does a framed page: the page framing it rings for the same waits. */
  const app = loop({
    state: startingDb(attending({ focused: document.hasFocus(), visible: document.visibilityState === 'visible' })),
    handlers: appHandlers({ planOf, clockMoves, archivesSettled, archivedAt, drawersAt, threadsOf: floorThreadsOf, keepsDrafts: (f) => draftsOf(f) !== undefined }),
    execute: {
      ...(timers<AppEvent>() as Executors<TimerEffect<AppEvent>, AppEvent>),
      announce: () => {},
      notify: () => {},
      unnotify: () => {},
      sound: ({ sound }) => void (s.doorMode || tower.framed || ring(sound)),
      keep: ({ field, value }) => keepViewer(field, value),
      leave: ({ panel }) => (LEAVE[panel.kind] as (p: Panel) => void)(panel),
      enter: ({ panel, from }) => (ENTER[panel.kind] as (p: Panel, from: Panel | undefined) => void)(panel, from),
      'tab/leave': ({ tab }) => TAB_LEAVE(tab),
      'tab/enter': ({ id, to }) => (TAB_ENTER[to.tab] as (id: string, to: TabTo) => void)(id, to),
      'desk/screen': ({ id }) => mountDeskScreen(findCard(boardNow()!, id)!),
      replays: () => dressReplays(),
      'fly-home': () => flyHome(),
      unlock: () => unlocked(),
      captured: () => (releaseKeys(), showPaused()),
      fire: ({ event }, dispatch) => dispatch(event),
      place: ({ level, spot }) => stand(level, spot),
      fade: ({ on }) => void $('fade').classList.toggle('on', on),
      hud: () => renderHud(),
      elevator: () => renderElevator(),
      arrived: ({ at }) => (ARRIVED[at.kind] as (at: Arrival) => void)(at),
      toast: ({ text }) => toast(text),
      'archives/read': ({ board }, dispatch) => (readArchives(board), dispatch({ type: 'archives/asked', at: wallNow() })),
      filings: () => void reconcile(FILINGS, s.filings, planNow(), discard),
      notes: () => void syncNotes(),
      cabinets: () => void syncCabinets(),
      'stats/fetch': ({ reading }, dispatch) =>
        void tower.stats(statsQuery(s.viewer.statsRange, wallNow())).then(
          (read) => dispatch({ type: 'stats/landed', reading, read, at: wallNow() }),
          (err: Error) => dispatch({ type: 'stats/failed', reading, message: err.message }),
        ),
      'world/apply': ({ was }) => {
      desk.update(boardNow()!)
      rereadViewer()
      worldRebuilt(was)
      hiring.dispatch({ type: 'board', board: boardNow()! })
      worldFurnished(was)
      if (s.draft?.id) followDraft(s.draft)
      renderHud()
    },
      fireworks: ({ cards }) => celebrate(cards),
      'waits/began': () => void (s.waitedAt = s.simNow),
      asked: ({ ask }) => toast(`${ask.title}, asked by ${ask.cap}`, { label: 'Go', run: () => goToAsk(ask) }),
      'shown/arrived': ({ id, target, atDesk }) => shownArrives(id, target, atDesk),
      'game/frame': ({ project, id }) => frameCabinet(cabinetOf(planNow(), project, id)!),
      logbooks: () => freshLogbooks(boardNow()!),
      'replan/at': ({ until }, dispatch) => dispatch({ type: 'replan', at: Math.max(until, wallNow()) }),
      'desk/go': ({ id }) => toDesk(id),
      'shell/go': ({ id }) => toShell(id),
      draw: askDraw,
      display: ({ subject }) => display(subject),
      focus: ({ selector }) => (drawPending(), document.querySelector<HTMLElement>(selector)?.focus()),
    },
  })

  app.subscribe(events.listen('app'))

  started.port.attach(app)

  addEventListener('focus', () => {
    app.dispatch({ type: 'focus', focused: true })
    const desk = panelAs('desk')
    const c = desk && boardNow() && findCard(boardNow()!, desk.id)
    if (c) sawDesk(boardNow()!, c)
  })

  // The window blurs as focus moves into one of the page's own frames, where the document still has it once focus settles.
  addEventListener('blur', () => setTimeout(() => app.dispatch({ type: 'focus', focused: document.hasFocus() })))

  document.addEventListener('visibilitychange', () => app.dispatch({ type: 'visible', visible: document.visibilityState === 'visible' }))

  return { app }
}
