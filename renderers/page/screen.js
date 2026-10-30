import { keysLabel } from '/keymap.js'
import { terminalFont } from '/terminal.js'
import { modeText } from '/term-view.js'

/**
 * @import { Board } from '../../src/bridge/board.ts'
 * @import { TermMode } from '../../src/shared/term-view.ts'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   refont: () => void,
 * }} ScreenDeps
 */

/**
 * The page's terminals alike: the viewer's face and size followed, how one holds its PTY said, and focus brought back
 * out of one.
 * @param {ScreenDeps} deps
 */
export function screen(deps) {
  const { board, refont } = deps

  /** The terminals' face and the size the viewer drives at, from their appearance. */
  const termFont = () => terminalFont(tower.prefs.get())

  const leaveHint = () => (keysLabel(board().keys, 'leave-terminal') ? ` · ${keysLabel(board().keys, 'leave-terminal')} leaves` : '')

  /** Says in `el` how a terminal holds its PTY. @param {HTMLElement} el @param {TermMode} mode */
  function showMode(el, mode) {
    el.className = mode.t === 'owning' ? 'owner' : ''
    el.textContent = modeText(mode) + (mode.t === 'owning' ? '' : leaveHint())
  }

  /**
   * A new face or size reaches every open terminal once the face has loaded. A terminal the viewer drives fits again,
   * resizing the PTY: a bigger font gives the session fewer columns and rows. A watched one fits the PTY it follows.
   */
  const applyTermFont = () => refont()

  /** The control focus was on before it went into a terminal, where leaving the terminal brings it back. @type {HTMLElement | undefined} */
  let beforeTerminal
  document.addEventListener('focusin', (e) => {
    const target = /** @type {HTMLElement} */ (e.target)
    if (!target.closest('.xterm')) beforeTerminal = target
  })

  /** Focus leaves the terminal for the control it came from, its worker's open tab, or the page itself. */
  function leaveTerminal() {
    const card = document.activeElement?.closest('[data-view="tower/card"]')
    const tab = card?.querySelector('[data-holds~="tabs"] [role=tab][aria-selected=true]')
    const to = [beforeTerminal, tab].find((el) => el?.isConnected && el.checkVisibility() && !el.closest('[inert]'))
    if (to) /** @type {HTMLElement} */ (to).focus()
    else /** @type {HTMLElement} */ (document.activeElement).blur()
  }

  return { showMode, termFont, applyTermFont, leaveTerminal }
}
