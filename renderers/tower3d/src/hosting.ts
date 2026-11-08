import { cardSubject, linesSubject, subjectAt, type Board, type Card, type Lines, type Renderer, type Subject } from '/lib/board.js'
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
  /** Where Tower 3D places a subject a view hands it (the kit's `display`). */
  display: (subject: Subject | string) => void
  /** Told when a view's module arrives or a mounted view's tally changes: the desk's tabs are drawn again. */
  redraw: () => void
}

/** The desk's Changes, `tower/changes`, its notes on picked lines in `lines.acts` beneath them. */
export const CHANGES = 'tower/changes'
/** The desk's Reviews, `reviews/thread`. */
export const THREAD = 'reviews/thread'
/** The reader's thread, `reviews/checkout-thread`, on a `reviews.thread` subject. */
export const CHECKOUT_THREAD = 'reviews/checkout-thread'

/**
 * The one view host behind every view Tower 3D mounts, made the first time one is: the desk's and the reader's views
 * load the same modules, so what a module keeps (a thread's note being written) is the same at both.
 */
export function viewHosting(deps: DeskViewsDeps) {
  const { board } = deps
  let host: ViewHost | undefined
  return () =>
    (host ??= (() => {
      const made = viewHost({
        tower: deps.tower,
        board,
        views: () => viewsOf(board()),
        layout: deps.layout,
        declared: () => deps.declared().regions ?? [],
        kit: deps.declared().kit ?? [],
        lent: { toast: deps.toast, display: deps.display },
        fills: {
          contributions: (_, id) => {
            throw new Error(`Tower 3D draws nothing extensions add inside a view, so it can't draw ${id}`)
          },
        },
      })
      made.onArrival(deps.redraw)
      return made
    })())
}

export function deskViews(deps: DeskViewsDeps, hosting: () => ViewHost) {
  const { board } = deps
  /** The views mounted at the desk, on the worker `id`, by view id: each kept, hidden, while another is seen. */
  let held: { id: string; views: Map<string, Hosted> } | undefined

  const viewOf = (id: string): View | undefined => viewsOf(board()).find((v) => v.id === id)

  /** Closes what the desk mounted, its elements removed. */
  function close() {
    for (const hosted of held?.views.values() ?? []) {
      hosted.close()
      hosted.el.remove()
    }
    held = undefined
  }

  /** Every view the desk holds hidden, its reads stopped until it is seen again. */
  function hide() {
    for (const hosted of held?.views.values() ?? []) {
      hosted.el.hidden = true
      hosted.visible(false)
    }
  }

  /** `c`'s view `id` in `into`, seen, the desk's others hidden: mounted afresh unless it is already. */
  function open(id: string, into: HTMLElement, c: Card) {
    if (held?.id !== c.id) close()
    hide()
    held ??= { id: c.id, views: new Map() }
    const kept = held.views.get(id)
    if (kept) return ((kept.el.hidden = false), kept.visible(true))
    const el = document.createElement('div')
    el.className = 'view-root'
    into.append(el)
    el.addEventListener('tab', deps.redraw)
    held.views.set(id, hosting().mountView(viewOf(id)!, el, cardSubject(c), { scale: 'pane', options: {} }))
  }

  /**
   * A view's tab words on `c`: the mounted view's own while it gives any, else its module's `tab` export, once the
   * module is here (it is fetched the first time it is asked for). None for a view not offered.
   */
  function tabOf(id: string, c: Card): TabWords | undefined {
    const view = viewOf(id)
    if (!view?.tab || view.off?.includes(c.project)) return undefined
    const mounted = held?.id === c.id ? held.views.get(id)?.tab() : undefined
    if (mounted) return mounted
    const module = hosting().loaded(view)
    if (!module) return void hosting().moduleOf(view)
    return (module[view.tab] as (board: Board, subject: ReturnType<typeof cardSubject>) => TabWords | undefined)(board(), cardSubject(c))
  }

  return {
    open,
    /** Lines of the mounted worker's Changes to scroll to, their file unfolded. */
    showLines: (lines: Lines) => held?.views.get(CHANGES)?.show(linesSubject(lines)),
    hide,
    /** The board as it stands, handed to the mounted views while their worker is on it; closed once it isn't. */
    update(b: Board) {
      if (!held) return
      const c = b.floors.flatMap((f) => f.cards).find((c) => c.id === held!.id)
      if (!c) return close()
      for (const hosted of held.views.values()) hosted.update(cardSubject(c))
    },
    close,
    tabOf,
  }
}

/** The reader's view: a checkout's review thread where no desk is, `reviews/checkout-thread` on its subject. */
export function readerView(deps: Pick<DeskViewsDeps, 'board'>, hosting: () => ViewHost) {
  let held: { key: string; hosted: Hosted } | undefined

  function close() {
    held?.hosted.close()
    held?.hosted.el.remove()
    held = undefined
  }

  return {
    /** The thread `key` names in `into`, mounted afresh. */
    open(into: HTMLElement, key: string) {
      close()
      const view = viewsOf(deps.board()).find((v) => v.id === CHECKOUT_THREAD)!
      const el = document.createElement('div')
      el.className = 'view-root'
      into.append(el)
      held = { key, hosted: hosting().mountView(view, el, subjectAt(deps.board(), key)!, { scale: 'pane', options: {} }) }
    },
    /** The board as it stands, handed to the view while its thread is on it: false once it isn't. */
    update(b: Board) {
      if (!held) return true
      const subject = subjectAt(b, held.key)
      if (!subject) return false
      held.hosted.update(subject)
      return true
    },
    close,
  }
}
