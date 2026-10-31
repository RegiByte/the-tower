import { ago, can, commandUrl, esc, findCard, parentOf, shownHref, shownKey, shownSubject, shownTitle } from '/cards.js'
import { mountTermView } from '/term-view.js'
import { offeredIn, ordered, paneShows, pickView, shownOf } from '/views.js'
import { shownFrom } from '/brief.js'
import { ICON } from '/icons.js'
import { fileSpansHtml, keepShownTabs } from '/panels.js'
import { keyedTip, paintOnce } from './kit.js'
import { addsHtml } from './added.js'

/**
 * @import { Board, Card, CardShown } from '../../src/bridge/board.ts'
 * @import { Subject } from '../../src/shared/subjects.ts'
 * @import { Bus, Kit, CommandKit, Location, Mount, Mounted, Pane, RegionHandle, RegionOptions, TabWords, Tab, View } from '../../src/shared/views.ts'
 * @import { Layout, Region, KitMember, Scale } from '../../src/shared/regions.ts'
 * @import { TermViewHandle } from '../../src/shared/term-view.ts'
 * @import { Tower, TerminalMsg } from '../../src/shared/shelf-page.ts'
 * @import { ShellStream } from '../../src/shared/terms.ts'
 * @import { Scheme } from '../../src/shared/design.ts'
 * @import { TermFont } from '../../src/shared/terminal.ts'
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
 *   commandKit: CommandKit & { go: (location: Location) => void, href: (to: Subject | Location) => string },
 *   tower: Tower,
 *   contributions: (el: HTMLElement, id: string, subject: Subject, options: { omit?: string[] }) => RegionHandle,
 *   subjectOf: (key: string) => Subject | undefined,
 *   unshown: () => ReadonlySet<string>,
 *   mainPane: () => Pane | undefined,
 *   gone: () => void,
 *   bus: Bus,
 * }} RegionsDeps
 */

/** The lines a shell's terminal keeps, as the dock's does. */
const SHELL_SCROLLBACK = 2000

/** How long a view's mount may take before its region says it failed. */
const MOUNT_MS = 10_000

/** How many workers the main pane keeps drawn once left, the least recently left closed first. */
const CARDS_KEPT = 4

/** How many showings stay drawn at once across every worker, the least recently shown closed first. */
const SHOWN_KEPT = 8

/** The keymap's command that opens each of the core's tabs. */
const PANE_COMMANDS = /** @type {Record<string, string>} */ ({ 'tower/terminal': 'pane-terminal', 'tower/brief': 'pane-brief', 'tower/changes': 'pane-changes', 'reviews/thread': 'pane-reviews' })

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
  const { board, views, layout, declared, termFont, scheme, run, commandKit, tower, contributions, subjectOf, unshown, mainPane, gone } = deps

  /** Each tabs region, by the element of the view it is in: where a tab's chord finds it. @type {WeakMap<HTMLElement, ReturnType<typeof tabs>>} */
  const regionsByHost = new WeakMap()

  /** Every terminal a view's kit opened, which the viewer's face and scheme reach. @type {Set<TermViewHandle>} */
  const terminals = new Set()

  /** Each view module, by its URL, once imported. @type {Map<string, Record<string, unknown>>} */
  const modules = new Map()
  /** @type {Map<string, Promise<Record<string, unknown>>>} */
  const importing = new Map()
  /** Every tabs region drawn, to draw again when a module it waits for arrives. @type {Set<{ draw: () => void }>} */
  const tabbed = new Set()

  /** @param {View} view */
  const urlOf = (view) => commandUrl(view.cap, /** @type {string} */ (view.module))

  /** A view's module, imported once; regions waiting on it drawn again when it arrives. @param {View} view */
  const moduleOf = (view) => {
    const url = urlOf(view)
    if (!importing.has(url))
      importing.set(url, import(url).then((m) => (modules.set(url, m), tabbed.forEach((r) => r.draw()), m)))
    return /** @type {Promise<Record<string, unknown>>} */ (importing.get(url))
  }

  /** @param {HTMLElement} el @param {string} id @param {string} why */
  const failed = (el, id, why) => {
    el.innerHTML = `<p class="view-failed">${esc(id)} couldn't draw: ${esc(why)}</p>`
  }

  /** `tower.store` under `view.<id>.<key>`: the view's own. @param {string} id */
  const stateOf = (id) => ({
    /** @param {string} key */
    get: (key) => tower.store.get(`view.${id}.${key}`),
    /** @param {string} key @param {unknown} value */
    set: (key, value) => tower.store.set(`view.${id}.${key}`, value),
  })

  /**
   * A view mounted into `el` on `subject`: its kit lends the page's terminals and regions, each closed with it, and
   * `showing`, told what it shows below its subject; `show` handed before the mount settles waits for it; new options
   * are handed to its `options`, else it is mounted afresh.
   * @param {View} view @param {HTMLElement} el @param {Subject} subject @param {Scale | undefined} scale @param {Record<string, unknown>} options @param {PaneScope | undefined} scope @param {(s: Subject) => void} showing @param {string[] | undefined} [args]
   */
  function mountView(view, el, subject, scale, options, scope, showing, args) {
    el.dataset.view = view.id
    /** @type {Set<TermViewHandle>} */
    const own = new Set()
    /** @type {Set<RegionHandle>} */
    const inner = new Set()
    /** The keys it published on the bus, once per publish: cleared with it. @type {string[]} */
    const published = []
    let closed = false
    /** @type {Mounted | undefined} */
    let mounted
    /** @type {Subject[]} */
    const pending = []
    /** @type {boolean | undefined} */
    let seen

    /** @param {HTMLElement} host @param {`terminal/${string}` | `shell/${string}`} path @returns {TermViewHandle} */
    const terminal = (host, path) => {
      const [stream, id] = /** @type {['terminal' | 'shell', string]} */ (path.split('/'))
      const shell = stream === 'shell'
      host.classList.toggle('claude-term', !shell)
      const handle = mountTermView(host, { Terminal, FitAddon: FitAddon.FitAddon, WebLinksAddon: WebLinksAddon.WebLinksAddon }, {
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
        files: {
          cwd: () => /** @type {string} */ (shell ? board().shells.find((sh) => sh.id === id)?.cwd : findCard(board(), id)?.cwd),
          edit: (path, line) => tower.call('edit', { path, line }),
        },
      })
      terminals.add(handle)
      own.add(handle)
      return { ...handle, close: () => (terminals.delete(handle), own.delete(handle), host.classList.remove('claude-term'), handle.close()) }
    }

    /** @type {Kit} */
    const kit = {
      ...commandKit,
      showing,
      terminal,
      region: (host, id, at, opts) => {
        const handle = regionIn(host, id, at, opts ?? {}, scope)
        inner.add(handle)
        return { ...handle, close: () => (inner.delete(handle), handle.close()) }
      },
      bus: {
        ...deps.bus,
        publish: (s, of) => (published.push(s.key), deps.bus.publish(s, of)),
        clear(key) {
          const at = published.indexOf(key)
          if (at < 0) return
          published.splice(at, 1)
          deps.bus.clear(key)
        },
      },
    }

    const settle = async () => {
      try {
        const module = await moduleOf(view)
        const mount = /** @type {Mount | undefined} */ (module[/** @type {string} */ (view.export)])
        if (typeof mount !== 'function') throw new Error(`${urlOf(view)} exports no function ${view.export}`)
        const ctx = { tower, board: board(), subject, kit, state: stateOf(view.id), options, scale, ...(args && { args }) }
        const done = /** @type {Mounted} */ (await Promise.race([
          Promise.resolve(mount(el, ctx)),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`its mount hadn't settled in ${MOUNT_MS / 1000} s`)), MOUNT_MS)),
        ]))
        if (closed) return done.close()
        mounted = done
        if (options !== ctx.options) {
          if (!mounted.options) return remount()
          mounted.options(options)
        }
        if (seen !== undefined) mounted.visible?.(seen)
        for (const s of pending.splice(0)) if (!mounted.show?.(s)) commandKit.toast(`${s.key} isn't there any more`)
      } catch (err) {
        if (!closed) fail(/** @type {Error} */ (err).message)
      }
    }

    /** @param {string} why */
    const fail = (why) => {
      const was = mounted
      mounted = undefined
      try {
        was?.close()
      } finally {
        letGo()
        failed(el, view.id, why)
      }
    }

    const letGo = () => {
      for (const t of own) t.close()
      for (const r of inner) r.close()
      inner.clear()
      for (const key of published.splice(0)) deps.bus.clear(key)
    }

    const remount = () => {
      const was = mounted
      mounted = undefined
      try {
        was?.close()
      } finally {
        letGo()
        void settle()
      }
    }

    void settle()

    return {
      view,
      el,
      /** @param {Subject} at */
      update(at) {
        subject = at
        try {
          mounted?.update(board(), at)
        } catch (err) {
          fail(/** @type {Error} */ (err).message)
        }
      },
      /** A subject below the one it is on; true when it took it, or will once mounted. @param {Subject} s */
      show(s) {
        if (closed) return false
        if (!mounted) return (pending.push(s), true)
        return mounted.show?.(s) ?? false
      },
      /** @param {boolean} on */
      visible(on) {
        seen = on
        mounted?.visible?.(on)
      },
      /** @param {Record<string, unknown>} next */
      options(next) {
        options = next
        if (!mounted) return
        if (!mounted.options) return remount()
        try {
          mounted.options(next)
        } catch (err) {
          fail(/** @type {Error} */ (err).message)
        }
      },
      tab: () => mounted?.tab?.(),
      /** The first terminal its kit opened, as a press of its tab's chord focuses it. */
      terminal: () => [...own][0]?.term(),
      close() {
        closed = true
        try {
          mounted?.close()
        } finally {
          letGo()
        }
      },
    }
  }

  /** @typedef {ReturnType<typeof mountView>} Hosted */

  /**
   * A region a view asks for: one holding views mounts them by the layout (a tabs region its tabs); any other draws what
   * extensions add to it, each hold in the element marked with it (`data-holds`) or in `host`, less the commands its
   * options `omit`.
   * @param {HTMLElement} host @param {string} id @param {Subject} subject @param {RegionOptions} options @param {PaneScope | undefined} scope
   * @returns {RegionHandle}
   */
  function regionIn(host, id, subject, options, scope) {
    const region = declared().find((r) => r.id === id)
    if (!region?.holds.includes('views')) return contributions(host, id, subject, /** @type {{ omit?: string[] }} */ (options))
    const byView = /** @type {Record<string, Record<string, unknown>>} */ (options)
    if (region.holds.some((h) => h !== 'views')) return beside(host, region, subject, byView)
    if (region.arity !== 'tabs') return one(host, region, subject, byView)
    const made = tabs(host, region, subject, byView, scope)
    const view = /** @type {HTMLElement | null} */ (host.closest('[data-view]'))
    if (view) regionsByHost.set(view, made)
    return made
  }

  /**
   * A region holding one view on its subject, the one the layout picks among those it offers.
   * @param {HTMLElement} host @param {Region} region @param {Subject} subject @param {Record<string, Record<string, unknown>>} options
   * @returns {RegionHandle}
   */
  function one(host, region, subject, options) {
    host.dataset.region = region.id
    host.dataset.subject = subject.key
    const offered = offeredIn(views(), region, layout(), deps.kit, subject)
    const view = pickView(board(), offered, layout()[region.id]?.order, subject)
    const el = document.createElement('div')
    el.className = 'view-root'
    host.replaceChildren(el)
    if (!view?.module) {
      failed(el, region.id, `nothing here draws ${subject.key}`)
      return { update: () => {}, close: () => host.replaceChildren() }
    }
    /** @param {Record<string, Record<string, unknown>>} asked */
    const optionsOf = (asked) => ({ ...layout()[region.id]?.options?.[view.id], ...asked[view.id] })
    const hosted = mountView(view, el, subject, region.scale, optionsOf(options), undefined, () => {})
    return {
      update: (at) => ((host.dataset.subject = at.key), hosted.update(at)),
      options: (next) => hosted.options(optionsOf(/** @type {Record<string, Record<string, unknown>>} */ (next))),
      show: (s) => hosted.show(s),
      visible: (on) => hosted.visible(on),
      close: () => (hosted.close(), host.replaceChildren(), delete host.dataset.region, delete host.dataset.subject),
    }
  }

  /**
   * A region holding one view beside contributions (`lines.acts`: what acts on picked lines): the view the layout picks
   * among those it offers, then what extensions add, the host hidden while it holds neither.
   * @param {HTMLElement} host @param {Region} region @param {Subject} subject @param {Record<string, Record<string, unknown>>} options
   * @returns {RegionHandle}
   */
  function beside(host, region, subject, options) {
    const viewEl = document.createElement('div')
    const acts = document.createElement('div')
    acts.className = 'region-acts'
    host.replaceChildren(viewEl, acts)
    const held = offeredIn(views(), region, layout(), deps.kit, subject).length ? one(viewEl, region, subject, options) : undefined
    const added = contributions(acts, region.id, subject, {})
    const fit = () => void (host.hidden = !held && !acts.childElementCount)
    fit()
    return {
      update: (at) => (held?.update(at), added.update(at), fit()),
      options: (next) => held?.options?.(next),
      show: (s) => held?.show?.(s) ?? false,
      visible: (on) => held?.visible?.(on),
      close: () => (held?.close(), added.close(), host.replaceChildren(), (host.hidden = false)),
    }
  }

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
      const module = modules.get(urlOf(v))
      if (!module) return (void moduleOf(v), 'waiting')
      return /** @type {Tab} */ (module[v.tab])(board(), at)
    }

    /** Whether a view offered here still waits for its module to say whether it has a tab: no tab opens before, so the default can't pick one it would pass over. */
    const waiting = () => offeredIn(views(), region, layout(), deps.kit, subject).some((v) => v.id !== hostView && v.module && v.tab && !modules.has(urlOf(v)))

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

    /** @param {TabOf} t @param {boolean} on */
    function tabHtml(t, on) {
      const command = PANE_COMMANDS[t.view.id]
      const panel = `panel-${esc(t.key)}`
      const words = mounted.get(t.key)?.hosted.tab() ?? t.words ?? {}
      if (t.showing) return shownTabHtml(t.showing, on, t.key, panel)
      const hint = words.hint ?? t.view.words.hint ?? t.view.words.label
      const tip = command ? keyedTip(board().keys, hint, command) : `data-tip="${esc(hint)}"`
      const tally = words.text ? `<small${words.tone ? ` class="${words.tone}"` : ''}${words.tip ? ` data-tip="${esc(words.tip)}"` : ''}>${esc(words.text)}</small>` : ''
      return `<button class="pane-tab ${on ? 'on' : ''}" role="tab" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-controls="${panel}" ${tip} data-tab="${esc(t.key)}">${esc(t.view.words.label)}${tally}</button>`
    }

    /** What a worker showed, as a tab: a link opens in a browser tab, anything else also opens out of the tower. @param {CardShown} s @param {boolean} on @param {string} key @param {string} panel */
    function shownTabHtml(s, on, key, panel) {
      const from = shownFrom(card.lineage, s)
      const what = `${card.callsign} showed ${s.target} · ${ago(Date.now() - s.at)} ago${from ? ` · in ${from.label}` : ''}`
      return `<button class="pane-tab shown-tab ${on ? 'on' : ''}" role="tab" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-controls="${panel}" data-tip="${esc(what)}" data-tab="${esc(key)}">` +
        `<span class="shown-name">${s.kind === 'link' ? `${ICON.remote} ` : ''}${esc(shownTitle(s))}</span>${from ? `<small>${from.mark}</small>` : ''}` +
        (on && s.kind !== 'link' ? `<span class="icon-btn" data-out="${esc(shownHref(s))}" aria-hidden="true" data-tip="open in a browser tab">${ICON.remote}</span>` : '') +
        (on && s.kind === 'file' ? fileSpansHtml(s.target) : '') +
        `<span class="icon-btn" data-unshow="${esc(shownKey(s))}" aria-hidden="true" data-tip="close: it comes back if shown again">${ICON.close}</span></button>`
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
      const hosted = mountView(t.view, root, t.subject, region.scale, optionsOf(t.view), scope, (s) => told(t.key, s))
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
      const showing = all.find((t) => t.key === open)?.showing
      const adds = showing ? addsHtml(board(), shownSubject(card, showing)) : ''
      const own = all.filter((t) => !t.showing)
      const shown = all.filter((t) => t.showing)
      paintOnce(
        strip,
        `<span class="tab-set" role="tablist" aria-label="views of ${esc(card.callsign)}">${own.map((t) => tabHtml(t, t.key === open)).join('')}` +
          (shown.length ? `<span class="shown-tabs">${shown.map((t) => tabHtml(t, t.key === open)).join('')}</span>` : '') +
          '</span>' +
          (adds && `<span class="shown-adds" role="group" aria-label="on ${esc(shownTitle(/** @type {CardShown} */ (showing)))}">${adds}</span>`),
      )
      keepShownTabs(strip, card.id)
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
      if (target.closest('[data-unshow], [data-out], [data-file-call], .shown-adds')) return
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

    panels.addEventListener('tab', () => draw())

    const self = { draw }
    tabbed.add(self)
    draw()

    return {
      update(at) {
        subject = at
        card = /** @type {Card} */ (at.value)
        for (const el of new Set([strip, panels])) el.dataset.subject = at.key
        draw()
        for (const t of tabsOf()) mounted.get(t.key)?.hosted.update(t.subject)
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
      return failed(el, location.view, 'nothing running declares it with a module')
    }
    if (!subject) return (el.remove(), gone())
    /** @type {PaneScope | undefined} */
    const scope = view.id === WORKER ? { pane: () => ({ on: open?.key === key, pane: mainPane() }), pick: (pane) => pickMain(key, pane) } : undefined
    const hosted = mountView(view, el, subject, 'pane', layout()['board.main']?.options?.[view.id] ?? {}, scope, () => {}, location.args)
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

  /** Every view the main pane holds gets the board; a hidden worker no longer there is closed, the one open takes the page home. */
  function update() {
    for (const k of kept) {
      const at = subjectOf(k.key)
      if (at) k.hosted.update(at)
      else (drop(k), (kept = kept.filter((m) => m !== k)))
    }
    if (!open) return
    const at = subjectOf(open.key)
    if (!at) return gone()
    open.hosted.update(at)
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
    mountedView: () => open?.view,
    refont: () => terminals.forEach((t) => void t.refont()),
    rescheme: () => terminals.forEach((t) => t.rescheme()),
  }
}
