/**
 * The tooltip every renderer shows. Any element with `data-tip="<text>"` shows its text, lines kept, in one element in
 * the top layer: on keyboard focus at once (not on the focus a press gives), on hover once the pointer rests on the element with no button held (at once
 * while a tip shows or has just hidden), beside the element and inside the viewport, until the pointer or the focus
 * leaves it, Esc, a press, a scroll or a redraw that removes it. It fades in and out, at once under reduced motion. A
 * renderer calls `watchTips(document)` once; what it draws later needs only the attribute. `placeBeside` stands any popover by
 * the element that opened it the same way.
 */
import { reduced } from './design.ts'

export type Box = { left: number; top: number; width: number; height: number }
export type Size = { width: number; height: number }

/** Space between a tip and its element, and the least between a tip and the viewport's edge. */
const GAP = 6
const MARGIN = 8
/** How long the pointer rests on an element before its tip shows, and how long after a tip hides the next shows at once. */
const INTENT_MS = 350
const WARM_MS = 300

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

/**
 * The tip's look, from the design's tokens: ink paper in either scheme. It fades in growing slightly, and back out:
 * `display` and `overlay` transition discretely, so a hidden tip stays in the top layer until its fade ends (in browsers
 * without `overlay`, it leaves the top layer as it starts fading). A placed popover hides until it is placed.
 */
export const tipsCss = `
.tower-tip { position: fixed; inset: auto; margin: 0; max-width: min(20rem, calc(100vw - 16px)); padding: var(--sp-s) var(--sp-m); border: 0; border-radius: var(--radius);
  background: var(--ink); color: var(--panel); box-shadow: 0 0 0 1px color-mix(in oklab, var(--panel) 30%, transparent), var(--shadow); font: var(--fs-s)/1.45 var(--ui); font-weight: 400; letter-spacing: 0; text-transform: none;
  white-space: pre-line; overflow-wrap: anywhere; pointer-events: none; overflow: visible;
  opacity: 0; scale: 0.97;
  transition: opacity 120ms ease-out, scale 120ms ease-out, display 120ms allow-discrete, overlay 120ms allow-discrete; }
.tower-tip:popover-open { opacity: 1; scale: 1; }
@starting-style { .tower-tip:popover-open { opacity: 0; scale: 0.97; } }
${reduced('.tower-tip', 'transition: none; scale: 1;')}
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
  let pending: ReturnType<typeof setTimeout> | undefined
  let warmUntil = 0
  /**
   * A redraw may take the element away while its tip shows: the tip goes with it. A morph that keeps the element strips
   * the `aria-describedby` its html lacks, and it is put back where it is missing, so the observer's own write ends there.
   */
  const redrawn = new MutationObserver(() => {
    if (!shown) return
    if (!shown.isConnected) hide()
    else if (shown.getAttribute('aria-describedby') !== tip.id) shown.setAttribute('aria-describedby', tip.id)
  })

  const show = (el: HTMLElement) => {
    clearTimeout(pending)
    if (shown) shown.removeAttribute('aria-describedby')
    else redrawn.observe(doc.body, { childList: true, subtree: true, attributeFilter: ['aria-describedby'] })
    shown = el
    tip.textContent = el.dataset.tip ?? ''
    if (!tip.matches(':popover-open')) tip.showPopover()
    placeBeside(tip, el)
    el.setAttribute('aria-describedby', tip.id)
  }
  const showSoon = (el: HTMLElement) => {
    if (shown || performance.now() < warmUntil) return show(el)
    clearTimeout(pending)
    pending = setTimeout(() => el.isConnected && show(el), INTENT_MS)
  }
  const hide = () => {
    clearTimeout(pending)
    if (!shown) return
    shown.removeAttribute('aria-describedby')
    shown = undefined
    redrawn.disconnect()
    warmUntil = performance.now() + WARM_MS
    tip.hidePopover()
  }
  const tipped = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null)

  doc.addEventListener('pointerover', (e) => {
    const el = tipped(e.target)
    if (el === shown || (!shown && el?.contains(e.relatedTarget as Node | null))) return
    if (el && !e.buttons) showSoon(el)
    else hide()
  })
  doc.addEventListener('pointerout', (e) => e.relatedTarget === null && hide())
  /**
   * Whether a press came since the last key or focus: the focus it gives shows no tip, though a text field it focuses
   * matches `:focus-visible`. A key clears it, so the focus a Tab gives after a press that focused nothing still does.
   */
  let pressed = false
  doc.addEventListener('focusin', (e) => {
    const byPress = pressed
    pressed = false
    const el = tipped(e.target)
    if (el && !byPress && (e.target as Element).matches(':focus-visible')) show(el)
  })
  doc.addEventListener('focusout', hide)
  doc.addEventListener('pointerdown', () => ((pressed = true), hide()), true)
  doc.addEventListener('scroll', hide, true)
  doc.addEventListener('keydown', (e) => ((pressed = false), e.key === 'Escape' && hide()), true)
}
