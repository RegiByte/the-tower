import type { Floor } from '../bridge/board.ts'
import { esc } from './format.ts'
import { type Renderer, type ShelfEntry, shelfItem } from './model.ts'

/** Shelf entries and declared renderers: how each is drawn and opened, and where its files are. */

/** Where a declared renderer is served. */
export const rendererUrl = (name: string) => `/r/${encodeURIComponent(name)}/`

/** How a shelf entry is drawn and opened: an `item` entry is read as markdown when it is one, framed as a page otherwise. */
export const shelfKind = (entry: ShelfEntry): 'html' | 'md' | 'url' | 'link' | 'renderer' => {
  if ('item' in entry) return entry.item.endsWith('.md') ? 'md' : 'html'
  if ('html' in entry) return 'html'
  if ('md' in entry) return 'md'
  if ('url' in entry) return 'url'
  if ('link' in entry) return 'link'
  return 'renderer'
}

/** The page an `html` or `item` entry frames, as its `/shelf/<project>/<n>/<file>` names it. */
export const shelfPage = (entry: ShelfEntry): string => ('item' in entry ? shelfItem(entry).id : 'html' in entry ? entry.html : '')

/** Where an entry's content comes from, as the config names it: a path, a glob, a URL, a renderer's or an item's. */
export const shelfSource = (entry: ShelfEntry): string =>
  'html' in entry ? entry.html
  : 'md' in entry ? entry.md
  : 'url' in entry ? entry.url
  : 'link' in entry ? entry.link
  : 'item' in entry ? entry.item
  : rendererUrl(entry.renderer)

const GLOB_PATTERN = /[*?[\]{}]/

/** The folder of a path, relative to its hub: `.` for one at the hub's top. */
const parentOf = (rel: string): string => rel.split('/').slice(0, -1).join('/') || '.'

/** The folder a glob's files sit in: its leading segments that name no pattern. */
const globFolder = (glob: string): string => {
  const segments = glob.split('/')
  const pattern = segments.findIndex((segment) => GLOB_PATTERN.test(segment))
  return pattern === -1 ? parentOf(glob) : segments.slice(0, pattern).join('/') || '.'
}

/** A path the config names relative to a hub, as it is on disk. */
export const onDisk = (hub: string, rel: string): string => (rel === '.' ? hub : `${hub}/${rel}`)

/**
 * The files an entry's head offers on disk, for Finder and the editor: the file a page shows and the folder it sits in,
 * or the folder of a markdown glob. A url, a link or a renderer has none.
 */
export const shelfPaths = (floor: Pick<Floor, 'hub' | 'collections'>, entry: ShelfEntry): { file?: string; folder?: string } => {
  if ('md' in entry) return { folder: onDisk(floor.hub, globFolder(entry.md)) }
  if ('html' in entry) return { file: onDisk(floor.hub, entry.html), folder: onDisk(floor.hub, parentOf(entry.html)) }
  if ('item' in entry) {
    const { collection, id } = shelfItem(entry)
    const dir = floor.collections.find((c) => c.id === collection)!.dir
    return { file: `${dir}/${id}`, folder: dir }
  }
  return {}
}

/**
 * The way to the declared renderers: this one named, a built one a link, one not built named with why. Framed on a
 * shelf, the frame can't navigate the tower page, so a link opens a tab of its own.
 */
export const renderersHtml = (renderers: Renderer[], here: string | undefined, framed: boolean) => {
  const target = framed ? ' target="_blank" rel="noopener"' : ''
  return `<span>renderers</span>${renderers.map((r) =>
    r.name === here ? `<b>${esc(r.name)}</b>`
    : r.available ? `<a href="${esc(rendererUrl(r.name))}"${target} data-tip="open ${esc(r.name)}">${esc(r.name)}</a>`
    : `<span data-tip="not built: ${esc(r.root)}/${esc(r.entry)} doesn't exist">${esc(r.name)}</span>`).join('')}`
}
