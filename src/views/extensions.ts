import type { Board } from '/lib/board.js'
import { extensionAnchor, extensionsPanelHtml, extensionsSummary } from '/lib/extensions-panel.js'
import { closeHtml, type Mount, paintOnce, viewCss } from '/lib/view.js'

/**
 * `tower/extensions`, the board's view of every extension the tower found: each one's state, version, where it is off,
 * what it tells workers, what it declares and every problem with its fix, those that should run and don't first. Its
 * location's first arg names an extension by id, the entry it opens on.
 */

const ID = 'tower/extensions'

const STYLE = viewCss(
  ID,
  `& .extensions { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-m); background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable; }`,
)

export const mount: Mount = (host, { board: first, kit, args }) => {
  host.innerHTML = `<style>${STYLE}</style><div class="shelf-head"></div><div class="extensions"></div>`
  const [head, list] = [host.querySelector('.shelf-head')!, host.querySelector<HTMLElement>('.extensions')!]

  /** The extension the view opened on, marked in the list. */
  const spotted = args?.[0]
  const entryOf = (id: string) => list.querySelector<HTMLElement>(`#${CSS.escape(extensionAnchor(id))}`)

  const draw = (board: Board) => {
    paintOnce(head, `<span class="label">Extensions</span><span class="actions"><small class="dim">${extensionsSummary(board.extensions)}</small>${closeHtml(board.keys)}</span>`)
    paintOnce(list, extensionsPanelHtml(board.extensions))
    if (spotted) entryOf(spotted)?.classList.add('spot')
  }

  host.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-home]')) kit.display('board')
  })

  draw(first)
  if (spotted) entryOf(spotted)?.scrollIntoView({ block: 'nearest' })

  return {
    update(board: Board) {
      draw(board)
    },
    close() {},
  }
}
