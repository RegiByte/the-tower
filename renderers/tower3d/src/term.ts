import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { terminalTheme, type } from '../../../src/shared/design.ts'
import { terminalKeymap } from '../../../src/shared/termkeys.ts'
import type { Keys } from '../../../src/shared/keymap.ts'
import { tower, type StreamMsg } from './api.ts'
import { watchStream } from './fixtures.ts'

/**
 * The real terminal of the desk or kiosk you're at. The PTY has one size: whoever types owns it. Opening a live
 * terminal claims it, fitting the PTY to the panel, when no other terminal is open on the session (a shell's stream
 * doesn't say, and is claimed); a resize from anyone else hands it back, and the terminal follows at a font that fits
 * until it's claimed again.
 */

const DRIVE_FONT = 14
const CELL_WIDTH = 0.6
const CELL_HEIGHT = 1.2

type Target = {
  path: string
  id: string
  sendKeys: (id: string, data: string) => void
  resizeVerb: 'resize' | 'shell/resize'
  scrollback: number
  onEnd: (msg: StreamMsg) => void
  onMode: (text: string, owner: boolean) => void
  onError: (err: Error) => void
  /** The board's keys now (`board.keys`). */
  keys: () => Keys
  /** Runs a keymap command from inside the terminal: true keeps its key from the PTY. */
  run: (id: string, e: KeyboardEvent) => boolean
}

type Mounted = { term?: Terminal; fit?: FitAddon; claimed?: { cols: number; rows: number }; claim?: () => void; unwatch: () => void }

let open: Mounted | undefined

export function closeTerm(host: HTMLElement) {
  open?.unwatch()
  open?.term?.dispose()
  open = undefined
  host.innerHTML = ''
}

const fitFont = (host: HTMLElement, cols: number, rows: number) =>
  Math.max(6, Math.min(DRIVE_FONT, Math.floor(Math.min((host.clientWidth - 4) / (cols * CELL_WIDTH), (host.clientHeight - 4) / (rows * CELL_HEIGHT)))))

export function mountTerm(host: HTMLElement, t: Target) {
  closeTerm(host)
  const state: Mounted = { unwatch: () => {} }
  open = state
  const isOwner = () => Boolean(state.claimed && state.term && state.claimed.cols === state.term.cols && state.claimed.rows === state.term.rows)
  const showMode = () =>
    t.onMode(isOwner() ? `in control · ${state.term!.cols}×${state.term!.rows}` : 'watching · type to take control', isOwner())
  const claim = () => {
    const term = state.term!
    term.options.fontSize = DRIVE_FONT
    state.fit!.fit()
    state.claimed = { cols: term.cols, rows: term.rows }
    tower.call(t.resizeVerb, { id: t.id, ...state.claimed }).catch(t.onError)
    showMode()
  }
  state.claim = claim
  const follow = (cols: number, rows: number) => {
    const term = state.term!
    if (term.cols === cols && term.rows === rows) return
    term.resize(cols, rows)
    if (!isOwner()) term.options.fontSize = fitFont(host, cols, rows)
    showMode()
  }
  const typed = (data: string) => {
    if (document.activeElement !== state.term!.textarea) return
    if (!isOwner()) claim()
    t.sendKeys(t.id, data)
  }
  state.unwatch = watchStream(t.path, (msg) => {
    if (open !== state) return
    if (msg.t === 'snapshot') {
      state.term?.dispose()
      const term = new Terminal({ cols: msg.cols, rows: msg.rows, fontSize: fitFont(host, msg.cols, msg.rows), fontFamily: type.mono,
        cursorBlink: false, scrollback: t.scrollback, theme: terminalTheme(tower.scheme()) })
      state.term = term
      state.fit = new FitAddon()
      term.loadAddon(state.fit)
      term.open(host)
      term.write(msg.data)
      if ('exited' in msg && msg.exited) return (term.attachCustomKeyEventHandler(terminalKeymap(t.keys, t.run, () => {})), t.onMode('past session · read-only', false))
      term.attachCustomKeyEventHandler(terminalKeymap(t.keys, t.run, typed))
      term.onData(typed)
      if ('terminals' in msg && msg.terminals > 0) showMode()
      else claim()
      term.focus()
    }
    if (msg.t === 'o') state.term?.write(msg.data)
    if (msg.t === 'r') 'size' in msg ? follow(...(msg.size.split('x').map(Number) as [number, number])) : follow(msg.cols, msg.rows)
    if (msg.t === 'x' || msg.t === 'error') t.onEnd(msg)
  })
}

tower.onScheme((scheme) => open?.term && (open.term.options.theme = terminalTheme(scheme)))

/** Refits a claimed terminal when its panel changes size. */
export function watchPanelSize(host: HTMLElement) {
  let timer: ReturnType<typeof setTimeout>
  new ResizeObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(() => open?.term && open.claimed && open.claim!(), 120)
  }).observe(host)
}
