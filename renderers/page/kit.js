import { esc, gistOf, shownHref, shownKey, when } from '/cards.js'
import { GIST_ICON, ICON } from '/icons.js'
import { keepingFocus } from '/panels.js'
import { toaster } from '/toasts.js'
import { keysLabel, keyshortcuts } from '/keymap.js'

/**
 * What the tower page's panes draw with alike: a card's gist, times, the close of a view, a toast, painting only
 * what changed and keeping a scrolled list's row in place, and a showing's key, pane and address.
 * @import { Card, CardShown } from '../../src/bridge/board.ts'
 * @import { Pane } from './view.js'
 * @import { Keys } from '../../src/shared/keymap.ts'
 */

/**
 * The elements `$` finds whose type is not a plain `HTMLElement`, or that exist only while their view is drawn.
 * @typedef {{
 *   spawn: HTMLDialogElement, transfer: HTMLDialogElement, landing: HTMLDialogElement, keys: HTMLDialogElement, confirm: HTMLDialogElement,
 *   'draft-text': HTMLTextAreaElement, 'archive-filter': HTMLInputElement,
 *   'shelf-page': HTMLIFrameElement, 'shelf-doc': HTMLIFrameElement, 'item-doc': HTMLIFrameElement, 'shelf-url': HTMLIFrameElement | null,
 *   orb: HTMLElement | null, clock: HTMLElement | null,
 * }} PageElements
 */

/** @param {Card} c */
const onDuty = (c) => c.onDuty

/** The card's gist as HTML: a tool's name in bold, said words after their mark. @param {Card} c */
const lineOf = (c) => {
  const gist = gistOf(c)
  if (!gist) return '<i>no prompt yet</i>'
  if (gist.kind === 'asks' || gist.kind === 'runs') return toolHtml(gist.text)
  return `<span class="said">${GIST_ICON[gist.kind]}</span> ${esc(gist.text)}`
}

/** `Bash npm test` → the tool's name in bold, then what it acts on. @param {string} tool */
const toolHtml = (tool) => {
  const [name, ...target] = tool.split(' ')
  return `<span class="tool"><b>${esc(name)}</b> ${esc(target.join(' '))}</span>`
}

/**
 * @template {string} K
 * @param {K} id
 * @returns {K extends keyof PageElements ? PageElements[K] : HTMLElement}
 */
const $ = (id) => /** @type {any} */ (document.getElementById(id))

/** @param {{ startedAt: number }} a @param {{ startedAt: number }} b */
const byStart = (a, b) => a.startedAt - b.startedAt

/** A floor's sign: its number on the project's band, its name in caps, cut to the sign's width and whole in the tooltip. @param {number} n @param {string} name */
const signHtml = (n, name, extra = '') =>
  `<div class="sign"><span class="num">${String(n).padStart(2, '0')}</span><span class="name" role="heading" aria-level="2" data-tip="${esc(name)}">${esc(name)}</span>${extra}</div>`

/** A meter's fill: ink, broken past `hot`. @param {number} pct @param {number} hot */
const fillOf = (pct, hot) => (pct > hot ? 'var(--broken)' : 'var(--ink)')

/**
 * A control's tip, what it does with the chords of the command it shares when it has any (`hide the sidebar (⌘B)`),
 * and those chords as its `aria-keyshortcuts`. @param {Keys} keys @param {string} what @param {string} id
 */
const keyedTip = (keys, what, id) =>
  keysLabel(keys, id) ? `data-tip="${esc(`${what} (${keysLabel(keys, id)})`)}" aria-keyshortcuts="${keyshortcuts(keys, id)}"` : `data-tip="${esc(what)}"`

/** The close of a view in the main pane: back to the skyline. @param {Keys} keys */
const closeHomeHtml = (keys) => `<button class="icon-btn" data-act="home" aria-label="back to the skyline" ${keyedTip(keys, 'back to the skyline', 'home')}>${ICON.close}</button>`

/** @param {CardShown} s @returns {Pane} */
const shownPane = (s) => `shown:${s.target}`

const DOC_CSS = `article { max-width: 980px; margin: 0; padding: var(--sp-xl) var(--sp-3xl) 48px; }`

/** @param {string} text @param {string} what */
const copyText = (text, what) => navigator.clipboard.writeText(text).then(() => toast(`Copied ${what}`), (err) => toast(err.message))

/** The nearest element from `el` up that scrolls its content: the list itself, or in the short layout the sidebar around it. @param {HTMLElement | null} el */
const scrollerOf = (el) => {
  for (let e = el; e; e = e.parentElement) if (/auto|scroll/.test(getComputedStyle(e).overflowY)) return e
  return /** @type {Element} */ (document.scrollingElement)
}

/** The `[data-hold]` row at a scrolled list's top edge, the last to start at or above it, and its offset from the edge. @param {HTMLElement} list */
const topAnchorOf = (list) => {
  const top = scrollerOf(list).getBoundingClientRect().top
  const row = [...list.querySelectorAll('[data-hold]')].findLast((el) => el.getBoundingClientRect().top <= top) ?? list.querySelector('[data-hold]')
  return row && { key: /** @type {string} */ (row.dataset.hold), offset: row.getBoundingClientRect().top - top }
}

/** The `[data-hold="key"]` row and its offset from a scrolled list's top edge, while any of it is in sight. @param {HTMLElement} list @param {string | undefined} key */
const sightAnchorOf = (list, key) => {
  const row = key && list.querySelector(`[data-hold="${CSS.escape(key)}"]`)
  if (!row) return undefined
  const edges = scrollerOf(list).getBoundingClientRect()
  const { top, bottom } = row.getBoundingClientRect()
  return top < edges.bottom && bottom > edges.top ? { key, offset: top - edges.top } : undefined
}

/**
 * Replaces a scrolled list's content with the `anchor` row kept where it was: a browser's scroll anchoring holds a list
 * still while rows above change height, and loses its anchor when the rows are replaced.
 * @param {HTMLElement} list
 * @param {string} html
 * @param {{ key: string, offset: number } | null | undefined} anchor
 */
function redrawHeld(list, html, anchor) {
  list.innerHTML = html
  const row = anchor && list.querySelector(`[data-hold="${CSS.escape(anchor.key)}"]`)
  if (!row) return
  const scroller = scrollerOf(list)
  scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset
}

/** Writes `html` into `el` only when it changed, so a focused or hovered control in it survives a render. @type {WeakMap<HTMLElement, string>} */
const painted = new WeakMap()

/** @param {HTMLElement} el @param {string} html */
const paintOnce = (el, html) => painted.get(el) === html || (painted.set(el, html), (el.innerHTML = html))

/** `paintOnce`, the control that had focus in `el` keeping it. */
/** @param {HTMLElement} el @param {string} html */
const repaint = (el, html) => keepingFocus(el, () => paintOnce(el, html))

/** Says `msg` to a screen reader, through the polite live region: a new node each time, so the same words are said again. @param {string} msg */
const announce = (msg) => $('announce').replaceChildren(Object.assign(document.createElement('p'), { textContent: msg }))

/** Tells what just happened, with an action that follows it up when given (`/toasts.js`, a live region of its own). */
const toast = toaster($('toasts'))

/**
 * A request whose failure is told in a toast, answering `undefined`.
 * @template T
 * @param {Promise<T>} request
 * @returns {Promise<T | undefined>}
 */
const told = (request) => request.catch((err) => (toast(err.message), undefined))

export { onDuty, lineOf, toolHtml, when, $, byStart, signHtml, fillOf, keyedTip, closeHomeHtml, shownPane, shownKey, shownHref, DOC_CSS, copyText, topAnchorOf, sightAnchorOf, redrawHeld, paintOnce, repaint, announce, toast, told }
