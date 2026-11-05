import type { Board, Floor } from '../../../src/bridge/board.ts'
import { esc } from '../../../src/shared/cards.ts'
import type { Subject } from '../../../src/shared/subjects.ts'
import type { Mount } from '../../../src/shared/views.ts'
import { closeHtml, paintOnce, viewCss } from '../../../src/views/parts.ts'
import { browser, DIRS_CSS } from './dirs.ts'

/**
 * `floors/repos`, a floor's hub and repos in the main pane: each repo removed with `floors/remove-repo`, and a folder
 * picked with the browser added with `floors/add-repo`. It draws the floor as the board has it, so a change shows once
 * the tower reads the config again.
 */

const ID = 'floors/repos'

const STYLE = viewCss(
  ID,
  `& .floor-repos { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-xl); padding: var(--sp-xl) var(--sp-2xl);
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  & section { display: flex; flex-direction: column; gap: var(--sp-s); }
  & h3 { margin: 0; font-size: var(--fs-s); font-weight: 600; }
  & .hint { color: var(--muted); font-size: var(--fs-s); }
  & ul { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border: 1px solid var(--line); border-radius: var(--radius); }
  & li { display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-s) var(--sp-l); border-bottom: 1px solid var(--line); font: var(--fs-m)/1.3 var(--mono); }
  & li:last-child { border-bottom: 0; }
  & li code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & li.none { color: var(--faint); font-family: inherit; }
  & .picker-actions { display: flex; align-items: center; gap: var(--sp-m); }
  & .picker-actions .hint { flex: 1; min-width: 0; }
  & .error { margin: 0; color: var(--broken); }
  & .error:empty { display: none; }
  ${DIRS_CSS}`,
)

/** Why the folder the browser is at can't be added to the floor's repos: none when it can. */
const repoWhy = (dir: string | undefined, floor: Floor) => {
  if (!dir) return 'browse to a folder'
  if (dir === floor.hub) return 'this is the hub'
  if (floor.repos.includes(dir)) return 'a repo already'
  return undefined
}

export const mount: Mount = (host, { tower, board: first, subject: on, kit }) => {
  let board: Board = first
  let floor = on.value as Floor
  let busy = false

  host.innerHTML = `<style>${STYLE}</style>
  <div class="shelf-head"><span class="label"></span><span class="dim">repos</span><span class="actions"></span></div>
  <div class="floor-repos">
    <section><h3>Hub</h3><small class="hint">Where its sessions start by default; the new-worker form can start one elsewhere.</small><ul data-hub></ul></section>
    <section><h3>Repos</h3><small class="hint">Other folders its sessions also work in. Removing one leaves the folder as it is.</small><ul data-repos></ul></section>
    <section><h3>Add a repo</h3><div data-browse></div>
      <div class="picker-actions"><span class="hint"></span><button type="button" data-add-repo>Add this folder</button></div></section>
    <p class="error" role="alert"></p>
  </div>`
  const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel)!
  const error = $<HTMLElement>('.error')

  const picker = browser($('[data-browse]'), tower, { listed: () => draw(), failed: (message) => void (error.textContent = message) })

  const draw = () => {
    paintOnce($('.shelf-head .label'), esc(floor.name))
    paintOnce($('.shelf-head .actions'), closeHtml(board.keys))
    paintOnce($('[data-hub]'), `<li><code title="${esc(floor.hub)}">${esc(floor.hub)}</code></li>`)
    paintOnce(
      $('[data-repos]'),
      floor.repos.length
        ? floor.repos.map((r) => `<li><code title="${esc(r)}">${esc(r)}</code><button type="button" data-unrepo="${esc(r)}" aria-label="remove ${esc(r)} from the repos">Remove</button></li>`).join('')
        : '<li class="none">none: its sessions work in the hub alone</li>',
    )
    const at = picker.listing()?.path
    const why = repoWhy(at, floor)
    $('.picker-actions .hint').textContent = why ?? `adds ${at}`
    $<HTMLButtonElement>('[data-add-repo]').disabled = busy || why !== undefined
    for (const b of host.querySelectorAll<HTMLButtonElement>('[data-unrepo]')) b.disabled = busy
  }

  /** Calls the verb, its refusal said in the view. */
  const change = async (verb: 'floors/add-repo' | 'floors/remove-repo', path: string) => {
    busy = true
    error.textContent = ''
    draw()
    try {
      await tower.call(verb as never, { project: floor.id, path } as never)
    } catch (err) {
      error.textContent = (err as Error).message
    } finally {
      busy = false
      if (host.isConnected) draw()
    }
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-home]')) return kit.display('board')
    if (target.closest('[data-add-repo]')) {
      const at = picker.listing()?.path
      if (at && !repoWhy(at, floor)) void change('floors/add-repo', at)
      return
    }
    const unrepo = target.closest<HTMLElement>('[data-unrepo]')?.dataset.unrepo
    if (unrepo !== undefined) void change('floors/remove-repo', unrepo)
  })

  draw()
  picker.browse(floor.hub.replace(/\/[^/]+\/?$/, '') || '/')

  return {
    update(next: Board, subject: Subject) {
      board = next
      floor = subject.value as Floor
      draw()
    },
    close() {},
  }
}
