import { offeredCall } from '/lib/board.js'
import { shellWhere, whyNot } from '/lib/cards.js'
import { shellPlaces } from '/lib/spawn.js'
import { mountTermView } from '/lib/terminal.js'
import { ICON, morphPanel, pressing } from '/lib/view.js'
import { domId } from '/lib/morph.js'
import { esc } from '/lib/words.js'
import { $, byStart, toast, told } from './kit.js'

/**
 * @import { Board, Floor } from '/lib/board.js'
 * @import { ShellStream, TermFont, TermMode, TermViewHandle } from '/lib/terminal.js'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   floorInView: () => string,
 *   paint: (projectId: string | undefined) => string,
 *   floorOf: (project: string) => Floor | undefined,
 *   termFont: () => TermFont,
 *   run: (id: string, e: KeyboardEvent) => boolean,
 *   showMode: (el: HTMLElement, mode: TermMode) => void,
 * }} ShellsDeps
 */

/**
 * The shells docked under the main pane: a tab for each the terms daemon runs, the one open in its own terminal
 * (`/lib/terminal.js`), new ones started in a floor's directory, and their height, set by the split above the dock and kept per viewer.
 * @param {ShellsDeps} deps
 */
export function shells(deps) {
  const { board, floorInView, paint, floorOf, termFont, run, showMode } = deps

  /** The shell open in the dock: its id and terminal view. @type {{ id: string, view: TermViewHandle } | undefined} */
  let shell
  const SHELL_SCROLLBACK = 2000
  /** An open shell's pane, under the dock's tabs: its least height, and its height until the viewer drags. */
  const SHELL_MIN_PX = 120
  const SHELL_DEFAULT = '38vh'

  /** @param {Board['shells'][number]} sh */
  const shellFloor = (sh) => board().floors.find((f) => f.id === sh.project)

  const shellAddHtml = () => shellPlaces(board().floors).length ? `<tower-popover-button for="shell-pick"><button class="tab-add" aria-label="new shell" data-tip="new shell: pick a directory">${ICON.plus}</button></tower-popover-button>` : ''

  /** The directories a new shell can start in, the floor in view first, each floor under its name. */
  function shellPickHtml() {
    const places = shellPlaces(board().floors, floorInView())
    return [...new Set(places.map((p) => p.project))].map((project) => `<div class="pick-floor eyebrow" style="${paint(project)}">${esc(/** @type {Floor} */ (floorOf(project)).name)}</div>` +
      places.filter((p) => p.project === project).map((p) => `<button data-shell-project="${esc(p.project)}" data-shell-dir="${esc(p.dir)}" data-tip="${esc(p.dir)}">${esc(p.name)}${p.worktree ? ` <small>${ICON.branch} ${esc(p.worktree)}</small>` : ''}</button>`).join('')).join('')
  }
  $('shell-pick').addEventListener('openchange', (e) => /** @type {CustomEvent<{ value: boolean }>} */ (e).detail.value && ($('shell-pick').body.innerHTML = shellPickHtml()))

  /** The dock's tabs, each shell's by its id. */
  function dockHtml() {
    if (!board().termsUp) return `<span>shells: ${esc(whyNot(board(), 'shell'))}</span>`
    if (!board().shells.length) return `${shellAddHtml()}<span>no shells · ${ICON.plus} starts one in a floor's directory</span>`
    return shellAddHtml() + [...board().shells].sort(byStart).map((sh) =>
      `<button class="tab ${sh.id === shell?.id ? 'open' : ''}" id="${esc(domId('shell', sh.id))}" style="${paint(sh.project)}" data-shell="${sh.id}" data-tip="${esc(sh.cwd)}">
      <span class="where">${esc(shellWhere(shellFloor(sh), sh))}</span><span class="what">${esc(sh.activity)}</span>
      <span class="icon-btn" data-kill-shell="${sh.id}" aria-hidden="true" data-tip="kill this shell">${ICON.close}</span></button>`).join('')
  }

  const renderDock = () => morphPanel($('tabs'), dockHtml())

  /** @param {string} id */
  function openShell(id) {
    closeShell()
    $('shell-pane').style.cssText = paint(board().shells.find((sh) => sh.id === id)?.project)
    $('main').classList.add('shell-open')
    const chrome = /** @type {HTMLElement} */ ($('shell-pane').parentElement).offsetHeight - $('shell-pane').offsetHeight
    split.setAttribute('min', `${SHELL_MIN_PX + chrome}px`)
    split.setAttribute('default-size', `calc(${SHELL_DEFAULT} + ${chrome}px)`)
    split.removeAttribute('disabled')
    const view = mountTermView($('s-screen'), { Terminal, FitAddon: FitAddon.FitAddon, WebLinksAddon: WebLinksAddon.WebLinksAddon, UnicodeGraphemesAddon: UnicodeGraphemesAddon.UnicodeGraphemesAddon }, {
      watch: (on) => tower.watch(`shell/${id}`, (msg) => on(/** @type {ShellStream} */ (msg))),
      resize: (size) => tower.call('shell/resize', { id, ...size }),
      send: (data) => tower.shellKeys(id, data),
      wheelReports: false,
      scrollback: SHELL_SCROLLBACK,
      font: termFont,
      keymap: () => board().keys,
      run,
      mode: (mode) => showMode($('s-mode'), mode),
      end: (msg) => (msg.t === 'error' && toast(msg.message), closeShell()),
      error: (err) => toast(err.message),
      upload: (name, data) => tower.call('upload', { name, data }).then((r) => r.path),
      files: { cwd: () => /** @type {string} */ (board().shells.find((sh) => sh.id === id)?.cwd), edit: (path, line) => tower.call('edit', { path, line }) },
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
    split.setAttribute('disabled', '')
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

  /** The shells' height, the dock's in px, as this viewer last dragged it: kept in `tower.store`, absent until they do. */
  const HEIGHT_KEY = 'shells.height'
  const split = $('shells-split')
  /** @param {number | null} px */
  const holdHeight = (px) => (px === null ? split.removeAttribute('size') : split.setAttribute('size', `${px}px`))
  tower.store.get(HEIGHT_KEY).then((px) => typeof px === 'number' && holdHeight(px))
  split.addEventListener('sizecommit', (e) => {
    if (e.target !== e.currentTarget) return
    const px = /** @type {CustomEvent<{ value: number | null }>} */ (e).detail.value
    tower.store.set(HEIGHT_KEY, px)
    holdHeight(px)
  })

  return { shellFloor, renderDock, refontShell, reschemeShell, toggleShell, spawnShell, spawnShellAt, focusShell, focusedShell, openShellId, closeShell }
}
