import { extensionsAttention, extensionsListHtml, extensionsSummary, brokenExtensions } from '/lib/extensions-panel.js'
import { placeOnOpen } from '/lib/chrome.js'
import { $, paintOnce, repaint } from './kit.js'

/**
 * @import { Board } from '/lib/board.js'
 * @import { Location } from '/lib/view.js'
 */

/** The core's view of every extension the tower found. */
export const EXTENSIONS_VIEW = 'tower/extensions'

/** How long a pointer rests on the entry before its list opens, and how long the list stays once the pointer leaves. */
const OPEN_AFTER_MS = 150
const CLOSE_AFTER_MS = 250

/**
 * @typedef {{
 *   board: () => Board,
 *   open: (location: Location) => void,
 *   isOpen: () => boolean,
 * }} ExtensionsEntryDeps
 */

/**
 * The Extensions entry in the sidebar's foot: a lamp as loud as the loudest extension and their count. A mouse resting
 * on it, or a keyboard reaching it, opens the list of every extension with its problems inline; a click, or a tap,
 * opens the full view in the main pane, a row of the list opening it on that extension.
 * @param {ExtensionsEntryDeps} deps
 */
export function extensionsEntry({ board, open, isOpen }) {
  const button = $('extensions-open')
  const pop = $('extensions-pop')
  placeOnOpen(pop, () => button)

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const shown = () => pop.matches(':popover-open')
  const within = (/** @type {EventTarget | null} */ el) => el instanceof Node && (button.contains(el) || pop.contains(el))
  /** A keyboard holds the list open while its focus is in it; focus a click left behind does not. */
  const keyboardWithin = () => within(document.activeElement) && /** @type {Element} */ (document.activeElement).matches(':focus-visible')

  function show() {
    clearTimeout(timer)
    if (!shown()) pop.showPopover()
  }
  function hide() {
    clearTimeout(timer)
    if (shown()) pop.hidePopover()
  }
  const later = (/** @type {() => void} */ fn, /** @type {number} */ ms) => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }

  for (const el of [button, pop]) {
    el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && (shown() ? show() : later(show, OPEN_AFTER_MS)))
    el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && !keyboardWithin() && later(hide, CLOSE_AFTER_MS))
    el.addEventListener('focusout', (e) => within(e.relatedTarget) || hide())
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !shown()) return
      e.stopPropagation()
      hide()
      button.focus({ preventScroll: true })
    })
  }
  button.addEventListener('focus', () => button.matches(':focus-visible') && show())
  button.addEventListener('click', () => (hide(), open({ view: EXTENSIONS_VIEW })))
  pop.addEventListener('click', (e) => {
    const id = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-extension]'))?.dataset.extension
    if (id === undefined) return
    hide()
    open({ view: EXTENSIONS_VIEW, subject: 'board', args: [id] })
  })

  /** The entry as the board stands, and the list while it is open or the next time it opens. */
  function paint() {
    const { extensions } = board()
    const broken = brokenExtensions(extensions).length
    button.className = `extensions-open ${extensionsAttention(extensions)}${isOpen() ? ' on' : ''}`
    button.setAttribute('aria-label', `${extensionsSummary(extensions)}: open every extension's status`)
    paintOnce(button, `<span class="lamp"></span>Extensions <b>${broken ? `${broken} not running` : extensions.length}</b>`)
    repaint(pop, `${extensionsListHtml(extensions)}<small class="more">click for the full view: what each declares, and what fixes each problem</small>`)
  }

  return { paint }
}
