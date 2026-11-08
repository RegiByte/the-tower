import { cardSubject, linesSubject, type Board, type Card, type Lines, type Renderer } from '/lib/board.js'
import { viewsOf, type Layout } from '/lib/layout.js'
import { viewHost, type Hosted, type TabWords, type View, type ViewHost } from '/lib/view.js'
import type { tower } from './api.ts'

/**
 * The page's views a desk mounts (decision `ui-model`): Tower 3D decides where a view appears, the view what it shows
 * and does. One view host lends them the kit Tower 3D's `renderer.json` names and the regions it declares; a region
 * holding no views is drawn by no one here, so a view asking for one fails saying so.
 */

export type DeskViewsDeps = {
  tower: typeof tower
  board: () => Board
  layout: () => Layout
  declared: () => Renderer
  toast: (message: string) => void
  /** Told when a view's module arrives or a mounted view's tally changes: the desk's tabs are drawn again. */
  redraw: () => void
}

/** The desk's Changes, `tower/changes`, its notes on picked lines in `lines.acts` beneath them. */
export const CHANGES = 'tower/changes'
/** The desk's Reviews, `reviews/thread`: only its tab's tally is read here. */
export const THREAD = 'reviews/thread'

export function deskViews(deps: DeskViewsDeps) {
  const { board } = deps
  let host: ViewHost | undefined
  /** The view mounted at the desk, on the worker `id`. */
  let held: { id: string; hosted: Hosted } | undefined

  const hosting = () =>
    (host ??= (() => {
      const made = viewHost({
        tower: deps.tower,
        board,
        views: () => viewsOf(board()),
        layout: deps.layout,
        declared: () => deps.declared().regions ?? [],
        kit: deps.declared().kit ?? [],
        lent: { toast: deps.toast },
        fills: {
          contributions: (_, id) => {
            throw new Error(`Tower 3D draws nothing extensions add inside a view, so it can't draw ${id}`)
          },
        },
      })
      made.onArrival(deps.redraw)
      return made
    })())

  const viewOf = (id: string): View | undefined => viewsOf(board()).find((v) => v.id === id)

  /** Closes what the desk mounted, its element emptied. */
  function close() {
    if (!held) return
    held.hosted.close()
    held.hosted.el.remove()
    held = undefined
  }

  /** `c`'s Changes in `into`, seen: mounted afresh unless they are already. */
  function openChanges(into: HTMLElement, c: Card) {
    if (held?.id !== c.id) close()
    if (held) return held.hosted.visible(true)
    const view = viewOf(CHANGES)!
    const el = document.createElement('div')
    el.className = 'view-root'
    into.replaceChildren(el)
    el.addEventListener('tab', deps.redraw)
    held = { id: c.id, hosted: hosting().mountView(view, el, cardSubject(c), { scale: 'pane', options: {} }) }
  }

  /**
   * A view's tab words on `c`: the mounted view's own while it gives any, else its module's `tab` export, once the
   * module is here (it is fetched the first time it is asked for). None for a view not offered.
   */
  function tabOf(id: string, c: Card): TabWords | undefined {
    const view = viewOf(id)
    if (!view?.tab || view.off?.includes(c.project)) return undefined
    const mounted = held?.id === c.id && held.hosted.view.id === id ? held.hosted.tab() : undefined
    if (mounted) return mounted
    const module = hosting().loaded(view)
    if (!module) return void hosting().moduleOf(view)
    return (module[view.tab] as (board: Board, subject: ReturnType<typeof cardSubject>) => TabWords | undefined)(board(), cardSubject(c))
  }

  return {
    openChanges,
    /** Lines of the mounted worker's Changes to scroll to, their file unfolded. */
    showLines: (lines: Lines) => held?.hosted.show(linesSubject(lines)),
    /** The mounted view hidden and kept, its reads stopped until it is seen again. */
    hide: () => held?.hosted.visible(false),
    /** The board as it stands, handed to the mounted view while its worker is on it; closed once it isn't. */
    update(b: Board) {
      if (!held) return
      const c = b.floors.flatMap((f) => f.cards).find((c) => c.id === held!.id)
      if (c) held.hosted.update(cardSubject(c))
      else close()
    },
    close,
    tabOf,
  }
}
