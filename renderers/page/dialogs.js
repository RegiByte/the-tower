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
 * The sheets the page opens over everything: what landing changed on a branch, the keymap with what the
 * statuses mean, and a question asked before a verb that cannot be taken back.
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

  /**
   * Asks `text` (a question, then what it means after a blank line, as the shared asks are written) with `verb` on
   * the button that goes ahead; answers whether it was pressed. Cancel, Escape and the backdrop answer no.
   * @param {string} text @param {string} verb
   * @returns {Promise<boolean>}
   */
  function ask(text, verb) {
    const [question, ...rest] = text.split('\n\n')
    $('confirm-title').textContent = question
    $('confirm-body').textContent = rest.join('\n\n')
    $('confirm-yes').textContent = verb
    $('confirm').returnValue = ''
    $('confirm').showModal()
    $('confirm-yes').focus()
    return new Promise((resolve) => $('confirm').addEventListener('close', () => resolve($('confirm').returnValue === 'yes'), { once: true }))
  }

  $('confirm').addEventListener('click', (e) => e.target === $('confirm') && $('confirm').close())

  return { showLanding, showKeys, ask }
}
