import { drawPanel, STATS_ALL, statsHtml, statsQuery } from '/panels.js'
import { loop, timers } from '/loop.js'
import { failRead, failureOf, landRead, noReads, reading, refreshRead, stepped, valueOf } from '/reads.js'
import { floorOfView } from './view.js'
import { $, toast } from './kit.js'

/**
 * @import { Board, Card, Floor } from '../../src/bridge/board.ts'
 * @import { Viewer } from '../../src/shared/viewer.ts'
 * @import { StatsRange } from '../../src/shared/panels.ts'
 * @import { Executors, Handlers, Loop, StateEffect, TimerEffect } from '../../src/shared/loop.ts'
 * @import { MainView } from './view.js'
 * @import { ReadEffect, ReadEvent, Reads } from '../../src/shared/reads.ts'
 * @import { Stats } from '../../src/bridge/stats.ts'
 */

/**
 * The sidebar shows the floors or the stats, kept in `tower.store`. The stats open on the floor in view (the selected
 * worker's, the open shelf's, archive's or draft's, else the top floor), with every floor's beside it; read again
 * every minute while shown, over the viewer's range, held until the next read lands (`/reads.js`). A range changed
 * drops what was read over the one before, and any read of it in flight.
 * @typedef {'floors' | 'stats'} SideView
 * @typedef {{ stats: Stats, at: number }} StatsRead
 * @typedef {{ side: SideView, range: StatsRange, all: boolean, reads: Reads<StatsRead> }} SideState
 * @typedef {{ type: 'side', side: SideView } | { type: 'range', range: StatsRange } | { type: 'scope', all: boolean } | { type: 'retry' } | { type: 'poll' }
 *   | Extract<ReadEvent<StatsRead>, { type: 'got' | 'failed' }>} SideEvent
 * @typedef {StateEffect<SideState> | ReadEffect | TimerEffect<SideEvent> | { type: 'keep', side: SideView }} SideEffect
 */

/**
 * @typedef {{
 *   view: () => MainView,
 *   findCard: (id: string | undefined) => Card | undefined,
 *   floorsTopDown: () => Floor[],
 *   board: () => Board,
 *   viewer: () => Viewer,
 *   lostAt: () => number | undefined,
 * }} StatsDeps
 */

/**
 * The sidebar's floors or stats as a machine, the Stats panel (`/panels.js`) over the viewer's range on the floor in
 * view.
 * @param {StatsDeps} deps
 */
export async function stats(deps) {
  const { view, findCard, floorsTopDown, board, viewer, lostAt } = deps
  const SIDE_VIEW_KEY = 'side.view'
  const STATS_POLL_MS = 60_000
  const STATS_SLOT = 'stats'

  /** @type {TimerEffect<SideEvent>} */
  const STATS_POLL = { type: 'timer/start', id: 'poll', ms: STATS_POLL_MS, fire: { type: 'poll' } }

  /** @param {SideState} s @returns {(r: Reads<StatsRead>) => SideState} */
  const withReads = (s) => (reads) => ({ ...s, reads })

  /** The stats read now, over the side's range. @param {SideState} s @returns {SideEffect[]} */
  const readNow = (s) => stepped(refreshRead(s.reads, STATS_SLOT, s.range), withReads(s))

  /** @type {Handlers<SideState, SideEvent, SideEffect>} */
  const sideHandlers = {
    side: (s, { side }) => {
      const next = { ...s, side }
      return [{ type: 'state', state: next }, { type: 'keep', side }, { type: 'timer/cancel', id: 'poll' }, ...(side === 'stats' ? [...readNow(next), STATS_POLL] : []), { type: 'draw' }]
    },
    poll: (s) => [...readNow(s), STATS_POLL],
    range: (s, { range }) => {
      const next = { ...s, range, reads: { n: s.reads.n, held: {} } }
      return [{ type: 'state', state: next }, { type: 'draw' }, ...(next.side === 'stats' ? readNow(next) : [])]
    },
    scope: (s, { all }) => [{ type: 'state', state: { ...s, all } }, { type: 'draw' }],
    retry: (s) => [...readNow(s), { type: 'draw' }],
    got: (s, e) => stepped(landRead(s.reads, e.slot, e.n, e.value), withReads(s)),
    failed: (s, e) => stepped(failRead(s.reads, e.slot, e.n, e.message), withReads(s)),
  }

  const floorInView = () => floorOfView(view(), (id) => findCard(id)?.project) ?? floorsTopDown()[0]?.id

  function drawSideView() {
    const { side: on, all, reads } = sideView.state()
    const side = /** @type {HTMLElement} */ (document.querySelector('.side'))
    side.classList.toggle('on-stats', on === 'stats')
    for (const b of document.querySelectorAll('[data-side-view]')) (b.classList.toggle('on', b.dataset.sideView === on), b.setAttribute('aria-pressed', String(b.dataset.sideView === on)))
    if (on !== 'stats') return
    const floor = board().floors.find((f) => f.id === floorInView())
    const tabs = [...(floor ? [{ id: floor.id, label: floor.name }] : []), { id: STATS_ALL, label: 'All floors' }]
    const projects = board().floors.map((f) => ({ id: f.id, label: f.name, color: f.color }))
    const held = valueOf(reads.held[STATS_SLOT])
    drawPanel($('stats'), statsHtml({ stats: held?.stats, at: held?.at, failed: failureOf(reads.held[STATS_SLOT]), range: viewer().statsRange, projects, tabs, scope: all || !floor ? STATS_ALL : floor.id }), {})
  }

  /** @type {Loop<SideState, SideEvent>} */
  const sideView = loop({
    state: { side: /** @type {SideView} */ ((await tower.store.get(SIDE_VIEW_KEY)) ?? 'floors'), range: viewer().statsRange, all: false, reads: noReads() },
    handlers: sideHandlers,
    execute: {
      .../** @type {Executors<TimerEffect<SideEvent>, SideEvent>} */ (timers()),
      read: reading((_, range) => tower.stats(statsQuery(/** @type {StatsRange} */ (range), Date.now())).then((stats) => ({ stats, at: Date.now() }))),
      keep: ({ side }) => tower.store.set(SIDE_VIEW_KEY, side),
      draw: () => drawSideView(),
      toast: ({ message }) => void (lostAt() || toast(message)),
    },
  })

  return { floorInView, drawSideView, sideView }
}
