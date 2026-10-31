import type { FloorCollection, FloorItem } from '../bridge/board.ts'
import { itemKey, itemSubject } from './subjects.ts'
import type { Mounted, ViewCtx } from './views.ts'
import { esc, span } from './cards.ts'
import { markdownHtml } from './markdown.ts'
import { itemTitles, titled, titleIn } from './titles.ts'

/**
 * Any collection's items as a renderer lists and reads them: one tray of rows per collection (title, tag, who kept it,
 * how long ago it changed), and an item read as what its type is. What opening or acting on an item means stays the
 * renderer's: a drafts row may open an editor, a games row a cabinet. The tower serves this module as `/items.js`;
 * nothing in the core imports it.
 */

type Floor = { id: string; collections: FloorCollection[] }

/** Where an item's content is read from, and served from on its own at the tower's origin (sandboxed). */
export const itemPath = (project: string, collection: string, id: string) => `collection/${project}/${collection}/${encodeURIComponent(id)}`

/** The file of an item on disk, for Finder and the editor. */
export const itemFile = (collection: Pick<FloorCollection, 'dir'>, id: string) => `${collection.dir}/${id}`

/**
 * How an item is read, by its extension: `markdown` drawn as words nobody vetted, `html` framed where it runs at an
 * origin of its own with no API, `image` shown, `text` as it is, `file` not shown at all (Finder and the editor open it).
 */
export type ItemKind = 'markdown' | 'html' | 'image' | 'text' | 'file'

const KINDS: [RegExp, ItemKind][] = [
  [/\.(md|markdown)$/i, 'markdown'],
  [/\.html?$/i, 'html'],
  [/\.(png|jpe?g|gif|webp|svg|avif)$/i, 'image'],
  [/\.(txt|json|jsonl|edn|clj|cljs|csv|tsv|ya?ml|toml|xml|js|mjs|ts|tsx|css|sh|py|rb|go|rs|sql|log)$/i, 'text'],
]

export const itemKind = (id: string): ItemKind => KINDS.find(([ext]) => ext.test(id))?.[1] ?? 'file'

/** Whether a renderer reads the item's text to show it. */
export const readsText = (kind: ItemKind) => kind === 'markdown' || kind === 'text'

/** The item's text as html safe in any element: markdown through `markdownHtml`, anything else as written. */
export const itemTextHtml = (id: string, text: string) =>
  itemKind(id) === 'markdown' ? markdownHtml(text) : `<pre class="item-text">${esc(text)}</pre>`

/**
 * Every collection's item titles, each as of its `modifiedAt` (`itemTitles`): a markdown or text item's first line, an
 * html item's `<title>`, else its tag. Only a type that names itself in its text is read. `prune` forgets the items a
 * board no longer shows.
 */
export function keptTitles(read: (project: string, collection: string, id: string) => Promise<string>, onText: () => void) {
  const byCollection = new Map<string, ReturnType<typeof itemTitles>>()
  const titlesOf = (collection: string) => {
    let titles = byCollection.get(collection)
    if (!titles) {
      titles = itemTitles(collection, (project, id) => read(project, collection, id), (item, text) => titleIn(item.id, text) ?? item.tag, onText)
      byCollection.set(collection, titles)
    }
    return titles
  }
  const title = (project: string, collection: string, item: FloorItem) => (titled(item.id) ? titlesOf(collection).title(project, item) : item.tag)
  const prune = (floors: Floor[]) => byCollection.forEach((titles) => titles.prune(floors))
  return { title, prune }
}

/** A collection's items, the one changed last first. */
export const newestFirst = (items: FloorItem[]) => [...items].sort((a, b) => b.modifiedAt - a.modifiedAt || b.id.localeCompare(a.id))

/** What a row says under its title: the tag (unless it is the title), who kept it, and how long ago it last changed. */
export const itemMeta = (item: FloorItem, title: string, now: number) =>
  [title === item.tag ? '' : item.tag, item.keptBy?.callsign, `${span(now - item.modifiedAt)} ago`].filter(Boolean).join(' · ')

/** The value of a row's `data-kept`: which item a click on it names, read back with `keptOf`. */
export const keptKey = (project: string, collection: string, id: string) => `${project}|${collection}|${id}`
export const keptOf = (key: string) => {
  const [project, collection, ...id] = key.split('|')
  return { project, collection, id: id.join('|') }
}

/** One item as a button carrying `data-kept`; `open` marks the one shown. */
export const itemRowHtml = (project: string, collection: string, item: FloorItem, title: string, open: boolean, now: number) =>
  `<button class="kept-row ${open ? 'sel' : ''}" data-kept="${esc(keptKey(project, collection, item.id))}"${open ? ' aria-current="true"' : ''} data-tip="${esc(`${title}\n${item.id}`)}">` +
  `<span class="t">${esc(title)}</span><span class="meta">${esc(itemMeta(item, title, now))}</span></button>`

const trayHtml = (c: FloorCollection, actions: string, rows: string) =>
  `<div class="kept-tray"><div class="kept-head eyebrow">${esc(c.label)}${actions}</div>` +
  (c.description ? `<div class="kept-about">${esc(c.description)}</div>` : '') +
  (rows || '<div class="kept-empty">none kept</div>') +
  '</div>'

const rowsHtml = (project: string, c: FloorCollection, items: FloorItem[], title: (item: FloorItem) => string, open: string | undefined, now: number) =>
  items.map((item) => itemRowHtml(project, c.id, item, title(item), item.id === open, now)).join('')

/**
 * A collection unfolded: its label with `actions` (a renderer's own buttons, such as a new draft), what it is for, and
 * a row per item, newest first. `open`: the id of the item shown, if it is in this collection.
 */
export const collectionTrayHtml = (
  project: string,
  c: FloorCollection,
  title: (item: FloorItem) => string,
  open: string | undefined,
  now: number,
  actions = '',
) => trayHtml(c, actions, rowsHtml(project, c, newestFirst(c.items), title, open, now))

/** How many of a collection's newest items a tray beside other things lists before it leads to the whole collection. */
export const TRAY_ROWS = 6

/**
 * A collection unfolded as `collectionTrayHtml` does, bounded to its `TRAY_ROWS` newest items, then `more`: what the
 * renderer draws to lead to the rest, given how many there are.
 */
export const collectionPeekHtml = (
  project: string,
  c: FloorCollection,
  title: (item: FloorItem) => string,
  open: string | undefined,
  now: number,
  more: (rest: number) => string,
  actions = '',
) => {
  const items = newestFirst(c.items)
  const rest = items.length - TRAY_ROWS
  return trayHtml(c, actions, rowsHtml(project, c, items.slice(0, TRAY_ROWS), title, open, now) + (rest > 0 ? more(rest) : ''))
}

/** What a renderer asks before deleting an item: deleting is the user's, and a deleted item is gone for good. */
export const deleteAsk = (c: Pick<FloorCollection, 'label'>, item: FloorItem, title: string) =>
  `Delete ${title === item.tag ? item.tag : `"${title}" (${item.tag})`} from ${c.label}?\n\nThe file is deleted for good.`

/** The rows' and trays' look, from the design's tokens. */
export const itemsCss = `
.kept-tray { padding: var(--sp-m) 0 0; }
.kept-head { display: flex; align-items: center; gap: var(--sp-2xs); padding: 0 var(--sp-2xs) 0 var(--sp-m); }
.kept-head > :first-child { margin-left: auto; }
.kept-head button { display: grid; place-items: center; min-width: var(--control); min-height: var(--control); background: none; border: none; padding: 0; color: var(--muted); }
.kept-head button .icon { width: var(--icon-m); height: var(--icon-m); }
.kept-head button:hover { color: var(--ink); }
.kept-about { padding: var(--sp-2xs) var(--sp-m) var(--sp-xs); color: var(--faint); font-size: var(--fs-xs); line-height: 1.35; }
.kept-empty { color: var(--faint); font-style: italic; font-size: var(--fs-s); padding: var(--sp-2xs) var(--sp-m); }
.kept-row { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr); padding: var(--sp-xs) var(--sp-m); border: none; border-radius: var(--radius); background: none;
  font: inherit; font-size: var(--fs-s); font-weight: 400; text-align: left; color: var(--muted); cursor: pointer; white-space: nowrap; }
.kept-row .t { overflow: hidden; text-overflow: ellipsis; }
.kept-row .meta { overflow: hidden; text-overflow: ellipsis; color: var(--faint); font: var(--fs-xs)/1.4 var(--mono); letter-spacing: .02em; }
.kept-row:hover, .kept-row.sel { background: var(--panel-2); color: var(--ink); }
.kept-row.sel { box-shadow: inset 3px 0 0 var(--p, var(--ink)); }
.kept-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.item-text { margin: 0; white-space: pre-wrap; font: var(--fs-m)/1.5 var(--mono); }
.tray { max-width: 100%; min-height: var(--control); padding: 0 var(--sp-m); font-size: var(--fs-xs); font-weight: 400; color: var(--muted); background: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tray b { color: var(--ink); font-variant-numeric: tabular-nums; }
.tray i { font-style: normal; font-weight: 700; color: var(--broken-text); }
.tray i.needs { color: var(--needs-text); }
.tray:hover { color: var(--ink); }
.tray.on { color: var(--ink); border-color: var(--ink); box-shadow: var(--selected); }
.tray-open { order: 1; flex-basis: 100%; min-width: 0; }
.kept-more { display: block; min-height: var(--control); padding: 0 var(--sp-m); border: none; background: none; color: var(--muted); font-size: var(--fs-xs); font-weight: 700; }
.kept-more:hover { color: var(--ink); }
`

/**
 * A tray's button, one collection folded to a count in a row of them: `label` its words as HTML, `tip` what it holds.
 * One that unfolds under the row says whether it is (`foldTrayHtml`); one that opens a view says whether that view is
 * open (`pressTrayHtml`). Its unfolded part is drawn in `.tray-open`, which a row laid out as a wrapping flex places
 * under every tray of the row.
 */
const trayButtonHtml = (state: string, on: boolean, label: string, tip: string) =>
  `<button class="tray${on ? ' on' : ''}" ${state}="${on}" data-tray data-tip="${esc(tip)}">${label}</button>`

export const foldTrayHtml = (unfolded: boolean, label: string, tip: string) => trayButtonHtml('aria-expanded', unfolded, label, tip)

export const pressTrayHtml = (open: boolean, label: string, tip: string) => trayButtonHtml('aria-pressed', open, label, tip)

/** The id of the item of `collection` on the floor `project` that a location is on, if it is on one. */
export const openItemOf = (location: { subject?: string } | undefined, project: string, collection: string) => {
  const prefix = itemKey(project, collection, '')
  return location?.subject?.startsWith(prefix) ? location.subject.slice(prefix.length) : undefined
}

/**
 * What a floor's tray of one collection draws its own way: its `icon`, and its items' `titles`, made from a read of an
 * item's text and what to call once a text arrives. `actions`, buttons beside its label once unfolded, each a
 * `data-act` that `act` is handed. `keptTrayTitles` titles items as every collection's are.
 */
export type KeptTray = {
  icon: string
  titles: (collection: string, read: (project: string, id: string) => Promise<string>, onText: () => void) => (project: string, item: FloorItem) => string
  actions?: string
  act?: (name: string) => void
}

/** An item's title as every collection's are titled (`keptTitles`): its text's first line or `<title>`, else its tag. */
export const keptTrayTitles: KeptTray['titles'] = (collection, read, onText) => {
  const titles = itemTitles(collection, read, (item, text) => titleIn(item.id, text) ?? item.tag, onText)
  return (project, item) => (titled(item.id) ? titles.title(project, item) : item.tag)
}

/**
 * A collection as a tray in a floor's row of them, the shape of `tower/tray` and of an extension's tray for its own
 * collection: its count, unfolding to its newest items (`collectionPeekHtml`), the one the renderer has open marked,
 * then a way to every item in `tower/collection`. A collection with no items draws nothing. A row opens its item where
 * the renderer displays it; whether it is unfolded is kept in the view's state, by the collection's key.
 */
export function mountKeptTray(host: HTMLElement, ctx: ViewCtx, id: string, tray: KeptTray): Mounted {
  const { tower, kit, state } = ctx
  let subject = ctx.subject
  const collection = () => subject.value as FloorCollection & { project: string }
  const unfoldedKey = `unfolded.${subject.key}`
  let unfolded = false
  const title = tray.titles(collection().id, (project, item) => tower.text(itemPath(project, collection().id, item)), () => draw())
  let painted = ''
  const paint = (html: string) => void (html !== painted && (host.innerHTML = painted = html))

  const draw = () => {
    const c = collection()
    if (!c.items.length) return paint('')
    const label = `${tray.icon} <b>${c.items.length}</b> in ${esc(c.label.toLowerCase())}`
    const more = (rest: number) => `<button class="kept-more" data-more data-tip="all ${c.items.length} in ${esc(c.label.toLowerCase())}, in the main pane">+${rest} more</button>`
    const open = openItemOf(kit.location?.(), c.project, c.id)
    paint(
      `<style>:where([data-view="${id}"]) { ${itemsCss} }</style>${foldTrayHtml(unfolded, label, `${c.label}: ${c.description ?? 'items kept for later'}`)}` +
        (unfolded ? `<div class="tray-open">${collectionPeekHtml(c.project, c, (item) => title(c.project, item), open, Date.now(), more, tray.actions)}</div>` : ''),
    )
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const c = collection()
    if (target.closest('[data-tray]')) {
      unfolded = !unfolded
      state.set(unfoldedKey, unfolded)
      return draw()
    }
    if (target.closest('[data-more]')) return kit.display(subject, { view: 'tower/collection' })
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act
    if (act) return tray.act?.(act)
    const kept = target.closest<HTMLElement>('[data-kept]')?.dataset.kept
    const item = kept && c.items.find((i) => i.id === keptOf(kept).id)
    if (item) kit.display(itemSubject(c.project, c.id, item))
  })

  void state.get(unfoldedKey).then((v) => {
    unfolded = v === true
    draw()
  })
  draw()

  return {
    update(_board, next) {
      subject = next
      draw()
    },
    close() {},
  }
}

