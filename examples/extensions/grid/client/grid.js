import { cardSubject, esc, lampOf, statusName } from '/cards.js'

/**
 * The grid: a view on a floor (or the board) drawing up to four workers side by side, each cell the tower's `card.cell`
 * region on its worker, which holds the worker's own view at cell scale: its tabs, and its head when the grid shows
 * heads. Which workers fill the cells is the view's own state, kept per floor (`cells.<floor key>`), so a reload opens
 * the same cells; whether the cells show heads is kept beside it (`head`). Above each cell is the grid's own strip:
 * whose cell it is, Open and ✕. A card displayed with this view joins its floor's grid.
 */

const MAX = 4

const STYLE = `
:where([data-view="grid/grid"]) { display: flex; flex-direction: column; gap: var(--sp-s); }
:where([data-view="grid/grid"]) .grid-bar { display: flex; align-items: center; gap: var(--sp-m); color: var(--muted); font-size: var(--fs-s); }
:where([data-view="grid/grid"]) .grid-bar b { color: var(--ink); }
:where([data-view="grid/grid"]) .grid-bar button { margin-left: auto; }
:where([data-view="grid/grid"]) .grid-cells { flex: 1; min-height: 0; display: grid; gap: var(--sp-s); grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); }
:where([data-view="grid/grid"]) .grid-cell { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
:where([data-view="grid/grid"]) .grid-cell:focus-within { border-color: var(--ink); }
:where([data-view="grid/grid"]) .grid-head { display: flex; align-items: center; gap: var(--sp-s); padding: var(--sp-2xs) var(--sp-s); border-bottom: 1px solid var(--line); font-size: var(--fs-xs); }
:where([data-view="grid/grid"]) .grid-head .mode { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:where([data-view="grid/grid"]) .grid-head .acts { margin-left: auto; display: flex; gap: var(--sp-2xs); }
:where([data-view="grid/grid"]) .grid-card { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: var(--sp-s); }
:where([data-view="grid/grid"]) .grid-note { margin: auto; color: var(--muted); font-size: var(--fs-s); }
`

/** Every card of the floor `key` names, or of every floor for the board's grid. */
const cardsOf = (board, key) => board.floors.filter((f) => key === 'board' || `floor:${f.id}` === key).flatMap((f) => f.cards)

/** The cells a grid opens with when it has none kept: its floor's workers on duty. */
const seed = (board, key) => cardsOf(board, key).filter((c) => c.onDuty).slice(0, MAX).map((c) => c.id)

export async function mount(host, { board, subject, kit, state }) {
  const key = subject.key
  /** @type {string[]} */
  let ids = (await state.get(`cells.${key}`)) ?? seed(board, key)
  let head = (await state.get('head')) ?? true
  let now = board
  /** Each cell's element and the `card.cell` region on its worker, by worker. @type {Map<string, { el: HTMLElement, region: ReturnType<typeof kit.region> | undefined }>} */
  const cells = new Map()

  const cardOf = (id) => now.floors.flatMap((f) => f.cards).find((c) => c.id === id)
  const keep = () => state.set(`cells.${key}`, ids)
  const label = () => (key === 'board' ? 'every floor' : now.floors.find((f) => `floor:${f.id}` === key)?.name ?? key)

  host.innerHTML = `<style>${STYLE}</style><div class="grid-bar"></div><div class="grid-cells"></div>`
  const bar = host.querySelector('.grid-bar')
  const grid = host.querySelector('.grid-cells')

  const headHtml = (id) => {
    const c = cardOf(id)
    return `<span class="lamp ${esc(c ? lampOf(c) : 'quiet')}"></span><b>${esc(c?.callsign ?? id)}</b><span class="mode">${esc(c ? statusName(c) : 'no longer on the board')}</span>
      <span class="acts"><button class="icon-btn" data-grid-open="${esc(id)}" title="Open this worker">Open</button><button class="icon-btn" data-grid-drop="${esc(id)}" title="Take it out of the grid">✕</button></span>`
  }

  /** @param {{ el: HTMLElement, region: ReturnType<typeof kit.region> | undefined }} cell */
  const letGo = (cell) => {
    cell.region?.close()
    cell.region = undefined
  }

  function draw() {
    bar.innerHTML = `<b>Grid</b><span>${esc(label())} · ${ids.length} of ${MAX}</span><button data-grid-heads>${head ? 'Hide heads' : 'Show heads'}</button>`
    grid.style.setProperty('--cols', String(ids.length === 4 ? 2 : Math.max(ids.length, 1)))
    for (const [id, cell] of cells) if (!ids.includes(id)) (letGo(cell), cell.el.remove(), cells.delete(id))
    if (!ids.length) grid.innerHTML = `<p class="grid-note">No worker on duty here. Add one with Add to grid on its bar.</p>`
    else grid.querySelector('.grid-note')?.remove()
    ids.forEach((id, n) => {
      let cell = cells.get(id)
      if (!cell) {
        const el = document.createElement('div')
        el.className = 'grid-cell'
        el.innerHTML = `<div class="grid-head"></div><div class="grid-card"></div>`
        cell = { el, region: undefined }
        cells.set(id, cell)
      }
      const c = cardOf(id)
      if (!c) letGo(cell)
      else if (cell.region) cell.region.update(cardSubject(c))
      else cell.region = kit.region(cell.el.querySelector('.grid-card'), 'card.cell', cardSubject(c), { 'tower/card': { head } })
      if (grid.children[n] !== cell.el) grid.insertBefore(cell.el, grid.children[n] ?? null)
      cell.el.querySelector('.grid-head').innerHTML = headHtml(id)
    })
  }

  host.addEventListener('click', (e) => {
    const t = e.target
    if (t.closest('[data-grid-heads]')) {
      head = !head
      state.set('head', head)
      for (const cell of cells.values()) letGo(cell)
      return draw()
    }
    const open = t.closest('[data-grid-open]')?.dataset.gridOpen
    if (open) return kit.display(`card:${open}`)
    const drop = t.closest('[data-grid-drop]')?.dataset.gridDrop
    if (drop) return (ids = ids.filter((id) => id !== drop), keep(), draw())
  })

  draw()
  return {
    update(next) {
      now = next
      draw()
    },
    show(s) {
      if (s.key === key) return true
      if (s.kind !== 'card' || (key !== 'board' && `floor:${s.project}` !== key)) return false
      if (!ids.includes(s.value.id)) (ids = [...ids, s.value.id].slice(-MAX), keep(), draw())
      return true
    },
    close() {
      for (const cell of cells.values()) letGo(cell)
      cells.clear()
    },
  }
}

/** Add to grid: the worker shown by the grid, which joins its floor's cells (or the open board grid's). */
export const add = ({ target, kit }) => kit.display(target, { view: 'grid/grid' })
