import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import { modeText, mountTermView, type TermViewHandle, terminalFont } from '/lib/terminal.js'
import type { Keys } from '/lib/keys.js'
import { tower, type StreamMsg } from './api.ts'
import { watchStream } from './fixtures.ts'

/**
 * The real terminal of the desk or kiosk you're at, a view of its PTY held by whoever types (`term-view.ts`). It
 * draws in the viewer's terminal face and size (`tower.prefs`): a bigger font gives the session fewer columns and rows.
 *
 * It mounts in an unpadded box filling its frame: xterm.js fits to its parent's computed width and height, which under
 * `box-sizing: border-box` include the parent's padding, so a padded parent sizes the PTY past the pane.
 */

type Target = {
  path: string
  id: string
  sendKeys: (id: string, data: string) => void
  resizeVerb: 'resize' | 'shell/resize'
  scrollback: number
  /** Its program reads the wheel as wheel reports, as Claude's fullscreen does. */
  wheelReports: boolean
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

/** The terminal: one mounted at a time, redrawn when the viewer's scheme or terminal face changes. */
export function startTerminal() {
  let open: TermViewHandle | undefined

  function closeTerm(host: HTMLElement) {
    open?.close()
    open = undefined
    host.innerHTML = ''
  }

  function mountTerm(host: HTMLElement, t: Target) {
    closeTerm(host)
    const box = host.appendChild(Object.assign(document.createElement('div'), { className: 'term-box' }))
    open = mountTermView(box, { Terminal, FitAddon, WebLinksAddon, UnicodeGraphemesAddon }, {
      watch: (on) => watchStream(t.path, on),
      resize: (size) => tower.call(t.resizeVerb, { id: t.id, ...size }),
      send: (data) => t.sendKeys(t.id, data),
      wheelReports: t.wheelReports,
      scrollback: t.scrollback,
      font: termFont,
      scheme: () => tower.scheme(),
      keymap: t.keys,
      run: t.run,
      mode: (m) => t.onMode(modeText(m), m.t === 'owning'),
      end: t.onEnd,
      error: t.onError,
      upload: (name, data) => tower.call('upload', { name, data }).then((r) => r.path),
      files: { cwd: t.cwd, edit: (path, line) => tower.call('edit', { path, line }) },
    })
  }

  const offs = [tower.onScheme(() => open?.rescheme()), tower.prefs.on(() => void open?.refont())]
  return { mountTerm, closeTerm, stop: () => offs.forEach((off) => off()) }
}

export type Term = ReturnType<typeof startTerminal>

const termFont = () => terminalFont(tower.prefs.get())
