import type { Board } from '/lib/board.js'
import type { TermViewHandle } from '/lib/terminal.js'
import { closeHtml, type Mount, paintOnce, viewCss } from '/lib/view.js'
import { esc } from '/lib/words.js'
import type { Clone } from '../clones.ts'

/**
 * `floors/clones`, floors' clones in the main pane: each one's URL, folder and what it came to, and the screen of each
 * running, or failed in the last minutes, read only through the kit's terminal.
 */

const ID = 'floors/clones'

/** How long after a job ends the jobs daemon keeps its screen. */
const SCREEN_KEPT_MS = 10 * 60_000

const STYLE = viewCss(
  ID,
  `& .clones { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-xl); padding: var(--sp-xl) var(--sp-2xl);
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); }
  & .clone { display: flex; flex-direction: column; gap: var(--sp-s); }
  & .clone header { display: flex; align-items: baseline; gap: var(--sp-m); font: var(--fs-m)/1.3 var(--mono); }
  & .clone header code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & .clone .state { font: var(--fs-s)/1 var(--ui); color: var(--muted); }
  & .clone .into { color: var(--muted); font: var(--fs-s)/1.3 var(--mono); }
  & .clone .screen { height: min(62vh, 560px); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  & .none { color: var(--faint); }`,
)

const stateWords = (c: Clone) =>
  c.outcome === 'running'
    ? 'cloning'
    : c.outcome === 'cloned'
      ? c.added
        ? `cloned, floor ${c.added} added`
        : c.refused
          ? "cloned, floor not added"
          : 'cloned, adding the floor'
      : c.outcome === 'failed'
        ? c.signal
          ? `ended by ${c.signal}`
          : `failed (exit ${c.exit})`
        : c.outcome === 'cancelled'
          ? 'stopped'
          : 'lost: the jobs daemon stopped before it ended'

/**
 * Whether to show its screen: running, or failed by its exit in the last minutes, when it says what git said and the
 * jobs daemon may still keep it. One ended by a signal was cancelled or stopped with the daemon, whose screens go with it.
 */
const screened = (c: Clone, now: number) => c.outcome === 'running' || (c.outcome === 'failed' && !c.signal && c.endedAt !== undefined && now - c.endedAt < SCREEN_KEPT_MS)

const clonesIn = (board: Board): Clone[] => ((board.x?.floors as { clones?: Clone[] } | undefined)?.clones ?? []).filter((c) => !c.dismissed)

export const mount: Mount = (host, { board: first, kit }) => {
  let board: Board = first
  const screens = new Map<string, TermViewHandle>()

  host.innerHTML = `<style>${STYLE}</style>
  <div class="shelf-head"><span class="label">Clones</span><span class="dim">floors' clones, as jobs</span><span class="actions"></span></div>
  <div class="clones"></div>`
  const list = host.querySelector<HTMLElement>('.clones')!

  const draw = () => {
    paintOnce(host.querySelector('.shelf-head .actions')!, closeHtml(board.keys))
    const now = Date.now()
    const clones = clonesIn(board)
    const shown = new Set(clones.filter((c) => screened(c, now)).map((c) => c.job))
    for (const [job, screen] of screens) if (!shown.has(job)) (screen.close(), screens.delete(job))
    paintOnce(
      list,
      clones.length
        ? clones
            .map(
              (c) =>
                `<section class="clone" data-job="${esc(c.job)}"><header><code title="${esc(c.url)}">${esc(c.url)}</code><span class="state">${esc(stateWords(c))}</span></header>
                <span class="into">into ${esc(c.into)}, the floor ${esc(c.name)}</span>${shown.has(c.job) ? '<div class="screen"></div>' : ''}</section>`,
            )
            .join('')
        : '<p class="none">No clones running or ended in the last day.</p>',
    )
    for (const job of shown) {
      const el = list.querySelector<HTMLElement>(`[data-job="${CSS.escape(job)}"] .screen`)
      if (!el) continue
      const held = screens.get(job)
      if (held && el.contains(held.term()?.element ?? null)) continue
      held?.close()
      screens.set(job, kit.terminal(el, `job/${job}`))
    }
  }

  host.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-home]')) kit.display('board')
  })

  draw()

  return {
    update(next: Board) {
      board = next
      draw()
    },
    close() {
      for (const screen of screens.values()) screen.close()
    },
  }
}
