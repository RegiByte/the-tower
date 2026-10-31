import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import { modeText, mountTermView, type TermViewHandle } from '../../../src/shared/term-view.ts'
import type { Keys } from '../../../src/shared/keymap.ts'
import { terminalFont } from '../../../src/shared/terminal.ts'
import { tower, type StreamMsg } from './api.ts'
import { watchStream } from './fixtures.ts'

/**
 * The real terminal of the desk or kiosk you're at, a view of its PTY held by whoever types (`/term-view.js`). It
 * draws in the viewer's terminal face and size (`tower.prefs`): a bigger font gives the session fewer columns and rows.
 */

type Target = {
  path: string
  id: string
  sendKeys: (id: string, data: string) => void
  resizeVerb: 'resize' | 'shell/resize'
  scrollback: number
  /** Claude's terminal: its wheel goes to Claude as wheel reports. */
  claude: boolean
  onEnd: (msg: StreamMsg) => void
  onMode: (text: string, owner: boolean) => void
  onError: (err: Error) => void
  /** The directory the file paths written in the terminal are read from. */
  cwd: () => string
  /** The board's keys now (`board.keys`). */
  keys: () => Keys
  /** Runs a keymap command from inside the terminal: true keeps its key from the PTY. */
  run: (id: string, e: KeyboardEvent) => boolean
}

let open: TermViewHandle | undefined

export function closeTerm(host: HTMLElement) {
  open?.close()
  open = undefined
  host.innerHTML = ''
}

const termFont = () => terminalFont(tower.prefs.get())

export function mountTerm(host: HTMLElement, t: Target) {
  closeTerm(host)
  open = mountTermView(host, { Terminal, FitAddon, WebLinksAddon, UnicodeGraphemesAddon }, {
    watch: (on) => watchStream(t.path, on),
    resize: (size) => tower.call(t.resizeVerb, { id: t.id, ...size }),
    send: (data) => t.sendKeys(t.id, data),
    claude: t.claude,
    scrollback: t.scrollback,
    font: termFont,
    scheme: () => tower.scheme(),
    keymap: t.keys,
    run: t.run,
    mode: (m) => t.onMode(modeText(m), m.t === 'owning'),
    end: t.onEnd,
    error: t.onError,
    files: { cwd: t.cwd, edit: (path, line) => tower.call('edit', { path, line }) },
  })
}

tower.onScheme(() => open?.rescheme())
tower.prefs.on(() => void open?.refont())
