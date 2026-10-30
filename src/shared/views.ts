import type { Board } from '../bridge/board.ts'
import type { ExtensionViewEntry, Words } from './extensions.ts'
import type { Tower } from './shelf-page.ts'
import type { TermViewHandle } from './term-view.ts'
import { accepted, mediaTypeOf } from './media.ts'
import type { KitMember, Layout, Region, Scale } from './regions.ts'
import { onKind, parentOf, subjectAt, type Subject, type Text } from './subjects.ts'

/**
 * Views (decision `ui-model`): modules that draw one subject into an element a region gives them, the core's and
 * extensions' alike, picked by the layout and reached through locations and display. Pure: every renderer that hosts
 * views reads them the same way. The tower serves this module as `/views.js`.
 */

/**
 * A view as a renderer offers it: `id` `<cap>/<name>`, the kinds it mounts `on` and those it `shows`, the media types
 * it `accepts`, the `scales` it draws at, the kit members it `needs`, the regions it declares inside it. A core view
 * with no `module` is drawn by the renderer's own route for it until its module ships.
 */
export type View = Omit<ExtensionViewEntry, 'module' | 'export'> & { cap: string; module?: string; export?: string; off?: string[] }

/**
 * Where a renderer is: the view in its main region and the subject it is on, by key; `pane`, the tab open in that
 * view's tabs region; `args`, the view's own (a shelf entry's file).
 */
export type Location = { view: string; subject?: string; pane?: { view: string; subject?: string }; args?: string[] }

/**
 * What a view is handed as it mounts. `state` is `tower.store` under `view.<id>.<key>`, the view's own; `scale`, the
 * scale of the region it is mounted in, where that region declares one (@since 1.112); `args`, its location's (a shelf entry's file).
 */
export type ViewCtx = {
  tower: Tower
  board: Board
  subject: Subject
  kit: Kit
  state: { get(key: string): Promise<unknown>; set(key: string, value: unknown): void }
  options: Record<string, unknown>
  scale?: Scale
  args?: string[]
}

/**
 * A mounted view. `update`: each board while it is mounted, its subject as it stands now; `show`: display handed it a
 * subject below the one it is on, true when it took it; `visible`: another tab was shown over it, or it came back;
 * `options`: its options as they stand now, drawn in place (@since 1.113). A view without `options` is mounted afresh.
 */
export type Mounted = {
  update(board: Board, subject: Subject): void
  show?(subject: Subject): boolean
  visible?(on: boolean): void
  tab?(): TabWords | undefined
  options?(options: Record<string, unknown>): void
  close(): void
}

/**
 * What a view's tab says beside its label in a tabs region: a tally (`text`, its own `tip`, `tone` `unseen` drawn
 * louder) and the tab's tip (`hint`, over the view's words). A view's `tab` export answers it from the board alone, and
 * `undefined` where the view has no tab on the subject; a mounted view's `tab()` answers it from what it read, and the
 * view dispatches a bubbling `tab` event on its host when that changes, for the region to draw its tab again. @since 1.111
 */
export type TabWords = { text?: string; tip?: string; tone?: 'unseen'; hint?: string }

/** A view's `tab` export. @since 1.111 */
export type Tab = (board: Board, subject: Subject) => TabWords | undefined

/** A view's module's export: mounts the view into `host`, the renderer's element, which the view draws only inside. */
export type Mount = (host: HTMLElement, ctx: ViewCtx) => Mounted | Promise<Mounted>

/**
 * What a renderer lends a view: a terminal mounted with its xterm, font, scheme and keymap; `region`, one of the
 * renderer's regions inside the view, on `subject`, filled the renderer's way and run by its presses; `run` a keymap
 * command or an extension's `<cap>/<name>` on a subject or the one in focus; `display` a subject, or its key; `go` to
 * a location; a toast; a confirm whose button says `verb`. A renderer lends what its `renderer.json` kit names.
 */
export type Kit = {
  terminal(host: HTMLElement, path: `terminal/${string}` | `shell/${string}`): TermViewHandle
  region(host: HTMLElement, id: string, subject: Subject, options?: RegionOptions): RegionHandle
  run(command: string, on?: Subject): Promise<boolean>
  display(subject: Subject | string, opts?: { view?: string }): void
  go(location: Location): void
  toast(text: string, action?: { label: string; run(): void }): void
  confirm(text: string, verb: string): Promise<boolean>
}

/**
 * What a view asks a region for beside its subject: one holding views takes each view's options by view id, laid over
 * the layout's; one holding contributions takes `omit`, the commands (`<cap>/<name>`) it leaves out. @since 1.113
 */
export type RegionOptions = Record<string, Record<string, unknown>> | { omit: string[] }

/**
 * A region a view asked the kit for: `update` with its subject as it stands; one holding views is handed `show`, a
 * subject below its own, true when a view in it took it (a tabs region opens that view's tab), `visible`, whether
 * the view holding it is seen, which it passes to the views it shows (@since 1.111), and `options`, the options it
 * was asked with as they stand now (@since 1.113).
 */
export type RegionHandle = { update(subject: Subject): void; show?(subject: Subject): boolean; visible?(on: boolean): void; options?(options: RegionOptions): void; close(): void }

/** The part of the kit a command is lent, as `ctx.kit`: it has no host to draw a terminal in. */
export type CommandKit = Pick<Kit, 'display' | 'toast' | 'confirm' | 'run'>

const core = (id: string, on: string[], scales: Scale[], words: Words): View => ({ id, cap: 'tower', on, scales, words })

/** A core view whose module the tower serves at `/x/tower/<name>.js`, its export `mount`, lent the kit members it `needs`. */
const served = (view: View, needs: KitMember[]): View => ({ ...view, module: `${view.id.slice('tower/'.length)}.js`, export: 'mount', needs })

/** A core view on every collection's item that draws the media types it `accepts`. */
const byType = (name: string, accepts: string[], words: Words): View => served({ ...core(`tower/${name}`, ['item.*'], ['pane'], words), accepts }, ['region', 'display', 'toast', 'confirm'])

/** A core view drawn in a worker's tabs, on its card, handed the kinds in `shows`. */
const pane = (name: string, shows: string[], words: Words, needs: KitMember[]): View => served({ ...core(`tower/${name}`, ['card'], ['pane'], words), ...(shows.length && { shows }) }, needs)

/**
 * The core's views, in the order that picks among them: the worker view first among those on a card, then its tabs,
 * the archive first among those on a floor. The views by type follow, `tower/file` the fallback, accepting none.
 */
export const CORE_VIEWS: readonly View[] = [
  served(core('tower/skyline', ['board'], ['pane'], { label: 'Skyline', hint: 'every floor and who works on it' }), ['display', 'run']),
  served({ ...core('tower/card', ['card'], ['pane', 'cell'], { label: 'Worker', hint: "the worker's head and its tabs" }), regions: ['card.panes'] }, ['region', 'run', 'display', 'toast', 'confirm']),
  pane('terminal', [], { label: 'Terminal', hint: 'the session in its terminal' }, ['terminal']),
  { ...pane('brief', ['conversation'], { label: 'Brief', hint: 'the last prompts and answers of each conversation, in full' }, ['region', 'toast']), tab: 'tab' },
  pane('changes', ['lines'], { label: 'Changes', hint: "what changed in the worker's repos, as git reads it" }, ['toast', 'confirm']),
  served(core('tower/shown', ['shown'], ['pane'], { label: 'Shown', hint: 'what the worker showed, as the tower draws its kind' }), []),
  served(core('tower/archive', ['floor'], ['pane'], { label: 'Archive', hint: "the floor's past workers" }), ['display', 'toast']),
  served(core('tower/collection', ['collection'], ['pane'], { label: 'Collection', hint: "a collection's items" }), ['display']),
  served(core('tower/shelf', ['shelf'], ['pane'], { label: 'Shelf', hint: 'a shelf entry' }), ['display', 'go', 'toast']),
  byType('document', ['text/markdown'], { label: 'Document', hint: 'the markdown drawn as a document' }),
  byType('html', ['text/html'], { label: 'Page', hint: 'the page, running framed at an origin of its own' }),
  byType('image', ['image/*'], { label: 'Image', hint: 'the image' }),
  byType('video', ['video/*'], { label: 'Video', hint: 'the video, playing' }),
  byType('text', ['text/*', 'application/json', 'application/x-ndjson'], { label: 'Text', hint: 'its text as written' }),
  byType('file', [], { label: 'File', hint: 'the file, left to Finder and the editor' }),
]

/** The core's view by type for an item of type `type`: the most specific `accepts`, else the fallback. */
export const coreViewOf = (type: string): View => {
  const items = CORE_VIEWS.filter((v) => v.on.includes('item.*'))
  return bestFit(items.filter((v) => fit(v.accepts, type)), type) ?? (items.find((v) => !v.accepts?.length) as View)
}

/** Every view: the core's, then each started extension's, in the board's order. */
export const viewsOf = (board: Board): View[] => [
  ...CORE_VIEWS,
  ...board.extensions
    .filter((e) => e.state === 'started')
    .flatMap((e) => e.views.map((v): View => ({ ...v, cap: e.provides, ...(e.off?.length && { off: e.off }) }))),
]

type LayoutEntry = Layout[string]

/**
 * The layout a renderer draws by, three layers each over the one before: its own (`renderer.json`), the config's, the
 * viewer's (`tower.store`'s `layout.<renderer>`). For each region, each field is the highest layer's that sets it,
 * every view's options apart; `hidden` is the layers' union, less each view a higher layer names in its `order`.
 */
export const layoutOf = (declared: Layout, configured: Layout, stored: Layout | undefined): Layout => {
  const layers = [declared, configured, stored ?? {}]
  const regions = [...new Set(layers.flatMap((l) => Object.keys(l)))]
  return Object.fromEntries(
    regions.map((id) => {
      const at = layers.map((l) => l[id] ?? {})
      const last = <K extends keyof LayoutEntry>(field: K) => at.findLast((e) => e[field] !== undefined)?.[field]
      const hidden = at.flatMap((e, n) => (e.hidden ?? []).filter((v) => !at.slice(n + 1).some((above) => above.order?.includes(v))))
      const options = Object.assign({}, ...at.map((e) => e.options ?? {}))
      const entry: LayoutEntry = {
        ...(last('order') && { order: last('order') }),
        ...(hidden.length && { hidden: [...new Set(hidden)] }),
        ...(last('open') && { open: last('open') }),
        ...(Object.keys(options).length && { options }),
      }
      return [id, entry]
    }),
  )
}

/** Whether a view's `on` holds `subject`: its kind, `item.*` for any collection's item, `collection.<id>` for that one collection. */
export const viewOn = (on: readonly string[], subject: Pick<Subject, 'kind' | 'value'>) =>
  onKind(on, subject.kind) || (subject.kind === 'collection' && on.includes(`collection.${(subject.value as { id: string }).id}`))

/**
 * The views `region` offers on `subject`: those on it (`viewOn`), at the region's scale, needing only what `kit`
 * lends, not hidden there, on a floor their extension is on.
 */
export const offeredIn = (views: View[], region: Region, layout: Layout, kit: readonly KitMember[], subject: Subject): View[] =>
  views.filter(
    (v) =>
      viewOn(v.on, subject) &&
      (!region.scale || v.scales.includes(region.scale)) &&
      (v.needs ?? []).every((m) => (kit as readonly string[]).includes(m)) &&
      !layout[region.id]?.hidden?.includes(v.id) &&
      !(subject.project !== undefined && v.off?.includes(subject.project)),
  )

/** `views` in a region's layout `order`, the rest after in their own. */
export const ordered = (views: View[], order: string[] | undefined) =>
  order ? [...order.flatMap((id) => views.filter((v) => v.id === id)), ...views.filter((v) => !order.includes(v.id))] : views

/** The capability whose extension declares the collection `subject` is an item of, when its floor carries one. */
const ownerOf = (board: Board, subject: Subject): string | undefined => {
  const { collection, project } = subject.value as { collection?: string; project?: string }
  return board.floors.find((f) => f.id === project)?.collections.find((c) => c.id === collection)?.by
}

/** A media type's specificity in `accepts`: 2 exact, 1 by its top-level type's wildcard, 0 none. */
const fit = (accepts: string[] | undefined, type: string) => (accepts?.includes(type) ? 2 : accepted(accepts ?? [], type) ? 1 : 0)

/** The view among `views` whose `accepts` fits `type` most specifically, the first in order among equals. */
const bestFit = (views: View[], type: string) => [...views].sort((a, b) => fit(b.accepts, type) - fit(a.accepts, type))[0]

/**
 * The view that draws `subject` among those a region offers (`offered`, in `viewsOf` order), by `order`, the region's
 * layout order. A subject bearing a type: the first in order that accepts it; else the view of the extension declaring
 * the subject's collection, on that exact kind; else the core view accepting it most specifically; else the most specific `accepts`; else
 * a fallback, a view accepting nothing. One bearing none: the first in order; the owner's on that exact kind; the first.
 */
export const pickView = (board: Board, offered: View[], order: string[] | undefined, subject: Subject): View | undefined => {
  const type = (subject.value as Text).type
  const owner = ownerOf(board, subject)
  const owned = offered.find((v) => v.cap === owner && v.on.includes(subject.kind))
  const firstIn = (views: View[]) => order?.map((id) => views.find((v) => v.id === id)).find((v) => v !== undefined)
  if (type === undefined) return firstIn(offered) ?? owned ?? offered[0]
  const accepting = offered.filter((v) => fit(v.accepts, type))
  return (
    firstIn(accepting) ??
    (owned && fit(owned.accepts, type) ? owned : undefined) ??
    bestFit(accepting.filter((v) => v.cap === 'tower'), type) ??
    bestFit(accepting, type) ??
    offered.find((v) => !v.accepts?.length)
  )
}

/** Everything display reads to place a subject: the board, every view, the regions declared, the layout and the kit. */
export type Placing = { board: Board; views: View[]; regions: Region[]; layout: Layout; kit: readonly KitMember[]; main: Region }

/** The views a level's main region offers on `subject`, the layout's order first. */
const mainViews = (p: Placing, subject: Subject) => ordered(offeredIn(p.views, p.main, p.layout, p.kit, subject), p.layout[p.main.id]?.order)

/** The subject `subject` is of, as the board holds it now. */
const parent = (board: Board, subject: Subject) => {
  const key = parentOf(subject)
  return key === undefined ? undefined : subjectAt(board, key)
}

/** `subject` and each subject it is of, outward to the board. */
const chainOf = (board: Board, subject: Subject): Subject[] => {
  const up = parent(board, subject)
  return [subject, ...(up ? chainOf(board, up) : [])]
}

/** A tab of a tabs region in `host` on `level` that has a view for `below`, by `pick`: the region's own subject's, or `below`'s. */
const tabFor = (p: Placing, host: View, level: Subject, below: Subject, pick: (offered: View[]) => View | undefined) =>
  (host.regions ?? [])
    .map((id) => p.regions.find((r) => r.id === id && r.arity === 'tabs' && onKind([r.subject], level.kind)))
    .flatMap((region) => {
      if (!region) return []
      const offered = p.views.filter(
        (v) => (viewOn(v.on, below) || onKind(v.shows ?? [], below.kind)) && (!region.scale || v.scales.includes(region.scale)) && !p.layout[region.id]?.hidden?.includes(v.id),
      )
      const view = pick(ordered(offered, p.layout[region.id]?.order))
      return view ? [{ view: view.id, subject: viewOn(view.on, level) ? level.key : below.key }] : []
    })[0]

/**
 * Where display puts `subject` (§9 of the UI model): up its chain, itself first, to the nearest level whose main view
 * hosts the level below as a tab, else the first level with a main view of its own; that view mounted on that level,
 * the tab opened. `view` narrows the walk: the deepest level offering it, as a tab before as the main view. `undefined`
 * when no level offers what was asked. A renderer hands the main view `show(subject)` when it is on a subject above it.
 */
export const displayed = (p: Placing, subject: Subject, view?: string): Location | undefined => {
  const chain = chainOf(p.board, subject)
  const hostAt = (n: number) => {
    const level = chain[n]
    const offered = mainViews(p, level)
    return { level, offered, main: pickView(p.board, offered, p.layout[p.main.id]?.order, level) }
  }
  if (view) {
    for (let n = 0; n < chain.length; n++) {
      const { level, main } = hostAt(n)
      const tab = main && main.id !== view ? tabFor(p, main, level, chain[Math.max(n - 1, 0)], (o) => o.find((v) => v.id === view)) : undefined
      if (tab) return { view: main!.id, subject: level.key, pane: tab }
    }
    const at = chain.find((level) => mainViews(p, level).some((v) => v.id === view))
    return at && { view, subject: at.key }
  }
  for (let n = 1; n < chain.length; n++) {
    const { level, main } = hostAt(n)
    const tab = main && tabFor(p, main, level, chain[n - 1], (o) => pickView(p.board, o, undefined, chain[n - 1]))
    if (tab) return { view: main!.id, subject: level.key, pane: tab }
  }
  for (let n = 0; n < chain.length; n++) {
    const { level, main } = hostAt(n)
    if (main) return { view: main.id, subject: level.key }
  }
  return undefined
}

/**
 * The views a region holding commands on `subject` draws as "Open <label>": each on its kind that the main region
 * offers, accepting its type when it bears one, and none already on screen for it: not `picked`, the one drawing it,
 * nor `beside`, the view hosting the region or a tab on the same subject.
 */
export const openable = (p: Placing, subject: Subject, beside: readonly string[]): View[] => {
  const type = (subject.value as Text).type
  const offered = mainViews(p, subject)
  const picked = pickView(p.board, offered, p.layout[p.main.id]?.order, subject)
  return offered.filter((v) => v !== picked && !beside.includes(v.id) && (type === undefined || fit(v.accepts, type) > 0))
}

const segment = (part: string) => encodeURIComponent(part)

/**
 * The hash naming `location`, by its grammar: `#v/<cap>/<name>[/<key>[/<arg>…]][;<cap>/<name>[/<key>]]`, every key
 * and arg one encoded segment, so `;` never appears in one.
 */
export const hashOf = (location: Location): string => {
  const main = [location.view, ...(location.subject === undefined ? [] : [segment(location.subject), ...(location.args ?? []).map(segment)])].join('/')
  const pane = location.pane && [location.pane.view, ...(location.pane.subject === undefined ? [] : [segment(location.pane.subject)])].join('/')
  return `#v/${main}${pane ? `;${pane}` : ''}`
}

/** The page's panes before views, and the view each is now. */
const PANE_VIEWS: Record<string, string> = { screen: 'tower/terminal', brief: 'tower/brief', changes: 'tower/changes', reviews: 'reviews/thread' }

/** The latest showing of `target` on the card `id`, as the board holds it. */
const latestShown = (board: Board, id: string, target: string) =>
  board.floors
    .flatMap((f) => f.cards)
    .find((c) => c.id === id)
    ?.shown.filter((s) => s.target === target)
    .at(-1)

/** A location the hash's short form names, as the tower page wrote them before the grammar: kept for every link the user has. */
const shortForm = (body: string, board: Board): Location | undefined => {
  const [kind, project, ...rest] = body.split('/')
  const decoded = (part: string | undefined) => (part === undefined ? undefined : decodeURIComponent(part))
  if (kind === 'shelf') return { view: 'tower/shelf', subject: `shelf:${project}/${rest[0]}`, ...(rest[1] !== undefined && { args: [decoded(rest[1])!] }) }
  if (kind === 'draft') return rest[0] === undefined ? { view: 'drafts/editor', subject: `collection:${project}/drafts` } : { view: 'drafts/editor', subject: `item.drafts:${project}/${decoded(rest[0])}` }
  if (kind === 'archive') return { view: 'tower/archive', subject: `floor:${project}` }
  if (kind === 'policies') return { view: 'policies/policies', subject: `floor:${project}` }
  if (kind === 'kept') {
    const [collection, id] = rest
    if (id === undefined) return { view: 'tower/collection', subject: `collection:${project}/${collection}` }
    const name = decoded(id)!
    return { view: coreViewOf(mediaTypeOf(name)).id, subject: `item.${collection}:${project}/${name}` }
  }
  const pane = decoded(project)
  const card = { view: 'tower/card', subject: `card:${kind}` }
  if (pane === undefined) return card
  if (PANE_VIEWS[pane]) return { ...card, pane: { view: PANE_VIEWS[pane] } }
  if (!pane.startsWith('shown:')) return card
  const shown = latestShown(board, kind, pane.slice('shown:'.length))
  return shown ? { ...card, pane: { view: 'tower/shown', subject: `shown:${kind}/${shown.at}` } } : card
}

/** A subject key's floor and what follows it: `collection:p/notes` is `p` and `notes`. */
const inFloor = (key: string) => {
  const rest = key.slice(key.indexOf(':') + 1)
  return { project: rest.slice(0, rest.indexOf('/')), name: rest.slice(rest.indexOf('/') + 1) }
}

/**
 * The short form of a location the tower page wrote before the grammar, which it keeps writing: `''` for the skyline,
 * `#archive/<p>`, `#policies/<p>`, `#kept/<p>/<c>`, `#kept/<p>/<c>/<id>` for an item in the core's view for its type,
 * `#shelf/<p>/<n>[/<file>]`, `#draft/<p>[/<id>]`; `undefined` for a
 * location that has none. `locationOf` reads each back.
 */
export const shortHashOf = (location: Location): string | undefined => {
  const key = location.subject ?? 'board'
  const kind = key.slice(0, key.indexOf(':'))
  const floor = key.slice(key.indexOf(':') + 1)
  const { project, name } = inFloor(key)
  switch (location.view) {
    case 'tower/skyline':
      return key === 'board' ? '' : undefined
    case 'tower/archive':
      return kind === 'floor' ? `#archive/${floor}` : undefined
    case 'policies/policies':
      return kind === 'floor' ? `#policies/${floor}` : undefined
    case 'tower/collection':
      return kind === 'collection' ? `#kept/${project}/${name}` : undefined
    case 'tower/shelf':
      return kind === 'shelf' ? `#shelf/${project}/${name}${location.args?.[0] === undefined ? '' : `/${segment(location.args[0])}`}` : undefined
    case 'drafts/editor':
      return kind === 'collection' ? `#draft/${project}` : kind === 'item.drafts' ? `#draft/${project}/${segment(name)}` : undefined
    default:
      return kind.startsWith('item.') && location.view === coreViewOf(mediaTypeOf(name)).id ? `#kept/${project}/${kind.slice('item.'.length)}/${segment(name)}` : undefined
  }
}

/**
 * The location `hash` names (`location.hash`, with or without its `#`): by the grammar `hashOf` writes, or a short
 * form the tower page wrote before it, which `board` resolves where it names a showing by its target. `undefined`
 * for the empty hash, the skyline's, and for one that names no view.
 */
export const locationOf = (hash: string, board: Board): Location | undefined => {
  const body = hash.replace(/^#/, '')
  if (!body) return undefined
  if (!body.startsWith('v/')) return shortForm(body, board)
  const [main, pane] = body.slice(2).split(';')
  const [cap, name, key, ...args] = main.split('/')
  if (!cap || !name) return undefined
  const [paneCap, paneName, paneKey] = pane?.split('/') ?? []
  return {
    view: `${cap}/${name}`,
    ...(key !== undefined && { subject: decodeURIComponent(key) }),
    ...(paneCap && paneName && { pane: { view: `${paneCap}/${paneName}`, ...(paneKey !== undefined && { subject: decodeURIComponent(paneKey) }) } }),
    ...(args.length && { args: args.map(decodeURIComponent) }),
  }
}
