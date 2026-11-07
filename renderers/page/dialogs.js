import { landingHtml, statusLegendHtml } from '/lib/cards.js'
import { closeOnBackdrop } from '/lib/chrome.js'
import { paneSheetHtml, panesOf } from '/lib/keys.js'
import { ICON } from '/lib/view.js'
import { $ } from './kit.js'

/**
 * @import { Board, LandingRead } from '/lib/board.js'
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
    $('keys-list').innerHTML = paneSheetHtml(board().keys, panesOf(board()))
    $('keys-legend').innerHTML = statusLegendHtml()
    $('keys').showModal()
    $('keys').scrollTop = 0
  }

  for (const d of /** @type {NodeListOf<HTMLDialogElement>} */ (document.querySelectorAll('dialog.sheet, dialog.palette'))) closeOnBackdrop(d)

  for (const head of document.querySelectorAll('dialog.sheet header')) {
    head.insertAdjacentHTML('beforeend', `<button class="icon-btn" value="" aria-label="Close" data-tip="Close">${ICON.close}</button>`)
  }

  return { showLanding, showKeys }
}
