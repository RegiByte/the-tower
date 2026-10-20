import { terminalTheme } from '/design.js'
import { $, told } from './kit.js'
import { terminalKeymap } from '/termkeys.js'
import { keysLabel } from '/keymap.js'
import { fitSize, loadTerminalFont, reportWheel, terminalFont } from '/terminal.js'

/**
 * @import { Board } from '../../src/bridge/board.ts'
 * @import { TerminalMsg } from '../../src/shared/shelf-page.ts'
 * @import { MainView } from './view.js'
 * @import * as Fit from '@xterm/addon-fit'
 * @import * as Xterm from '@xterm/xterm'
 * @import { Scheme } from '../../src/shared/design.ts'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   selected: () => string | undefined,
 *   scheme: () => Scheme,
 *   run: (id: string, e: KeyboardEvent) => boolean,
 *   reopen: (view: MainView) => void,
 *   refontShell: (font: ReturnType<typeof terminalFont>) => void,
 * }} ScreenDeps
 */

/**
 * The selected worker's terminal: its screen streamed into xterm.js, the PTY's one size held by whoever types, the
 * viewer's face and size followed, and focus brought back out of it.
 * @param {ScreenDeps} deps
 */
export function screen(deps) {
  const { board, selected, scheme, run, reopen, refontShell } = deps
  /** @type {Xterm.Terminal | undefined} */
  let term
  /** @type {Fit.FitAddon | undefined} */
  let fit
  /** @type {(() => void) | undefined} */
  let stopScreen
  const REFIT_DEBOUNCE_MS = 120

  /**
   * The PTY has one size: whoever types owns it. Opening the terminal claims it when no other terminal is open on the
   * session, fitting the PTY to this pane; a resize from anyone else hands it back, and the view follows the PTY at a
   * font scaled to fit.
   * @type {{ cols: number, rows: number } | undefined}
   */
  let claimed

  /** The terminals' face and the size the viewer drives at, from their appearance. */
  const termFont = () => terminalFont(tower.prefs.get())
  /** @param {number} cols @param {number} rows */
  const fitFont = (cols, rows) => fitSize($('c-screen'), cols, rows, termFont())

  const leaveHint = () => (keysLabel(board().keys, 'leave-terminal') ? ` · ${keysLabel(board().keys, 'leave-terminal')} leaves` : '')

  /** Says how the open terminal is held. */
  function showMode(text = isOwner() ? `in control · ${openTerm().cols}×${openTerm().rows}` : `watching · type to take control${leaveHint()}`) {
    $('c-mode').className = isOwner() ? 'owner' : ''
    $('c-mode').textContent = text
  }

  /** The terminal open on the selected worker, and its fit, while one is. */
  const openTerm = () => /** @type {Xterm.Terminal} */ (term)
  /** The terminal open on the selected worker, if one is. */
  const terminal = () => term

  function claim() {
    openTerm().options.fontSize = termFont().size
    const fitting = /** @type {Fit.FitAddon} */ (fit)
    fitting.fit()
    claimed = { cols: openTerm().cols, rows: openTerm().rows }
    told(tower.call('resize', { id: /** @type {string} */ (selected()), ...claimed }))
    showMode()
  }

  const isOwner = () => Boolean(claimed && term && claimed.cols === term.cols && claimed.rows === term.rows)

  const sendKeys = tower.keys

  /** @param {number} cols @param {number} rows */
  function followPty(cols, rows) {
    if (openTerm().cols === cols && openTerm().rows === rows) return
    openTerm().resize(cols, rows)
    if (!isOwner()) openTerm().options.fontSize = fitFont(cols, rows)
    showMode()
  }

  /** @param {string} data */
  const typed = (data) => {
    if (document.activeElement !== openTerm().textarea) return
    if (!isOwner()) claim()
    sendKeys(/** @type {string} */ (selected()), data)
  }

  /** @param {Extract<TerminalMsg, { t: 'snapshot' }>} snapshot */
  function openTerminal({ cols, rows, data, exited, terminals }) {
    term?.dispose()
    term = new Terminal({ cols, rows, fontSize: fitFont(cols, rows), fontFamily: termFont().family, cursorBlink: false, scrollback: 0, theme: terminalTheme(scheme()) })
    fit = new FitAddon.FitAddon()
    term.loadAddon(fit)
    term.open($('c-screen'))
    term.write(data)
    if (exited) return (term.attachCustomKeyEventHandler(terminalKeymap(() => board().keys, run, () => {})), showMode(`past session · read-only${leaveHint()}`))
    term.attachCustomKeyEventHandler(terminalKeymap(() => board().keys, run, typed))
    term.onData(typed)
    reportWheel(term, typed)
    if (terminals === 0) claim()
    else showMode()
    term.focus()
  }

  function closeTerminal() {
    claimed = undefined
    stopScreen?.()
    term?.dispose()
    term = undefined
    $('c-screen').innerHTML = ''
    $('c-mode').textContent = ''
  }

  /** A worker's terminal streams while the main pane is on it; when its session ends, the worker is opened again. @param {string} id */
  function enterWorker(id) {
    stopScreen = tower.watch(`terminal/${id}`, (streamed) => {
      const msg = /** @type {TerminalMsg} */ (streamed)
      if (msg.t === 'snapshot') openTerminal(msg)
      if (msg.t === 'o') openTerm().write(msg.data)
      if (msg.t === 'r') followPty(.../** @type {[number, number]} */ (msg.size.split('x').map(Number)))
      if (msg.t === 'x') reopen({ t: 'worker', id, pane: undefined })
    })
  }

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let refitTimer
  new ResizeObserver(() => {
    clearTimeout(refitTimer)
    refitTimer = setTimeout(() => {
      if (!term) return
      if (isOwner()) claim()
      else term.options.fontSize = fitFont(term.cols, term.rows)
    }, REFIT_DEBOUNCE_MS)
  }).observe($('screen'))

  /**
   * A new face or size reaches every open terminal once the face has loaded. A terminal the viewer drives fits again,
   * resizing the PTY: a bigger font gives the session fewer columns and rows. A watched one fits the PTY it follows.
   */
  let fontShown = termFont()
  async function applyTermFont() {
    const font = termFont()
    if (font.family === fontShown.family && font.size === fontShown.size) return
    fontShown = font
    await loadTerminalFont(font)
    if (fontShown !== font) return
    if (term) {
      term.options.fontFamily = font.family
      if (isOwner()) claim()
      else term.options.fontSize = fitFont(term.cols, term.rows)
    }
    refontShell(font)
  }

  /** The control focus was on before it went into a terminal, where leaving the terminal brings it back. @type {HTMLElement | undefined} */
  let beforeTerminal
  document.addEventListener('focusin', (e) => {
    const target = /** @type {HTMLElement} */ (e.target)
    if (!target.closest('.xterm')) beforeTerminal = target
  })

  /** Focus leaves the terminal for the control it came from, the selected pane's tab, or the page itself. */
  function leaveTerminal() {
    const tab = $('bar-line').querySelector('[role=tab][aria-selected=true]')
    const to = [beforeTerminal, tab].find((el) => el?.isConnected && el.checkVisibility() && !el.closest('[inert]'))
    if (to) to.focus()
    else /** @type {HTMLElement} */ (document.activeElement).blur()
  }

  return { REFIT_DEBOUNCE_MS, termFont, openTerm, terminal, isOwner, closeTerminal, enterWorker, applyTermFont, leaveTerminal }
}
