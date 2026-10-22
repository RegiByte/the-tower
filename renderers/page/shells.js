import { whyNot, offeredCall, esc, shellPlaces, shellWhere } from '/cards.js'
import { ICON } from '/icons.js'
import { $, byStart, toast, told } from './kit.js'
import { mountTermView } from '/term-view.js'
import { placeOnOpen } from '/tips.js'
import { pressing } from '/press.js'

/**
 * @import { Board, Floor } from '../../src/bridge/board.ts'
 * @import { ShellStream } from '../../src/shared/terms.ts'
 * @import { TermMode, TermViewHandle } from '../../src/shared/term-view.ts'
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
 *   showMode: (el: HTMLElement, mode: TermMode) => void,
 * }} ShellsDeps
 */

/**
 * The shells docked under the main pane: a tab for each the terms daemon runs, the one open in its own terminal
 * (`/term-view.js`), new ones started in a floor's directory, and the grip that sets their height.
 * @param {ShellsDeps} deps
 */
export function shells(deps) {
  const { board, floorInView, paint, floorOf, termFont, scheme, run, showMode } = deps

  /** The shell open in the dock: its id and terminal view. @type {{ id: string, view: TermViewHandle } | undefined} */
  let shell
  const SHELL_SCROLLBACK = 2000

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
    $('shell-pane').style.cssText = paint(board().shells.find((sh) => sh.id === id)?.project)
    $('main').classList.add('shell-open')
    const view = mountTermView($('s-screen'), { Terminal, FitAddon: FitAddon.FitAddon }, {
      watch: (on) => tower.watch(`shell/${id}`, (msg) => on(/** @type {ShellStream} */ (msg))),
      resize: (size) => tower.call('shell/resize', { id, ...size }),
      send: (data) => tower.shellKeys(id, data),
      claude: false,
      scrollback: SHELL_SCROLLBACK,
      font: termFont,
      scheme,
      keymap: () => board().keys,
      run,
      mode: (mode) => showMode($('s-mode'), mode),
      end: (msg) => (msg.t === 'error' && toast(msg.message), closeShell()),
      error: (err) => toast(err.message),
    })
    shell = { id, view }
    renderDock()
  }

  /** The open shell takes the viewer's new face and size. */
  const refontShell = () => void shell?.view.refont()

  const reschemeShell = () => shell?.view.rescheme()

  /** A shell's tab opens its view, or closes it when it is the one open. @param {string} id */
  const toggleShell = (id) => (id === shell?.id ? closeShell() : openShell(id))

  /** Focuses the shell `id`, opened in the dock unless it is the one open there. @param {string} id */
  const focusShell = (id) => (id === shell?.id ? shell.view.term()?.focus() : openShell(id))

  /** The id of the shell open in the dock. */
  const openShellId = () => shell?.id

  /** The id of the shell open in the dock while focus is in it. */
  const focusedShell = () => (shell && $('s-screen').contains(document.activeElement) ? shell.id : undefined)

  /** Closes the view only: the shell keeps running until it is killed. */
  function closeShell() {
    shell?.view.close()
    shell = undefined
    $('s-mode').textContent = ''
    $('main').classList.remove('shell-open')
    renderDock()
  }

  /** A shell starts on a floor that offers `shell`. @param {HTMLElement} button @param {string} project @param {string} cwd */
  async function spawnShell(button, project, cwd) {
    const f = /** @type {Floor} */ (floorOf(project))
    const reply = await told(pressing(button, async () => tower.run(offeredCall(f, 'shell', f.name), { cwd })))
    if (reply) openShell(reply.id)
  }

  /** A shell started from the keyboard, pressed as the sidebar's button for its directory is, drawn or not. @param {string} project @param {string} cwd */
  function spawnShellAt(project, cwd) {
    const button = document.createElement('button')
    Object.assign(button.dataset, { shellProject: project, shellDir: cwd })
    return spawnShell(button, project, cwd)
  }

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

  return { shellFloor, renderDock, refontShell, reschemeShell, toggleShell, spawnShell, spawnShellAt, focusShell, focusedShell, openShellId, closeShell }
}
