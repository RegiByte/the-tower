/**
 * The tooltip every renderer shows. Any element with `data-tip="<text>"` shows its text, lines kept, in one element in
 * the top layer: at once on hover and on keyboard focus, beside the element and inside the viewport, until the pointer
 * or the focus leaves it, Esc, a press or a scroll. A renderer calls `watchTips(document)` once; what it draws later
 * needs only the attribute. `placeBeside` stands any popover by the element that opened it the same way. The tower
 * serves this module as `/tips.js`.
 */

export type Box = { left: number; top: number; width: number; height: number }
export type Size = { width: number; height: number }

/** Space between a tip and its element, and the least between a tip and the viewport's edge. */
const GAP = 6
const MARGIN = 8

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))

/**
 * Where a box of `size` stands by `anchor` in a viewport of `view`: below it, or above when only above has room, centred
 * on it, then moved to stay inside the edges.
 */
export const placeNear = (anchor: Box, size: Size, view: Size) => {
  const below = anchor.top + anchor.height + GAP
  const above = anchor.top - GAP - size.height
  const top = below + size.height > view.height - MARGIN && above >= MARGIN ? above : below
  const left = anchor.left + anchor.width / 2 - size.width / 2
  return { left: clamp(left, MARGIN, view.width - MARGIN - size.width), top: clamp(top, MARGIN, view.height - MARGIN - size.height) }
}

/** Stands `el`, shown and fixed in place, by `anchor`, and marks it `data-placed`, which `tipsCss` shows it on. */
export function placeBeside(el: HTMLElement, anchor: Element) {
  const at = placeNear(anchor.getBoundingClientRect(), el.getBoundingClientRect(), { width: innerWidth, height: innerHeight })
  el.style.left = `${at.left}px`
  el.style.top = `${at.top}px`
  el.dataset.placed = ''
}

/** A popover that stands by `anchor()` each time it opens, hidden until it does. */
export function placeOnOpen(el: HTMLElement, anchor: () => Element) {
  el.dataset.placeable = ''
  el.addEventListener('toggle', (e) => ((e as ToggleEvent).newState === 'open' ? placeBeside(el, anchor()) : delete el.dataset.placed))
}

/** The tip's look, from the design's tokens: ink paper in either scheme. A placed popover hides until it is placed. */
export const tipsCss = `
.tower-tip { position: fixed; inset: auto; margin: 0; max-width: min(320px, calc(100vw - 16px)); padding: 6px 9px; border: 0; border-radius: var(--radius);
  background: var(--ink); color: var(--panel); box-shadow: 0 0 0 1px color-mix(in oklab, var(--panel) 30%, transparent), var(--shadow); font: 12px/1.45 var(--ui); font-weight: 400; letter-spacing: 0; text-transform: none;
  white-space: pre-line; overflow-wrap: anywhere; pointer-events: none; overflow: visible; }
.tower-tip:not([data-placed]), [popover][data-placeable]:not([data-placed]) { visibility: hidden; }
`

/** Shows each `data-tip` of `doc` in one tooltip. */
export function watchTips(doc: Document) {
  doc.head.append(Object.assign(doc.createElement('style'), { textContent: tipsCss }))
  const tip = Object.assign(doc.createElement('div'), { className: 'tower-tip', id: 'tower-tip' })
  tip.setAttribute('popover', 'manual')
  tip.setAttribute('role', 'tooltip')
  doc.body.append(tip)
  let shown: HTMLElement | undefined

  const show = (el: HTMLElement) => {
    hide()
    shown = el
    tip.textContent = el.dataset.tip ?? ''
    tip.showPopover()
    placeBeside(tip, el)
    el.setAttribute('aria-describedby', tip.id)
  }
  const hide = () => {
    if (!shown) return
    shown.removeAttribute('aria-describedby')
    shown = undefined
    delete tip.dataset.placed
    tip.hidePopover()
  }
  const tipped = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null)

  doc.addEventListener('pointerover', (e) => {
    const el = tipped(e.target)
    if (el === shown) return
    if (el) show(el)
    else hide()
  })
  doc.addEventListener('pointerout', (e) => e.relatedTarget === null && hide())
  doc.addEventListener('focusin', (e) => {
    const el = tipped(e.target)
    if (el && (e.target as Element).matches(':focus-visible')) show(el)
  })
  doc.addEventListener('focusout', hide)
  doc.addEventListener('pointerdown', hide, true)
  doc.addEventListener('scroll', hide, true)
  doc.addEventListener('keydown', (e) => e.key === 'Escape' && hide())
}
