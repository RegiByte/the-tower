/**
 * A browser terminal's type, the same in every renderer: the face and size it draws in, from the viewer's appearance
 * (`tower.prefs`), and the size a watched terminal draws at to fit the PTY's cells in its box. Cells are measured in
 * the face itself, so any monospace face fits.
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

/**
 * A cell of `family` per px of font size: a run of W in a span at 100 px, scaled. Not xterm's cell at a given size:
 * a face's ascent and descent round per size, so a scaled height overshoots. `fitSize` measures each size as xterm does.
 * @deprecated A watched terminal's size is `fitSize`'s.
 */
export function cellOf(family: string): Cell {
  const span = Object.assign(document.createElement('span'), { textContent: 'W'.repeat(32) })
  span.style.cssText = `position: absolute; visibility: hidden; white-space: pre; font: 100px/normal ${family}`
  document.body.append(span)
  const { width, height } = span.getBoundingClientRect()
  span.remove()
  return { width: width / 32 / 100, height: height / 100 }
}

/**
 * The quiet between wheel events that ends a stroke: three display frames at 60 Hz. Inside a stroke, events come a
 * frame apart (15-20 ms in the session logs' wheel input), so every mouse notch turned at up to 20 a second starts its
 * own stroke and sends a report. A trackpad drag slow enough to leave this much quiet between its events sends a row
 * per event.
 */
const STROKE_GAP_MS = 50

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
 * stroke from its first row. An event that starts a stroke (`STROKE_GAP_MS` after the last) sends at least one report
 * and drops the stale remainder: a slow mouse notch is a fraction of a row (macOS reports 0.1 line, about 4 px), and
 * the page can't tell a mouse from a trackpad. Claude moves its transcript a scroll speed's rows per report
 * (`/scroll-speed`; 1 follows the finger). xterm, left alone, sends one report per wheel event however far it went and
 * damps a trackpad's small deltas. While the program reads no mouse, the wheel stays xterm's.
 */
export function reportWheel(term: WheelTerm, send: (data: string) => void) {
  let carry = 0
  let last = -Infinity
  term.attachCustomWheelEventHandler((e) => {
    if (term.modes.mouseTrackingMode === 'none' || !term.element || e.deltaY === 0) return true
    e.preventDefault()
    const screen = term.element.querySelector('.xterm-screen')!.getBoundingClientRect()
    const rowPx = screen.height / term.rows
    const travel = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY / rowPx : e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY : e.deltaY * term.rows
    const now = performance.now()
    const starts = now - last > STROKE_GAP_MS
    last = now
    carry = (starts ? 0 : carry) + travel
    let rows = Math.trunc(carry)
    if (starts && rows === 0) {
      rows = Math.sign(carry)
      carry = 0
    } else carry -= rows
    if (rows === 0) return false
    const cell = (at: number, start: number, size: number, count: number) => Math.min(count, Math.max(1, Math.floor((at - start) / size) + 1))
    const col = cell(e.clientX, screen.left, screen.width / term.cols, term.cols)
    const row = cell(e.clientY, screen.top, rowPx, term.rows)
    send(`\x1b[<${rows < 0 ? 64 : 65};${col};${row}M`.repeat(Math.abs(rows)))
    return false
  })
}

/**
 * A cell of `family` at `size` px, as xterm lays it out: a W's advance wide, and as tall as the face's box rounded up
 * to whole device pixels. Measured at the size itself, since a face's ascent and descent round per size: JetBrains Mono
 * is 132 px tall at 100 px but 17 px, not 17.16, at 13 px.
 */
const cellAt = (text: OffscreenCanvasRenderingContext2D, family: string, size: number) => {
  text.font = `${size}px ${family}`
  const w = text.measureText('W')
  return { width: w.width, height: Math.ceil((w.fontBoundingBoxAscent + w.fontBoundingBoxDescent) * devicePixelRatio) / devicePixelRatio }
}

/**
 * The largest whole size, at most `font.size` and at least `MIN_SIZE`, at which `cols`×`rows` cells of its face fit in
 * `box`: at the size a driving terminal draws, the cells it fitted to a box of the same size.
 */
export function fitSize(box: Box, cols: number, rows: number, font: TermFont): number {
  const text = new OffscreenCanvas(1, 1).getContext('2d')!
  const fits = (size: number) => {
    const cell = cellAt(text, font.family, size)
    return cols * cell.width <= box.clientWidth && rows * cell.height <= box.clientHeight
  }
  let size = font.size
  while (size > MIN_SIZE && !fits(size)) size--
  return size
}
