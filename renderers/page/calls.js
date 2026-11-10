import { loudest } from '/lib/cards.js'
import { ICON } from '/lib/view.js'
import { reducedMotion } from '/lib/viewer.js'
import { plural } from '/lib/words.js'

/** @typedef {import('/lib/board.js').Attention} Attention */

/** The attentions a wait is drawn in, read off a marked element's classes. @type {Attention[]} */
const WAIT_ATTENTIONS = ['needs', 'broken', 'ready']

/** The animations of the flash (index.html), kept in step. */
const FLASHES = ['call', 'blink']

/** @param {Element} el @returns {Attention | undefined} */
const attentionOf = (el) => WAIT_ATTENTIONS.find((a) => el.classList.contains(a))

/** How many waits a marked element stands for: a folded floor's count says its number in `data-n`, a row or a lamp is one. @param {Element} el */
const waitsIn = (el) => Number(/** @type {HTMLElement} */ (el).dataset.n ?? 1)

/** Whether a change to the sidebar can move what is marked: not a clock's text (`data-since`), rewritten every tick. @param {MutationRecord} r */
const moves = (r) => !(r.type === 'childList' && r.target instanceof Element && r.target.matches('[data-since]'))

/**
 * While the viewer has waits flash (`waits: 'flash'` in `tower.prefs`), an arrow at the sidebar's top edge when
 * something that waits on them (`.calls`: a worker's row, a folded floor's count, a lamp of the rail) is scrolled
 * above sight, and one at its foot when below, each counting them in the loudest of their attentions. Pressing one
 * scrolls the nearest of them into the middle. The top edge is under the floor's sign stuck there, if one is, so a row
 * hidden under it counts as above; what the stuck sign itself carries is in sight. The sidebar scrolls in
 * its floors, or whole on a narrow or short window, or as the rail while folded: the one scrolling now is the one drawn
 * whose overflow scrolls.
 * @param {HTMLElement} side
 */
export function watchCalls(side) {
  /** @param {'up' | 'down'} way */
  const arrow = (way) => {
    const b = document.createElement('button')
    b.className = `edge-call ${way}`
    b.hidden = true
    document.body.append(b)
    return b
  }
  const arrows = { up: arrow('up'), down: arrow('down') }
  /** The nearest marked element out of sight each way, as last drawn. @type {Record<'up' | 'down', Element | undefined>} */
  const nearest = { up: undefined, down: undefined }

  /** The part of the sidebar that scrolls now, if any does. @returns {HTMLElement | undefined} */
  const scroller = () => /** @type {HTMLElement[]} */ ([side.querySelector('.rail'), side.querySelector('.floors'), side].filter(Boolean))
    .find((el) => el.getClientRects().length > 0 && /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)

  /**
   * The floor's sign stuck at the scroller's top, if one is: one at its sticky `top` from the scroller's padding edge,
   * pushed up by nothing.
   * @param {HTMLElement} el @returns {Element | undefined}
   */
  const stuckSign = (el) => {
    const edge = el.getBoundingClientRect().top + el.clientTop + parseFloat(getComputedStyle(el).paddingTop)
    return [...el.querySelectorAll('.floor > .sign')].find((sign) => Math.abs(sign.getBoundingClientRect().top - edge - parseFloat(getComputedStyle(sign).top)) < 1)
  }

  /** @param {'up' | 'down'} way @param {Element[]} out @param {DOMRect} box */
  const draw = (way, out, box) => {
    const b = arrows[way]
    nearest[way] = way === 'up' ? out.at(-1) : out[0]
    b.hidden = !out.length
    if (!out.length) return
    const n = out.reduce((sum, el) => sum + waitsIn(el), 0)
    const tone = loudest(out.map((el) => /** @type {any} */ ({ attention: attentionOf(el) }))) ?? 'ready'
    const words = `${plural(n, 'wait')} on you ${way === 'up' ? 'above' : 'below'}: scroll to the nearest`
    b.className = `edge-call ${way} ${tone}`
    const html = `${ICON.caret}<b>${n}</b>`
    if (b.innerHTML !== html) b.innerHTML = html
    b.setAttribute('aria-label', words)
    b.dataset.tip = words
    const half = b.offsetWidth / 2 + 4
    b.style.left = `${Math.min(Math.max(box.left + box.width / 2, half), innerWidth - half)}px`
    b.style.top = way === 'up' ? `${box.top + 6}px` : ''
    b.style.bottom = way === 'down' ? `${innerHeight - box.bottom + 6}px` : ''
  }

  const paint = () => {
    frame = 0
    const el = scroller()
    if (!el) return draw('up', [], new DOMRect()), draw('down', [], new DOMRect())
    const whole = el.getBoundingClientRect()
    const sign = stuckSign(el)
    const top = sign ? sign.getBoundingClientRect().bottom : whole.top
    const box = new DOMRect(whole.x, top, whole.width, whole.bottom - top)
    const marked = [...el.querySelectorAll('.calls')].filter((m) => m.getClientRects().length > 0)
    const rects = marked.map((m) => m.getBoundingClientRect())
    draw('up', marked.filter((m, i) => rects[i].bottom <= (sign?.contains(m) ? whole.top : top) + 4), box)
    draw('down', marked.filter((_, i) => rects[i].top >= box.bottom - 4), box)
  }

  /**
   * Every flash and blink in step, wherever on the page it is drawn (a row's outline, its lamp, an arrow, a count's
   * lamp, a view's): each starts at the timeline's origin, whenever its element was drawn. Under reduced motion each
   * flashes once from when it was drawn, so is left be.
   * @param {AnimationEvent} e
   */
  const inStep = (e) => {
    if (!FLASHES.includes(e.animationName) || reducedMotion()) return
    const el = /** @type {Element} */ (e.target)
    for (const a of el.getAnimations({ subtree: true })) {
      if (a instanceof CSSAnimation && a.animationName === e.animationName && /** @type {KeyframeEffect} */ (a.effect).target === el && a.startTime !== 0) a.startTime = 0
    }
  }
  let frame = 0
  const schedule = () => { frame ||= requestAnimationFrame(paint) }

  /** @param {Event} e */
  const scrolled = (e) => { if (e.target === side || side.contains(/** @type {Node} */ (e.target))) schedule() }
  const changes = new MutationObserver((records) => records.some(moves) && schedule())
  const sizes = new ResizeObserver(schedule)
  for (const way of /** @type {const} */ (['up', 'down'])) {
    arrows[way].addEventListener('click', () => nearest[way]?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }))
  }

  let on = false
  /** @param {boolean} flash */
  const turn = (flash) => {
    if (flash === on) return
    on = flash
    if (on) {
      document.addEventListener('scroll', scrolled, { capture: true, passive: true })
      document.addEventListener('animationstart', inStep)
      for (const a of document.getAnimations()) a instanceof CSSAnimation && FLASHES.includes(a.animationName) && !reducedMotion() && (a.startTime = 0)
      changes.observe(side, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
      changes.observe(document.body, { attributes: true, attributeFilter: ['class'] })
      sizes.observe(side)
      schedule()
      return
    }
    cancelAnimationFrame(frame)
    frame = 0
    document.removeEventListener('scroll', scrolled, { capture: true })
    document.removeEventListener('animationstart', inStep)
    changes.disconnect()
    sizes.disconnect()
    arrows.up.hidden = arrows.down.hidden = true
  }
  turn(tower.prefs.get().waits === 'flash')
  tower.prefs.on((prefs) => turn(prefs.waits === 'flash'))
}
