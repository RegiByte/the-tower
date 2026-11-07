import { can, findCard, parentOf, shownSubject } from '/lib/board.js'
import { shownFrom } from '/lib/brief.js'
import { heldActions, shownHref, shownKey, shownTitle } from '/lib/cards.js'
import { addedActions, offeredIn, ordered, overflowOf, paneShows, pickView, shownOf } from '/lib/layout.js'
import { panesOf } from '/lib/keys.js'
import { mountTermView } from '/lib/terminal.js'
import { fileSpansHtml, ICON, keyedTip, viewHost } from '/lib/view.js'
import { ago, esc } from '/lib/words.js'
import { repaint } from './kit.js'
import { actionsHtml, badgesHtml, iconActionsHtml } from './added.js'
import { menu } from './menu.js'

/**
 * @import { Board, Card, CardShown, Subject } from '/lib/board.js'
 * @import { TerminalMsg, Tower } from '/lib/client.js'
 * @import { Scheme } from '/lib/design.js'
 * @import { Action, Added } from '/lib/extension.js'
 * @import { KitMember, Layout, Overflow, Region } from '/lib/layout.js'
 * @import { JobStream, ShellStream, TermFont, TermViewHandle } from '/lib/terminal.js'
 * @import { Bus, CommandKit, Hosted, Location, Pane, RegionHandle, Tab, TabWords, View } from '/lib/view.js'
 * @import { MenuItem } from './menu.js'
 */

/**
 * What a tabs region of the main pane's worker reads from the page's location and tells it: the tab the location names
 * while the worker is the one on screen, and a tab picked.
 * @typedef {{ pane: () => { on: boolean, pane: Pane | undefined }, pick: (pane: Pane) => void }} PaneScope
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   views: () => View[],
 *   layout: () => Layout,
 *   declared: () => Region[],
 *   kit: readonly KitMember[],
 *   termFont: () => TermFont,
 *   scheme: () => Scheme,
 *   run: (id: string, e: KeyboardEvent) => boolean,
 *   commandKit: CommandKit & { go: (location: Location) => void, href: (to: Subject | Location) => string, location: () => Location | undefined, spawn: (on: Subject, open: () => boolean) => Promise<string | undefined> },
 *   tower: Tower,
 *   contributions: (el: HTMLElement, id: string, subject: Subject, options: { omit?: string[] }) => RegionHandle,
 *   subjectOf: (key: string) => Subject | undefined,
 *   unshown: () => ReadonlySet<string>,
 *   mainPane: () => Pane | undefined,
 *   gone: () => void,
 *   left: () => void,
 *   bus: Bus,
 * }} RegionsDeps
 */

/** The lines a shell's terminal keeps, as the dock's does. */
const SHELL_SCROLLBACK = 2000

/** How many workers the main pane keeps drawn once left, the least recently left closed first. */
const CARDS_KEPT = 4

/** How many showings stay drawn at once across every worker, the least recently shown closed first. */
const SHOWN_KEPT = 8

const WORKER = 'tower/card'

/** A tab's key: its view and its subject. @param {string} view @param {string} subject */
const tabKey = (view, subject) => `${view}|${subject}`

/**
 * Where the tower page mounts views (decision `ui-model`): the main pane, one view at a location; a region a view asks
 * the kit for inside it, filled by the page: contributions drawn the page's way, a tabs region's tabs as (view,
 * subject) pairs, each mounted the first time it shows and kept under the one shown, a worker's showings among them.
 * A view's module is imported from `/x/<cap>/`, mounted with the page's kit, updated on each board, told whether it is
 * seen, and closed as its subject leaves; one that fails says so in one line where it would draw.
 * @param {RegionsDeps} deps
 */
export function regions(deps) {
  const { board, views, layout, declared, termFont, scheme, run, commandKit, tower, contributions, subjectOf, unshown, mainPane, gone, left } = deps

  /** The command that opens the view `id` where it is a pane. @param {string} id */
  const paneCommand = (id) => panesOf(board()).find((p) => p.view === id)?.command

  /** Each tabs region, by the element of the view it is in: where a tab's chord finds it. @type {WeakMap<HTMLElement, ReturnType<typeof tabs>>} */
  const regionsByHost = new WeakMap()

  /** Every terminal a view's kit opened, which the viewer's face and scheme reach. @type {Set<TermViewHandle>} */
  const terminals = new Set()

  /** Every tabs region drawn, to draw again when a module it waits for arrives. @type {Set<{ draw: () => void }>} */
  const tabbed = new Set()

  /** What a mounted tabs region reads from the page, by the element of the view it is in. @type {WeakMap<HTMLElement, PaneScope>} */
  const scopes = new WeakMap()

  /**
   * A job's screen, read only: its snapshot marked as viewed elsewhere, so the view follows the job's size and never
   * resizes it, and keys go nowhere, since nothing types into a job.
   * @param {HTMLElement} host @param {string} id @returns {TermViewHandle}
   */
  const jobTerminal = (host, id) => {
    const handle = mountTermView(host, { Terminal, FitAddon: FitAddon.FitAddon, WebLinksAddon: WebLinksAddon.WebLinksAddon, UnicodeGraphemesAddon: UnicodeGraphemesAddon.UnicodeGraphemesAddon }, {
      watch: (on) =>
        tower.watch(`job/${id}/screen`, (msg) => {
          const job = /** @type {JobStream} */ (msg)
          if (job.t === 'snapshot') return on({ ...job, terminals: 1 })
          if (job.t === 'x') return on({ t: 'x', exitCode: job.exit ?? 1 })
          on(job)
        }),
      resize: () => Promise.resolve(),
      send: () => {},
      claude: false,
      scrollback: SHELL_SCROLLBACK,
      font: termFont,
      scheme,
      keymap: () => board().keys,
      run,
      mode: () => {},
      end: () => {},
      error: (err) => commandKit.toast(err.message),
    })
    terminals.add(handle)
    return { ...handle, close: () => (terminals.delete(handle), handle.close()) }
  }

  /** @param {HTMLElement} host @param {`terminal/${string}` | `shell/${string}` | `job/${string}`} path @returns {TermViewHandle} */
  const terminal = (host, path) => {
    if (path.startsWith('job/')) return jobTerminal(host, path.slice('job/'.length))
    const [stream, id] = /** @type {['terminal' | 'shell', string]} */ (path.split('/'))
    const shell = stream === 'shell'
    host.classList.toggle('claude-term', !shell)
    const handle = mountTermView(host, { Terminal, FitAddon: FitAddon.FitAddon, WebLinksAddon: WebLinksAddon.WebLinksAddon, UnicodeGraphemesAddon: UnicodeGraphemesAddon.UnicodeGraphemesAddon }, {
      watch: (on) => tower.watch(path, (msg) => on(/** @type {TerminalMsg | ShellStream} */ (msg))),
      resize: (size) => (shell ? tower.call('shell/resize', { id, ...size }) : tower.call('resize', { id, ...size })),
      send: (data) => (shell ? tower.shellKeys(id, data) : tower.keys(id, data)),
      claude: !shell,
      scrollback: shell ? SHELL_SCROLLBACK : 0,
      font: termFont,
      scheme,
      keymap: () => board().keys,
      run,
      mode: () => {},
      end: () => {},
      error: (err) => commandKit.toast(err.message),
      upload: (name, data) => tower.call('upload', { name, data }).then((r) => r.path),
      files: {
        cwd: () => /** @type {string} */ (shell ? board().shells.find((sh) => sh.id === id)?.cwd : findCard(board(), id)?.cwd),
        edit: (path, line) => tower.call('edit', { path, line }),
      },
    })
    terminals.add(handle)
    return { ...handle, close: () => (terminals.delete(handle), host.classList.remove('claude-term'), handle.close()) }
  }

  const hosting = viewHost({
    tower,
    board,
    views,
    layout,
    declared,
    kit: deps.kit,
    lent: { ...commandKit, terminal, bus: deps.bus },
    fills: {
      contributions: (el, id, subject, options) => contributions(el, id, subject, /** @type {{ omit?: string[] }} */ (options)),
      // A tabs region takes the pane scope of the view it is drawn in, found by DOM ancestry: the nearest [data-view].
      tabs: (el, id, subject, options) => {
        const view = /** @type {HTMLElement | null} */ (el.closest('[data-view]'))
        const made = tabs(el, /** @type {Region} */ (declared().find((r) => r.id === id)), subject, /** @type {Record<string, Record<string, unknown>>} */ (options), view ? scopes.get(view) : undefined)
        if (view) regionsByHost.set(view, made)
        return made
      },
    },
  })
  hosting.onArrival(() => tabbed.forEach((r) => r.draw()))

  /** The showings mounted in every tabs region, the least recently shown first. @type {{ key: string, drop: () => void }[]} */
  const shownKept = []

  /**
   * A tabs region on a worker: a tab for each view the region offers on its card (in the layout's order, where its
   * `tab` says it has one), then one for each thing it showed and the viewer hasn't closed, by the view its type picks,
   * or another view the tab open names for it that takes its type (Open Text on a markdown file).
   * The tab strip is drawn in the element marked `data-holds="tabs"`, the views in `data-holds="views"`. A tab is
   * mounted the first time it shows, then stays under the one shown, hidden by visibility (a hidden terminal would refit
   * the PTY to nothing). The tab open is the location's for the main pane's worker (`scope`), else the region's own;
   * none named, the terminal while the worker drives, else its brief.
   * @param {HTMLElement} host @param {Region} region @param {Subject} subject @param {Record<string, Record<string, unknown>>} options @param {PaneScope | undefined} scope
   * @returns {RegionHandle & { tabs: () => { views: string[], open: string | undefined }, toPane: (id: string) => boolean }}
   */
  function tabs(host, region, subject, options, scope) {
    const hostView = /** @type {HTMLElement | null} */ (host.closest('[data-view]'))?.dataset.view
    const slot = (/** @type {string} */ name) => /** @type {HTMLElement} */ ([...host.querySelectorAll(`[data-holds~="${name}"]`)].find((el) => el.closest('[data-view]') === host.closest('[data-view]')) ?? host)
    const strip = slot('tabs')
    const panels = slot('views')
    for (const el of new Set([strip, panels])) (el.dataset.region = region.id), (el.dataset.subject = subject.key)
    let card = /** @type {Card} */ (subject.value)
    /** The tab picked here, where no location names one. @type {Pane | undefined} */
    let picked
    /** The tab the location named while this worker was last on screen. @type {Pane | undefined} */
    let seenPane
    /** The tab open, by key. @type {string | undefined} */
    let open
    let seen = true
    /** @type {Map<string, { hosted: Hosted, panel: HTMLElement }>} */
    const mounted = new Map()
    /** What each tab shows below its subject, by key, as last handed to it or told by it. @type {Map<string, Pick<Pane, 'shows' | 'args'>>} */
    const below = new Map()

    /** @typedef {{ key: string, view: View, subject: Subject, showing?: CardShown, words?: TabWords }} TabOf */

    /** A tab's view's options: the layout's, under those the region was asked with. @param {View} v */
    const optionsOf = (v) => ({ ...layout()[region.id]?.options?.[v.id], ...options[v.id] })

    /** The tab a view's `tab` export gives on `at`, once its module is here; `undefined` for none. @param {View} v @param {Subject} at @returns {TabWords | undefined | 'waiting'} */
    const exported = (v, at) => {
      if (!v.tab) return {}
      const module = hosting.loaded(v)
      if (!module) return (void hosting.moduleOf(v), 'waiting')
      return /** @type {Tab} */ (module[v.tab])(board(), at)
    }

    /** Whether a view offered here still waits for its module to say whether it has a tab: no tab opens before, so the default can't pick one it would pass over. */
    const waiting = () => offeredIn(views(), region, layout(), deps.kit, subject).some((v) => v.id !== hostView && v.module && v.tab && !hosting.loaded(v))

    /** @returns {TabOf[]} */
    function tabsOf() {
      const offered = offeredIn(views(), region, layout(), deps.kit, subject).filter((v) => v.id !== hostView && v.module)
      const own = ordered(offered, layout()[region.id]?.order).flatMap((v) => {
        const words = exported(v, subject)
        return words === undefined || words === 'waiting' ? [] : [{ key: tabKey(v.id, subject.key), view: v, subject, words }]
      })
      const closedHere = unshown()
      const at = scope?.pane()
      if (at?.on) seenPane = at.pane
      const pane = scope ? seenPane : picked
      const showings = card.shown.filter((s) => !closedHere.has(shownKey(s))).flatMap((s) => {
        const shown = shownSubject(card, s)
        const offeredOn = offeredIn(views(), region, layout(), deps.kit, shown)
        const v = (pane?.subject === shown.key ? openedAs(offeredOn, pane.view, shown) : undefined) ?? pickView(board(), offeredOn, layout()[region.id]?.order, shown)
        return v ? [{ key: tabKey(v.id, shown.key), view: v, subject: shown, showing: s }] : []
      })
      return [...own, ...showings]
    }

    /**
     * The view a pane names for a showing, among those offered on it, where that view takes its type and is not the
     * core's own pick for it, which is all the page's short form names: Open Text on a markdown file.
     * @param {View[]} offered @param {string} view @param {Subject} shown
     */
    const openedAs = (offered, view, shown) =>
      view === pickView(board(), offered.filter((v) => v.cap === 'tower'), undefined, shown)?.id ? undefined : offered.find((v) => v.id === view && pickView(board(), [v], undefined, shown) === v)

    /** The tab a pane names among `all`: a showing's by its subject alone, whatever view the pane names. @param {TabOf[]} all @param {Pane | undefined} pane */
    const named = (all, pane) => pane && all.find((t) => (t.showing ? t.subject.key === pane.subject : t.view.id === pane.view && (pane.subject === undefined || t.subject.key === pane.subject)))

    /** The terminal while the worker drives (or has no brief), else its brief. @param {TabOf[]} all */
    const byDefault = (all) => all.find((t) => t.view.id === (can(card, 'drive') || !can(card, 'brief') ? 'tower/terminal' : 'tower/brief')) ?? all[0]

    /** A tab's words: the view's own `tab` export's while mounted, else what it gave when listed. @param {TabOf} t @returns {TabWords} */
    const wordsOf = (t) => mounted.get(t.key)?.hosted.tab() ?? t.words ?? {}

    /** What a view's tab says it opens. @param {TabOf} t */
    const hintOf = (t) => wordsOf(t).hint ?? t.view.words.hint ?? t.view.words.label

    /** @param {TabOf} t @param {boolean} on */
    const tabHtml = (t, on) => (t.showing ? shownTabHtml(t.showing, on, t.key, `panel-${esc(t.key)}`) : viewTabHtml(t, on, hintOf(t)))

    /** A tab whose label may be cut short: its tip says its name first. @param {TabOf} t @param {boolean} on */
    const namedTabHtml = (t, on) => (t.showing ? tabHtml(t, on) : viewTabHtml(t, on, `${t.view.words.label} · ${hintOf(t)}`))

    /** A view's tab, `hint` its tip. @param {TabOf} t @param {boolean} on @param {string} hint */
    function viewTabHtml(t, on, hint) {
      const command = paneCommand(t.view.id)
      const words = wordsOf(t)
      const tip = command ? keyedTip(board().keys, hint, command) : `data-tip="${esc(hint)}"`
      const tally = words.text ? `<small${words.tone ? ` class="${words.tone}"` : ''}${words.tip ? ` data-tip="${esc(words.tip)}"` : ''}>${esc(words.text)}</small>` : ''
      return `<button class="pane-tab ${on ? 'on' : ''}" role="tab" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-controls="panel-${esc(t.key)}" ${tip} data-tab="${esc(t.key)}"><span class="tab-word">${esc(t.view.words.label)}</span>${tally}</button>`
    }

    /** What a worker showed, as a tab: a link opens in a browser tab, anything else also opens out of the tower. @param {CardShown} s @param {boolean} on @param {string} key @param {string} panel */
    function shownTabHtml(s, on, key, panel) {
      const from = shownFrom(card.lineage, s)
      const what = `${card.callsign} showed ${s.target} · ${ago(Date.now() - s.at)} ago${from ? ` · in ${from.label}` : ''}`
      return `<button class="pane-tab shown-tab ${on ? 'on' : ''}" role="tab" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-controls="${panel}" data-tip="${esc(what)}" data-tab="${esc(key)}">` +
        `<span class="shown-name">${s.kind === 'link' ? `${ICON.remote} ` : ''}${esc(shownTitle(s))}</span>${from ? `<small>${from.mark}</small>` : ''}` +
        (on ? heldHtml('shown.tab', shownSubject(card, s), iconActionsHtml) : '') +
        (on && s.kind !== 'link' ? `<span class="icon-btn" data-out="${esc(shownHref(s))}" aria-hidden="true" data-tip="open in a browser tab">${ICON.remote}</span>` : '') +
        (on && s.kind === 'file' ? fileSpansHtml(s.target) : '') +
        `<span class="icon-btn" data-unshow="${esc(shownKey(s))}" aria-hidden="true" data-tip="close: it comes back if shown again">${ICON.close}</span></button>`
    }

    /**
     * What extensions add to a showing that the page's region `id` holds: its badges, and its actions drawn by `drawn`.
     * @param {string} id @param {Subject} on @param {(board: Board, subject: Subject, actions: Added<Action>[]) => string} drawn
     */
    function heldHtml(id, on, drawn) {
      const holds = declared().find((r) => r.id === id)?.holds ?? []
      return `${holds.includes('badges') ? badgesHtml(board(), on) : ''}${drawn(board(), on, heldActions(holds, addedActions(board(), on)))}`
    }

    /** The tab to open: the location's while its worker is on screen, else the one picked here, else the default; none newly opened while its worker is hidden. @param {TabOf[]} all */
    function wanted(all) {
      const at = scope?.pane()
      if (at && !at.on) return all.find((t) => t.key === open)
      return named(all, at ? at.pane : picked) ?? byDefault(all)
    }

    /** A showing shown is the most recently shown; past `SHOWN_KEPT`, the least recently shown is closed. @param {string} key */
    function keptShown(key) {
      const at = shownKept.findIndex((k) => k.key === key)
      if (at >= 0) shownKept.splice(at, 1)
      shownKept.push({ key, drop: () => closeTab(key) })
      const extra = shownKept.length - SHOWN_KEPT
      if (extra > 0) for (const k of shownKept.splice(0, extra)) k.drop()
    }

    /** @param {string} key */
    function closeTab(key) {
      const m = mounted.get(key)
      if (!m) return
      mounted.delete(key)
      below.delete(key)
      if (key === open) open = undefined
      m.hosted.close()
      m.panel.remove()
      const at = shownKept.findIndex((k) => k.key === key)
      if (at >= 0) shownKept.splice(at, 1)
    }

    /** @param {TabOf} t */
    function mountTab(t) {
      const panel = document.createElement('div')
      panel.className = 'pane-panel'
      panel.id = `panel-${t.key}`
      panel.role = 'tabpanel'
      panel.ariaLabel = t.showing ? shownTitle(t.showing) : t.view.words.label
      panel.dataset.region = region.id
      panel.dataset.subject = t.subject.key
      const root = document.createElement('div')
      root.className = 'view-root'
      panel.append(root)
      panels.append(panel)
      if (scope) scopes.set(root, scope)
      const hosted = hosting.mountView(t.view, root, t.subject, { scale: region.scale, options: optionsOf(t.view), showing: (s) => told(t.key, s) })
      mounted.set(t.key, { hosted, panel })
      return mounted.get(t.key)
    }

    /** Opens the tab `wanted` names, mounting it the first time; the tab left told it is no longer seen. */
    function draw() {
      const all = tabsOf()
      for (const key of [...mounted.keys()]) if (!all.some((t) => t.key === key)) closeTab(key)
      const to = waiting() ? undefined : wanted(all)
      if (to && to.key !== open) {
        mounted.get(open ?? '')?.hosted.visible(false)
        open = to.key
        const m = mounted.get(to.key) ?? mountTab(to)
        m?.hosted.visible(seen)
        if (to.showing) keptShown(to.key)
      }
      for (const [key, m] of mounted) {
        m.panel.classList.toggle('on', key === open)
        m.panel.inert = key !== open
      }
      handOpen(all)
      const name = formOf()
      if (name !== formNow.name) formNow.close(), (formNow = { name, ...forms[name]() })
      formNow.draw(all, shownAddsHtml(all))
    }

    /**
     * A form the tab row is drawn in: made as the row takes it, then drawn on every draw, told when the row resizes and
     * when the type changes (the viewer's scale or face, a web font loaded), and closed as the row leaves it.
     * @typedef {{ draw: (all: TabOf[], adds: string) => void, resized: () => void, remeasure: () => void, close: () => void }} TabsForm
     */

    /** The forms the tab row is drawn in, by the overflow each draws. @type {Record<'scroll' | 'menu' | 'wrap', () => TabsForm>} */
    const forms = {
      scroll: () => ({ draw: tabsScroll, resized: () => (bringOpen(/** @type {HTMLElement} */ (scrollerOf())), markEdges(/** @type {HTMLElement} */ (scrollerOf()))), remeasure: () => {}, close: () => {} }),
      menu: tabsMenu,
      wrap: () => ({ draw: tabsWrap, resized: () => {}, remeasure: () => {}, close: () => {} }),
    }

    /** The form the row is drawn in now: none before the first draw. @type {TabsForm & { name?: keyof typeof forms }} */
    let formNow = { draw: () => {}, resized: () => {}, remeasure: () => {}, close: () => {} }

    /** The form the layout picks among those the region offers; a region offering none is drawn scrolling. @returns {keyof typeof forms} */
    function formOf() {
      if (!region.overflows) return 'scroll'
      return /** @type {keyof typeof forms} */ (overflowOf(/** @type {Region & { overflows: Overflow[] }} */ (region), layout()[region.id]))
    }

    /** What extensions add to the open showing (`shown.head`), after the tablist. @param {TabOf[]} all */
    function shownAddsHtml(all) {
      const showing = all.find((t) => t.key === open)?.showing
      const adds = showing ? heldHtml('shown.head', shownSubject(card, showing), actionsHtml) : ''
      return adds && `<span class="shown-adds" role="group" aria-label="on ${esc(shownTitle(/** @type {CardShown} */ (showing)))}">${adds}</span>`
    }

    /** The worker's tablist around `inner`, the tabs as form `form` lays them out. @param {keyof typeof forms} form @param {string} inner */
    const tablistHtml = (form, inner) => `<span class="tab-set tabs-${form}" role="tablist" aria-label="views of ${esc(card.callsign)}">${inner}</span>`

    /** @param {TabOf[]} tabs */
    const tabsHtml = (tabs) => tabs.map((t) => tabHtml(t, t.key === open)).join('')

    /**
     * The scroll form: the tabs of the panes stay put, and every other tab, extension views and
     * showings alike, scrolls sideways in a `.tab-scroll` past them, with a thin scrollbar and a fade at an edge past
     * which more hide. The open tab is brought into view as it opens and as the row resizes.
     * @param {TabOf[]} all @param {string} adds
     */
    function tabsScroll(all, adds) {
      const fixed = all.filter((t) => !t.showing && paneCommand(t.view.id))
      const rest = all.filter((t) => !fixed.includes(t))
      repaint(strip, tablistHtml('scroll', `${tabsHtml(fixed)}<span class="tab-scroll">${tabsHtml(rest)}</span>`) + adds)
      const scroller = /** @type {HTMLElement} */ (scrollerOf())
      if (scroller !== scrolled.drawn) scroller.scrollLeft = scrolled.left
      if (scrolled.open !== open) bringOpen(scroller)
      scrolled.drawn = scroller
      scrolled.open = open
      markEdges(scroller)
    }

    /** The wrap form: every tab in the layout's order, on as many rows as they take. @param {TabOf[]} all @param {string} adds */
    function tabsWrap(all, adds) {
      repaint(strip, tablistHtml('wrap', tabsHtml(all)) + adds)
    }

    /**
     * The menu form: the tabs that fit on one row, the rest behind "+n ▾" after the tablist, a menu of them
     * (`/menu.js`). The tabs a pane chord opens and the open tab are always drawn, their labels cut short when even they
     * don't fit; the tab last picked from the menu is drawn next while it fits, then the others fill what room is left
     * in the layout's order, each drawn where that order puts it. Each tab's width is read while every tab is drawn,
     * and remembered by what it draws until the row's width or the type changes.
     * The tablist, "+n ▾" and the showing's adds are the row's own while it is in this form: drawn into, never replaced.
     * @returns {TabsForm}
     */
    function tabsMenu() {
      repaint(strip, '')
      const list = document.createElement('span')
      list.className = 'tab-set tabs-menu'
      list.role = 'tablist'
      const more = document.createElement('button')
      more.className = 'pane-tab tabs-more'
      more.hidden = true
      const addsAt = document.createElement('span')
      addsAt.className = 'tabs-adds'
      strip.append(list, more, addsAt)
      const listed = menu(more, {
        run: (item) => {
          const t = tabsOf().find((t) => itemKey(t) === item.key)
          if (t) (swapped = t.key), pick(t)
        },
      })
      /** The tab last picked from the menu. @type {string | undefined} */
      let swapped
      /** Each tab's width on the row, its gap included, by what it draws. @type {Map<string, number>} */
      const widths = new Map()
      /** "+n ▾"'s width, its gap included, as wide as it ever reads. */
      let moreWidth = 0
      /** The row's width when the widths were read. */
      let room = -1

      /** @param {TabOf} t */
      const itemKey = (t) => `${card.id} tab ${t.key}`
      /** What a tab draws, but its tip, which tells the time: it names the tab's width. @param {TabOf} t */
      const drawsOf = (t) => tabHtml(t, t.key === open).replace(/ data-tip="[^"]*"/g, '')
      const gapOf = (/** @type {HTMLElement} */ el) => parseFloat(getComputedStyle(el).columnGap) || 0

      /** Draws every tab and "+n ▾" at its widest, and keeps their widths. @param {TabOf[]} all */
      function measure(all) {
        list.classList.remove('tight')
        repaint(list, tabsHtml(all))
        more.hidden = false
        more.textContent = `+${all.length} ▾`
        const gap = gapOf(list)
        ;[...list.children].forEach((el, n) => widths.set(drawsOf(all[n]), el.getBoundingClientRect().width + gap))
        moreWidth = more.getBoundingClientRect().width + gapOf(strip)
      }

      /**
       * The tabs drawn in place, in the layout's order, those tucked behind "+n ▾", and whether the drawn are tight: the
       * tabs a pane chord opens and the open tab, which are never tucked, wider than the room, so their labels shrink.
       * @param {TabOf[]} all
       */
      function fit(all) {
        const widthOf = (/** @type {TabOf[]} */ ts) => ts.reduce((n, t) => n + /** @type {number} */ (widths.get(drawsOf(t))), 0) - (ts.length ? gapOf(list) : 0)
        const added = addsAt.firstElementChild ? addsAt.firstElementChild.getBoundingClientRect().width + gapOf(strip) : 0
        const free = strip.clientWidth - added
        if (widthOf(all) <= free) return { drawn: all, tucked: [], tight: false }
        const kept = all.filter((t) => (!t.showing && paneCommand(t.view.id)) || t.key === open)
        let left = free - moreWidth - widthOf(kept)
        const filled = new Set(kept)
        const picked = all.find((t) => t.key === swapped && !filled.has(t))
        for (const t of picked ? [picked, ...all] : all) {
          if (filled.has(t)) continue
          const width = /** @type {number} */ (widths.get(drawsOf(t)))
          if (left - width < 0) break
          left -= width
          filled.add(t)
        }
        return { drawn: all.filter((t) => filled.has(t)), tucked: all.filter((t) => !filled.has(t)), tight: left < 0 }
      }

      /** @param {TabOf} t @returns {MenuItem} */
      const itemOf = (t) => {
        const words = wordsOf(t)
        return { t: 'item', key: itemKey(t), label: t.showing ? shownTitle(t.showing) : t.view.words.label, ...(words.text && { hint: words.text }) }
      }

      return {
        draw(all, adds) {
          repaint(addsAt, adds)
          list.setAttribute('aria-label', `views of ${card.callsign}`)
          if (strip.clientWidth !== room) widths.clear(), (room = strip.clientWidth)
          if (all.some((t) => !widths.has(drawsOf(t)))) measure(all)
          const { drawn, tucked, tight } = fit(all)
          list.classList.toggle('tight', tight)
          repaint(list, drawn.map((t) => (tight ? namedTabHtml : tabHtml)(t, t.key === open)).join(''))
          more.hidden = !tucked.length
          more.textContent = `+${tucked.length} ▾`
          const said = `More tabs of ${card.callsign}: ${tucked.length}`
          more.setAttribute('aria-label', said)
          more.dataset.tip = said
          listed.draw({ header: '', entries: tucked.map(itemOf) })
          if (!tucked.length) listed.close()
        },
        resized: () => strip.clientWidth !== room && draw(),
        remeasure: () => ((room = -1), draw()),
        close: () => (listed.remove(), strip.replaceChildren()),
      }
    }

    /**
     * Where the scroll form's scroller was left, the scroller last drawn and the tab open then. A scroller a draw left in
     * place already sits where the viewer left it: only one a draw put in its place takes the offset back.
     * @type {{ left: number, drawn?: HTMLElement, open?: string }}
     */
    const scrolled = { left: 0 }

    const scrollerOf = () => /** @type {HTMLElement | null} */ (strip.querySelector(':scope > .tab-set > .tab-scroll'))

    /** The scroll padding the scroller's fades take at each edge. @param {HTMLElement} scroller */
    const fadeOf = (scroller) => parseFloat(getComputedStyle(scroller).scrollPaddingLeft)

    /** The open tab when the scroller holds it. @param {HTMLElement} scroller */
    const openIn = (scroller) => open === undefined ? null : /** @type {HTMLElement | null} */ (scroller.querySelector(`:scope > [data-tab="${CSS.escape(open)}"]`))

    /** Whether `tab` is wider than the scroller can show between its fades: shown from its start, unfaded. @param {HTMLElement} scroller @param {HTMLElement} tab */
    const fills = (scroller, tab) => tab.offsetWidth > scroller.clientWidth - 2 * fadeOf(scroller)

    /** Scrolls the open tab clear of the scroller's fades, or to its start when it fills the scroller. @param {HTMLElement} scroller */
    function bringOpen(scroller) {
      const tab = openIn(scroller)
      if (!tab) return
      const fade = fadeOf(scroller)
      const box = scroller.getBoundingClientRect()
      const at = tab.getBoundingClientRect()
      if (fills(scroller, tab)) scroller.scrollLeft += at.left - box.left
      else if (at.left < box.left + fade) scroller.scrollLeft += at.left - box.left - fade
      else if (at.right > box.right - fade) scroller.scrollLeft += at.right - box.right + fade
    }

    /** Keeps where the scroller is, and fades each edge past which more tabs hide, but not over an open tab shown from its start that fills it. @param {HTMLElement} scroller */
    function markEdges(scroller) {
      scrolled.left = scroller.scrollLeft
      const tab = openIn(scroller)
      const whole = !!tab && fills(scroller, tab) && Math.abs(tab.getBoundingClientRect().left - scroller.getBoundingClientRect().left) < 1
      scroller.classList.toggle('more-before', !whole && scroller.scrollLeft > 0)
      scroller.classList.toggle('more-after', !whole && scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1)
    }

    /** The pane naming tab `t`: on a showing's subject, or on its own with what it shows below it. @param {TabOf} t @returns {Pane} */
    function paneOf(t) {
      const shows = below.get(t.key)
      return { view: t.view.id, ...((t.showing || shows) && { subject: t.subject.key }), ...shows }
    }

    /** Opens the tab `key`: through the location for the main pane's worker. @param {TabOf} t */
    function pick(t) {
      const pane = paneOf(t)
      if (scope) return scope.pick(pane)
      picked = pane
      draw()
    }

    /** Tab `key` told what it shows below its subject: the location names it while that tab is open. @param {string} key @param {Subject} s */
    function told(key, s) {
      below.set(key, paneShows(s))
      const t = key === open ? tabsOf().find((t) => t.key === key) : undefined
      if (t) pick(t)
    }

    /**
     * The open tab handed what the location's pane `shows` when that isn't what the tab shows: a reload, the history or
     * a link reached it. A microtask later, so a subject display hands whole in the same step is handed first.
     * @param {TabOf[]} all
     */
    function handOpen(all) {
      const at = scope?.pane()
      const pane = at ? (at.on ? at.pane : undefined) : picked
      const t = all.find((t) => t.key === open)
      if (!t || pane?.shows === undefined || named(all, pane) !== t) return
      queueMicrotask(() => {
        const was = below.get(t.key)
        if (open !== t.key || (was?.shows === pane.shows && String(was?.args) === String(pane.args))) return
        below.set(t.key, { shows: pane.shows, ...(pane.args && { args: pane.args }) })
        mounted.get(t.key)?.hosted.show(shownOf(/** @type {Pane & { shows: string }} */ (pane), card.project))
      })
    }

    strip.addEventListener('click', (e) => {
      const target = /** @type {Element} */ (e.target)
      if (target.closest('[data-unshow], [data-out], [data-file-call], [data-added], .shown-adds')) return
      const key = /** @type {HTMLElement | null} */ (target.closest('[data-tab]'))?.dataset.tab
      const t = key && tabsOf().find((t) => t.key === key)
      if (t) pick(t)
    })

    /** The tabs move as the ARIA tabs pattern has it: ← → Home End go along the row and open the tab they reach. */
    strip.addEventListener('keydown', (e) => {
      const tab = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[role=tab]'))
      if (!tab || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
      const all = /** @type {HTMLElement[]} */ ([...strip.querySelectorAll('[role=tab]')])
      const at = all.indexOf(tab)
      const to = all[/** @type {Record<string, number>} */ ({ ArrowLeft: (at - 1 + all.length) % all.length, ArrowRight: (at + 1) % all.length, Home: 0, End: all.length - 1 })[e.key]]
      if (!to) return
      e.preventDefault()
      to.focus()
      const t = tabsOf().find((t) => t.key === to.dataset.tab)
      if (t) pick(t)
    })

    strip.addEventListener('scroll', (e) => e.target === scrollerOf() && markEdges(/** @type {HTMLElement} */ (e.target)), true)

    /** A mouse wheel over the scroller turns it sideways. */
    strip.addEventListener('wheel', (e) => {
      const scroller = scrollerOf()
      if (!scroller?.contains(/** @type {Node} */ (e.target)) || scroller.scrollWidth <= scroller.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      e.preventDefault()
      scroller.scrollLeft += e.deltaY
    }, { passive: false })

    const resized = new ResizeObserver(() => formNow.resized())
    resized.observe(strip)
    const remeasure = () => formNow.remeasure()
    const offPrefs = tower.prefs.on(remeasure)
    document.fonts.addEventListener('loadingdone', remeasure)

    panels.addEventListener('tab', () => draw())

    const self = { draw }
    tabbed.add(self)
    draw()

    return {
      update(at) {
        const drove = can(card, 'drive')
        subject = at
        card = /** @type {Card} */ (at.value)
        for (const el of new Set([strip, panels])) el.dataset.subject = at.key
        draw()
        const all = tabsOf()
        for (const t of all) mounted.get(t.key)?.hosted.update(t.subject)
        if (drove && !can(card, 'drive') && all.find((t) => t.key === open)?.view.id === 'tower/terminal') pick(byDefault(all))
      },
      show(s) {
        const all = tabsOf()
        const handed = all.filter((t) => t.view.on.includes(s.kind) || t.view.shows?.includes(s.kind))
        const t = all.find((t) => t.subject.key === s.key) ?? handed.find((t) => t.subject.key === parentOf(s)) ?? handed[0]
        if (!t) return false
        if (t.subject.key !== s.key) below.set(t.key, paneShows(s))
        if (t.key !== open) pick(t)
        if (t.subject.key === s.key) return true
        return mounted.get(t.key)?.hosted.show(s) ?? false
      },
      options(next) {
        options = /** @type {Record<string, Record<string, unknown>>} */ (next)
        for (const { hosted } of mounted.values()) hosted.options(optionsOf(hosted.view))
      },
      visible(on) {
        seen = on
        mounted.get(open ?? '')?.hosted.visible(on)
        if (on && open && tabsOf().find((t) => t.key === open)?.showing) keptShown(open)
      },
      /** The view ids of its tabs, and of the tab open. */
      tabs: () => ({ views: tabsOf().map((t) => t.view.id), open: tabsOf().find((t) => t.key === open)?.view.id }),
      /** Opens the tab of view `id`, its terminal focused, else its tab; false when it has none. @param {string} id */
      toPane(id) {
        const t = tabsOf().find((t) => t.view.id === id)
        if (!t) return false
        pick(t)
        queueMicrotask(() => {
          const term = mounted.get(t.key)?.hosted.terminal()
          if (term) term.focus()
          else /** @type {HTMLElement | null} */ (strip.querySelector(`[data-tab="${CSS.escape(t.key)}"]`))?.focus()
        })
        return true
      },
      close() {
        tabbed.delete(self)
        resized.disconnect()
        offPrefs()
        document.fonts.removeEventListener('loadingdone', remeasure)
        formNow.close()
        for (const key of [...mounted.keys()]) closeTab(key)
        for (const el of [strip, panels]) delete el.dataset.region, delete el.dataset.subject
      },
    }
  }

  /** @typedef {ReturnType<typeof tabs>} TabsRegion */

  const main = /** @type {HTMLElement} */ (document.getElementById('view-host'))

  /**
   * The main pane: the view at the location, and the workers left recently, kept drawn and hidden so each is as it was
   * left when gone back to (its tab, scroll, pick, terminal), the least recently left closed past `CARDS_KEPT`.
   * @type {{ key: string, view: string, el: HTMLElement, hosted: Hosted } | undefined}
   */
  let open
  /** @type {{ key: string, view: string, el: HTMLElement, hosted: Hosted }[]} */
  let kept = []

  /** @type {(key: string, pane: Pane) => void} */
  let pickMain = () => {}

  /** @param {{ el: HTMLElement, hosted: Hosted }} m @param {boolean} on */
  const reveal = (m, on) => {
    m.el.classList.toggle('kept', !on)
    m.el.inert = !on
    m.hosted.visible(on)
  }

  /** @param {{ el: HTMLElement, hosted: Hosted }} m */
  const drop = (m) => {
    m.hosted.close()
    m.el.remove()
  }

  /**
   * Enters `location`: a worker kept is shown again, any other view mounted afresh; a subject that isn't there takes the
   * page home.
   * @param {Location} location
   */
  function enter(location) {
    const key = location.subject ?? 'board'
    main.dataset.subject = key
    const back = location.view === WORKER ? kept.find((k) => k.key === key) : undefined
    if (back) {
      kept = kept.filter((k) => k !== back)
      open = back
      reveal(back, true)
      back.hosted.update(/** @type {Subject} */ (subjectOf(key)))
      return
    }
    const view = views().find((v) => v.id === location.view)
    const subject = subjectOf(key)
    const el = Object.assign(document.createElement('div'), { className: 'view-root' })
    main.append(el)
    if (!view?.module || !view.export) {
      el.dataset.view = location.view
      open = { key, view: location.view, el, hosted: /** @type {Hosted} */ (/** @type {unknown} */ ({ update: () => {}, visible: () => {}, show: () => false, close: () => {}, tab: () => undefined, terminal: () => undefined })) }
      return hosting.failed(el, location.view, 'nothing running declares it with a module')
    }
    if (!subject) return (el.remove(), gone())
    /** @type {PaneScope | undefined} */
    const scope = view.id === WORKER ? { pane: () => ({ on: open?.key === key, pane: mainPane() }), pick: (pane) => pickMain(key, pane) } : undefined
    if (scope) scopes.set(el, scope)
    const hosted = hosting.mountView(view, el, subject, { scale: 'pane', options: layout()['board.main']?.options?.[view.id] ?? {}, ...(location.args && { args: location.args }) })
    open = { key, view: view.id, el, hosted }
  }

  /** Leaves the view open: a worker is kept, hidden, any other closed. */
  function leave() {
    const was = open
    open = undefined
    delete main.dataset.subject
    if (!was) return
    if (was.view !== WORKER) return drop(was)
    reveal(was, false)
    kept = [...kept, was]
    for (const k of kept.splice(0, Math.max(kept.length - CARDS_KEPT, 0))) drop(k)
  }

  /** Every view the main pane holds gets the board; a hidden worker no longer there is closed, the one open is told to `left`. */
  function update() {
    for (const k of kept) {
      const at = subjectOf(k.key)
      if (at) k.hosted.update(at)
      else (drop(k), (kept = kept.filter((m) => m !== k)))
    }
    if (!open) return
    const at = subjectOf(open.key)
    if (!at) return left()
    open.hosted.update(at)
  }

  /**
   * A region the page draws once for each of many subjects inside a list it paints whole (`floor.trays`: one row per
   * collection of a floor). Each subject's view, the one the layout picks among those the region offers, lives in a
   * host of its own, kept mounted while its subject stands: a paint writes `slotHtml` where it goes, and `place` moves
   * the host there, updated. A host no paint places (its floor folded) stays mounted unseen; one whose subject left
   * the board, or whose pick changed, is closed. The layout's `order` also places the rows: those drawn by a view it
   * names first, in its order, the rest after in theirs.
   * @param {string} id
   */
  function rows(id) {
    /** @type {Map<string, { view: string | undefined, el: HTMLElement, hosted: Hosted | undefined }>} */
    const held = new Map()
    const region = () => /** @type {Region} */ (declared().find((r) => r.id === id))
    /** @param {Subject} subject */
    const pick = (subject) => pickView(board(), offeredIn(views(), region(), layout(), deps.kit, subject), layout()[id]?.order, subject)

    /** @param {string} key */
    const drop = (key) => {
      held.get(key)?.hosted?.close()
      held.delete(key)
    }

    /** The host of `subject`'s row, mounted when it has none or its pick changed, else updated. @param {Subject} subject */
    const hostOf = (subject) => {
      const view = pick(subject)
      const was = held.get(subject.key)
      if (was && was.view === view?.id) return (was.hosted?.update(subject), was.el)
      drop(subject.key)
      const el = Object.assign(document.createElement('div'), { className: 'region-row' })
      el.dataset.region = id
      el.dataset.subject = subject.key
      if (!view?.module) {
        hosting.failed(el, id, `nothing here draws ${subject.key}`)
        held.set(subject.key, { view: view?.id, el, hosted: undefined })
        return el
      }
      const hosted = hosting.mountView(view, el, subject, { scale: region().scale, options: layout()[id]?.options?.[view.id] ?? {} })
      held.set(subject.key, { view: view.id, el, hosted })
      return el
    }

    return {
      /** `subjects` in the order the region places them. @param {Subject[]} subjects */
      ordered: (subjects) => {
        const order = layout()[id]?.order ?? []
        const at = (/** @type {Subject} */ s) => {
          const n = order.indexOf(/** @type {string} */ (pick(s)?.id))
          return n < 0 ? order.length : n
        }
        return subjects.map((s) => ({ s, n: at(s) })).sort((a, b) => a.n - b.n).map(({ s }) => s)
      },
      /** Whether a view the region offers draws `subject`. @param {Subject} subject */
      draws: (subject) => pick(subject)?.module !== undefined,
      /** Where a paint puts `subject`'s row. @param {Subject} subject */
      slotHtml: (subject) => `<div data-row-of="${esc(id)}" data-row="${esc(subject.key)}"></div>`,
      /** Moves each row into the place a paint of `root` left for it, and closes those whose subject left the board. @param {HTMLElement} root */
      place(root) {
        for (const slot of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(`[data-row-of="${CSS.escape(id)}"]`))) {
          const subject = subjectOf(/** @type {string} */ (slot.dataset.row))
          if (subject) slot.replaceWith(hostOf(subject))
        }
        for (const key of [...held.keys()]) if (!subjectOf(key)) drop(key)
      },
      /**
       * Updates the rows in `root` where they stand, when its paint wrote nothing new: one whose pick changed is mounted
       * afresh in its place. Those whose subject left the board are closed. @param {HTMLElement} root
       */
      refresh(root) {
        for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(`.region-row[data-region="${CSS.escape(id)}"]`))) {
          const subject = subjectOf(/** @type {string} */ (el.dataset.subject))
          const now = subject && hostOf(subject)
          if (now && now !== el) el.replaceWith(now)
        }
        for (const key of [...held.keys()]) if (!subjectOf(key)) drop(key)
      },
    }
  }

  /** The tabs region of the worker in `el`'s card, or of the main pane's: where a tab's chord acts. @param {Element | null} el @returns {TabsRegion | undefined} */
  const tabsAt = (el) => {
    const panels = /** @type {HTMLElement | null | undefined} */ (el?.closest('[data-view="tower/card"]'))
    const card = panels ?? (open?.view === WORKER ? open.el : undefined)
    return card ? regionsByHost.get(/** @type {HTMLElement} */ (card)) : undefined
  }

  return {
    enter,
    leave,
    update,
    /** @param {Subject} s */
    show: (s) => open?.hosted.show(s) ?? false,
    /** @param {(key: string, pane: Pane) => void} fn */
    onPick: (fn) => void (pickMain = fn),
    tabsAt,
    rows,
    mountedView: () => open?.view,
    refont: () => terminals.forEach((t) => void t.refont()),
    rescheme: () => terminals.forEach((t) => t.rescheme()),
  }
}
