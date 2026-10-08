/** A shell the terms daemon runs in a project directory. */
export type Shell = {
  id: string
  project: string
  cwd: string
  startedAt: number
  cols: number
  rows: number
  /** The foreground process, such as `zsh` or `node`. */
  process: string
  /** The terminal title the shell or its program set, if any. */
  title?: string
}

/** Control messages to the terms daemon. Every request gets exactly one reply, in order, except `attach`. */
export type ToTerms =
  /** `cwd` is a directory a session of the project could work in (`sessionDirs`): a main checkout or a worktree of one. */
  | { t: 'spawn'; project: string; cwd: string; cols: number; rows: number }
  | { t: 'write'; id: string; data: string }
  | { t: 'resize'; id: string; cols: number; rows: number }
  | { t: 'kill'; id: string }
  | { t: 'list' }
  /** Turns the connection into the shell's stream (see ShellStream) until either side closes it. */
  | { t: 'attach'; id: string }

export type FromTerms =
  | { t: 'spawned'; id: string }
  | { t: 'ok' }
  | { t: 'shells'; shells: Shell[] }
  | { t: 'error'; message: string }

/** A snapshot of the shell's screen, then its output, resizes and exit as they happen. */
export type ShellStream =
  | { t: 'snapshot'; data: string; cols: number; rows: number }
  | { t: 'o'; data: string }
  | { t: 'r'; cols: number; rows: number }
  | { t: 'x'; exitCode: number }
  | { t: 'error'; message: string }

/** The title a shell sets for itself at its prompt: `user@host:dir`. */
const PROMPT_TITLE = /^[^\s@]+@[^\s:]+:/

/** What a shell is doing: the command its title names, or its foreground process while it sits at its prompt. */
export const shellActivity = (shell: Shell): string => (shell.title && !PROMPT_TITLE.test(shell.title) ? shell.title : shell.process)

/** Shells start at this size; the first viewer fits them to its pane. */
export const SHELL_SIZE = { cols: 120, rows: 30 }

/** Lines of history a shell's screen keeps above its rows, sent with every snapshot. */
export const SHELL_SCROLLBACK = 2000
