/**
 * What every panel shares: a read that failed, where settled work stands, drawing html into an element while keeping
 * what is being typed and what has focus, and a worker's tab row. Bundled into `/panels.js`.
 */
import type { CheckoutState } from '../bridge/reviews.ts'
import { esc } from './cards.ts'
import { ICON } from './icons.ts'
import { identityOf } from './press.ts'

/**
 * A read that failed, in place of what it would have drawn: what couldn't be read and why, and the control that reads
 * it again (`again`, its data attribute). Any renderer's own reads draw it too.
 */
export const failedHtml = (what: string, message: string, again: string) =>
  `<div class="read-failed" role="alert"><p>couldn't read ${esc(what)}: ${esc(message)}</p><button ${again}>${ICON.resume} Read again</button></div>`

/** Where work that no longer goes on stands, said once at the top of a panel: nothing beside it takes a note. */
export function settledHtml(state: CheckoutState, checkout: string) {
  if (state.is === 'live') return ''
  const said = state.is === 'gone'
    ? `<b>Worktree removed</b>: the folders of ${esc(checkout)} are gone, and nothing says its work landed.`
    : state.empty
      ? `<b>Nothing to land</b>: ${esc(checkout)} made no commits of its own${state.filed ? `, and its thread was filed ${esc(state.filed.at)}` : ''}.`
      : `<b>Landed${state.on ? ` on <code>${esc(state.on)}</code>` : ''}${state.edited ? `, ${state.edited} edited` : ''}</b>: the work of ${esc(checkout)} is in its base${state.edited ? `, ${state.edited === 1 ? 'one commit' : `${state.edited} commits`} changed on the way${state.branch ? ` (<button data-landing-of="${esc(state.branch)}">what landing changed</button>)` : ''}` : ''}${state.filed ? `, and its thread was filed ${esc(state.filed.at)}` : ''}.`
  return `<p class="settled" role="status">${said} Notes on it would reach nobody.</p>`
}

/** The text boxes a panel holds, by their attribute: their text lives in the renderer, never in the html. */
export type TextBox = 'pick-text' | 'note-text'

/** What `drawPanel` last put in each element, and the panel's root it made: anything else writing the element replaces the root. */
const painted = new WeakMap<HTMLElement, { html: string; root: Element | null }>()

/**
 * Puts `html` in `el` when it differs from what `el` shows, then sets each text box to the renderer's text for it:
 * the box that had focus keeps it, and its caret, and a control that had focus keeps it (`keepingFocus`). A redraw that
 * changes nothing leaves every box as it is. An element that scrolls on its own (`data-keep-scroll="<name>"`, the Changes'
 * file tree) keeps where it was scrolled to.
 */
export function drawPanel(el: HTMLElement, html: string, texts: Partial<Record<TextBox, string>>) {
  const had = document.activeElement
  const box = had instanceof HTMLTextAreaElement && el.contains(had) ? (Object.keys(texts) as TextBox[]).find((b) => had.hasAttribute(`data-${b}`)) : undefined
  const caret = box && [(had as HTMLTextAreaElement).selectionStart, (had as HTMLTextAreaElement).selectionEnd] as const
  keepingFocus(el, () => {
    const was = painted.get(el)
    if (was?.html !== html || was.root !== el.firstElementChild) {
      const scrolled = [...el.querySelectorAll<HTMLElement>('[data-keep-scroll]')].map((s) => [s.dataset.keepScroll!, s.scrollTop] as const)
      el.innerHTML = html
      for (const [name, top] of scrolled) {
        const again = el.querySelector<HTMLElement>(`[data-keep-scroll="${CSS.escape(name)}"]`)
        if (again) again.scrollTop = top
      }
      painted.set(el, { html, root: el.firstElementChild })
    }
    for (const [b, text] of Object.entries(texts) as [TextBox, string][]) {
      const area = el.querySelector<HTMLTextAreaElement>(`[data-${b}]`)
      if (area && area.value !== text) area.value = text
    }
  })
  const again = box && el.querySelector<HTMLTextAreaElement>(`[data-${box}]`)
  if (!again || again === had) return
  again.focus()
  again.setSelectionRange(...caret!)
}

/**
 * Runs `write`, which may replace the html inside `el`, and gives focus back to the control that had it: the one element
 * of the same tag and the same attributes naming what it does (`data-` ones but a tip, a time or a hold, an `href`, a
 * `popovertarget`), so a keyboard keeps its place through a redraw. A control nothing names, or that two now match, loses focus.
 */
export function keepingFocus(el: HTMLElement, write: () => void) {
  const had = document.activeElement
  const id = had && had !== el && el.contains(had) ? identityOf(had) : undefined
  write()
  if (!id || id === had!.localName || el.contains(document.activeElement)) return
  const again = el.querySelectorAll<HTMLElement>(id)
  if (again.length === 1) again[0].focus({ preventScroll: true })
}

/** Each tab row's worker, place along its showings and showing selected when it was last drawn. */
const shownStrips = new WeakMap<HTMLElement, { of: string; left: number; on?: string }>()

/**
 * Keeps a `.tab-row`'s `.shown-tabs` where the viewer left it through a redraw, scrolls a showing newly selected into
 * view, marks the edges past which more showings hide (`more-before`, `more-after`) and turns a mouse wheel over it
 * sideways. A selected showing as wide as the strip fills it unfaded, its controls in full. Call it after each draw of the row, with the id of the worker it is drawn for: another starts at its first.
 */
export function keepShownTabs(row: HTMLElement, of: string) {
  const strip = row.querySelector<HTMLElement>('.shown-tabs')
  if (!strip) return
  const was = shownStrips.get(row)
  const kept = was?.of === of ? was : { of, left: 0 }
  shownStrips.set(row, kept)
  const tabs = [...strip.children]
  const on = tabs.find((t) => t.classList.contains('on'))
  const onKey = on && `${tabs.indexOf(on)}:${on.querySelector('.shown-name')?.textContent}`
  const fills = on instanceof HTMLElement && on.offsetWidth > strip.clientWidth - 2 * parseFloat(getComputedStyle(strip).scrollPaddingLeft)
  const inView = () => Math.abs(on!.getBoundingClientRect().left - strip.getBoundingClientRect().left) < 1
  strip.scrollLeft = kept.left
  if (on && onKey !== kept.on) {
    if (fills) strip.scrollLeft += on.getBoundingClientRect().left - strip.getBoundingClientRect().left
    else on.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  kept.on = onKey
  const mark = () => {
    kept.left = strip.scrollLeft
    const faded = !(fills && inView())
    strip.classList.toggle('more-before', faded && strip.scrollLeft > 0)
    strip.classList.toggle('more-after', faded && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1)
  }
  mark()
  strip.addEventListener('scroll', mark)
  strip.addEventListener('wheel', (e) => {
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
    e.preventDefault()
    strip.scrollLeft += e.deltaY
  }, { passive: false })
}
