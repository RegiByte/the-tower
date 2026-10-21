import { $, toast } from './kit.js'
import { keysLabel } from '/keymap.js'
import { terminalFont } from '/terminal.js'
import { modeText, mountTermView } from '/term-view.js'

/**
 * @import { Board } from '../../src/bridge/board.ts'
 * @import { TerminalMsg } from '../../src/shared/shelf-page.ts'
 * @import { MainView } from './view.js'
 * @import * as Xterm from '@xterm/xterm'
 * @import { TermMode, TermViewHandle } from '../../src/shared/term-view.ts'
 * @import { Scheme } from '../../src/shared/design.ts'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   scheme: () => Scheme,
 *   run: (id: string, e: KeyboardEvent) => boolean,
 *   reopen: (view: MainView) => void,
 *   refontShell: () => void,
 * }} ScreenDeps
 */

/**
 * The selected worker's terminal: its screen streamed into xterm.js, the PTY's one size held by whoever types, the
 * viewer's face and size followed, and focus brought back out of it.
 * @param {ScreenDeps} deps
 */
export function screen(deps) {
  const { board, scheme, run, reopen, refontShell } = deps
  /** The selected worker's terminal view, while one is open. @type {TermViewHandle | undefined} */
  let view

  /** The terminals' face and the size the viewer drives at, from their appearance. */
  const termFont = () => terminalFont(tower.prefs.get())

  const leaveHint = () => (keysLabel(board().keys, 'leave-terminal') ? ` · ${keysLabel(board().keys, 'leave-terminal')} leaves` : '')

  /** Says in `el` how a terminal holds its PTY. @param {HTMLElement} el @param {TermMode} mode */
  function showMode(el, mode) {
    el.className = mode.t === 'owning' ? 'owner' : ''
    el.textContent = modeText(mode) + (mode.t === 'owning' ? '' : leaveHint())
  }

  /** The terminal open on the selected worker, while one is. */
  const openTerm = () => /** @type {Xterm.Terminal} */ (view?.term())
  /** The terminal open on the selected worker, if one is. */
  const terminal = () => view?.term()

  const isOwner = () => view?.state().t === 'owning'

  function closeTerminal() {
    view?.close()
    view = undefined
    $('c-mode').textContent = ''
  }

  /** A worker's terminal streams while the main pane is on it; when its session ends, the worker is opened again. @param {string} id */
  function enterWorker(id) {
    view = mountTermView($('c-screen'), { Terminal, FitAddon: FitAddon.FitAddon }, {
      watch: (on) => tower.watch(`terminal/${id}`, (msg) => on(/** @type {TerminalMsg} */ (msg))),
      resize: (size) => tower.call('resize', { id, ...size }),
      send: (data) => tower.keys(id, data),
      claude: true,
      scrollback: 0,
      font: termFont,
      scheme,
      keymap: () => board().keys,
      run,
      mode: (mode) => showMode($('c-mode'), mode),
      end: () => reopen({ t: 'worker', id, pane: undefined }),
      error: (err) => toast(err.message),
    })
  }

  /**
   * A new face or size reaches every open terminal once the face has loaded. A terminal the viewer drives fits again,
   * resizing the PTY: a bigger font gives the session fewer columns and rows. A watched one fits the PTY it follows.
   */
  function applyTermFont() {
    void view?.refont()
    refontShell()
  }

  const rescheme = () => view?.rescheme()

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

  return { showMode, termFont, openTerm, terminal, isOwner, closeTerminal, enterWorker, applyTermFont, leaveTerminal, rescheme }
}
