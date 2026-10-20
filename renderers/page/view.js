/**
 * What the tower page's main pane shows, as one value, and the URL hash that names it. Pure: the page goes from one
 * view to the next through its loop, which leaves the view before and enters the next.
 * @import { Board } from '../../src/bridge/board.ts'
 */

/**
 * A view of the selected worker: a pane's name, or `shown:<target>` for what it showed.
 * @typedef {'screen' | 'brief' | 'changes' | 'reviews' | `shown:${string}`} Pane
 */

/**
 * The skyline (`home`); a worker, on the pane the viewer picked since selecting it (none: its default); a worker the
 * page started, until the board carries it (`arriving`, drawn as the skyline); a shelf entry and the file of it shown;
 * a floor's archive, policies or collection; a draft, unsaved while it has no id; a kept item.
 * @typedef {{ t: 'home' }
 *   | { t: 'worker', id: string, pane: Pane | undefined }
 *   | { t: 'arriving', id: string }
 *   | { t: 'shelf', project: string, n: number, file: string | undefined }
 *   | { t: 'archive', project: string }
 *   | { t: 'policies', project: string }
 *   | { t: 'collection', project: string, collection: string }
 *   | { t: 'draft', project: string, id: string | undefined }
 *   | { t: 'item', project: string, collection: string, id: string }} MainView
 */

/** @type {MainView} */
export const HOME = { t: 'home' }

/** @param {string} part */
const encoded = (part) => encodeURIComponent(part)

/** The hash naming `v`, `''` for the skyline: a reload opens what it names. @param {MainView} v @returns {string} */
export function hashOf(v) {
  switch (v.t) {
    case 'home':
    case 'arriving':
      return ''
    case 'worker':
      return `#${v.id}`
    case 'shelf':
      return `#shelf/${v.project}/${v.n}${v.file ? '/' + encoded(v.file) : ''}`
    case 'archive':
      return `#archive/${v.project}`
    case 'policies':
      return `#policies/${v.project}`
    case 'collection':
      return `#kept/${v.project}/${v.collection}`
    case 'draft':
      return `#draft/${v.project}${v.id ? '/' + encoded(v.id) : ''}`
    case 'item':
      return `#kept/${v.project}/${v.collection}/${encoded(v.id)}`
  }
}

/**
 * The view a hash (without its `#`) names on `board`, the skyline when it names nothing there; `lookup` for an id the
 * board has no card for, which may be a worker of an archive the page has yet to read.
 * @param {string} hash @param {Board} board @returns {MainView | { t: 'lookup', id: string }}
 */
export function viewOf(hash, board) {
  if (!hash) return HOME
  const [kind, project, ...rest] = hash.split('/')
  const f = board.floors.find((f) => f.id === project)
  if (kind === 'shelf') return f?.shelf?.[Number(rest[0])] ? { t: 'shelf', project, n: Number(rest[0]), file: rest[1] === undefined ? undefined : decodeURIComponent(rest[1]) } : HOME
  if (kind === 'draft') return f ? { t: 'draft', project, id: rest[0] === undefined ? undefined : decodeURIComponent(rest[0]) } : HOME
  if (kind === 'archive') return f ? { t: 'archive', project } : HOME
  if (kind === 'policies') return f ? { t: 'policies', project } : HOME
  if (kind === 'kept') {
    const [collection, id] = rest
    const c = f?.collections.find((c) => c.id === collection)
    if (!c) return HOME
    if (id === undefined) return { t: 'collection', project, collection }
    const item = decodeURIComponent(id)
    return c.items.some((i) => i.id === item) ? { t: 'item', project, collection, id: item } : HOME
  }
  return board.floors.some((f) => f.cards.some((c) => c.id === hash)) ? { t: 'worker', id: hash, pane: undefined } : { t: 'lookup', id: hash }
}

/**
 * Whether `a` and `b` are the same place in the main pane, so going from one to the other leaves nothing: a worker on
 * another pane, a shelf entry on another of its files.
 * @param {MainView} a @param {MainView} b
 */
export function sameRoom(a, b) {
  if (a.t !== b.t) return false
  switch (a.t) {
    case 'home':
      return true
    case 'worker':
    case 'arriving':
      return a.id === /** @type {typeof a} */ (b).id
    case 'shelf':
      return a.project === /** @type {typeof a} */ (b).project && a.n === /** @type {typeof a} */ (b).n
    default:
      return hashOf(a) === hashOf(b)
  }
}

/** The main pane's class for `v`, which shows its part of the page. @param {MainView} v */
export function mainClass(v) {
  return /** @type {Record<MainView['t'], string>} */ ({
    home: 'home', arriving: 'home', worker: 'worker-view', shelf: 'shelf', archive: 'archived', policies: 'policing', collection: 'listing', draft: 'drafting', item: 'kept',
  })[v.t]
}

/** The floor `v` is on, if it names one; a worker's is its card's, which `projectOfCard` reads. @param {MainView} v @param {(id: string) => string | undefined} projectOfCard */
export function floorOfView(v, projectOfCard) {
  switch (v.t) {
    case 'home':
    case 'arriving':
      return undefined
    case 'worker':
      return projectOfCard(v.id)
    default:
      return v.project
  }
}
