import type { FloorCollection, FloorItem } from '../bridge/board.ts'
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
) =>
  `<div class="kept-tray"><div class="kept-head">${esc(c.label)}${actions}</div>` +
  (c.description ? `<div class="kept-about">${esc(c.description)}</div>` : '') +
  (newestFirst(c.items).map((item) => itemRowHtml(project, c.id, item, title(item), item.id === open, now)).join('') || '<div class="kept-empty">none kept</div>') +
  '</div>'

/** What a renderer asks before deleting an item: deleting is the user's, and a deleted item is gone for good. */
export const deleteAsk = (c: Pick<FloorCollection, 'label'>, item: FloorItem, title: string) =>
  `Delete ${title === item.tag ? item.tag : `"${title}" (${item.tag})`} from ${c.label}?\n\nThe file is deleted for good.`

/** The rows' and trays' look, from the design's tokens. */
export const itemsCss = `
.kept-tray { padding: 8px 2px 0; }
.kept-head { display: flex; align-items: center; gap: 2px; padding: 0 2px 0 8px; color: var(--faint); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.kept-head > :first-child { margin-left: auto; }
.kept-head button { background: none; border: none; padding: 0 6px; color: var(--faint); font-size: 15px; font-weight: 400; }
.kept-head button:hover { color: var(--ink); }
.kept-about { padding: 2px 8px 4px; color: var(--faint); font-size: 11px; line-height: 1.35; }
.kept-empty { color: var(--faint); font-style: italic; font-size: 12px; padding: 2px 8px; }
.kept-row { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr); padding: 3px 8px; border: none; border-radius: var(--radius); background: none;
  font: inherit; font-size: 12px; font-weight: 400; text-align: left; color: var(--muted); cursor: pointer; white-space: nowrap; }
.kept-row .t { overflow: hidden; text-overflow: ellipsis; }
.kept-row .meta { overflow: hidden; text-overflow: ellipsis; color: var(--faint); font: 10px/1.4 var(--mono); letter-spacing: .02em; }
.kept-row:hover, .kept-row.sel { background: var(--panel-2); color: var(--ink); }
.kept-row.sel { box-shadow: inset 3px 0 0 var(--p, var(--ink)); }
.kept-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.item-text { margin: 0; white-space: pre-wrap; font: 13px/1.5 var(--mono); }
`
