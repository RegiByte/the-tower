import { can, cardSubject, floorSettingsOf, floorSubject, settingsOf } from '/lib/board.js'
import { heededWaits, lampOf, statusName } from '/lib/cards.js'
import { ICON } from '/lib/view.js'
import { VIEWER_KEYS } from '/lib/viewer.js'
import { esc } from '/lib/words.js'

/**
 * The grid: a view on a floor (or the board) drawing up to four workers side by side, each cell the tower's `card.cell`
 * region on its worker, which holds the worker's own view at cell scale: its compact head (or, with heads hidden, one
 * row of its callsign and tabs) over its tabs. Which workers fill the cells is the view's own state, kept per floor
 * (`cells.<floor key>`), so a reload opens the same cells; whether the cells show heads is kept beside it (`head`).
 * The grid's own controls go to each worker's head through its options: Open and ✕ as `acts`, and the callsign as a
 * `pick` of the floor's workers on duty, which puts the one picked in that cell (two cells swap when it has one). The
 * grid's bar adds a cell while it has room: Add worker, a menu of the floor's workers on duty not in a cell, then New
 * worker…, the tower's new-worker form on the floor (`kit.spawn`, where the renderer lends it; one row per floor on the
 * board's grid), whose worker takes a new cell, drawn as starting until the board carries it, the page staying on the
 * grid. A reload while it
 * starts keeps its cell but not that it is starting: the cell shows the worker, or that it isn't on the board, with
 * Pick a worker: the floor's workers on duty in no cell, the one picked taking that cell's place. Three
 * cells are two over one. A card displayed with this view joins its floor's grid. A cell whose worker waits on you
 * (`heededWaits`: the board's waits the viewer hasn't dismissed, the tower page's "waiting on you") flashes in its
 * attention's colour (`FLASH`): red while it needs you, green while its answer is unread, the failed colour after a
 * failed turn. It stops when the wait is over, as typing to the worker ends it, or when the viewer dismisses it. The
 * setting `flash` says whether cells flash at all, read from the board, and the bar's Flash button changes it in the
 * config, so it follows the user to every browser. The floor's own value wins, so the button writes there when it has
 * one. The ring is its own layer, opacity alone animated, so a flash repaints nothing and the cell's border stays
 * the focus ring.
 */

const MAX = 4

/** This extension's capability: the name its settings go by on the board and in the config. */
const CAP = 'grid'

/** The attentions a cell flashes in, each in its palette colour, and how long one flash takes. */
const FLASH = { needs: '1.1s', ready: '2.2s', broken: '2.2s' }

/** The values of the setting `flash`, in the order the bar's button steps through them. */
const FLASH_MODES = ['off', 'steady', 'blink']

const STYLE = `
:where([data-view="grid/grid"]) { display: flex; flex-direction: column; gap: var(--sp-s); }
:where([data-view="grid/grid"]) .grid-bar { display: flex; align-items: center; gap: var(--sp-m); color: var(--muted); font-size: var(--fs-s); }
:where([data-view="grid/grid"]) .grid-bar b { color: var(--ink); }
:where([data-view="grid/grid"]) .grid-bar > span { margin-right: auto; }
:where([data-view="grid/grid"]) .grid-add { margin: 0; position: fixed; inset: auto; height: auto; width: max-content; min-width: 14rem; max-height: 60vh; overflow: auto; padding: var(--sp-xs) 0;
  background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-pop); font-size: var(--fs-s); }
:where([data-view="grid/grid"]) .grid-add h3 { margin: 0; padding: var(--sp-xs) var(--sp-m); color: var(--faint); font-size: var(--fs-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
:where([data-view="grid/grid"]) .grid-add button { display: flex; align-items: center; gap: var(--sp-s); width: 100%; min-height: 0; padding: var(--sp-xs) var(--sp-m); border: 0; border-radius: 0; background: none;
  color: var(--ink); font-weight: 400; text-align: left; }
:where([data-view="grid/grid"]) .grid-add button:hover, :where([data-view="grid/grid"]) .grid-add button:focus-visible { background: var(--panel-2); }
:where([data-view="grid/grid"]) .grid-add small { margin-left: auto; padding-left: var(--sp-l); color: var(--muted); }
:where([data-view="grid/grid"]) .grid-add .none { padding: var(--sp-xs) var(--sp-m); color: var(--muted); }
:where([data-view="grid/grid"]) .grid-add [data-grid-new] { margin-top: var(--sp-xs); border-top: 1px solid var(--line); padding-top: var(--sp-s); }
:where([data-view="grid/grid"]) .grid-add [data-grid-new] + [data-grid-new] { margin-top: 0; border-top: 0; padding-top: var(--sp-xs); }
:where([data-view="grid/grid"]) .grid-cells { flex: 1; min-height: 0; display: grid; gap: var(--sp-s); grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); }
:where([data-view="grid/grid"]) .grid-cells.three > .grid-cell:nth-child(3) { grid-column: 1 / -1; }
:where([data-view="grid/grid"]) .grid-cell { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
:where([data-view="grid/grid"]) .grid-cell:focus-within { border-color: var(--ink); }
${Object.entries(FLASH).map(([a, d]) => `:where([data-view="grid/grid"]) .grid-cell[data-flash="${a}"] { --flash: var(--${a}); --flash-time: ${d}; }`).join('\n')}
:where([data-view="grid/grid"]) .grid-cell[data-flash] { position: relative; }
:where([data-view="grid/grid"]) .grid-cell[data-flash]::after { content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none; border-radius: inherit; box-shadow: inset 0 0 0 2px var(--flash), inset 0 0 12px var(--flash); }
:where([data-view="grid/grid"]) .grid-cells[data-flash-mode="blink"] .grid-cell[data-flash]::after { animation: grid-flash var(--flash-time) ease-in-out infinite; }
@keyframes grid-flash { 50% { opacity: 0; } }
:where([data-view="grid/grid"]) .grid-note { margin: auto; color: var(--muted); font-size: var(--fs-s); }
`

/** The grid's controls on each worker's head. */
const ACTS = [
  { id: 'open', label: 'Open', tip: 'Open this worker' },
  { id: 'drop', label: 'Take it out of the grid', icon: 'close' },
]

/** The floor `key` names, or every floor for the board's grid. */
const floorsOf = (board, key) => board.floors.filter((f) => key === 'board' || `floor:${f.id}` === key)

/** Every card of the floors a grid holds. */
const cardsOf = (board, key) => floorsOf(board, key).flatMap((f) => f.cards)

/** The cells a grid opens with when it has none kept: its floor's workers on duty. */
const seed = (board, key) => cardsOf(board, key).filter((c) => c.onDuty).slice(0, MAX).map((c) => c.id)

/** `randomUUID` needs a secure context, and a tower may be reached by a host name over plain http; `getRandomValues` does not. */
const uuid = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function mount(host, { tower, board, subject, kit, state }) {
  const key = subject.key
  /** @type {string[]} */
  let ids = (await state.get(`cells.${key}`)) ?? seed(board, key)
  let head = (await state.get('head')) ?? true
  let now = board
  /** Each cell's element, the `card.cell` region on its worker, and the options it was last given, by worker. @type {Map<string, { el: HTMLElement, region: ReturnType<typeof kit.region> | undefined, given: string }>} */
  const cells = new Map()
  /** The workers this grid started whose cards the board doesn't carry yet: drawn as starting, not as gone. @type {Set<string>} */
  const starting = new Set()
  /** The waits the viewer dismissed, as every renderer of theirs keeps them, read again when the page sets them. */
  const dismissedNow = async () => new Set(/** @type {string[] | undefined} */ (await tower.store.get(VIEWER_KEYS.dismissed)) ?? [])
  let dismissed = await dismissedNow()
  const unhear = tower.store.on((k) => k === VIEWER_KEYS.dismissed && void dismissedNow().then((d) => ((dismissed = d), draw())))

  const cardOf = (id) => now.floors.flatMap((f) => f.cards).find((c) => c.id === id)
  /** A board carries no settings for an extension the tower refuses while its view is open: the cells stay, unflashing. */
  const flashNow = () => /** @type {{ flash: string } | undefined} */ (key === 'board' ? settingsOf(now, CAP) : floorSettingsOf(now, CAP, subject.project))?.flash ?? 'off'
  /** The next mode, kept where the mode in force comes from: the floor's own value, or else the system's. */
  const stepFlash = async () => {
    const config = await tower.get('config')
    const system = ['extensions', CAP, 'settings', 'flash']
    const floor = key !== 'board' && ['projects', subject.project, ...system]
    const valueAt = (at) => at.reduce((held, k) => held?.[k], config)
    const at = floor && valueAt(floor) !== undefined ? floor : system
    const was = valueAt(at)
    const value = FLASH_MODES[(FLASH_MODES.indexOf(flashNow()) + 1) % FLASH_MODES.length]
    await (was === undefined ? tower.call('config/add', { key: at, value }) : tower.call('config/set', { key: at, value, was })).catch((err) => kit.toast(err.message))
  }
  const keep = () => state.set(`cells.${key}`, ids)
  const label = () => (key === 'board' ? 'every floor' : floorsOf(now, key)[0]?.name ?? key)

  const pop = `grid-add-${uuid()}`
  host.innerHTML = `<style>${STYLE}</style><div class="grid-bar"><b>Grid</b><span></span><button data-grid-open-add popovertarget="${pop}">Add worker</button><button data-grid-flash data-tip="How a cell shows that its worker waits on you, in every browser: off, a steady ring, or a blinking one"></button><button data-grid-heads></button><div class="grid-add" id="${pop}" popover></div></div><div class="grid-cells"></div><div class="grid-add" id="${pop}-fill" popover></div>`
  const bar = host.querySelector('.grid-bar')
  const adder = bar.querySelector('[data-grid-open-add]')
  const menu = bar.querySelector('.grid-add')
  const grid = host.querySelector('.grid-cells')
  const filler = host.querySelector(`[id="${pop}-fill"]`)
  /** The gone-home cell whose worker the filler's menu picks, set when the menu opens. @type {string | undefined} */
  let filling

  /** The menu opens under Add worker, its right edge on the button's. */
  menu.addEventListener('beforetoggle', (e) => {
    if (e.newState !== 'open') return
    const at = adder.getBoundingClientRect()
    Object.assign(menu.style, { top: `${at.bottom + 4}px`, right: `${document.documentElement.clientWidth - at.right}px` })
  })

  let painted = ''
  let paintedFill = ''

  /** New worker…, on each floor the grid holds where a worker can start now (none while the host is down), when the renderer lends `kit.spawn`. */
  const newRowsHtml = (attrs = '') =>
    (kit.spawn ? floorsOf(now, key) : [])
      .filter((f) => can(f, 'spawn'))
      .map((f) => `<button data-grid-new="${esc(f.id)}" ${attrs}>${ICON.plus}${key === 'board' ? `New worker on ${esc(f.name)}…` : 'New worker…'}</button>`)
      .join('')

  /** The floor's workers on duty and in no cell, each a button carrying `attr`, by its lamp, callsign and status, or a note that there are none. */
  const freeWorkersHtml = (attr) =>
    cardsOf(now, key)
      .filter((c) => c.onDuty && !ids.includes(c.id))
      .map((c) => `<button ${attr}="${esc(c.id)}"><span class="lamp ${lampOf(c)}"></span>${esc(c.callsign)}<small>${esc(statusName(c))}</small></button>`)
      .join('') || '<div class="none">no other worker on duty</div>'

  /** The menu of workers to add: the free workers, then New worker…. */
  const addMenuHtml = () => `<h3>Add a worker on duty</h3>${freeWorkersHtml('data-grid-add')}${newRowsHtml()}`

  /** The menu of workers to put in a gone-home cell. */
  const replaceMenuHtml = () => `<h3>Put a worker in this cell</h3>${freeWorkersHtml('data-grid-fill')}${newRowsHtml('data-grid-fill-new')}`

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
    bar.querySelector('span').textContent = `${label()} · ${ids.length} of ${MAX}`
    bar.querySelector('[data-grid-heads]').textContent = head ? 'Hide heads' : 'Show heads'
    adder.hidden = ids.length >= MAX
    if (adder.hidden && menu.matches(':popover-open')) menu.hidePopover()
    const items = addMenuHtml()
    if (items !== painted) menu.innerHTML = painted = items
    const fills = replaceMenuHtml()
    if (fills !== paintedFill) filler.innerHTML = paintedFill = fills
    grid.style.setProperty('--cols', String(ids.length >= 3 ? 2 : Math.max(ids.length, 1)))
    grid.classList.toggle('three', ids.length === 3)
    for (const [id, cell] of cells) if (!ids.includes(id)) (letGo(cell), cell.el.remove(), cells.delete(id))
    for (const id of starting) if (!ids.includes(id)) starting.delete(id)
    const mode = flashNow()
    bar.querySelector('[data-grid-flash]').textContent = `Flash: ${mode}`
    grid.dataset.flashMode = mode
    const waits = new Set(mode === 'off' ? [] : heededWaits(now, { dismissed }).map((w) => w.id))
    if (!ids.length) grid.innerHTML = `<p class="grid-note">No worker here yet. Add one with Add worker, or Add to grid on its bar.</p>`
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
      if (c) starting.delete(id)
      if (c && waits.has(id) && c.attention in FLASH) cell.el.dataset.flash = c.attention
      else delete cell.el.dataset.flash
      const options = optionsOf(id)
      const given = JSON.stringify(options)
      const gone = starting.has(id) ? 'Starting a worker…' : `${esc(id)} is no longer on the board`
      if (!c) (letGo(cell), (cell.el.innerHTML = `<p class="grid-note">${gone} ${starting.has(id) ? '' : '<button data-grid-fill-open>Pick a worker</button> '}<button class="icon-btn" data-grid-drop aria-label="Take it out of the grid">${ICON.close}</button></p>`))
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

  /** The worker `id` takes a new cell; in a full grid, the first cell's place. @param {string} id */
  const join = (id) => {
    if (ids.includes(id)) return
    ids = [...ids, id].slice(-MAX)
    keep()
    draw()
  }

  /** The tower's new-worker form on the floor `project`: the id of the worker it starts, drawn as starting until the board carries it. @param {string} project */
  async function spawnOn(project) {
    const f = now.floors.find((f) => f.id === project)
    if (!f) return
    const id = await kit.spawn(floorSubject(f))
    if (id) starting.add(id)
    return id
  }

  /** The worker started on `project` takes a new cell. @param {string} project */
  async function startOn(project) {
    menu.hidePopover()
    const id = await spawnOn(project)
    if (id) join(id)
  }

  /** The worker started on `project` takes the place of the gone-home cell `gone`. @param {string} gone @param {string} project */
  async function startIn(gone, project) {
    filler.hidePopover()
    const id = await spawnOn(project)
    if (id) fill(gone, id)
  }

  /** The worker `to` takes the cell of `from`: one already in a cell swaps places with it. */
  function swap(from, to) {
    const at = ids.indexOf(from)
    const there = ids.indexOf(to)
    ids = ids.map((id, n) => (n === at ? to : n === there ? from : id))
    keep()
    draw()
  }

  /** The worker `to` takes the place of the gone-home cell `gone`, in one write. */
  function fill(gone, to) {
    ids = ids.map((id) => (id === gone ? to : id))
    keep()
    draw()
  }

  host.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-grid-fill-open]')
    if (opener) {
      filling = opener.closest('[data-cell]').dataset.cell
      const at = opener.getBoundingClientRect()
      filler.showPopover()
      const left = Math.max(8, Math.min(at.left, document.documentElement.clientWidth - filler.offsetWidth - 8))
      return Object.assign(filler.style, { top: `${at.bottom + 4}px`, left: `${left}px` })
    }
    const filled = e.target.closest('[data-grid-fill]')
    if (filled) return (filler.hidePopover(), fill(filling, filled.dataset.gridFill))
    if (e.target.closest('[data-grid-drop]')) return drop(e.target.closest('[data-cell]').dataset.cell)
    const added = e.target.closest('[data-grid-add]')
    if (added) return (menu.hidePopover(), join(added.dataset.gridAdd))
    const freshHere = e.target.closest('[data-grid-fill-new]')
    if (freshHere) return void startIn(filling, freshHere.dataset.gridNew)
    const fresh = e.target.closest('[data-grid-new]')
    if (fresh) return void startOn(fresh.dataset.gridNew)
    if (e.target.closest('[data-grid-flash]')) return void stepFlash()
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
      join(s.value.id)
      return true
    },
    close() {
      unhear()
      for (const cell of cells.values()) letGo(cell)
      cells.clear()
    },
  }
}

/** Add to grid: the worker shown by the grid, which joins its floor's cells (or the open board grid's). */
export const add = ({ target, kit }) => kit.display(target, { view: 'grid/grid' })
