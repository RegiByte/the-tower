/**
 * What the page measures to fit a region's ranked items to its room (decision `region-overflow`): the width a box takes
 * on one line, whatever the line does now (wrapped below the floor, or tucked items already gone), so the shared
 * `fill` can say how many items fit. Reads only: the caller writes what it decides, after every region has been read.
 */

const EDGES = /** @type {const} */ (['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'])

/** Whether `el` draws generated content before or after its children: a box the row holds that no child is. @param {Element} el */
const generates = (el) => ['::before', '::after'].some((p) => !['none', 'normal'].includes(getComputedStyle(el, p).content))

/**
 * Whether `el` lays out its children in a row it can be read as: a flex row whose every box is an element of its own,
 * no text and no generated content beside them.
 * @param {Element} el @param {CSSStyleDeclaration} style
 */
const isRow = (el, style) =>
  style.display.endsWith('flex') &&
  style.flexDirection.startsWith('row') &&
  ![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) &&
  !generates(el)

/**
 * The boxes `el` lays out in its row: its children, a `display: contents` child's own in its place, less those taken
 * out of the row (hidden, or positioned, as an open popover is) and those `skip` names.
 * @param {Element} el @param {(el: Element) => boolean} skip @returns {Element[]}
 */
const boxesIn = (el, skip) =>
  [...el.children].flatMap((c) => {
    if (skip(c)) return []
    const style = getComputedStyle(c)
    if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') return []
    return style.display === 'contents' ? boxesIn(c, skip) : [c]
  })

/**
 * The width `el` takes laid out on one line: a flex row the sum of its boxes, the gaps between them and its own edges,
 * any other box its width as drawn. What `skip` names counts as absent.
 * @param {Element} el @param {(el: Element) => boolean} [skip] @returns {number}
 */
export function lineWidth(el, skip = () => false) {
  const style = getComputedStyle(el)
  if (!isRow(el, style)) return el.getBoundingClientRect().width
  const boxes = boxesIn(el, skip)
  const edges = EDGES.reduce((w, k) => w + parseFloat(style[k]), 0)
  return boxes.reduce((w, b) => w + lineWidth(b, skip), 0) + Math.max(0, boxes.length - 1) * gapOf(style) + edges
}

/** @param {CSSStyleDeclaration} style */
const gapOf = (style) => parseFloat(style.columnGap) || 0

/** The gap `el` brings to the row it is drawn in: that of the nearest box holding it, past `display: contents` slots. @param {Element} el @returns {number} */
export const gapBeside = (el) => {
  const parent = el.parentElement
  if (!parent) return 0
  const style = getComputedStyle(parent)
  return style.display === 'contents' ? gapBeside(parent) : gapOf(style)
}

/** The width `el`'s content has to be drawn in. @param {Element} el */
export const roomOf = (el) => {
  const style = getComputedStyle(el)
  return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
}

/** Whether `el`'s text is cut where it is drawn: gone, or wider than its box. @param {HTMLElement} el */
export const isCut = (el) => !el.checkVisibility() || el.scrollWidth > el.clientWidth + 1
