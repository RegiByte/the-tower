import { policyDoneLine } from '/x/policies/panel.js'
import { floorPolicies } from '/x/policies/policies.js'
import { toast, told } from './kit.js'
import { pressing } from '/press.js'

/**
 * @import { Floor } from '../../src/bridge/board.ts'
 * @import { PolicyReplies } from '../../extensions/policies/policies.ts'
 * @import { PolicyCall } from '../../extensions/policies/client/panel.ts'
 */

/**
 * @typedef {{
 *   floorOf: (project: string) => Floor | undefined,
 *   selectArriving: (id: string) => void,
 * }} PolicyCallDeps
 */

/**
 * A policy's Run now or Approve, or an offer's Accept, where the page draws them: a run started opens its worker once
 * the board carries it.
 * @param {PolicyCallDeps} deps
 */
export function policyCalls(deps) {
  const { floorOf, selectArriving } = deps

  /**
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

  return { policyCall }
}
