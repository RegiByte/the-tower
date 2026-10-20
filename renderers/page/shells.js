import { terminalTheme } from '/design.js'
import { whyNot, offeredCall, esc, shellPlaces, shellWhere } from '/cards.js'
import { ICON } from '/icons.js'
import { $, byStart, toast, told } from './kit.js'
import { terminalKeymap } from '/termkeys.js'
import { terminalFont } from '/terminal.js'
import { placeOnOpen } from '/tips.js'
import { pressing } from '/press.js'

/**
 * @import { Board, Floor } from '../../src/bridge/board.ts'
 * @import { ShellStream } from '../../src/shared/terms.ts'
 * @import * as Fit from '@xterm/addon-fit'
 * @import * as Xterm from '@xterm/xterm'
 * @import { TermFont } from '../../src/shared/terminal.ts'
 * @import { Scheme } from '../../src/shared/design.ts'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   floorInView: () => string,
 *   paint: (projectId: string | undefined) => string,
 *   floorOf: (project: string) => Floor | undefined,
 *   termFont: () => TermFont,
 *   scheme: () => Scheme,
 *   run: (id: string, e: KeyboardEvent) => boolean,
 *   REFIT_DEBOUNCE_MS: number,
 * }} ShellsDeps
 */

/**
 * The shells docked under the main pane: a tab for each the terms daemon runs, the one open in its own terminal
 * sized to its pane, new ones started in a floor's directory, and the grip that sets their height.
 * @param {ShellsDeps} deps
 */
export function shells(deps) {
  const { board, floorInView, paint, floorOf, termFont, scheme, run, REFIT_DEBOUNCE_MS } = deps
  const sendShellKeys = tower.shellKeys

  /**
   * The shell open in the dock: its id and stream, and its terminal once the snapshot has arrived.
   * @typedef {{ id: string, stop: () => void }} ShellView
   * @typedef {ShellView & { term: Xterm.Terminal, fit: Fit.FitAddon, size: { cols: number, rows: number } }} MountedShell
   * @type {(ShellView & { term?: undefined }) | MountedShell | undefined}
   */
  let shell
  const SHELL_SCROLLBACK = 2000
  /** The shell open, with its terminal. */
  const mounted = () => /** @type {MountedShell} */ (shell)

  /** @param {Board['shells'][number]} sh */
  const shellFloor = (sh) => board().floors.find((f) => f.id === sh.project)

  const shellAddHtml = () => shellPlaces(board().floors).length ? `<button class="tab-add" popovertarget="shell-pick" aria-label="new shell" data-tip="new shell: pick a directory">${ICON.plus}</button>` : ''

  /** The directories a new shell can start in, the floor in view first, each floor under its name. */
  function shellPickHtml() {
    const places = shellPlaces(board().floors, floorInView())
    return [...new Set(places.map((p) => p.project))].map((project) => `<div class="pick-floor eyebrow" style="${paint(project)}">${esc(/** @type {Floor} */ (floorOf(project)).name)}</div>` +
      places.filter((p) => p.project === project).map((p) => `<button data-shell-project="${esc(p.project)}" data-shell-dir="${esc(p.dir)}" data-tip="${esc(p.dir)}">${esc(p.name)}${p.worktree ? ` <small>${ICON.branch} ${esc(p.worktree)}</small>` : ''}</button>`).join('')).join('')
  }
  $('shell-pick').addEventListener('toggle', (e) => e.newState === 'open' && ($('shell-pick').innerHTML = shellPickHtml()))
  placeOnOpen($('shell-pick'), () => /** @type {HTMLElement} */ ($('tabs').querySelector('.tab-add')))

  function renderDock() {
    if (!board().termsUp) return ($('tabs').innerHTML = `<span>shells: ${esc(whyNot(board(), 'shell'))}</span>`)
    if (!board().shells.length) return ($('tabs').innerHTML = `${shellAddHtml()}<span>no shells · ${ICON.plus} starts one in a floor's directory</span>`)
    $('tabs').innerHTML = shellAddHtml() + [...board().shells].sort(byStart).map((sh) =>
      `<button class="tab ${sh.id === shell?.id ? 'open' : ''}" style="${paint(sh.project)}" data-shell="${sh.id}" data-tip="${esc(sh.cwd)}">
      <span class="where">${esc(shellWhere(shellFloor(sh), sh))}</span><span class="what">${esc(sh.activity)}</span>
      <span class="icon-btn" data-kill-shell="${sh.id}" aria-hidden="true" data-tip="kill this shell">${ICON.close}</span></button>`).join('')
  }

  /** @param {string} id */
  function openShell(id) {
    closeShell()
    const opening = /** @type {ShellView} */ ({ id })
    shell = opening
    $('shell-pane').style.cssText = paint(board().shells.find((sh) => sh.id === id)?.project)
    $('main').classList.add('shell-open')
    opening.stop = tower.watch(`shell/${id}`, (streamed) => {
      const msg = /** @type {ShellStream} */ (streamed)
      if (msg.t === 'snapshot') mountShell(msg)
      if (msg.t === 'o') mounted().term.write(msg.data)
      if (msg.t === 'error') (toast(msg.message), closeShell())
      if (msg.t === 'x') closeShell()
    })
    renderDock()
  }

  /** The stream sends a snapshot again each time it reconnects, as after a tower restart: it replaces the terminal. @param {Extract<ShellStream, { t: 'snapshot' }>} snapshot */
  function mountShell({ data, cols, rows }) {
    const open = /** @type {NonNullable<typeof shell>} */ (shell)
    open.term?.dispose()
    const id = open.id
    const term = new Terminal({ cols, rows, fontSize: termFont().size, fontFamily: termFont().family, cursorBlink: false, scrollback: SHELL_SCROLLBACK, theme: terminalTheme(scheme()) })
    const fit = new FitAddon.FitAddon()
    term.loadAddon(fit)
    term.open($('s-screen'))
    term.write(data)
    /** @param {string} d */
    const typed = (d) => document.activeElement === term.textarea && sendShellKeys(id, d)
    term.attachCustomKeyEventHandler(terminalKeymap(() => board().keys, run, typed))
    term.onData(typed)
    Object.assign(open, { term, fit, size: { cols, rows } })
    fitShell()
    term.focus()
  }

  /** The open shell takes the size of its pane. */
  function fitShell() {
    if (!shell?.term) return
    shell.fit.fit()
    const { cols, rows } = shell.term
    if (cols === shell.size.cols && rows === shell.size.rows) return
    shell.size = { cols, rows }
    told(tower.call('shell/resize', { id: shell.id, cols, rows }))
  }

  /** The open shell takes a new face and size. @param {ReturnType<typeof terminalFont>} font */
  function refontShell(font) {
    if (!shell?.term) return
    Object.assign(shell.term.options, { fontFamily: font.family, fontSize: font.size })
    fitShell()
  }

  /** The open shell's terminal, once mounted. */
  const shellTerm = () => shell?.term

  /** A shell's tab opens its view, or closes it when it is the one open. @param {string} id */
  const toggleShell = (id) => (id === shell?.id ? closeShell() : openShell(id))

  /** Closes the view only: the shell keeps running until it is killed. */
  function closeShell() {
    shell?.stop()
    shell?.term?.dispose()
    shell = undefined
    $('s-screen').innerHTML = ''
    $('main').classList.remove('shell-open')
    renderDock()
  }

  /** A shell starts on a floor that offers `shell`. @param {HTMLElement} button @param {string} project @param {string} cwd */
  async function spawnShell(button, project, cwd) {
    const f = /** @type {Floor} */ (floorOf(project))
    const reply = await told(pressing(button, async () => tower.run(offeredCall(f, 'shell', f.name), { cwd })))
    if (reply) openShell(reply.id)
  }

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let shellRefitTimer
  new ResizeObserver(() => {
    clearTimeout(shellRefitTimer)
    shellRefitTimer = setTimeout(fitShell, REFIT_DEBOUNCE_MS)
  }).observe($('s-screen'))

  /** The grip's reading of the shells' height, which stays between 120px and all but 160px of the window. */
  /** @param {number} h */
  const markGrip = (h) => {
    $('grip').setAttribute('aria-valuenow', String(h))
    $('grip').setAttribute('aria-valuemax', String(innerHeight - 160))
  }
  /** @param {number} px */
  const resizeShells = (px) => {
    const h = Math.round(Math.max(120, Math.min(innerHeight - 160, px)))
    $('main').style.setProperty('--shell-h', `${h}px`)
    markGrip(h)
  }
  const SHELLS_STEP_PX = 24

  $('grip').addEventListener('pointerdown', (e) => {
    $('grip').setPointerCapture(e.pointerId)
    const bottom = $('shell-pane').getBoundingClientRect().bottom
    const tabs = $('tabs').offsetHeight
    $('grip').onpointermove = (ev) => resizeShells(bottom - tabs - ev.clientY)
    $('grip').onpointerup = () => ($('grip').onpointermove = null)
  })
  $('grip').addEventListener('focus', () => markGrip($('shell-pane').offsetHeight))
  $('grip').addEventListener('keydown', (e) => {
    const step = { ArrowUp: SHELLS_STEP_PX, ArrowDown: -SHELLS_STEP_PX }[e.key]
    if (!step || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    e.stopPropagation()
    resizeShells($('shell-pane').offsetHeight + step)
  })

  return { shellFloor, renderDock, refontShell, shellTerm, toggleShell, spawnShell }
}
