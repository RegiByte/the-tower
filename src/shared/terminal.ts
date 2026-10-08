/**
 * A browser terminal's type, the same in every renderer: the face and size it draws in, from the viewer's appearance
 * (`tower.prefs`), and the size a watched terminal draws at to fit the PTY's cells in its box. Cells are measured in
 * the face itself, so any monospace face fits. The tower serves this module as `/terminal.js`.
 *
 * The PTY has one size, set by whoever drives it: a driving terminal draws at `size` and fits the PTY to its box, so a
 * bigger font gives the session fewer columns and rows. A watched terminal follows the PTY at `fitSize`, at most `size`.
 */
import type { Prefs } from './prefs.ts'

export type TermFont = { family: string; size: number }

/** A cell's width and height per px of font size. */
export type Cell = { width: number; height: number }

type Box = { clientWidth: number; clientHeight: number }

/** The smallest a watched terminal draws, however big its PTY. */
const MIN_SIZE = 6

/** The face as the root's `--mono` resolves it (tower.js puts the viewer's pick before the shipped face), at the size they drive at. */
export const terminalFont = (prefs: Prefs): TermFont => ({
  family: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim(),
  size: prefs.termSize,
})

/** Loads the face, regular and bold, before a terminal measures its cells: xterm measures once, as it opens or its font changes. */
export const loadTerminalFont = ({ family, size }: TermFont) =>
  Promise.all([`${size}px ${family}`, `700 ${size}px ${family}`].map((font) => document.fonts.load(font)))

/** A cell of `family`, measured as xterm measures it: a run of W in a span, at a size large enough to read fractions. */
export function cellOf(family: string): Cell {
  const span = Object.assign(document.createElement('span'), { textContent: 'W'.repeat(32) })
  span.style.cssText = `position: absolute; visibility: hidden; white-space: pre; font: 100px/normal ${family}`
  document.body.append(span)
  const { width, height } = span.getBoundingClientRect()
  span.remove()
  return { width: width / 32 / 100, height: height / 100 }
}

/** The largest whole size, at most `font.size` and at least `MIN_SIZE`, at which `cols`×`rows` cells of its face fit in `box`. */
export function fitSize(box: Box, cols: number, rows: number, font: TermFont): number {
  const cell = cellOf(font.family)
  const fits = Math.min((box.clientWidth - 4) / (cols * cell.width), (box.clientHeight - 4) / (rows * cell.height))
  return Math.max(MIN_SIZE, Math.min(font.size, Math.floor(fits)))
}
