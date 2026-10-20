import { HOST_MEANS, heededWaits, whyNot, can, esc, UNRESUMABLE_NAME, UNRESUMABLE_TITLE, LET_GO_MEANS } from '/cards.js'
import { keysLabel } from '/keymap.js'

/**
 * @import { Board, Card, Unresumable } from '../../src/bridge/board.ts'
 * @import { DaemonVerb, Heed } from '../../src/shared/cards.ts'
 */

/**
 * @typedef {{
 *   findCard: (id: string | undefined) => Card | undefined,
 *   board: () => Board,
 *   heed: () => Heed,
 *   lostAt: () => number | undefined,
 * }} BoardKitDeps
 */

/**
 * What the panes read off the board alike: a worker's callsign, the cards, a floor and its colour, why a daemon
 * verb is held back, and the chords of a command.
 * @param {BoardKitDeps} deps
 */
export function boardKit(deps) {
  const { findCard, board, heed, lostAt } = deps
  /** @param {string} id */
  const callsign = (id) => /** @type {Card} */ (findCard(id)).callsign

  const cards = () => board().floors.flatMap((f) => f.cards)

  /** The project's color as `--p`, for an element's styles to use. @param {string | undefined} projectId */
  const paint = (projectId) => {
    const color = board().floors.find((f) => f.id === projectId)?.color
    return color ? `--p:${esc(color)}` : ''
  }

  /** The workers waiting on you that you heed, in the order to go to them. */
  const waitsOnYou = () => heededWaits(board(), heed()).map((w) => /** @type {Card} */ (findCard(w.id)))

  /** Top floor first, like an elevator panel. */
  const floorsTopDown = () => [...board().floors].reverse()

  /** Let a stranded worker go, asked first. @param {Card} c @param {string} label */
  const letGoHtml = (c, label) => !can(c, 'let-go') ? '' : heldWhy('let-go') ? heldHtml('let-go', label, label) : `<button data-let-go="${c.id}" data-tip="${esc(`let ${callsign(c.id)} go: ${LET_GO_MEANS}`)}">${label}</button>`

  /** Why a past worker can't be resumed, quietly: it is history, not an alarm. @param {Unresumable} why */
  const unresumableHtml = (why) => `<span class="unresumable" data-tip="${esc(UNRESUMABLE_TITLE[why])}">${UNRESUMABLE_NAME[why]}</span>`

  /** Why a daemon verb can't run now: the tower lost (its board is stale), or a daemon it needs down (`whyNot`). @param {DaemonVerb} verb */
  const heldWhy = (verb) => (lostAt() ? HOST_MEANS.unknown : whyNot(board(), verb))

  /** A verb `heldWhy` holds back: drawn, inert, its tip saying why. @param {DaemonVerb} verb @param {string} label @param {string} inner */
  const heldHtml = (verb, label, inner, cls = '') =>
    `<button class="held ${cls}" aria-disabled="true" aria-label="${esc(label)}" data-tip="${esc(heldWhy(verb))}">${inner}</button>`

  /** @param {string} what @param {string} id */
  const withKeys = (what, id) => (keysLabel(board().keys, id) ? `${what} (${keysLabel(board().keys, id)})` : what)

  /** @param {string} project */
  const floorOf = (project) => board().floors.find((f) => f.id === project)

  return { callsign, cards, paint, waitsOnYou, floorsTopDown, letGoHtml, unresumableHtml, heldWhy, heldHtml, withKeys, floorOf }
}
