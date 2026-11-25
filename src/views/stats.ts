import { type Board, type Floor } from '/lib/board.js'
import { failRead, failureOf, type Handlers, landRead, loop, noReads, reading, type ReadEffect, type ReadEvent, type Reads, refreshRead, type StateEffect, stepped, timers, type TimerEffect, valueOf } from '/lib/machine.js'
import { STATS_ALL, statsHtml, statsQuery, type Stats, type StatsRange } from '/lib/stats.js'
import { closeHtml, componentsLayer, morphPanel, type Mount, paintOnce, panelsCss, viewCss } from '/lib/view.js'
import { esc } from '/lib/words.js'
import { readViewer, VIEWER_KEYS } from '/lib/viewer.js'

/**
 * `tower/stats`, spend, work and waits from the logs (`/lib/stats.js`): on the board every floor's, on a floor that
 * floor's. Its scope tabs display the view on another subject, so the location names the scope. It reads over the
 * viewer's range (`VIEWER_KEYS.statsRange`, every renderer's alike) every minute while mounted, holding what it read
 * until the next read lands; a range changed drops what was read over the one before.
 */

const ID = 'tower/stats'
const POLL_MS = 60_000
const SLOT = 'stats'

type StatsRead = { stats: Stats; at: number }
type State = { range: StatsRange; reads: Reads<StatsRead> }
type Event = { type: 'range'; range: StatsRange } | { type: 'retry' } | { type: 'poll' } | { type: 'stop' } | Extract<ReadEvent<StatsRead>, { type: 'got' | 'failed' }>
type Effect = StateEffect<State> | ReadEffect | TimerEffect<Event>

const POLL: TimerEffect<Event> = { type: 'timer/start', id: 'poll', ms: POLL_MS, fire: { type: 'poll' } }

const withReads = (s: State) => (reads: Reads<StatsRead>): State => ({ ...s, reads })

/** The stats read now, over the state's range. */
const readNow = (s: State): Effect[] => stepped(refreshRead(s.reads, SLOT, s.range), withReads(s))

const handlers: Handlers<State, Event, Effect> = {
  range: (s, { range }) => {
    const next = { range, reads: { n: s.reads.n, held: {} } }
    return [{ type: 'state', state: next }, { type: 'draw' }, ...readNow(next), POLL]
  },
  poll: (s) => [...readNow(s), POLL],
  retry: (s) => [...readNow(s), { type: 'draw' }, POLL],
  stop: () => [{ type: 'timer/cancel', id: 'poll' }],
  got: (s, e) => stepped(landRead(s.reads, e.slot, e.n, e.value), withReads(s)),
  failed: (s, e) => stepped(failRead(s.reads, e.slot, e.n, e.message), withReads(s)),
}

const STYLE = viewCss(
  ID,
  `& .stats { flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--sp-xl) var(--sp-xl); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-card);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable; }`,
)

/** The floors, top down as the skyline stands them. */
const floorsTopDown = (board: Board) => [...board.floors].reverse()

export const mount: Mount = async (host, { tower, board: first, subject, kit }) => {
  let board = first
  const project = subject.kind === 'floor' ? (subject.value as Floor).id : undefined

  host.innerHTML = `<style>${STYLE}${componentsLayer(panelsCss)}</style><div class="shelf-head"></div><div class="stats"></div>`
  const [head, panel] = [host.querySelector<HTMLElement>('.shelf-head')!, host.querySelector<HTMLElement>('.stats')!]

  const now = kit.now ?? Date.now
  const reads = loop<State, Event, Effect>({
    state: { range: (await readViewer(tower.store.get)).statsRange, reads: noReads() },
    handlers,
    execute: {
      ...timers<Event>(),
      read: reading((_, range) => tower.stats(statsQuery(range as StatsRange, now())).then((stats) => ({ stats, at: now() }))),
      draw: () => draw(),
      toast: ({ message }) => kit.toast(message),
    },
  })

  function draw() {
    const { range, reads: r } = reads.state()
    const floor = board.floors.find((f) => f.id === project)
    paintOnce(head, `<span class="label">Stats</span><span class="dim">${floor ? esc(floor.name) : 'All floors'}</span><span class="actions">${closeHtml(board.keys)}</span>`)
    const floors = floorsTopDown(board)
    const held = valueOf(r.held[SLOT])
    morphPanel(
      panel,
      statsHtml({
        stats: held?.stats,
        at: held?.at,
        failed: failureOf(r.held[SLOT]),
        range,
        projects: floors.map((f) => ({ id: f.id, label: f.name, color: f.color })),
        tabs: [...floors.map((f) => ({ id: f.id, label: f.name })), { id: STATS_ALL, label: 'All floors' }],
        scope: floor?.id ?? STATS_ALL,
      }),
    )
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-home]')) return kit.display('board')
    const scope = target.closest<HTMLElement>('[data-stats-scope]')?.dataset.statsScope
    if (scope) return scope === (project ?? STATS_ALL) ? undefined : kit.display(scope === STATS_ALL ? 'board' : `floor:${scope}`, { view: ID })
    const range = target.closest<HTMLElement>('[data-stats-range]')?.dataset.statsRange as StatsRange | undefined
    if (range) return (tower.store.set(VIEWER_KEYS.statsRange, range), reads.dispatch({ type: 'range', range }))
    if (target.closest('[data-stats-read]')) reads.dispatch({ type: 'retry' })
  })

  /** The range another renderer of the viewer's chose. */
  const offStore = tower.store.on(async () => {
    const { statsRange } = await readViewer(tower.store.get)
    if (statsRange !== reads.state().range) reads.dispatch({ type: 'range', range: statsRange })
  })

  reads.dispatch({ type: 'retry' })

  return {
    update(next: Board) {
      board = next
      draw()
    },
    close() {
      offStore()
      reads.dispatch({ type: 'stop' })
    },
  }
}
