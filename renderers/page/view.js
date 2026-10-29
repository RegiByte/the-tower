import { hashOf as locationHash, locationOf } from '/views.js'

/**
 * What the tower page's main pane shows, as one value, and the URL hash that names it. Pure: the page goes from one
 * view to the next through its loop, which leaves the view before and enters the next.
 * @import { Board } from '../../src/bridge/board.ts'
 * @import { Location } from '../../src/shared/views.ts'
 */

/**
 * A view of the selected worker: a pane's name, or `shown:<target>` for what it showed.
 * @typedef {'screen' | 'brief' | 'changes' | 'reviews' | `shown:${string}`} Pane
 */

/**
 * The skyline (`home`); a worker, on the pane the viewer picked since selecting it (none: its default); a worker the
 * page started, until the board carries it (`arriving`, drawn as the skyline); a shelf entry and the file of it shown;
 * a floor's archive, policies or collection; a draft, unsaved while it has no id; a kept item; a view an extension
 * declares, mounted in the main pane at a location (`/views.js`).
 * @typedef {{ t: 'home' }
 *   | { t: 'worker', id: string, pane: Pane | undefined }
 *   | { t: 'arriving', id: string }
 *   | { t: 'shelf', project: string, n: number, file: string | undefined }
 *   | { t: 'archive', project: string }
 *   | { t: 'policies', project: string }
 *   | { t: 'collection', project: string, collection: string }
 *   | { t: 'draft', project: string, id: string | undefined }
 *   | { t: 'item', project: string, collection: string, id: string }
 *   | { t: 'view', location: Location }} MainView
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
      return `#${v.id}${v.pane ? '/' + encoded(v.pane) : ''}`
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
    case 'view':
      return locationHash(v.location)
  }
}

const PANES = ['screen', 'brief', 'changes', 'reviews']

/** The pane a hash names after a worker's id: `undefined` for none, or one that is no pane. @param {string | undefined} part @returns {Pane | undefined} */
function paneOfHash(part) {
  if (part === undefined) return undefined
  const pane = decodeURIComponent(part)
  return PANES.includes(pane) || pane.startsWith('shown:') ? /** @type {Pane} */ (pane) : undefined
}

/**
 * The view a hash (without its `#`) names on `board`, the skyline when it names nothing there; `lookup` for an id the
 * board has no card for, which may be a worker of an archive the page has yet to read, with the pane the hash names.
 * @param {string} hash @param {Board} board @returns {MainView | { t: 'lookup', id: string, pane: Pane | undefined }}
 */
export function viewOf(hash, board) {
  if (!hash) return HOME
  if (hash.startsWith('v/')) return mainViewOf(locationOf(hash, board), board)
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
  const pane = paneOfHash(project)
  return board.floors.some((f) => f.cards.some((c) => c.id === kind)) ? { t: 'worker', id: kind, pane } : { t: 'lookup', id: kind, pane }
}

/** The page's pane each core view of a worker's tabs is, until they are views. */
const VIEW_PANES = /** @type {Record<string, Pane>} */ ({ 'tower/terminal': 'screen', 'tower/brief': 'brief', 'tower/changes': 'changes', 'reviews/thread': 'reviews' })

/** The kind and the rest of a subject key: `floor:lab` is `floor` and `lab`. @param {string} key */
const keyParts = (key) => {
  const at = key.indexOf(':')
  return at < 0 ? { kind: key, rest: '' } : { kind: key.slice(0, at), rest: key.slice(at + 1) }
}

/** `<project>/<name>`, split at its first slash. @param {string} rest */
const inFloor = (rest) => ({ project: rest.slice(0, rest.indexOf('/')), name: rest.slice(rest.indexOf('/') + 1) })

/** The pane a worker's location names: a core tab's, or the showing its key names, by target. @param {Location['pane']} pane @param {Board} board @returns {Pane | undefined} */
function paneOfLocation(pane, board) {
  if (!pane) return undefined
  if (VIEW_PANES[pane.view]) return VIEW_PANES[pane.view]
  if (pane.view !== 'tower/shown' || !pane.subject) return undefined
  const { rest } = keyParts(pane.subject)
  const [id, at] = [rest.slice(0, rest.lastIndexOf('/')), rest.slice(rest.lastIndexOf('/') + 1)]
  const s = board.floors.flatMap((f) => f.cards).find((c) => c.id === id)?.shown.find((s) => String(s.at) === at)
  return s && /** @type {Pane} */ (`shown:${s.target}`)
}

/**
 * What a location opens: a view an extension declares as itself; a core view by the route the page draws it with
 * until it is a view (the skyline, a worker, an archive, a collection, an item, a draft, a shelf entry, policies), the
 * skyline when what it names isn't on the board; `lookup` for a worker the board has no card for.
 * @param {Location | undefined} location @param {Board} board @returns {MainView | { t: 'lookup', id: string, pane: Pane | undefined }}
 */
export function mainViewOf(location, board) {
  if (!location) return HOME
  const { kind, rest } = keyParts(location.subject ?? 'board')
  const floorAt = (/** @type {string} */ project) => board.floors.find((f) => f.id === project)
  switch (location.view) {
    case 'tower/skyline':
      return HOME
    case 'tower/card': {
      if (kind !== 'card') return HOME
      const pane = paneOfLocation(location.pane, board)
      return board.floors.some((f) => f.cards.some((c) => c.id === rest)) ? { t: 'worker', id: rest, pane } : { t: 'lookup', id: rest, pane }
    }
    case 'tower/archive':
    case 'policies/policies':
      return kind === 'floor' && floorAt(rest) ? { t: location.view === 'tower/archive' ? 'archive' : 'policies', project: rest } : HOME
    case 'tower/shelf': {
      const { project, name } = inFloor(rest)
      return kind === 'shelf' && floorAt(project)?.shelf?.[Number(name)] ? { t: 'shelf', project, n: Number(name), file: location.args?.[0] } : HOME
    }
    case 'tower/collection': {
      const { project, name } = inFloor(rest)
      return kind === 'collection' && floorAt(project)?.collections.some((c) => c.id === name) ? { t: 'collection', project, collection: name } : HOME
    }
    case 'drafts/editor': {
      const { project, name } = inFloor(rest)
      if (!floorAt(project)) return HOME
      return kind === 'collection' ? { t: 'draft', project, id: undefined } : kind === 'item.drafts' ? { t: 'draft', project, id: name } : HOME
    }
    case 'tower/item': {
      const { project, name } = inFloor(rest)
      const collection = kind.slice('item.'.length)
      const c = kind.startsWith('item.') ? floorAt(project)?.collections.find((c) => c.id === collection) : undefined
      return c?.items.some((i) => i.id === name) ? { t: 'item', project, collection, id: name } : HOME
    }
    default:
      return { t: 'view', location }
  }
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
    case 'view':
      return a.location.view === /** @type {typeof a} */ (b).location.view && a.location.subject === /** @type {typeof a} */ (b).location.subject
    default:
      return hashOf(a) === hashOf(b)
  }
}

/** The main pane's class for `v`, which shows its part of the page. @param {MainView} v */
export function mainClass(v) {
  return /** @type {Record<MainView['t'], string>} */ ({
    home: 'home', arriving: 'home', worker: 'worker-view', shelf: 'shelf', archive: 'archived', policies: 'policing', collection: 'listing', draft: 'drafting', item: 'kept', view: 'viewing',
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
    case 'view': {
      const { kind, rest } = keyParts(v.location.subject ?? 'board')
      return kind === 'board' ? undefined : kind === 'card' ? projectOfCard(rest) : kind === 'floor' ? rest : inFloor(rest).project
    }
    default:
      return v.project
  }
}
