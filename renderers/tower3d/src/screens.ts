import * as THREE from 'three'
import { Terminal, type IBufferCell } from '@xterm/xterm'
import { terminalTheme, type } from '../../../src/shared/design.ts'
import { watchStream } from './fixtures.ts'

/**
 * Live monitors: each stream (`screen/<id>`, `shell/<id>`) feeds a terminal nobody sees, painted onto a canvas
 * texture while it changes, more often the nearer its monitor. xterm parses with no DOM, so the buffer is read cell by
 * cell.
 */

const W = 1024
const H = 640
/** How often a changing monitor is painted, by its distance from the eye in meters: a far one can't be read anyway. */
const REPAINT = [
  { within: 6, ms: 150 },
  { within: 14, ms: 600 },
  { within: Infinity, ms: 2000 },
]

const repaintMs = (distance: number) => REPAINT.find((r) => distance < r.within)!.ms
/** Monitors are things in the world: the light scheme's terminal, whatever the viewer's panels follow. */
const THEME = terminalTheme('light')
const FG = THEME.foreground
const BG = THEME.background
const ANSI = [THEME.black, THEME.red, THEME.green, THEME.yellow, THEME.blue, THEME.magenta, THEME.cyan, THEME.white,
  THEME.brightBlack, THEME.brightRed, THEME.brightGreen, THEME.brightYellow, THEME.brightBlue, THEME.brightMagenta, THEME.brightCyan, THEME.brightWhite]

const ansi256 = (i: number) => {
  if (i < 16) return ANSI[i]
  if (i >= 232) {
    const v = 8 + (i - 232) * 10
    return `rgb(${v},${v},${v})`
  }
  const n = i - 16
  const level = (x: number) => (x ? 55 + x * 40 : 0)
  return `rgb(${level(Math.floor(n / 36))},${level(Math.floor(n / 6) % 6)},${level(n % 6)})`
}
const rgb = (v: number) => `rgb(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255})`
const fgOf = (c: IBufferCell) => (c.isFgRGB() ? rgb(c.getFgColor()) : c.isFgPalette() ? ansi256(c.getFgColor()) : FG)
const bgOf = (c: IBufferCell) => (c.isBgRGB() ? rgb(c.getBgColor()) : c.isBgPalette() ? ansi256(c.getBgColor()) : undefined)

type Screen = {
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  term?: Terminal
  dirty: boolean
  drawnAt: number
  ended: boolean
  /** A past session's screen replayed: washed sepia under this stamp. */
  stamp?: string
  unwatch: () => void
}

const screens = new Map<string, Screen>()

function open(path: string): Screen {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  const screen: Screen = { canvas, texture, dirty: true, drawnAt: 0, ended: false, unwatch: () => {} }
  screen.unwatch = watchStream(path, (msg) => {
    if (msg.t === 'snapshot') {
      screen.term?.dispose()
      screen.term = new Terminal({ cols: msg.cols, rows: msg.rows, scrollback: 0, allowProposedApi: true })
      screen.term.onWriteParsed(() => (screen.dirty = true))
      screen.term.write(msg.data)
    }
    if (msg.t === 'o') screen.term?.write(msg.data)
    if (msg.t === 'r') {
      const [cols, rows] = 'size' in msg ? msg.size.split('x').map(Number) : [msg.cols, msg.rows]
      screen.term?.resize(cols, rows)
    }
    if (msg.t === 'x' || msg.t === 'error') screen.ended = true
    screen.dirty = true
  })
  screens.set(path, screen)
  return screen
}

/** The texture of a stream's monitor, its stream opened on first use. */
export const screenTexture = (path: string) => (screens.get(path) ?? open(path)).texture

/** A past session's last screen on a monitor, sepia, stamped `stamp` ("REPLAY · Oct 6, 21:40"). */
export function replayTexture(path: string, stamp: string) {
  const screen = screens.get(path) ?? open(path)
  screen.stamp = stamp
  screen.dirty = true
  return screen.texture
}

export const isScreenTexture = (t: THREE.Texture) => [...screens.values()].some((s) => s.texture === t)

/** The stream a monitor's texture shows. */
export const screenPathOf = (t: THREE.Texture) => [...screens].find(([, s]) => s.texture === t)?.[0]

/** Ends every stream not in `paths`: only what stands in the building streams. */
export function keepScreens(paths: ReadonlySet<string>) {
  for (const [path, s] of screens) {
    if (paths.has(path)) continue
    s.unwatch()
    s.term?.dispose()
    s.texture.dispose()
    screens.delete(path)
  }
}

function paint(s: Screen) {
  const g = s.canvas.getContext('2d')!
  g.fillStyle = BG
  g.fillRect(0, 0, W, H)
  const term = s.term
  if (term) {
    const font = Math.min(W / (term.cols * 0.6), H / (term.rows * 1.18))
    const cw = font * 0.6
    const ch = font * 1.18
    const x0 = (W - cw * term.cols) / 2
    const y0 = (H - ch * term.rows) / 2
    g.font = `${font}px ${type.mono}`
    g.textBaseline = 'top'
    const buf = term.buffer.active
    const cell = buf.getNullCell()
    for (let y = 0; y < term.rows; y++) {
      const line = buf.getLine(buf.viewportY + y)
      if (!line) continue
      let run = ''
      let runColor = ''
      let runX = 0
      const flush = () => {
        if (run.trim()) {
          g.fillStyle = runColor
          g.fillText(run, x0 + runX * cw, y0 + y * ch)
        }
        run = ''
      }
      for (let x = 0; x < term.cols; x++) {
        line.getCell(x, cell)
        const inverse = cell.isInverse()
        const bg = inverse ? fgOf(cell) : bgOf(cell)
        if (bg) {
          g.fillStyle = bg
          g.fillRect(x0 + x * cw, y0 + y * ch, cw + 0.5, ch + 0.5)
        }
        const color = inverse ? (bgOf(cell) ?? BG) : cell.isDim() ? THEME.brightBlack : fgOf(cell)
        if (color !== runColor) {
          flush()
          runColor = color
          runX = x
        }
        run += cell.getChars() || ' '
        if (cell.getWidth() === 2) x++
      }
      flush()
    }
  }
  if (s.stamp) {
    g.globalCompositeOperation = 'saturation'
    g.fillStyle = '#808080'
    g.fillRect(0, 0, W, H)
    g.globalCompositeOperation = 'multiply'
    g.fillStyle = '#e6c99a'
    g.fillRect(0, 0, W, H)
    g.globalCompositeOperation = 'source-over'
    g.font = `800 34px ${type.display}`
    const w = g.measureText(s.stamp).width + 36
    g.save()
    g.translate(W - w / 2 - 28, 44)
    g.rotate(-0.03)
    g.fillStyle = '#f4ead6ee'
    g.fillRect(-w / 2, -26, w, 52)
    g.strokeStyle = '#9c6b2e'
    g.lineWidth = 4
    g.strokeRect(-w / 2, -26, w, 52)
    g.fillStyle = '#9c6b2e'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(s.stamp, 0, 2)
    g.restore()
    g.textAlign = 'start'
    g.textBaseline = 'top'
  } else if (s.ended) {
    g.fillStyle = '#05070dc0'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#7d8ba6'
    g.font = '700 48px ui-monospace, Menlo, monospace'
    g.textAlign = 'center'
    g.fillText('ENDED', W / 2, H / 2 - 24)
    g.textAlign = 'start'
  }
  s.texture.needsUpdate = true
}

/**
 * Paints the screens that changed and can be seen, each at its distance's rate; the rest stay dirty until they can.
 * `distance`: how far the stream's nearest monitor stands from the eye, `undefined` for one out of sight.
 */
export function paintScreens(now: number, distance: (path: string) => number | undefined) {
  for (const [path, s] of screens) {
    const d = distance(path)
    if (!s.dirty || d === undefined || now - s.drawnAt < repaintMs(d)) continue
    s.dirty = false
    s.drawnAt = now
    paint(s)
  }
}

/** A monitor showing a word and the keys that answer it, drawn once. */
function still(title: string, color: string, lines: string[]) {
  const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 320 })
  const g = cv.getContext('2d')!
  g.fillStyle = '#0a0d14'
  g.fillRect(0, 0, 512, 320)
  g.textAlign = 'center'
  g.fillStyle = color
  g.font = '700 44px ui-monospace, Menlo, monospace'
  g.fillText(title, 256, 140)
  g.font = '24px ui-monospace, Menlo, monospace'
  g.fillStyle = '#7d8ba6'
  lines.forEach((line, i) => g.fillText(line, 256, 192 + i * 34))
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** A stranded desk's monitor. */
export const OFFLINE = still('OFFLINE', '#c99a4a', ['F to resume'])
/** The open workstation's monitor: the next worker on its floor sits here. */
export const OPEN_DESK = still('OPEN', '#86b9cc', ['E  hire a worker', 'G  choose how'])
/** A free workstation's monitor while another is open. */
export const ASLEEP = still('', '', [])

export const isStillScreen = (t: THREE.Texture) => t === OFFLINE || t === OPEN_DESK || t === ASLEEP
