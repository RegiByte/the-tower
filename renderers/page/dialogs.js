import { statusLegendHtml, landingHtml } from '/cards.js'
import { $ } from './kit.js'
import { keymapSheetHtml } from '/keymap.js'

/**
 * @import { Board } from '../../src/bridge/board.ts'
 * @import { LandingRead } from '../../src/bridge/worktrees.ts'
 */

/**
 * @typedef {{
 *   board: () => Board,
 * }} DialogsDeps
 */

/**
 * The sheets the page opens over everything: what landing changed on a branch, and the keymap with what the
 * statuses mean.
 * @param {DialogsDeps} deps
 */
export function dialogs(deps) {
  const { board } = deps
  /** @param {LandingRead} l */
  function showLanding(l) {
    $('landing-title').textContent = `What landing changed on ${l.branch}`
    $('landing-body').innerHTML = landingHtml(l)
    $('landing').showModal()
    $('landing').scrollTop = 0
  }

  function showKeys() {
    $('keys-list').innerHTML = keymapSheetHtml(board().keys)
    $('keys-legend').innerHTML = statusLegendHtml()
    $('keys').showModal()
    $('keys').scrollTop = 0
  }

  return { showLanding, showKeys }
}
