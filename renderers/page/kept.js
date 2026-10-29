import { itemKey, subjectAt } from '/cards.js'
import { itemPath, keptTitles } from '/items.js'
import { policyDoneLine } from '/x/policies/panel.js'
import { floorPolicies } from '/x/policies/policies.js'
import { toast, told } from './kit.js'
import { pressing } from '/press.js'

/**
 * @import { Board, Floor, FloorItem } from '../../src/bridge/board.ts'
 * @import { PolicyReplies } from '../../extensions/policies/policies.ts'
 * @import { PolicyCall } from '../../extensions/policies/client/panel.ts'
 * @import { MainView } from './view.js'
 */

/**
 * @typedef {{
 *   render: () => void,
 *   viewing: <T extends MainView['t']>(t: T) => Extract<MainView, { t: T }> | undefined,
 *   display: (key: string) => void,
 *   floorOf: (project: string) => Floor | undefined,
 *   board: () => Board,
 *   selectArriving: (id: string) => void,
 * }} KeptViewsDeps
 */

/**
 * Every collection's titles, a kept item opened where display puts it and which one is open, and a policy's Run now,
 * Approve and Accept where the page draws them.
 * @param {KeptViewsDeps} deps
 */
export function keptViews(deps) {
  const { render, viewing, display, floorOf, board, selectArriving } = deps
  /** Every other collection's items, titled from their text where their type names itself; a row opens the item in the main pane. */
  const { title: keptTitle, prune: pruneKeptTitles } = keptTitles((project, collection, id) => tower.text(itemPath(project, collection, id)), () => render())

  /** The id of the item of `collection` on the floor `project` that the main pane has open, if one is. @param {string} project @param {string} collection */
  const openItemIn = (project, collection) => {
    const key = viewing('view')?.location.subject
    const open = key === undefined ? undefined : subjectAt(board(), key)
    return open?.kind === `item.${collection}` && open.project === project ? /** @type {FloorItem} */ (open.value).id : undefined
  }

  /**
   * A policy's Run now or Approve, or an offer's Accept: a run started opens its worker once the board carries it.
   * @param {HTMLElement} button
   * @param {PolicyCall} call `policies/run` or `policies/approve`, and its input
   */
  async function policyCall(button, call) {
    const { project, policy } = /** @type {{ project: string; policy: string }} */ (call[1])
    const title = floorPolicies(floorOf(project)).policies.find((p) => p.id === policy)?.title ?? policy
    const reply = await told(pressing(button, () => /** @type {Promise<PolicyReplies[keyof PolicyReplies]>} */ (tower.call(/** @type {never} */ (call[0]), /** @type {never} */ (call[1])))))
    if (!reply) return
    toast(policyDoneLine(call, title, reply))
    if (call[0] === 'policies/run') selectArriving(/** @type {PolicyReplies['policies/run']} */ (reply).id)
  }

  /** @param {string} project @param {string} collection @param {string} id */
  function openItem(project, collection, id) {
    if (!floorOf(project)?.collections.find((c) => c.id === collection)?.items.some((i) => i.id === id)) return toast('That item is gone')
    display(itemKey(project, collection, id))
  }

  return { keptTitle, pruneKeptTitles, openItemIn, policyCall, openItem }
}
