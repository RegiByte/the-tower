import type { Board } from '../bridge/board.ts'
import { commandUrl } from './adds.ts'
import { esc } from './cards.ts'
import { importServed } from './import-served.ts'
import type { KitMember, Layout, Region, Scale } from './regions.ts'
import { NO_KIT } from './run-command.ts'
import type { Tower } from './shelf-page.ts'
import type { Subject } from './subjects.ts'
import type { TermViewHandle } from './term-view.ts'
import { unlent } from './unlent.ts'
import { offeredIn, pickView, type Kit, type Mount, type Mounted, type RegionHandle, type RegionOptions, type View } from './views.ts'

/** How long a view's mount may take before its region says it failed. */
const MOUNT_MS = 10_000

/**
 * What a renderer lends the views it hosts, of the kit `renderer.json` names: a member left out throws naming itself
 * if a view calls it. `spawn` is told `open`, whether the view that asked still stands. The host makes `region` and
 * `showing`, and keeps `terminal` and `bus` to close what a view opened with them.
 */
export type Lent = Partial<Pick<Kit, 'terminal' | 'display' | 'toast' | 'notice' | 'confirm' | 'run' | 'go' | 'bus' | 'href' | 'location'>> & {
  spawn?(on: Subject, open: () => boolean): Promise<string | undefined>
}

/** A region the renderer draws its own way, in `host` on `subject`. */
export type Fill = (host: HTMLElement, id: string, subject: Subject, options: RegionOptions) => RegionHandle

/**
 * The regions a renderer draws its own way, by what they are: `contributions`, every region holding no views; `tabs`,
 * a region of views of arity `tabs`, which a renderer with none leaves out, and a view asking for one fails naming it.
 */
export type Fills = { contributions: Fill; tabs?: Fill }

/** What a view host reads from its renderer. `kit`: the members its `renderer.json` names, which pick what a region offers. */
export type HostDeps = {
  tower: Tower
  board: () => Board
  views: () => View[]
  layout: () => Layout
  declared: () => Region[]
  kit: readonly KitMember[]
  lent: Lent
  fills: Fills
}

/** Where a view is mounted: its scale, its options, and `showing`, told what it shows below its subject, where a renderer names that. */
export type Placed = { scale: Scale | undefined; options: Record<string, unknown>; showing?: (subject: Subject) => void; args?: string[] }

export type Hosted = ReturnType<ViewHost['mountView']>

export type ViewHost = ReturnType<typeof viewHost>

/**
 * A view host (decision `ui-model`): what mounts views for a renderer, the page's and any sibling's. It imports a view's
 * module from `/x/<cap>/` by its whole address, lends it the kit, and fills the regions it asks for: one view, one view
 * beside contributions, or what `fills` draws. One that fails says so in one line where it would draw.
 *
 * The host follows nothing. The renderer that mounts hands each board to `update`, tells `visible(false)` a view it
 * hides and keeps (a view starts seen; a renderer that closes what it hides never calls it), and closes what it mounted:
 * `close` ends the view, its terminals, its inner regions and what it published on the bus. The element stays the
 * renderer's, to empty or remove, with `.view-failed`'s look and the layout a flex view wants from its parent.
 */
export function viewHost(deps: HostDeps) {
  const { tower, board, views, layout, declared, lent, fills } = deps
  const lentBus = lent.bus ?? NO_KIT.bus

  /** Each view module, by its URL, once imported. */
  const modules = new Map<string, Record<string, unknown>>()
  const importing = new Map<string, Promise<Record<string, unknown>>>()
  let arrived = () => {}

  const urlOf = (view: View) => commandUrl(view.cap, view.module as string)

  /** A view's module, imported once. */
  const moduleOf = (view: View) => {
    const url = urlOf(view)
    if (!importing.has(url))
      importing.set(url, importServed(url).then((m) => (modules.set(url, m), arrived(), m)))
    return importing.get(url) as Promise<Record<string, unknown>>
  }

  const failed = (el: HTMLElement, id: string, why: string) => {
    el.innerHTML = `<p class="view-failed">${esc(id)} couldn't draw: ${esc(why)}</p>`
  }

  /**
   * A view whose module no longer links against the modules this page loaded: the page holds one version of each
   * shared module, so a client the tower changed since the page loaded needs the page reloaded.
   */
  const stale = (el: HTMLElement, id: string, why: string) => {
    el.innerHTML = `<p class="view-failed">${esc(id)} couldn't draw: the tower's code changed since this page loaded (${esc(why)}) <button data-reload-page>Reload</button></p>`
    el.querySelector('[data-reload-page]')?.addEventListener('click', () => location.reload())
  }

  /** `tower.store` under `view.<id>.<key>`: the view's own. */
  const stateOf = (id: string) => ({
    get: (key: string) => tower.store.get(`view.${id}.${key}`),
    set: (key: string, value: unknown) => tower.store.set(`view.${id}.${key}`, value),
  })

  /**
   * A view mounted into `el` on `subject`: its kit lends the renderer's terminals and regions, each closed with it, and
   * `showing`; `show` handed before the mount settles waits for it; new options are handed to its `options`, else it is
   * mounted afresh.
   */
  function mountView(view: View, el: HTMLElement, subject: Subject, { scale, options, showing, args }: Placed) {
    el.dataset.view = view.id
    const own = new Set<TermViewHandle>()
    const inner = new Set<RegionHandle>()
    /** The keys it published on the bus, once per publish: cleared with it. */
    const published: string[] = []
    let closed = false
    let mounted: Mounted | undefined
    const pending: Subject[] = []
    let seen: boolean | undefined

    const opened = lent.terminal
    const askedSpawn = lent.spawn

    const kit: Kit = {
      ...NO_KIT,
      go: unlent('go'),
      ...lent,
      spawn: askedSpawn && ((on) => askedSpawn(on, () => !closed)),
      showing,
      terminal: opened
        ? (host, path) => {
            const handle = opened(host, path)
            own.add(handle)
            return { ...handle, close: () => (own.delete(handle), handle.close()) }
          }
        : unlent('terminal'),
      region: (host, id, at, opts) => {
        const handle = regionIn(host, id, at, opts ?? {})
        inner.add(handle)
        return { ...handle, close: () => (inner.delete(handle), handle.close()) }
      },
      bus: {
        ...lentBus,
        publish: (s, of) => (published.push(s.key), lentBus.publish(s, of)),
        clear(key) {
          const at = published.indexOf(key)
          if (at < 0) return
          published.splice(at, 1)
          lentBus.clear(key)
        },
      },
    }

    const settle = async () => {
      try {
        let module: Record<string, unknown>
        try {
          module = await moduleOf(view)
        } catch (err) {
          // A module that doesn't link (a SyntaxError from its import) is newer than the modules the page holds.
          if (!(err instanceof SyntaxError)) throw err
          if (!closed) dropped(() => stale(el, view.id, err.message))
          return
        }
        const mount = module[view.export as string] as Mount | undefined
        if (typeof mount !== 'function') throw new Error(`${urlOf(view)} exports no function ${view.export}`)
        const ctx = { tower, board: board(), subject, kit, state: stateOf(view.id), options, scale, ...(args && { args }) }
        const done = (await Promise.race([
          Promise.resolve(mount(el, ctx)),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`its mount hadn't settled in ${MOUNT_MS / 1000} s`)), MOUNT_MS)),
        ])) as Mounted
        if (closed) return done.close()
        mounted = done
        if (options !== ctx.options) {
          if (!mounted.options) return remount()
          mounted.options(options)
        }
        if (seen !== undefined) mounted.visible?.(seen)
        for (const s of pending.splice(0)) if (!mounted.show?.(s)) kit.toast(`${s.key} isn't there any more`)
      } catch (err) {
        if (!closed) fail((err as Error).message)
      }
    }

    /** What was mounted closed, and `draw` in its place. */
    const dropped = (draw: () => void) => {
      const was = mounted
      mounted = undefined
      try {
        was?.close()
      } finally {
        letGo()
        draw()
      }
    }

    const fail = (why: string) => dropped(() => failed(el, view.id, why))

    const letGo = () => {
      for (const t of own) t.close()
      own.clear()
      for (const r of inner) r.close()
      inner.clear()
      for (const key of published.splice(0)) lentBus.clear(key)
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
      update(at: Subject) {
        subject = at
        try {
          mounted?.update(board(), at)
        } catch (err) {
          fail((err as Error).message)
        }
      },
      /** A subject below the one it is on; true when it took it, or will once mounted. */
      show(s: Subject): boolean {
        if (closed) return false
        if (!mounted) return (pending.push(s), true)
        return mounted.show?.(s) ?? false
      },
      visible(on: boolean) {
        seen = on
        mounted?.visible?.(on)
      },
      options(next: Record<string, unknown>) {
        options = next
        if (!mounted) return
        if (!mounted.options) return remount()
        try {
          mounted.options(next)
        } catch (err) {
          fail((err as Error).message)
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

  /**
   * A region a view asks for: one holding views mounts them by the layout; any other draws what extensions add to it,
   * the renderer's way (`fills`).
   */
  function regionIn(host: HTMLElement, id: string, subject: Subject, options: RegionOptions): RegionHandle {
    const region = declared().find((r) => r.id === id)
    if (!region?.holds.includes('views')) return fills.contributions(host, id, subject, options)
    const byView = options as Record<string, Record<string, unknown>>
    if (region.holds.some((h) => h !== 'views')) return beside(host, region, subject, byView)
    if (region.arity !== 'tabs') return one(host, region, subject, byView)
    if (!fills.tabs) throw new Error(`this renderer draws no tabs region: ${id} needs fills.tabs`)
    return fills.tabs(host, id, subject, byView)
  }

  /**
   * A region holding one view on its subject, the one the layout picks among those it offers, picked again on every
   * update and mounted again when the pick changes. A row with none to draw is hidden, as a row beside contributions
   * is: a pane with none says so.
   */
  function one(host: HTMLElement, region: Region, subject: Subject, options: Record<string, Record<string, unknown>>): RegionHandle {
    host.dataset.region = region.id
    let at = subject
    let asked = options
    let seen = true
    /** The view mounted, by id, and its host; `undefined` while none is. */
    let held: { id: string | undefined; hosted: Hosted | undefined } = { id: undefined, hosted: undefined }
    const optionsOf = (next: Record<string, Record<string, unknown>>, id: string) => ({ ...layout()[region.id]?.options?.[id], ...next[id] })
    const pick = () => pickView(board(), offeredIn(views(), region, layout(), deps.kit, at), layout()[region.id]?.order, at)

    function mount() {
      const view = pick()
      held.hosted?.close()
      const el = document.createElement('div')
      el.className = 'view-root'
      host.replaceChildren(el)
      host.hidden = !view?.module && region.scale === 'row'
      if (!view?.module) {
        if (!host.hidden) failed(el, region.id, `nothing here draws ${at.key}`)
        held = { id: view?.id, hosted: undefined }
        return
      }
      const hosted = mountView(view, el, at, { scale: region.scale, options: optionsOf(asked, view.id) })
      if (!seen) hosted.visible(false)
      held = { id: view.id, hosted }
    }

    host.dataset.subject = at.key
    mount()
    return {
      update: (next) => {
        at = next
        host.dataset.subject = next.key
        if (pick()?.id !== held.id) mount()
        else held.hosted?.update(next)
      },
      options: (next) => {
        asked = next as Record<string, Record<string, unknown>>
        if (held.id) held.hosted?.options(optionsOf(asked, held.id))
      },
      show: (s) => held.hosted?.show(s) ?? false,
      visible: (on) => ((seen = on), held.hosted?.visible(on)),
      close: () => (held.hosted?.close(), host.replaceChildren(), (host.hidden = false), delete host.dataset.region, delete host.dataset.subject),
    }
  }

  /**
   * A region holding one view beside contributions (`lines.acts`: what acts on picked lines): the view the layout picks
   * among those it offers, then what extensions add, the host hidden while it holds neither.
   */
  function beside(host: HTMLElement, region: Region, subject: Subject, options: Record<string, Record<string, unknown>>): RegionHandle {
    const viewEl = document.createElement('div')
    const acts = document.createElement('div')
    acts.className = 'region-acts'
    host.replaceChildren(viewEl, acts)
    const held = offeredIn(views(), region, layout(), deps.kit, subject).length ? one(viewEl, region, subject, options) : undefined
    const added = fills.contributions(acts, region.id, subject, {})
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

  return {
    mountView,
    region: regionIn,
    moduleOf,
    /** A view's module, when it has arrived. */
    loaded: (view: View) => modules.get(urlOf(view)),
    failed,
    /** `fn` told as each module arrives, for what waits on one. */
    onArrival: (fn: () => void) => void (arrived = fn),
  }
}
