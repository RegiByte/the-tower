import { CAPABILITIES } from '/capabilities.js'
import { esc } from '/cards.js'
import { chordLabel } from '/keymap.js'
import { markdownHtml } from '/markdown.js'
import { paletteEntries, rankPalette, rankingOf } from '/palette.js'
import { draftsOf } from '/x/drafts/drafts.js'
import { $, told } from './kit.js'

/**
 * @import { Board, FloorItem } from '../../src/bridge/board.ts'
 * @import { Entry, Pick, PaletteGroup } from '../../src/shared/palette.ts'
 * @import { Pattern } from '../../src/shared/capabilities.ts'
 * @import { Heed } from '../../src/shared/cards.ts'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   selected: () => string | undefined,
 *   draftTitle: (project: string, item: FloorItem) => string,
 *   heed: () => Heed,
 *   pick: (does: Pick, row: HTMLElement) => void,
 * }} PaletteDeps
 */

/** The entry ids this viewer picked, the latest first, kept in `tower.store`. */
const RECENT_KEY = 'palette.recent'
const RECENT_MAX = 20

/**
 * The command palette (`/palette.js`): one input over the entries for where the viewer stands, grouped, each with its
 * hint and the chords that do the same; ↑↓ move, Enter or a click picks, Esc closes. A pick closes it and goes through
 * `pick`, the page's own handlers. The patterns sheet lists `GET /patterns`.
 * @param {PaletteDeps} deps
 */
export async function palette(deps) {
  const { board, selected, draftTitle, heed, pick } = deps
  const dialog = $('palette')
  const input = /** @type {HTMLInputElement} */ ($('palette-input'))
  /** @type {string[]} */
  let recent = /** @type {string[] | undefined} */ (await tower.store.get(RECENT_KEY)) ?? []
  /** @type {Entry[]} */
  let shown = []
  let active = 0

  const context = () => ({ board: board(), selected: selected(), capabilities: CAPABILITIES, recent, heed: heed(), draftsOf, draftTitle })

  /** @param {Entry} e @param {number} n */
  const rowHtml = (e, n) => `<div class="pal-item${e.destructive ? ' danger' : ''}${e.learn ? ' learn' : ''}" role="option" id="pal-${n}" aria-selected="${n === active}" data-palette-entry="${esc(e.id)}">
    <span class="pal-label">${esc(e.label)}</span>${e.hint ? `<span class="pal-hint">${esc(e.hint)}</span>` : ''}
    ${e.chords?.length ? `<span class="pal-chords">${e.chords.map((t) => `<kbd>${esc(chordLabel(t))}</kbd>`).join('')}</span>` : ''}</div>`

  /** @param {PaletteGroup[]} groups */
  const listHtml = (groups) => {
    let n = 0
    return groups.map((g, i) => `<div role="group" aria-labelledby="pal-g${i}"><div class="eyebrow pal-group" id="pal-g${i}">${esc(g.group)}</div>${g.entries.map((e) => rowHtml(e, n++)).join('')}</div>`).join('')
  }

  function draw() {
    const ctx = context()
    const groups = rankPalette(paletteEntries(ctx), input.value, rankingOf(ctx))
    shown = groups.flatMap((g) => g.entries)
    active = Math.min(active, Math.max(shown.length - 1, 0))
    $('palette-list').innerHTML = shown.length ? listHtml(groups) : `<div class="pal-empty">${input.value.trim() ? 'Nothing matches' : 'Type to go to a worker, a floor or a draft, or to run a command'}</div>`
    drawActive()
  }

  function drawActive() {
    for (const row of $('palette-list').querySelectorAll('[role=option]')) row.setAttribute('aria-selected', String(row.id === `pal-${active}`))
    const row = shown.length ? $(`pal-${active}`) : undefined
    row?.scrollIntoView({ block: 'nearest' })
    if (row) input.setAttribute('aria-activedescendant', row.id)
    else input.removeAttribute('aria-activedescendant')
    $('palette-hint').textContent = shown[active]?.hint ?? ''
  }

  /** @param {number} n */
  function choose(n) {
    const e = shown[n]
    if (!e) return
    recent = [e.id, ...recent.filter((id) => id !== e.id)].slice(0, RECENT_MAX)
    tower.store.set(RECENT_KEY, recent)
    const row = /** @type {HTMLElement} */ ($(`pal-${n}`))
    dialog.close()
    pick(e.does, row)
  }

  function openPalette() {
    if (dialog.open) return dialog.close()
    input.value = ''
    active = 0
    draw()
    dialog.showModal()
    input.focus()
  }

  input.addEventListener('input', () => ((active = 0), draw()))
  input.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (step && shown.length) {
      e.preventDefault()
      active = (active + step + shown.length) % shown.length
      return drawActive()
    }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      choose(active)
    }
  })
  $('palette-list').addEventListener('pointermove', (e) => {
    const row = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[role=option]'))
    const n = row ? Number(row.id.slice('pal-'.length)) : active
    if (n !== active) ((active = n), drawActive())
  })
  $('palette-list').addEventListener('click', (e) => {
    const row = /** @type {Element} */ (e.target).closest('[role=option]')
    if (row) choose(Number(row.id.slice('pal-'.length)))
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

  return { openPalette, showPatterns }
}
