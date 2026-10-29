import { commandUrl, esc, subjectAt } from '/cards.js'
import { mountTermView } from '/term-view.js'
import { $ } from './kit.js'

/**
 * @import { Board } from '../../src/bridge/board.ts'
 * @import { Subject } from '../../src/shared/subjects.ts'
 * @import { Kit, Location, Mount, Mounted, View } from '../../src/shared/views.ts'
 * @import { Layout } from '../../src/shared/regions.ts'
 * @import { TermViewHandle } from '../../src/shared/term-view.ts'
 * @import { TerminalMsg } from '../../src/shared/shelf-page.ts'
 * @import { ShellStream } from '../../src/shared/terms.ts'
 * @import { Scheme } from '../../src/shared/design.ts'
 * @import { TermFont } from '../../src/shared/terminal.ts'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   views: () => View[],
 *   layout: () => Layout,
 *   termFont: () => TermFont,
 *   scheme: () => Scheme,
 *   run: (id: string, e: KeyboardEvent) => boolean,
 *   kit: Omit<Kit, 'terminal'>,
 *   gone: () => void,
 * }} HostedDeps
 */

/** The lines a shell's terminal keeps, as the dock's does. */
const SHELL_SCROLLBACK = 2000

/** How long a view's mount may take before its region says it failed. */
const MOUNT_MS = 10_000

/**
 * The view an extension declares, mounted in the main pane at a location (decision `ui-model`): its module imported
 * from `/x/<cap>/`, mounted on the location's subject with the page's kit, updated on each board, closed as the
 * location leaves; its subject gone from the board takes the page home (`gone`). A view that fails says so in one
 * line where it would draw, and the page goes on.
 * @param {HostedDeps} deps
 */
export function hosted(deps) {
  const { board, views, layout, termFont, scheme, run, kit, gone } = deps
  const host = $('view-host')
  /** The view mounted, while one is: what it is, its subject's key, and its mount once it settles. @type {{ view: View, key: string, mounted: Mounted | undefined, pending: Subject[] } | undefined} */
  let open
  /** The terminals the kit opened for the view mounted, which the viewer's face and scheme reach. @type {Set<TermViewHandle>} */
  const terminals = new Set()

  /** @param {string} id @param {string} why */
  const failed = (id, why) => {
    host.innerHTML = `<p class="view-failed">${esc(id)} couldn't draw: ${esc(why)}</p>`
  }

  /** @param {HTMLElement} el @param {`terminal/${string}` | `shell/${string}`} path @returns {TermViewHandle} */
  const terminal = (el, path) => {
    const [stream, id] = /** @type {['terminal' | 'shell', string]} */ (path.split('/'))
    const shell = stream === 'shell'
    const handle = mountTermView(el, { Terminal, FitAddon: FitAddon.FitAddon }, {
      watch: (on) => tower.watch(path, (msg) => on(/** @type {TerminalMsg | ShellStream} */ (msg))),
      resize: (size) => (shell ? tower.call('shell/resize', { id, ...size }) : tower.call('resize', { id, ...size })),
      send: (data) => (shell ? tower.shellKeys(id, data) : tower.keys(id, data)),
      claude: !shell,
      scrollback: shell ? SHELL_SCROLLBACK : 0,
      font: termFont,
      scheme,
      keymap: () => board().keys,
      run,
      mode: () => {},
      end: () => {},
      error: (err) => kit.toast(err.message),
    })
    terminals.add(handle)
    return { ...handle, close: () => (terminals.delete(handle), handle.close()) }
  }

  /** `tower.store` under `view.<id>.<key>`: the view's own. @param {string} id */
  const stateOf = (id) => ({
    /** @param {string} key */
    get: (key) => tower.store.get(`view.${id}.${key}`),
    /** @param {string} key @param {unknown} value */
    set: (key, value) => tower.store.set(`view.${id}.${key}`, value),
  })

  /** Hands the mounted view a subject below the one it is on; false when it didn't take it, or isn't mounted. @param {Subject} subject */
  const show = (subject) => {
    if (!open) return false
    if (!open.mounted) return (open.pending.push(subject), true)
    return open.mounted.show?.(subject) ?? false
  }

  /** @param {Location} location */
  async function enter(location) {
    const view = views().find((v) => v.id === location.view)
    const key = location.subject ?? 'board'
    const subject = subjectAt(board(), key)
    host.dataset.view = location.view
    host.dataset.subject = key
    host.innerHTML = ''
    if (!view?.module || !view.export) return failed(location.view, 'no running extension declares it')
    if (!subject) return gone()
    const entry = { view, key, mounted: /** @type {Mounted | undefined} */ (undefined), pending: /** @type {Subject[]} */ ([]) }
    open = entry
    try {
      const module = await import(commandUrl(view.cap, view.module))
      const mount = /** @type {Mount | undefined} */ (module[view.export])
      if (typeof mount !== 'function') throw new Error(`${commandUrl(view.cap, view.module)} exports no function ${view.export}`)
      const ctx = { tower, board: board(), subject, kit: { ...kit, terminal }, state: stateOf(view.id), options: layout()['board.main']?.options?.[view.id] ?? {} }
      const mounted = await Promise.race([
        Promise.resolve(mount(host, ctx)),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`its mount hadn't settled in ${MOUNT_MS / 1000} s`)), MOUNT_MS)),
      ])
      if (open !== entry) return /** @type {Mounted} */ (mounted).close()
      entry.mounted = /** @type {Mounted} */ (mounted)
      for (const s of entry.pending.splice(0)) if (!entry.mounted.show?.(s)) kit.toast(`${s.key} isn't there any more`)
    } catch (err) {
      if (open === entry) (open = undefined, failed(view.id, /** @type {Error} */ (err).message))
    }
  }

  function leave() {
    const was = open
    open = undefined
    try {
      was?.mounted?.close()
    } finally {
      for (const t of terminals) t.close()
      terminals.clear()
      host.innerHTML = ''
      delete host.dataset.view
      delete host.dataset.subject
    }
  }

  /** The mounted view gets the board, its subject as it stands; a subject the board no longer holds takes the page home. */
  function update() {
    if (!open?.mounted) return
    const subject = subjectAt(board(), open.key)
    if (!subject) return gone()
    try {
      open.mounted.update(board(), subject)
    } catch (err) {
      const { view } = open
      leave()
      failed(view.id, /** @type {Error} */ (err).message)
    }
  }

  const refont = () => terminals.forEach((t) => void t.refont())
  const rescheme = () => terminals.forEach((t) => t.rescheme())

  return { enter, leave, update, show, refont, rescheme, mountedView: () => open?.view.id }
}
