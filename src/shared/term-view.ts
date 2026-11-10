import type { FitAddon } from '@xterm/addon-fit'
import type { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import type { WebLinksAddon } from '@xterm/addon-web-links'
import type { ILink, Terminal } from '@xterm/xterm'
import { terminalTheme, type Scheme } from './design.ts'
import type { Keys } from './keymap.ts'
import { loop, timers, type Handlers, type StateEffect, type TimerEffect } from './loop.ts'
import type { ScreenMsg, TerminalMsg } from './shelf-page.ts'
import { fitSize, loadTerminalFont, reportWheel, type TermFont } from './terminal.ts'
import type { ShellStream } from './terms.ts'
import { terminalKeymap } from './termkeys.ts'
import { base64Of, uploadRefusal } from './uploads.ts'

/**
 * A terminal a viewer has open on a PTY, every renderer's: `termHandlers` its steps, `mountTermView` the xterm.js view
 * they run in. The PTY has one size, held by the terminal the user acted on last. A terminal opened while nobody else
 * views the PTY takes the size, fitting it to its pane (a shell's snapshot doesn't say, so a shell is taken); a resize
 * from anyone else hands it back, and the view follows the PTY at a font that fits; the user acting on the terminal
 * takes it again: a key or a pointer press in it, a paste or files dropped on it, or text they give it. Nothing else
 * does: focus, a reload, a pane or font change, a press elsewhere in the page, the pointer passing over, a wheel, and
 * what xterm.js answers the program on its own. A pane or font change fits the PTY again only while this viewer holds
 * it, and only the holder's terminal speaks to the PTY but for a wheel, a focus report and the user's text.
 * The tower serves this module as `/term-view.js`.
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
 * size, set by anyone; `ended`: the PTY exited while viewed; `typed`: what the terminal sends the PTY, the user's keys and mouse among
 * xterm.js's own answers to the program, which a watching view takes the size for only when it is the user's text (`userText`);
 * `wheeled`: a wheel turned over it, as wheel reports; `pressed`: a key or a pointer pressed in the terminal, or a paste or files
 * dropped on it; `pane`: the view's box changed, `settled` once it has stopped; `font`: the viewer's face
 * or size changed and has loaded; `fitted`: the size the pane fits at the viewer's size, with the keys to send once it is taken.
 * @since 1.145 for `wheeled` and `pressed`, and for `typed` taking the size only for the user's text: a report (a mouse motion,
 * an answer to the program's query) from a watching view is dropped.
 */
export type TermEvent =
  | { type: 'snapshot'; data: string; cols: number; rows: number; exited: boolean; others: boolean }
  | { type: 'resized'; cols: number; rows: number }
  | { type: 'ended' }
  | { type: 'typed'; data: string }
  | { type: 'wheeled'; data: string }
  | { type: 'pressed' }
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
  m.t === 'owning' ? `in control · ${m.cols}×${m.rows}` : m.t === 'watching' ? 'watching · click or type here to take control' : 'past session · read-only'

/**
 * What xterm.js sends as its window gains or loses focus while the program asks for focus events (mode 1004): not
 * typing, so a watching view sends them and keeps watching. A window that blurs keeps its terminal as
 * `document.activeElement`, and its report arrives as a click lands on another viewer's terminal.
 */
const FOCUS_REPORTS = new Set(['\x1b[I', '\x1b[O'])

/**
 * What the user gives a terminal as text, typed, pasted, dictated or picked from the symbols panel: anything not opening
 * with an escape, or a bracketed paste. Mouse reports, focus reports and xterm.js's answers to the program's queries
 * all open with one.
 */
const userText = (data: string) => !data.startsWith('\x1b') || data.startsWith('\x1b[200~')

/** Keys that only modify another: pressed alone, they are no key the user typed in the terminal. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock', 'AltGraph'])

const sameSize = (a: Size, b: Size) => a.cols === b.cols && a.rows === b.rows

const state = (s: TermView): StateEffect<TermView> => ({ type: 'state', state: s })

/** Draws again after the pane or the font changed: a held PTY is fitted again, a followed one drawn to fit. */
const redraw = (s: TermView): TermEffect[] =>
  s.t === 'owning' ? [{ type: 'fit', then: '' }] : s.t === 'opening' ? [] : [{ type: 'follow', ...s.pty }]

/**
 * Whether a view opening at a snapshot of `pty` takes the size: when it held it before the stream dropped and nobody
 * resized it since, or when it opens fresh and nobody else views the PTY. A view that was watching keeps watching.
 */
const takesOnOpen = (s: TermView, pty: Size, others: boolean) => (s.t === 'owning' ? sameSize(s.pty, pty) : s.t === 'opening' && !others)

export const termHandlers = (): Handlers<TermView, TermEvent, TermEffect> => ({
  snapshot: (s, { data, cols, rows, exited, others }) => {
    const opened = { type: 'open' as const, data, cols, rows, exited }
    if (exited) return [state({ t: 'exited', pty: { cols, rows } }), opened, { type: 'mode', mode: { t: 'exited' } }]
    const watching = state({ t: 'watching', pty: { cols, rows } })
    if (takesOnOpen(s, { cols, rows }, others)) return [watching, opened, { type: 'fit', then: '' }]
    return [watching, opened, { type: 'mode', mode: { t: 'watching' } }]
  },
  resized: (s, { cols, rows }) => {
    if (s.t === 'opening') return []
    const echo = s.t === 'owning' ? s.asked.findIndex((a) => sameSize(a, { cols, rows })) : -1
    if (s.t === 'owning' && echo >= 0) return [state({ ...s, asked: s.asked.slice(echo + 1) })]
    const next: TermView = s.t === 'exited' ? { t: 'exited', pty: { cols, rows } } : { t: 'watching', pty: { cols, rows } }
    return [state(next), { type: 'follow', cols, rows }, { type: 'mode', mode: modeOf(next) }]
  },
  /** A PTY that exited takes no more sizes or keys: a view still mounted on it, unseen or not, stays read-only. */
  ended: (s) => (s.t === 'opening' || s.t === 'exited' ? [] : [state({ t: 'exited', pty: s.pty }), { type: 'mode', mode: { t: 'exited' } }]),
  typed: (s, { data }) => {
    if (s.t === 'owning' || (s.t === 'watching' && FOCUS_REPORTS.has(data))) return [{ type: 'send', data }]
    return s.t === 'watching' && userText(data) ? [{ type: 'fit', then: data }] : []
  },
  wheeled: (s, { data }) => (s.t === 'owning' || s.t === 'watching' ? [{ type: 'send', data }] : []),
  pressed: (s) => (s.t === 'watching' ? [{ type: 'fit', then: '' }] : []),
  pane: () => [{ type: 'timer/start', id: 'pane', ms: SETTLE_MS, fire: { type: 'settled' } }],
  settled: redraw,
  font: redraw,
  fitted: (s, { cols, rows, then }) => {
    if (s.t === 'opening' || s.t === 'exited') return []
    const next: TermView = { t: 'owning', pty: { cols, rows }, asked: [...(s.t === 'owning' ? s.asked : []), { cols, rows }] }
    return [state(next), { type: 'resize', cols, rows }, ...(then ? [{ type: 'send' as const, data: then }] : []), { type: 'mode', mode: modeOf(next) }]
  },
})

/**
 * xterm.js's constructors, as the renderer loads them: globals on a plain page, bundled in another. Given
 * `WebLinksAddon`, addresses written in the terminal are links too. Given `UnicodeGraphemesAddon`, a character takes as
 * many cells as Claude Code gives it (an emoji two, a grapheme cluster one character): without it, Claude's redraws
 * after an emoji land a column off and leave stray characters.
 */
export type Xterm = { Terminal: typeof Terminal; FitAddon: typeof FitAddon; WebLinksAddon?: typeof WebLinksAddon; UnicodeGraphemesAddon?: typeof UnicodeGraphemesAddon }

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
  /** Given, a file dropped or pasted on the terminal is copied where the PTY's program can read it, its bytes base64, and its path answered (`upload`, the verb). */
  upload?(name: string, data: string): Promise<string>
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

/**
 * Keeps a key xterm typed on keypress out of its input textarea. xterm sends capitals (to type them right with Caps Lock
 * on), spaces and punctuation on keypress and leaves the browser to insert them as well, so the textarea would hold
 * the prompt until Enter. macOS edits text held there, putting a period after a word on a double space or completing
 * it inline, and xterm sends such an edit as typed text: a space swallowed, earlier text sent again. Composed text
 * (dead keys, an IME) fires no keypress and still goes through the textarea. A keypress with Cmd held, or Ctrl without
 * Alt, is no typed key (xterm sends none) but a shortcut: WebKit fires one for Cmd-V, and cancelling it would take the
 * key from the app's Edit menu, so nothing would be pasted. Ctrl with Alt is Windows' AltGr, which xterm types.
 */
const keepTextareaEmpty = (e: KeyboardEvent) => e.metaKey || (e.ctrlKey && !e.altKey) || e.preventDefault()

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
        term = new xterm.Terminal({ cols, rows, fontSize: fitSize(host, cols, rows, font), fontFamily: font.family, cursorBlink: false, scrollback: io.scrollback, theme: terminalTheme(io.scheme()), linkHandler: { activate: openLink }, allowProposedApi: true })
        fit = new xterm.FitAddon()
        term.loadAddon(fit)
        if (xterm.WebLinksAddon) term.loadAddon(new xterm.WebLinksAddon(openLink))
        if (xterm.UnicodeGraphemesAddon) term.loadAddon(new xterm.UnicodeGraphemesAddon())
        const files = io.files
        if (files) {
          const edit = (file: string, line?: number) => void files.edit(resolvePath(files.cwd(), file), line).catch(io.error)
          const shown = term
          term.registerLinkProvider({ provideLinks: (y, done) => done(fileLinks(shown, y, edit)) })
        }
        term.open(host)
        term.textarea!.addEventListener('keypress', keepTextareaEmpty)
        // Composed and dictated text still pass through the textarea, which WebKit's inline predictions would rewrite.
        term.textarea!.setAttribute('writingsuggestions', 'false')
        term.write(data)
        if (exited) return term.attachCustomKeyEventHandler(terminalKeymap(io.keymap, io.run, () => {}))
        term.attachCustomKeyEventHandler(terminalKeymap(io.keymap, io.run, typed))
        term.onData(typed)
        if (io.claude) reportWheel(term, (data) => machine.dispatch({ type: 'wheeled', data }))
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
    if (msg.t === 'x') machine.dispatch({ type: 'ended' })
    io.end(msg)
  })
  /**
   * Files dropped or pasted on the terminal reach its PTY as their paths, pasted, a space between, as a native
   * terminal pastes a dropped file's path: the browser hands over the bytes, not a path, so each is uploaded first.
   * Claude takes a pasted image's path as the image. A past session's terminal takes none.
   */
  async function pasteFiles(upload: NonNullable<TermViewIo['upload']>, files: File[]) {
    const refusal = files.map((file) => uploadRefusal(file.name, file.size)).find(Boolean)
    if (refusal) throw new Error(refusal)
    const paths = []
    for (const file of files) paths.push(await upload(file.name, await base64Of(file)))
    if (!term || machine.state().t === 'exited') return
    term.focus()
    paths.forEach((path, i) => (i && term!.paste(' '), term!.paste(path)))
  }
  const takeFiles = (e: Event, list: FileList | undefined) => {
    if (!io.upload || !list?.length || !term || machine.state().t === 'exited') return
    e.preventDefault()
    e.stopPropagation()
    pasteFiles(io.upload, [...list]).catch(io.error)
  }
  /** A paste with text in it is the text's (a sheet's or a document's copy carries a picture of itself too): xterm's. */
  const onPaste = (e: ClipboardEvent) => e.clipboardData?.types.includes('text/plain') || takeFiles(e, e.clipboardData?.files)
  const onDrop = (e: DragEvent) => takeFiles(e, e.dataTransfer?.files)
  const onDragOver = (e: DragEvent) => {
    if (!io.upload || !e.dataTransfer?.types.includes('Files') || !term || machine.state().t === 'exited') return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  /**
   * The user acting on this terminal: a key but a modifier alone (the first of a chord that leaves the window), a
   * pointer pressed in it, a paste or files dropped on it. Heard as it starts down to the terminal, so the PTY is sized
   * before xterm.js sends what it caused; a press lands in one terminal, so two views of one PTY never trade the size.
   */
  const onPress = (e: KeyboardEvent | PointerEvent | DragEvent | ClipboardEvent) => {
    if (!e.isTrusted || (e instanceof KeyboardEvent && MODIFIERS.has(e.key))) return
    if (term) machine.dispatch({ type: 'pressed' })
  }
  const PRESSES = ['keydown', 'pointerdown', 'paste', 'drop'] as const
  for (const type of PRESSES) host.addEventListener(type, onPress as EventListener, { capture: true })
  host.addEventListener('paste', onPaste, { capture: true })
  host.addEventListener('drop', onDrop)
  host.addEventListener('dragover', onDragOver)
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
      host.removeEventListener('paste', onPaste, { capture: true })
      for (const type of PRESSES) host.removeEventListener(type, onPress as EventListener, { capture: true })
      host.removeEventListener('drop', onDrop)
      host.removeEventListener('dragover', onDragOver)
      timing['timer/cancel']({ type: 'timer/cancel', id: 'pane' }, machine.dispatch)
      term?.dispose()
      term = undefined
      host.innerHTML = ''
    },
  }
}
