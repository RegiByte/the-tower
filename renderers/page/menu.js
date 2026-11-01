import { esc } from '/cards.js'
import { keepingFocus } from '/panels.js'

/**
 * The page's menu for what a region couldn't draw in place (decision `region-overflow`): a button the caller draws
 * opens a popover whose header says what was tucked that can't be pressed (badges, lines, text), and whose list holds
 * what can, as an ARIA menu. It knows nothing of the region it serves: the caller lists the entries and runs the one
 * picked.
 *
 * The popover is placed right after the button, inside the caller's region, so the page's handling of a region's
 * presses finds the subject it was drawn on. A board drawn while it is open repaints its list in place, focus kept on
 * the same entry by its key, or moved to its neighbour when it is gone.
 *
 * Keyboard (the ARIA menu button pattern): Enter, Space or ↓ on the button opens it on its first entry, ↑ on its last;
 * ↑ ↓ Home End move among the entries, a letter goes to the next whose label starts with what was typed; Esc and Tab
 * close it, focus back on the button.
 *
 * @typedef {{ t: 'item', key: string, label: string, hint?: string, danger?: boolean, fresh?: boolean, busy?: boolean, held?: boolean, stays?: boolean }} MenuItem
 *   `key` is unique in the page, as a control asking a thing is named by it while it is busy (`/press.js`), and stable
 *   across boards; `held`, shown but not pressable (its `hint` says why); `stays`, the menu stays open once it runs (it
 *   changes what the menu lists).
 * @typedef {{ t: 'check', key: string, label: string, hint?: string, checked: boolean }} MenuCheck
 *   A choice the menu stays open on, checked or not (`menuitemcheckbox`).
 * @typedef {MenuItem | MenuCheck | { t: 'separator' } | { t: 'group', label: string, entries: MenuEntry[] }} MenuEntry
 * @typedef {{ header: string, entries: MenuEntry[] }} Listing
 *   `header`: html, plain text and badges only: it is the menu's description.
 */

let menus = 0

/** How long typed letters add up to one search. */
const TYPED_MS = 700

/** An entry as the menu draws it: an item a focusable button, a group labelled, its label shown but not read twice. @param {MenuEntry} e @returns {string} */
const entryHtml = (e) => {
  if (e.t === 'separator') return '<div role="separator"></div>'
  if (e.t === 'group') return `<div role="group" aria-label="${esc(e.label)}"><div class="menu-label" aria-hidden="true">${esc(e.label)}</div>${e.entries.map(entryHtml).join('')}</div>`
  if (e.t === 'check')
    return `<button role="menuitemcheckbox" aria-checked="${e.checked}" tabindex="-1" class="menu-item" data-key="${esc(e.key)}"${e.hint ? ` aria-description="${esc(e.hint)}"` : ''}><span class="menu-word">${esc(e.label)}</span>${e.hint ? `<small aria-hidden="true">${esc(e.hint)}</small>` : ''}</button>`
  const classes = ['menu-item', e.danger ? 'danger' : '', e.fresh ? 'fresh' : ''].filter(Boolean).join(' ')
  const description = [e.fresh ? 'new' : '', e.hint ?? ''].filter(Boolean).join('. ')
  return `<button role="menuitem" tabindex="-1" class="${classes}" data-key="${esc(e.key)}"${e.held ? ` aria-disabled="true" data-tip="${esc(e.hint ?? '')}"` : ''}${e.busy ? ' aria-busy="true"' : ''}${description ? ` aria-description="${esc(description)}"` : ''}><span class="menu-word">${esc(e.label)}</span>${e.hint ? `<small aria-hidden="true">${esc(e.hint)}</small>` : ''}</button>`
}

/** Every item and choice of `entries`, groups opened. @param {MenuEntry[]} entries @returns {(MenuItem | MenuCheck)[]} */
const itemsOf = (entries) => entries.flatMap((e) => (e.t === 'item' || e.t === 'check' ? [e] : e.t === 'group' ? itemsOf(e.entries) : []))

/**
 * A menu `control` opens, its entries `draw` gives it, `run` called with the item picked and its element, once the menu
 * has closed unless the item stays (`stays`, a choice). `opening` is called as it opens, before it is placed, so the
 * caller can draw what it lists at that moment; `closed` once it has closed. Answers what the caller drives it by:
 * `draw` again on every board, `open` whether it is open, `focus` an entry by its key (after an entry that stays
 * changed what is listed), `remove` when its region goes.
 * @param {HTMLButtonElement} control
 * @param {{ run(item: MenuItem | MenuCheck, el: HTMLElement): void, opening?(): void, closed?(): void }} on
 */
export function menu(control, on) {
  const id = `region-menu-${++menus}`
  const pop = document.createElement('div')
  pop.className = 'region-menu'
  pop.id = id
  pop.popover = 'auto'
  pop.innerHTML = `<div class="menu-head" id="${id}-head"></div><div role="menu" id="${id}-list" aria-labelledby="${id}-control" aria-describedby="${id}-head"></div>`
  control.after(pop)
  control.id = `${id}-control`
  control.setAttribute('popovertarget', id)
  control.setAttribute('aria-haspopup', 'menu')
  control.setAttribute('aria-expanded', 'false')
  control.setAttribute('aria-controls', `${id}-list`)
  const head = /** @type {HTMLElement} */ (pop.querySelector('.menu-head'))
  const list = /** @type {HTMLElement} */ (pop.querySelector('[role="menu"]'))
  /** The items drawn, by key. @type {Map<string, MenuItem | MenuCheck>} */
  let items = new Map()
  let drawn = { header: '', list: '' }
  /** Where focus goes as the menu opens: its first item or its last. @type {'first' | 'last'} */
  let landing = 'first'
  let typed = ''
  let typedAt = 0

  const buttons = () => /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')])
  const open = () => pop.matches(':popover-open')
  /** @param {number} n */
  const focusAt = (n) => {
    const all = buttons()
    if (all.length) all[(n + all.length) % all.length].focus()
  }
  const at = () => buttons().indexOf(/** @type {HTMLElement} */ (document.activeElement))
  const close = () => {
    if (open()) pop.hidePopover()
  }
  /**
   * Closed from inside, focus back on the button: a popover would hand it back to whatever had it before it opened, and
   * moving it during the popover's own hiding would show the button's tip in the middle of that.
   */
  const closeToControl = () => (control.focus({ preventScroll: true }), close())

  /** The popover under the button, its right edge at the button's, as far down as the window lets it run. */
  function place() {
    const r = control.getBoundingClientRect()
    pop.style.top = `${Math.round(r.bottom + 4)}px`
    pop.style.right = `${Math.round(Math.max(8, innerWidth - r.right))}px`
    pop.style.maxHeight = `${Math.max(160, Math.round(innerHeight - r.bottom - 12))}px`
  }

  pop.addEventListener('beforetoggle', (e) => {
    if (/** @type {ToggleEvent} */ (e).newState !== 'open') return
    on.opening?.()
    place()
  })
  pop.addEventListener('toggle', (e) => {
    const opened = /** @type {ToggleEvent} */ (e).newState === 'open'
    control.setAttribute('aria-expanded', String(opened))
    if (opened) {
      focusAt(landing === 'first' ? 0 : -1)
      landing = 'first'
      return
    }
    if (pop.contains(document.activeElement)) control.focus({ preventScroll: true })
    on.closed?.()
  })

  control.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    landing = e.key === 'ArrowDown' ? 'first' : 'last'
    if (open()) focusAt(landing === 'first' ? 0 : -1)
    else pop.showPopover()
  })

  list.addEventListener('keydown', (e) => {
    const moves = /** @type {Record<string, () => void>} */ ({
      ArrowDown: () => focusAt(at() + 1),
      ArrowUp: () => focusAt(at() - 1),
      Home: () => focusAt(0),
      End: () => focusAt(-1),
      Escape: closeToControl,
      Tab: closeToControl,
    })
    const move = moves[e.key]
    if (move) return (e.preventDefault(), e.stopPropagation(), move())
    if (e.key.length !== 1 || e.key === ' ' || e.metaKey || e.ctrlKey || e.altKey) return
    e.preventDefault()
    e.stopPropagation()
    typed = (performance.now() - typedAt < TYPED_MS ? typed : '') + e.key.toLowerCase()
    typedAt = performance.now()
    const all = buttons()
    const from = at()
    const order = [...all.slice(from + 1), ...all.slice(0, from + 1)]
    const hit = order.find((b) => b.querySelector('.menu-word')?.textContent?.toLowerCase().startsWith(typed))
    hit?.focus()
  })

  list.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[role="menuitem"], [role="menuitemcheckbox"]'))
    if (!el) return
    e.stopPropagation()
    const item = items.get(/** @type {string} */ (el.dataset.key))
    if (!item || el.getAttribute('aria-disabled') === 'true') return
    if (item.t === 'item' && !item.stays) closeToControl()
    on.run(item, el)
  })

  return {
    /** Draws `listing`, repainting only what changed; while open, focus stays on the same entry. @param {Listing} listing */
    draw(listing) {
      items = new Map(itemsOf(listing.entries).map((i) => [i.key, i]))
      if (listing.header !== drawn.header) head.innerHTML = listing.header
      const html = listing.entries.map(entryHtml).join('')
      if (html !== drawn.list) {
        const was = list.contains(document.activeElement) ? at() : -1
        keepingFocus(list, () => (list.innerHTML = html))
        if (was >= 0 && !list.contains(document.activeElement)) focusAt(Math.min(was, buttons().length - 1))
      }
      drawn = { header: listing.header, list: html }
    },
    open,
    close,
    /** Focus on the entry with `key`, while the menu is open. @param {string} key */
    focus: (key) => buttons().find((b) => b.dataset.key === key)?.focus(),
    /** The menu gone with its region: closed, its popover removed, the button left as the caller made it. */
    remove: () => (close(), pop.remove()),
  }
}
