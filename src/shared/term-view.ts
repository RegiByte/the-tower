import type { FitAddon } from '@xterm/addon-fit'
import type { WebLinksAddon } from '@xterm/addon-web-links'
import type { ILink, Terminal } from '@xterm/xterm'
import { terminalTheme, type Scheme } from './design.ts'
import type { Keys } from './keymap.ts'
import { loop, timers, type Handlers, type StateEffect, type TimerEffect } from './loop.ts'
import type { ScreenMsg, TerminalMsg } from './shelf-page.ts'
import { fitSize, loadTerminalFont, reportWheel, type TermFont } from './terminal.ts'
import type { ShellStream } from './terms.ts'
import { terminalKeymap } from './termkeys.ts'

/**
 * A terminal a viewer has open on a PTY, every renderer's: `termHandlers` its steps, `mountTermView` the xterm.js view
 * they run in. The PTY has one size, and whoever types holds it. A terminal opened while nobody else views the PTY
 * takes the size, fitting it to its pane (a shell's snapshot doesn't say, so a shell is taken); a resize from anyone
 * else hands it back, and the view follows the PTY at a font that fits; typing takes it again. A pane or font change
 * fits the PTY again only while this viewer holds it. The tower serves this module as `/term-view.js`.
 */

export type Size = { cols: number; rows: number }

/**
 * The view: waiting for its snapshot, following the PTY at a font that fits, holding the PTY at the size it set, or a
 * PTY that no longer runs, read-only. `asked`: the sizes an owning view sent the PTY whose echo has yet to come back,
 * oldest first; an echo arrives behind the PTY's queued output, so one can land after a later size was asked.
 */
export type TermView =
  | { t: 'opening' }
  | { t: 'watching'; pty: Size }
  | { t: 'owning'; pty: Size; asked: Size[] }
  | { t: 'exited'; pty: Size }

/** How the view holds the PTY, for the renderer to say. */
export type TermMode = { t: 'owning'; cols: number; rows: number } | { t: 'watching' } | { t: 'exited' }

/**
 * `snapshot`: the stream's, each time it connects, opening a fresh terminal (`others`: another terminal views the PTY); `resized`: the PTY's
 * size, set by anyone; `pane`: the view's box changed, `settled` once it has stopped; `font`: the viewer's face or size
 * changed and has loaded; `fitted`: the size the pane fits at the viewer's size, with the keys typed while taking it.
 */
export type TermEvent =
  | { type: 'snapshot'; data: string; cols: number; rows: number; exited: boolean; others: boolean }
  | { type: 'resized'; cols: number; rows: number }
  | { type: 'typed'; data: string }
  | { type: 'pane' }
  | { type: 'settled' }
  | { type: 'font' }
  | { type: 'fitted'; cols: number; rows: number; then: string }

/**
 * `open` makes a fresh terminal at the snapshot; `fit` draws at the viewer's size and fits the pane, dispatching
 * `fitted` with `then`; `follow` draws the PTY's cells at a font that fits the pane; `resize` sizes the PTY; `send`
 * types into it.
 */
export type TermEffect =
  | StateEffect<TermView>
  | TimerEffect<TermEvent>
  | { type: 'open'; data: string; cols: number; rows: number; exited: boolean }
  | { type: 'fit'; then: string }
  | { type: 'follow'; cols: number; rows: number }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'send'; data: string }
  | { type: 'mode'; mode: TermMode }

/** A pane's resizes settle this long before the PTY follows. */
export const SETTLE_MS = 120

export const termOpening = (): TermView => ({ t: 'opening' })

export const modeOf = (s: TermView): TermMode =>
  s.t === 'owning' ? { t: 'owning', ...s.pty } : s.t === 'exited' ? { t: 'exited' } : { t: 'watching' }

/** How a view holds the PTY, in words. */
export const modeText = (m: TermMode) =>
  m.t === 'owning' ? `in control · ${m.cols}×${m.rows}` : m.t === 'watching' ? 'watching · type to take control' : 'past session · read-only'

/**
 * What xterm.js sends as its window gains or loses focus while the program asks for focus events (mode 1004): not
 * typing, so a watching view sends them and keeps watching. A window that blurs keeps its terminal as
 * `document.activeElement`, and its report arrives as a click lands on another viewer's terminal.
 */
const FOCUS_REPORTS = new Set(['\x1b[I', '\x1b[O'])

const sameSize = (a: Size, b: Size) => a.cols === b.cols && a.rows === b.rows

const state = (s: TermView): StateEffect<TermView> => ({ type: 'state', state: s })

/** Draws again after the pane or the font changed: a held PTY is fitted again, a followed one drawn to fit. */
const redraw = (s: TermView): TermEffect[] =>
  s.t === 'owning' ? [{ type: 'fit', then: '' }] : s.t === 'opening' ? [] : [{ type: 'follow', ...s.pty }]

export const termHandlers = (): Handlers<TermView, TermEvent, TermEffect> => ({
  snapshot: (_, { data, cols, rows, exited, others }) => {
    const opened = { type: 'open' as const, data, cols, rows, exited }
    if (exited) return [state({ t: 'exited', pty: { cols, rows } }), opened, { type: 'mode', mode: { t: 'exited' } }]
    if (others) return [state({ t: 'watching', pty: { cols, rows } }), opened, { type: 'mode', mode: { t: 'watching' } }]
    return [state({ t: 'watching', pty: { cols, rows } }), opened, { type: 'fit', then: '' }]
  },
  resized: (s, { cols, rows }) => {
    if (s.t === 'opening') return []
    const echo = s.t === 'owning' ? s.asked.findIndex((a) => sameSize(a, { cols, rows })) : -1
    if (s.t === 'owning' && echo >= 0) return [state({ ...s, asked: s.asked.slice(echo + 1) })]
    const next: TermView = s.t === 'exited' ? { t: 'exited', pty: { cols, rows } } : { t: 'watching', pty: { cols, rows } }
    return [state(next), { type: 'follow', cols, rows }, { type: 'mode', mode: modeOf(next) }]
  },
  typed: (s, { data }) => {
    if (s.t === 'owning' || (s.t === 'watching' && FOCUS_REPORTS.has(data))) return [{ type: 'send', data }]
    return s.t === 'watching' ? [{ type: 'fit', then: data }] : []
  },
  pane: () => [{ type: 'timer/start', id: 'pane', ms: SETTLE_MS, fire: { type: 'settled' } }],
  settled: redraw,
  font: redraw,
  fitted: (s, { cols, rows, then }) => {
    if (s.t === 'opening' || s.t === 'exited') return []
    const next: TermView = { t: 'owning', pty: { cols, rows }, asked: [...(s.t === 'owning' ? s.asked : []), { cols, rows }] }
    return [state(next), { type: 'resize', cols, rows }, ...(then ? [{ type: 'send' as const, data: then }] : []), { type: 'mode', mode: modeOf(next) }]
  },
})

/** xterm.js's constructors, as the renderer loads them: globals on a plain page, bundled in another. Given `WebLinksAddon`, addresses written in the terminal are links too. */
export type Xterm = { Terminal: typeof Terminal; FitAddon: typeof FitAddon; WebLinksAddon?: typeof WebLinksAddon }

/** A link clicked in a terminal, written as an address or as a hyperlink (OSC 8), opens in a new tab: only the web's. */
const openLink = (_: MouseEvent, uri: string) => {
  if (URL.canParse(uri) && ['http:', 'https:'].includes(new URL(uri).protocol)) window.open(uri, '_blank', 'noreferrer')
}

/**
 * A file path written in a terminal, with the line after it (`src/a.ts:12`, `/abs/notes.md`, `report.html`): a word
 * with a slash, or a name of two letters or more before its extension. A URL's words are its own links, not a file's.
 */
const FILE_WORD = /[^\s()[\]{}<>"'`|,;]+/g
const FILE_PATH = /^(?<path>(?:\.{1,2}\/|\/)?(?:[\w@+-][\w.@+-]*\/)*[\w@+-][\w.@+-]*\.[A-Za-z]\w{0,9})(?::(?<line>\d+)(?::\d+)?)?$/

export type FileMention = { start: number; end: number; path: string; line?: number }

/** The file paths in a line of text, each at its offsets in the text. */
export function fileMentions(text: string): FileMention[] {
  return [...text.matchAll(FILE_WORD)].flatMap((m) => {
    const word = m[0].replace(/[.:]+$/, '')
    const found = !word.includes('://') && FILE_PATH.exec(word)?.groups
    if (!found) return []
    const name = found.path.slice(found.path.lastIndexOf('/') + 1)
    if (!found.path.includes('/') && name.indexOf('.') < 2) return []
    return [{ start: m.index, end: m.index + word.length, path: found.path, ...(found.line ? { line: Number(found.line) } : {}) }]
  })
}

/** `file` as an absolute path, read from `cwd` if relative: `.` and `..` resolved. */
export function resolvePath(cwd: string, file: string): string {
  const parts: string[] = []
  for (const part of (file.startsWith('/') ? file : `${cwd}/${file}`).split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return `/${parts.join('/')}`
}

/** The file paths on a buffer line as links, their ranges in cells: a wide character takes two. */
function fileLinks(term: Terminal, y: number, open: (path: string, line?: number) => void): ILink[] | undefined {
  const line = term.buffer.active.getLine(y - 1)
  if (!line) return undefined
  let text = ''
  const cellAt: number[] = []
  for (let x = 0; x < line.length; x++) {
    const chars = line.getCell(x)?.getChars() || ' '
    if (line.getCell(x)?.getWidth() === 0) continue
    for (let i = 0; i < chars.length; i++) cellAt.push(x)
    text += chars
  }
  cellAt.push(line.length)
  const links = fileMentions(text).map((f): ILink => ({
    range: { start: { x: cellAt[f.start] + 1, y }, end: { x: cellAt[f.end - 1] + 1, y } },
    text: text.slice(f.start, f.end),
    activate: () => open(f.path, f.line),
  }))
  return links.length ? links : undefined
}

/** What a view needs of its renderer. `watch` streams `terminal/<id>`, `screen/<id>` or `shell/<id>`; `end` hears its `x` or `error`. */
export type TermViewIo = {
  watch(on: (msg: TerminalMsg | ScreenMsg | ShellStream) => void): () => void
  resize(size: Size): Promise<unknown>
  send(data: string): void
  /** Claude's terminal: its wheel goes to Claude as wheel reports, a row each (`reportWheel`). A shell's program may read another mouse encoding. */
  claude: boolean
  scrollback: number
  font(): TermFont
  scheme(): Scheme
  /** The board's keys now (`board.keys`), and the keymap command a key inside the terminal runs: true keeps its key from the PTY. */
  keymap(): Keys
  run(command: string, e: KeyboardEvent): boolean
  mode(m: TermMode): void
  end(msg: Extract<TerminalMsg | ShellStream, { t: 'x' | 'error' }>): void
  error(err: Error): void
  /** Given, the file paths written in the terminal are links too, read from `cwd()` and opened through `edit` (the verb). */
  files?: { cwd(): string; edit(path: string, line?: number): Promise<unknown> }
}

export type TermViewHandle = {
  /** The terminal, once the snapshot has opened it. */
  term(): Terminal | undefined
  state(): TermView
  /** Takes the viewer's face and size once loaded, if they changed. */
  refont(): Promise<void>
  rescheme(): void
  close(): void
}

/** Opens a view of a PTY's stream in `host`, which it fits and watches for resizes, until `close`. */
export function mountTermView(host: HTMLElement, xterm: Xterm, io: TermViewIo): TermViewHandle {
  let term: Terminal | undefined
  let fit: FitAddon | undefined
  let fontShown = io.font()
  const typed = (data: string) => document.activeElement === term?.textarea && machine.dispatch({ type: 'typed', data })
  const timing = timers<TermEvent>()
  const machine = loop({
    state: termOpening(),
    handlers: termHandlers(),
    execute: {
      ...timing,
      open: ({ data, cols, rows, exited }) => {
        term?.dispose()
        const font = io.font()
        term = new xterm.Terminal({ cols, rows, fontSize: fitSize(host, cols, rows, font), fontFamily: font.family, cursorBlink: false, scrollback: io.scrollback, theme: terminalTheme(io.scheme()), linkHandler: { activate: openLink } })
        fit = new xterm.FitAddon()
        term.loadAddon(fit)
        if (xterm.WebLinksAddon) term.loadAddon(new xterm.WebLinksAddon(openLink))
        const files = io.files
        if (files) {
          const edit = (file: string, line?: number) => void files.edit(resolvePath(files.cwd(), file), line).catch(io.error)
          const shown = term
          term.registerLinkProvider({ provideLinks: (y, done) => done(fileLinks(shown, y, edit)) })
        }
        term.open(host)
        term.write(data)
        if (exited) return term.attachCustomKeyEventHandler(terminalKeymap(io.keymap, io.run, () => {}))
        term.attachCustomKeyEventHandler(terminalKeymap(io.keymap, io.run, typed))
        term.onData(typed)
        if (io.claude) reportWheel(term, typed)
        term.focus()
      },
      fit: ({ then }, dispatch) => {
        Object.assign(term!.options, { fontFamily: io.font().family, fontSize: io.font().size })
        fit!.fit()
        dispatch({ type: 'fitted', cols: term!.cols, rows: term!.rows, then })
      },
      follow: ({ cols, rows }) => {
        if (term!.cols !== cols || term!.rows !== rows) term!.resize(cols, rows)
        Object.assign(term!.options, { fontFamily: io.font().family, fontSize: fitSize(host, cols, rows, io.font()) })
      },
      resize: (size) => void io.resize({ cols: size.cols, rows: size.rows }).catch(io.error),
      send: ({ data }) => io.send(data),
      mode: ({ mode }) => io.mode(mode),
    },
  })
  const stop = io.watch((msg) => {
    if (msg.t === 'o') return term?.write(msg.data)
    if (msg.t === 'snapshot')
      return machine.dispatch({ type: 'snapshot', data: msg.data, cols: msg.cols, rows: msg.rows, exited: 'exited' in msg && msg.exited, others: 'terminals' in msg && msg.terminals > 0 })
    if (msg.t === 'r') {
      const [cols, rows] = 'size' in msg ? msg.size.split('x').map(Number) : [msg.cols, msg.rows]
      return machine.dispatch({ type: 'resized', cols, rows })
    }
    io.end(msg)
  })
  const observer = new ResizeObserver(() => machine.dispatch({ type: 'pane' }))
  observer.observe(host)
  return {
    term: () => term,
    state: machine.state,
    refont: async () => {
      const font = io.font()
      if (font.family === fontShown.family && font.size === fontShown.size) return
      fontShown = font
      await loadTerminalFont(font)
      if (fontShown === font && term) machine.dispatch({ type: 'font' })
    },
    rescheme: () => term && (term.options.theme = terminalTheme(io.scheme())),
    close: () => {
      stop()
      observer.disconnect()
      timing['timer/cancel']({ type: 'timer/cancel', id: 'pane' }, machine.dispatch)
      term?.dispose()
      term = undefined
      host.innerHTML = ''
    },
  }
}
