/**
 * How many of a region's ranked items fit in place (decision `region-overflow`): a region draws a prefix of its ranked
 * list and tucks the rest behind its menu, so the answer is a count. Pure, so every renderer that measures shares it.
 * The tower serves it in `/views.js`.
 */

/** The width `count` of `widths` take drawn in place, the menu control's `menu` added while any is left out. */
const needed = (widths: readonly number[], count: number, menu: number): number =>
  widths.slice(0, count).reduce((sum, w) => sum + w, 0) + (count < widths.length ? menu : 0)

/** The most of `widths` that fit in `room`, the menu taking its width while any is left out. */
const most = (widths: readonly number[], room: number, menu: number): number => {
  for (let count = widths.length; count > 0; count--) if (needed(widths, count, menu) <= room) return count
  return 0
}

/**
 * How many of `widths` (rank order) a region draws in place in `room`, the menu control taking `menu` when any is left
 * out: fewer than `was` as soon as they don't fit; more than `was` only with `margin` to spare, so a region at the edge
 * doesn't flicker. A renderer passes the count it drew last as `was`, and `widths.length` on a first fit or once its
 * ranked ids changed, since a count of another list means nothing: then as many as fit are drawn. @since 1.138
 */
export const fill = (widths: readonly number[], room: number, menu: number, was: number, margin: number): number => {
  const fits = most(widths, room, menu)
  const drawn = Math.min(was, widths.length)
  return fits <= drawn ? fits : Math.max(drawn, most(widths, room - margin, menu))
}
