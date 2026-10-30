import { cardSubject, esc } from '/cards.js'
import { ICON } from '/icons.js'

/**
 * The grid: a view on a floor (or the board) drawing up to four workers side by side, each cell the tower's `card.cell`
 * region on its worker, which holds the worker's own view at cell scale: its compact head (or, with heads hidden, one
 * row of its callsign and tabs) over its tabs. Which workers fill the cells is the view's own state, kept per floor
 * (`cells.<floor key>`), so a reload opens the same cells; whether the cells show heads is kept beside it (`head`).
 * The grid's own controls go to each worker's head through its options: Open and ✕ as `acts`, and the callsign as a
 * `pick` of the floor's workers on duty, which puts the one picked in that cell (two cells swap when it has one). Three
 * cells are two over one. A card displayed with this view joins its floor's grid.
 */

const MAX = 4

const STYLE = `
:where([data-view="grid/grid"]) { display: flex; flex-direction: column; gap: var(--sp-s); }
:where([data-view="grid/grid"]) .grid-bar { display: flex; align-items: center; gap: var(--sp-m); color: var(--muted); font-size: var(--fs-s); }
:where([data-view="grid/grid"]) .grid-bar b { color: var(--ink); }
:where([data-view="grid/grid"]) .grid-bar button { margin-left: auto; }
:where([data-view="grid/grid"]) .grid-cells { flex: 1; min-height: 0; display: grid; gap: var(--sp-s); grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); }
:where([data-view="grid/grid"]) .grid-cells.three > .grid-cell:nth-child(3) { grid-column: 1 / -1; }
:where([data-view="grid/grid"]) .grid-cell { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
:where([data-view="grid/grid"]) .grid-cell:focus-within { border-color: var(--ink); }
:where([data-view="grid/grid"]) .grid-note { margin: auto; color: var(--muted); font-size: var(--fs-s); }
`

/** The grid's controls on each worker's head. */
const ACTS = [
  { id: 'open', label: 'Open', tip: 'Open this worker' },
  { id: 'drop', label: 'Take it out of the grid', icon: 'close' },
]

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
  /** Each cell's element, the `card.cell` region on its worker, and the options it was last given, by worker. @type {Map<string, { el: HTMLElement, region: ReturnType<typeof kit.region> | undefined, given: string }>} */
  const cells = new Map()

  const cardOf = (id) => now.floors.flatMap((f) => f.cards).find((c) => c.id === id)
  const keep = () => state.set(`cells.${key}`, ids)
  const label = () => (key === 'board' ? 'every floor' : now.floors.find((f) => `floor:${f.id}` === key)?.name ?? key)

  host.innerHTML = `<style>${STYLE}</style><div class="grid-bar"></div><div class="grid-cells"></div>`
  const bar = host.querySelector('.grid-bar')
  const grid = host.querySelector('.grid-cells')

  /** What the worker in a cell is told: the heads toggle, the grid's controls, the floor's workers on duty to pick from, and no "Add to grid". */
  const optionsOf = (id) => ({
    'tower/card': {
      head,
      acts: ACTS,
      pick: {
        label: 'Swap for a worker on duty',
        tip: 'put another worker in this cell',
        choices: cardsOf(now, key).filter((c) => c.onDuty && c.id !== id).map((c) => ({ id: c.id, ...(ids.includes(c.id) && { note: 'in a cell: swaps places' }) })),
      },
      omit: ['grid/add'],
    },
  })

  /** @param {{ el: HTMLElement, region: ReturnType<typeof kit.region> | undefined }} cell */
  const letGo = (cell) => {
    cell.region?.close()
    cell.region = undefined
  }

  function draw() {
    bar.innerHTML = `<b>Grid</b><span>${esc(label())} · ${ids.length} of ${MAX}</span><button data-grid-heads>${head ? 'Hide heads' : 'Show heads'}</button>`
    grid.style.setProperty('--cols', String(ids.length >= 3 ? 2 : Math.max(ids.length, 1)))
    grid.classList.toggle('three', ids.length === 3)
    for (const [id, cell] of cells) if (!ids.includes(id)) (letGo(cell), cell.el.remove(), cells.delete(id))
    if (!ids.length) grid.innerHTML = `<p class="grid-note">No worker on duty here. Add one with Add to grid on its bar.</p>`
    else grid.querySelector('.grid-note')?.remove()
    ids.forEach((id, n) => {
      let cell = cells.get(id)
      if (!cell) {
        const el = document.createElement('div')
        el.className = 'grid-cell'
        el.dataset.cell = id
        cell = { el, region: undefined, given: '' }
        cells.set(id, cell)
      }
      const c = cardOf(id)
      const options = optionsOf(id)
      const given = JSON.stringify(options)
      if (!c) (letGo(cell), (cell.el.innerHTML = `<p class="grid-note">${esc(id)} is no longer on the board <button class="icon-btn" data-grid-drop aria-label="Take it out of the grid">${ICON.close}</button></p>`))
      else if (!cell.region) cell.region = kit.region(cell.el, 'card.cell', cardSubject(c), options)
      else {
        cell.region.update(cardSubject(c))
        if (given !== cell.given) cell.region.options?.(options)
      }
      cell.given = given
      if (grid.children[n] !== cell.el) grid.insertBefore(cell.el, grid.children[n] ?? null)
    })
  }

  /** @param {string} id */
  const drop = (id) => ((ids = ids.filter((d) => d !== id)), keep(), draw())

  /** The worker `to` takes the cell of `from`: one already in a cell swaps places with it. */
  function swap(from, to) {
    const at = ids.indexOf(from)
    const there = ids.indexOf(to)
    ids = ids.map((id, n) => (n === at ? to : n === there ? from : id))
    keep()
    draw()
  }

  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-grid-drop]')) return drop(e.target.closest('[data-cell]').dataset.cell)
    if (!e.target.closest('[data-grid-heads]')) return
    head = !head
    state.set('head', head)
    draw()
  })
  host.addEventListener('act', (e) => {
    const id = e.target.closest('[data-cell]')?.dataset.cell
    if (!id) return
    if (e.detail.id === 'open') return kit.display(`card:${id}`)
    if (e.detail.id === 'drop') return drop(id)
  })
  host.addEventListener('pick', (e) => {
    const id = e.target.closest('[data-cell]')?.dataset.cell
    if (id) swap(id, e.detail.id)
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
