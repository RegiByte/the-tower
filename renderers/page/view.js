import { hashOf as locationHash, locationOf, shortHashOf } from '/views.js'
import { subjectAt } from '/cards.js'

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
 * A worker, on the pane the viewer picked since selecting it (none: its default); a worker the page started, until
 * the board carries it (`arriving`, drawn as the skyline); a view mounted in the main pane at a location
 * (`/views.js`), the skyline and kept items among them.
 * @typedef {{ t: 'worker', id: string, pane: Pane | undefined }
 *   | { t: 'arriving', id: string }
 *   | { t: 'view', location: Location }} MainView
 */

/** The skyline's location: the view the board opens on. @type {Location} */
export const SKYLINE = { view: 'tower/skyline' }

/** @type {MainView} */
export const HOME = { t: 'view', location: SKYLINE }

/** Whether `v` is the skyline. @param {MainView} v */
export const isHome = (v) => v.t === 'view' && v.location.view === SKYLINE.view && (v.location.subject ?? 'board') === 'board'

/** @param {string} part */
const encoded = (part) => encodeURIComponent(part)

/** The hash naming `v`, `''` for the skyline: a reload opens what it names; a location by its short form when it has one. @param {MainView} v @returns {string} */
export function hashOf(v) {
  switch (v.t) {
    case 'arriving':
      return ''
    case 'worker':
      return `#${v.id}${v.pane ? '/' + encoded(v.pane) : ''}`
    case 'view':
      return shortHashOf(v.location) ?? locationHash(v.location)
  }
}

const PANES = ['screen', 'brief', 'changes', 'reviews']

/** The first segments of the short forms `/views.js` reads: any other names a worker. */
const SHORT_FORMS = ['shelf', 'draft', 'archive', 'policies', 'kept']

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
  const [kind, pane] = hash.split('/')
  if (kind === 'v' || SHORT_FORMS.includes(kind)) return mainViewOf(locationOf(hash, board), board)
  return board.floors.some((f) => f.cards.some((c) => c.id === kind)) ? { t: 'worker', id: kind, pane: paneOfHash(pane) } : { t: 'lookup', id: kind, pane: paneOfHash(pane) }
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
 * What a location opens: a worker by the route the page draws it with until it is a view (its card, a showing as its
 * pane), any other view mounted at it; the skyline when what it names isn't on the board; `lookup` for a worker the board has no
 * card for.
 * @param {Location | undefined} location @param {Board} board @returns {MainView | { t: 'lookup', id: string, pane: Pane | undefined }}
 */
export function mainViewOf(location, board) {
  if (!location) return HOME
  const { kind, rest } = keyParts(location.subject ?? 'board')
  switch (location.view) {
    case 'tower/card': {
      if (kind !== 'card') return HOME
      const pane = paneOfLocation(location.pane, board)
      return board.floors.some((f) => f.cards.some((c) => c.id === rest)) ? { t: 'worker', id: rest, pane } : { t: 'lookup', id: rest, pane }
    }
    default:
      return subjectAt(board, location.subject ?? 'board') ? { t: 'view', location } : HOME
  }
}

/**
 * Whether `a` and `b` are the same place in the main pane, so going from one to the other leaves nothing: a worker on
 * another pane, a view on its subject with other args (a shelf entry's other file).
 * @param {MainView} a @param {MainView} b
 */
export function sameRoom(a, b) {
  if (a.t !== b.t) return false
  switch (a.t) {
    case 'worker':
    case 'arriving':
      return a.id === /** @type {typeof a} */ (b).id
    case 'view': {
      const [x, y] = [a.location, /** @type {typeof a} */ (b).location]
      return x.view === y.view && (x.subject ?? 'board') === (y.subject ?? 'board')
    }
  }
}

/** The main pane's class for `v`, which shows its part of the page. @param {MainView} v */
export function mainClass(v) {
  return /** @type {Record<MainView['t'], string>} */ ({
    arriving: 'viewing', worker: 'worker-view', view: 'viewing',
  })[v.t]
}

/** The floor `v` is on, if it names one; a worker's is its card's, which `projectOfCard` reads. @param {MainView} v @param {(id: string) => string | undefined} projectOfCard */
export function floorOfView(v, projectOfCard) {
  switch (v.t) {
    case 'arriving':
      return undefined
    case 'worker':
      return projectOfCard(v.id)
    case 'view': {
      const { kind, rest } = keyParts(v.location.subject ?? 'board')
      return kind === 'board' ? undefined : kind === 'card' ? projectOfCard(rest) : kind === 'floor' ? rest : inFloor(rest).project
    }
  }
}

/**
 * Where the view `id` stands while `v` mounts it: its subject's kind, floor and name on that floor (`shelf:p/2` is
 * `shelf`, `p` and `2`; `floor:p` is `floor`, `p` and `''`); `undefined` while `v` is another.
 * @param {MainView} v @param {string} id
 */
export function located(v, id) {
  if (v.t !== 'view' || v.location.view !== id) return undefined
  const { kind, rest } = keyParts(v.location.subject ?? 'board')
  return kind === 'floor' ? { kind, project: rest, name: '' } : { kind, ...inFloor(rest) }
}
