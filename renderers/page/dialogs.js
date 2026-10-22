import { statusLegendHtml, landingHtml } from '/cards.js'
import { ICON } from '/icons.js'
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

  /** @param {HTMLDialogElement} d @param {MouseEvent} e */
  const outside = (d, e) => {
    const r = d.getBoundingClientRect()
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  }

  for (const d of /** @type {NodeListOf<HTMLDialogElement>} */ (document.querySelectorAll('dialog.sheet, dialog.confirm'))) {
    let pressedOutside = false
    d.addEventListener('pointerdown', (e) => (pressedOutside = e.target === d && outside(d, e)))
    d.addEventListener('click', (e) => e.target === d && pressedOutside && outside(d, e) && d.close())
  }

  for (const head of document.querySelectorAll('dialog.sheet header')) {
    head.insertAdjacentHTML('beforeend', `<button class="icon-btn" value="" aria-label="Close" data-tip="Close">${ICON.close}</button>`)
  }

  return { showLanding, showKeys, ask }
}
