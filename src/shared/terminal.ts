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

/** The parts of an xterm `Terminal` a wheel handler reads. */
type WheelTerm = {
  cols: number
  rows: number
  element: HTMLElement | undefined
  modes: { mouseTrackingMode: string }
  attachCustomWheelEventHandler(handler: (e: WheelEvent) => boolean): void
}

/**
 * Sends a session's wheel motion to Claude as SGR wheel reports (`\e[<64;col;rowM` up, 65 down), one per row of
 * travel, the remainder carried to the next event, so a flick reaches Claude at its full length and a slow trackpad
 * stroke from its first row. Claude moves its transcript a scroll speed's rows per report (`/scroll-speed`; 1 follows
 * the finger). xterm, left alone, sends one report per wheel event however far it went and damps a trackpad's small
 * deltas. While the program reads no mouse, the wheel stays xterm's.
 */
export function reportWheel(term: WheelTerm, send: (data: string) => void) {
  let carry = 0
  term.attachCustomWheelEventHandler((e) => {
    if (term.modes.mouseTrackingMode === 'none' || !term.element || e.deltaY === 0) return true
    e.preventDefault()
    const screen = term.element.querySelector('.xterm-screen')!.getBoundingClientRect()
    const rowPx = screen.height / term.rows
    carry += e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY / rowPx : e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY : e.deltaY * term.rows
    const rows = Math.trunc(carry)
    carry -= rows
    if (rows === 0) return false
    const cell = (at: number, start: number, size: number, count: number) => Math.min(count, Math.max(1, Math.floor((at - start) / size) + 1))
    const col = cell(e.clientX, screen.left, screen.width / term.cols, term.cols)
    const row = cell(e.clientY, screen.top, rowPx, term.rows)
    send(`\x1b[<${rows < 0 ? 64 : 65};${col};${row}M`.repeat(Math.abs(rows)))
    return false
  })
}

/**
 * The largest whole size, at most `font.size` and at least `MIN_SIZE`, at which `cols`×`rows` cells of its face fit in
 * `box`. xterm draws a row in whole device pixels, a cell's width as measured.
 */
export function fitSize(box: Box, cols: number, rows: number, font: TermFont): number {
  const cell = cellOf(font.family)
  const rowHeight = (size: number) => Math.ceil(cell.height * size * devicePixelRatio) / devicePixelRatio
  const fits = (size: number) => cols * cell.width * size <= box.clientWidth - 4 && rows * rowHeight(size) <= box.clientHeight - 4
  let size = font.size
  while (size > MIN_SIZE && !fits(size)) size--
  return size
}
