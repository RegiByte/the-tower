import { hashOf as locationHash, locationOf, shortHashOf } from '/views.js'

/**
 * What the tower page's main pane shows, as one value, and the URL hash that names it. Pure: the page goes from one
 * view to the next through its loop, which leaves the view before and enters the next.
 * @import { Board } from '../../src/bridge/board.ts'
 * @import { Location } from '../../src/shared/views.ts'
 */

/**
 * A worker the page started, until the board carries it (`arriving`, drawn as the skyline); a view mounted in the main
 * pane at a location (`/views.js`): the skyline, a worker (`tower/card`) and kept items among them.
 * @typedef {{ t: 'arriving', id: string } | { t: 'view', location: Location }} MainView
 */

/** A location the page reads a worker from that it may yet look up in the floors' archives. @typedef {{ t: 'lookup', id: string, location: Location }} Lookup */

/** The skyline's location: the view the board opens on. @type {Location} */
export const SKYLINE = { view: 'tower/skyline' }

/** @type {MainView} */
export const HOME = { t: 'view', location: SKYLINE }

/** Whether `v` is the skyline. @param {MainView} v */
export const isHome = (v) => v.t === 'view' && v.location.view === SKYLINE.view && (v.location.subject ?? 'board') === 'board'

/** The kind and the rest of a subject key: `floor:lab` is `floor` and `lab`. @param {string} key */
const keyParts = (key) => {
  const at = key.indexOf(':')
  return at < 0 ? { kind: key, rest: '' } : { kind: key.slice(0, at), rest: key.slice(at + 1) }
}

/** `<project>/<name>`, split at its first slash. @param {string} rest */
const inFloor = (rest) => ({ project: rest.slice(0, rest.indexOf('/')), name: rest.slice(rest.indexOf('/') + 1) })

/** The worker view's tabs as the page's short forms name them, after a worker's id. */
const PANE_NAMES = /** @type {Record<string, string>} */ ({ 'tower/terminal': 'screen', 'tower/brief': 'brief', 'tower/changes': 'changes', 'reviews/thread': 'reviews' })

/** The worker the main pane shows, while it shows one. @param {MainView} v */
export const cardIdOf = (v) => (v.t === 'view' && v.location.view === 'tower/card' && v.location.subject?.startsWith('card:') ? v.location.subject.slice('card:'.length) : undefined)

/**
 * The hash naming `v`, `''` for the skyline: a reload opens what it names; a location by its short form when it has
 * one, a worker as `#<id>` with its tab (`/changes`, `/shown:<target>`, the showing read on `board`).
 * @param {MainView} v @param {Board} board @returns {string}
 */
export function hashOf(v, board) {
  if (v.t === 'arriving') return ''
  const id = cardIdOf(v)
  if (id === undefined) return shortHashOf(v.location) ?? locationHash(v.location)
  const pane = v.location.pane
  if (!pane) return `#${id}`
  if (PANE_NAMES[pane.view]) return `#${id}/${PANE_NAMES[pane.view]}`
  const at = pane.subject?.slice(pane.subject.lastIndexOf('/') + 1)
  const shown = board.floors.flatMap((f) => f.cards).find((c) => c.id === id)?.shown.find((s) => String(s.at) === at)
  return shown ? `#${id}/${encodeURIComponent(`shown:${shown.target}`)}` : locationHash(v.location)
}

/**
 * What a location opens: a view mounted at it; the skyline when what it names isn't there (`has`, the board or a read
 * the page holds); `lookup` for a worker it doesn't hold, which may be one of an archive the page has yet to read.
 * @param {Location | undefined} location @param {(key: string) => boolean} has @returns {MainView | Lookup}
 */
export function mainViewOf(location, has) {
  if (!location) return HOME
  const key = location.subject ?? 'board'
  if (has(key)) return { t: 'view', location }
  return location.view === 'tower/card' && key.startsWith('card:') ? { t: 'lookup', id: key.slice('card:'.length), location } : HOME
}

/** The view a hash (without its `#`) names. @param {string} hash @param {Board} board @param {(key: string) => boolean} has */
export const viewOf = (hash, board, has) => (hash ? mainViewOf(locationOf(hash, board), has) : HOME)

/**
 * Whether `a` and `b` are the same place in the main pane, so going from one to the other leaves nothing: a worker on
 * another pane, a view on its subject with other args (a shelf entry's other file).
 * @param {MainView} a @param {MainView} b
 */
export function sameRoom(a, b) {
  if (a.t !== b.t) return false
  switch (a.t) {
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
    arriving: 'viewing', view: 'viewing',
  })[v.t]
}

/** The floor `v` is on, if it names one; a worker's is its card's, which `projectOfCard` reads. @param {MainView} v @param {(id: string) => string | undefined} projectOfCard */
export function floorOfView(v, projectOfCard) {
  switch (v.t) {
    case 'arriving':
      return undefined
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
