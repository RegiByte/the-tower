/** The library's `/lib/terminal.js`: a browser terminal: face, size, keys, the view machine, a shell's stream. */
export {
  modeText,
  mountTermView,
} from '../shared/term-view.ts'
export {
  /** @provisional */ loadTerminalFont,
  terminalFont,
} from '../shared/terminal.ts'
export {
  /** @provisional */ SHELL_SCROLLBACK,
} from '../shared/terms.ts'
export type {
  /** @provisional */ JobStream,
} from '../shared/jobs.ts'
export type {
  /** @provisional */ TermMode,
  TermViewHandle,
} from '../shared/term-view.ts'
export type {
  /** @provisional */ TermFont,
} from '../shared/terminal.ts'
export type {
  /** @provisional */ ShellStream,
} from '../shared/terms.ts'
