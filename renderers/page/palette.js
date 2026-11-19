import { CAPABILITIES } from '/lib/capabilities.js'
import { domId } from '/lib/morph.js'
import { chordLabel } from '/lib/keys.js'
import { markdownHtml } from '/lib/markdown.js'
import { paletteEntries, rankingOf, rankPalette, rankSpawnPick, spawnPickEntries } from '/lib/palette.js'
import { morphPanel } from '/lib/view.js'
import { esc } from '/lib/words.js'
import { draftsOf } from './clients.js'
import { $, told } from './kit.js'

/**
 * @import { Board, FloorItem } from '/lib/board.js'
 * @import { Pattern } from '/lib/capabilities.js'
 * @import { Heed } from '/lib/cards.js'
 * @import { Entry, Openable, PaletteGroup, Pick } from '/lib/palette.js'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   selected: () => string | undefined,
 *   draftTitle: (project: string, item: FloorItem) => string,
 *   heed: () => Heed,
 *   pick: (does: Pick, row: HTMLElement) => void,
 *   opens: () => Openable[],
 * }} PaletteDeps
 */

/** The entry ids this viewer picked, the latest first, kept in `tower.store`. */
const RECENT_KEY = 'palette.recent'
const RECENT_MAX = 20

/**
 * The command palette (`/lib/palette.js`): one input over the entries for where the viewer stands, grouped, each with its
 * hint and the chords that do the same; ↑↓ move, Enter or a click picks, Esc closes. A pick closes it and goes through
 * `pick`, the page's own handlers. It opens over everything (`openPalette`) or over the floors a worker can start on
 * (`openSpawnPick`), one listing at a time. The patterns sheet lists `GET /patterns`.
 * @param {PaletteDeps} deps
 */
export async function palette(deps) {
  const { board, selected, draftTitle, heed, pick, opens } = deps
  const dialog = $('palette')
  const input = /** @type {HTMLInputElement} */ ($('palette-input'))
  /** @type {string[]} */
  let recent = /** @type {string[] | undefined} */ (await tower.store.get(RECENT_KEY)) ?? []
  /** @type {Entry[]} */
  let shown = []
  /** The entry the active row shows, by its id: a redraw that moves it keeps it active. @type {string | undefined} */
  let active

  const context = () => ({ board: board(), selected: selected(), capabilities: CAPABILITIES, recent, heed: heed(), draftsOf, draftTitle, opens: opens(), stale: tower.stale() !== null })

  /**
   * What the open palette lists: `rank`, its entries in groups for what is typed; `ask`, the input's placeholder and
   * name; `none`, what it says with nothing typed and nothing to list.
   * @typedef {{ rank: (query: string) => PaletteGroup[], ask: string, name: string, none: string }} Listing
   */

  /** @type {Listing} */
  const everything = {
    rank: (query) => {
      const ctx = context()
      return rankPalette(paletteEntries(ctx), query, rankingOf(ctx))
    },
    ask: 'Go to a worker, run a command…',
    name: 'Go to or run',
    none: 'Type to go to a worker, a floor or a draft, or to run a command',
  }

  /** @type {Listing} */
  const floors = {
    rank: (query) => rankSpawnPick(spawnPickEntries(board()), query, rankingOf(context())),
    ask: 'Floor for a new worker…',
    name: 'Floor for a new worker',
    none: 'No floor can start a worker now',
  }

  let listing = everything

  /** @param {Entry} e */
  const rowHtml = (e) => `<div class="pal-item${e.destructive ? ' danger' : ''}${e.learn ? ' learn' : ''}" role="option" id="${esc(domId('pal', e.id))}" aria-selected="${e.id === active}" data-palette-entry="${esc(e.id)}">
    <span class="pal-label">${esc(e.label)}</span>${e.hint ? `<span class="pal-hint">${esc(e.hint)}</span>` : ''}
    ${e.chords?.length ? `<span class="pal-chords">${e.chords.map((t) => `<kbd>${esc(chordLabel(t))}</kbd>`).join('')}</span>` : ''}</div>`

  /** A group's head by its first entry: two groups may share a name (two floors' verbs), never an entry. @param {PaletteGroup} g */
  const groupId = (g) => esc(domId('pal/group', g.entries[0].id))

  /** @param {PaletteGroup[]} groups */
  const listHtml = (groups) =>
    groups.map((g) => `<div role="group" aria-labelledby="${groupId(g)}"><div class="eyebrow pal-group" id="${groupId(g)}">${esc(g.group)}</div>${g.entries.map(rowHtml).join('')}</div>`).join('')

  /** The entry of a row drawn in the list, read from its data. @param {Element} row */
  const entryOf = (row) => /** @type {HTMLElement} */ (row).dataset.paletteEntry

  function draw() {
    const groups = listing.rank(input.value)
    shown = groups.flatMap((g) => g.entries)
    if (!shown.some((e) => e.id === active)) active = shown[0]?.id
    morphPanel($('palette-list'), shown.length ? listHtml(groups) : `<div class="pal-empty">${input.value.trim() ? 'Nothing matches' : esc(listing.none)}</div>`)
    drawActive()
  }

  function drawActive() {
    for (const row of $('palette-list').querySelectorAll('[role=option]')) row.setAttribute('aria-selected', String(entryOf(row) === active))
    const row = active === undefined ? undefined : document.getElementById(domId('pal', active))
    row?.scrollIntoView({ block: 'nearest' })
    if (row) input.setAttribute('aria-activedescendant', row.id)
    else input.removeAttribute('aria-activedescendant')
    $('palette-hint').textContent = shown.find((e) => e.id === active)?.hint ?? ''
  }

  /** @param {string | undefined} id */
  function choose(id) {
    const e = shown.find((e) => e.id === id)
    if (!e) return
    recent = [e.id, ...recent.filter((id) => id !== e.id)].slice(0, RECENT_MAX)
    tower.store.set(RECENT_KEY, recent)
    const row = /** @type {HTMLElement} */ (document.getElementById(domId('pal', e.id)))
    dialog.close()
    pick(e.does, row)
  }

  /** Opens the palette over `over`, or closes it when it is open over `over` already. @param {Listing} over */
  function openOver(over) {
    if (dialog.open && listing === over) return dialog.close()
    listing = over
    input.value = ''
    input.placeholder = over.ask
    input.setAttribute('aria-label', over.name)
    active = undefined
    draw()
    if (!dialog.open) dialog.showModal()
    input.focus()
  }

  const openPalette = () => openOver(everything)
  /** The floors a worker can start on, picked by typing a name: the new-worker form opens on the one picked. */
  const openSpawnPick = () => openOver(floors)

  input.addEventListener('input', () => ((active = undefined), draw()))
  input.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (step && shown.length) {
      e.preventDefault()
      const at = shown.findIndex((e) => e.id === active)
      active = shown[(at + step + shown.length) % shown.length].id
      return drawActive()
    }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      choose(active)
    }
  })
  $('palette-list').addEventListener('pointermove', (e) => {
    const row = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[role=option]'))
    const id = row ? entryOf(row) : active
    if (id !== active) ((active = id), drawActive())
  })
  $('palette-list').addEventListener('click', (e) => {
    const row = /** @type {Element} */ (e.target).closest('[role=option]')
    if (row) choose(entryOf(row))
  })

  /** A pattern, its story's hard-wrapped lines joined. @param {Pattern} p */
  const patternHtml = (p) => `<article class="pattern"><h3>${esc(p.title)}</h3><p class="summary">${esc(p.summary)}</p><div class="md">${markdownHtml(p.story.replace(/(?<!\n)\n(?!\n)/g, ' '))}</div></article>`

  async function showPatterns() {
    const patterns = await told(tower.get('patterns'))
    if (!patterns) return
    $('patterns-list').innerHTML = patterns.map(patternHtml).join('')
    $('patterns').showModal()
    $('patterns').scrollTop = 0
  }

  /** Draws the entries again while the palette is open, as a draft's title arrives. */
  const redraw = () => dialog.open && draw()

  return { openPalette, openSpawnPick, redraw, showPatterns }
}
