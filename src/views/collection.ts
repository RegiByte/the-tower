import type { Board, Floor, FloorCollection } from '../bridge/board.ts'
import { esc, plural } from '../shared/cards.ts'
import { ICON } from '../shared/icons.ts'
import { collectionTrayHtml, itemPath, itemsCss, keptOf, keptTitles } from '../shared/items.ts'
import { itemSubject } from '../shared/subjects.ts'
import { viewsOf, type Mount } from '../shared/views.ts'
import { closeHtml, paintOnce, viewCss } from './parts.ts'

/**
 * `tower/collection`, a collection's view: every item it keeps, newest first, each titled from its text where its type
 * names itself, opened where the renderer displays it. A view on that one collection (`collection.<id>`), such as the
 * drafts editor's new draft, is its `+`.
 */

const ID = 'tower/collection'

const STYLE = `${itemsCss}
${viewCss(
  ID,
  `& .collection-list { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-m); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable; }`,
)}`

export const mount: Mount = (host, { tower, board: first, subject, kit }) => {
  let board = first
  const { project, id } = subject.value as FloorCollection & { project: string }
  const floor = () => board.floors.find((f) => f.id === project) as Floor
  const collection = () => floor().collections.find((c) => c.id === id) as FloorCollection
  /** The view that makes a new item of this collection: one on it alone, `collection.<id>`. */
  const maker = () => viewsOf(board).find((v) => v.on.includes(`collection.${id}`))

  host.innerHTML = `<style>${STYLE}</style><div class="shelf-head"></div><div class="collection-list"></div>`
  const [head, list] = [host.querySelector('.shelf-head')!, host.querySelector('.collection-list')!]

  const { title } = keptTitles((project, collection, id) => tower.text(itemPath(project, collection, id)), () => draw())

  const draw = () => {
    const [f, c] = [floor(), collection()]
    const make = maker()
    const label = make && `new ${make.words.label.toLowerCase()}`
    const plus = make ? `<button data-make aria-label="${esc(label!)}" data-tip="${esc(label!)}">${ICON.plus}</button>` : ''
    paintOnce(head, `<span class="label">${esc(c.label)}</span><span class="dim">${esc(f.name)}</span><span class="actions"><small class="dim">${plural(c.items.length, 'item')}</small>${closeHtml(board.keys)}</span>`)
    paintOnce(list, collectionTrayHtml(f.id, c, (item) => title(f.id, c.id, item), undefined, Date.now(), plus))
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-home]')) return kit.display('board')
    const make = target.closest('[data-make]') && maker()
    if (make) return kit.display(subject.key, { view: make.id })
    const kept = target.closest<HTMLElement>('[data-kept]')?.dataset.kept
    const item = kept && collection().items.find((i) => i.id === keptOf(kept).id)
    if (item) kit.display(itemSubject(project, id, item))
  })

  draw()

  return {
    update(next: Board) {
      board = next
      draw()
    },
    close() {},
  }
}
