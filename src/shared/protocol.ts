import type { ModEvent } from './model.ts'

/**
 * The host protocol's version, sent in every `live` reply. A change to a message to or from the host bumps it, so a
 * client that outlived a host restart's code change can say the running host is older than itself.
 */
export const HOST_PROTOCOL = 5

/** Control messages to the host. Every request gets exactly one reply, in order. */
export type ToHost =
  /**
   * The host runs `argv` whole in `cwd`, the project's hub or one of its repos, with `env` over its own environment:
   * clients compose both (protocol 5). `runtime` and `command` are labels the host copies to the session's header and
   * never reads: what the session runs, and the name of the config's `argv` command it was composed from. `facts`:
   * `tower.*` facts logged right after the header, before any of the session's own events.
   */
  | { t: 'spawn'; id: string; project: string; cwd: string; runtime: string; argv: string[]; env: Record<string, string>; command?: string; facts?: ModEvent[]; cols: number; rows: number }
  | { t: 'write'; id: string; data: string }
  | { t: 'resize'; id: string; cols: number; rows: number }
  | { t: 'kill'; id: string }
  /**
   * Appends a `tower.*` fact to a session's log, as a hook event at the host's time: a running session's, or the log
   * of one this host does not run (stopped or lost with an earlier host), which no other process writes.
   */
  | { t: 'fact'; id: string; fact: ModEvent }
  | { t: 'live' }

/**
 * A spawn as a host older than protocol 5 takes it: `args` follow the config's `argv` and the mod's `--plugin-dir`,
 * which that host adds. `facts` from protocol 3; `command`, a name of the config's `argv` the host resolves, from
 * protocol 4: an older host spreads `argv` as an array and fails on the object shape.
 */
export type OldHostSpawn = { t: 'spawn'; id: string; project: string; cwd: string; args: string[]; command?: string; facts?: ModEvent[]; cols: number; rows: number }

/** What a client sends a host: a host older than protocol 5 takes the old spawn. */
export type ToAnyHost = ToHost | OldHostSpawn

/** What a running host says of itself: the ids of its running sessions and the protocol it speaks. */
export type HostLive = { ids: Set<string>; protocol: number }

export type FromHost =
  | { t: 'spawned'; id: string }
  | { t: 'ok' }
  /** A host older than `HOST_PROTOCOL` 1 sends no `protocol`. */
  | { t: 'live'; ids: string[]; protocol: number }
  | { t: 'error'; message: string }

export const frame = (msg: object): string => `${JSON.stringify(msg)}\n`

/** Text read as a JSON object; any other JSON value is refused, saying what it was. */
export const jsonObject = (text: string): object => {
  const value: unknown = JSON.parse(text)
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value
  throw new Error(`Expected a JSON object, got ${Array.isArray(value) ? 'an array' : value === null ? 'null' : typeof value}`)
}

/** The most columns or rows a daemon gives a terminal: its screen's buffer grows with both. */
export const MAX_TERMINAL_SIDE = 1000

/**
 * Throws unless `cols` and `rows` are whole numbers from 1 to `MAX_TERMINAL_SIDE`. A PTY takes fractions and huge
 * sizes that a screen (xterm) refuses later, on a timer, and that a log's `r` event would keep for every replay.
 */
export const checkSize = (cols: unknown, rows: unknown): void => {
  const side = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_TERMINAL_SIDE
  if (!side(cols) || !side(rows)) throw new Error(`A terminal's size is whole cols and rows from 1 to ${MAX_TERMINAL_SIDE}, not ${JSON.stringify(cols)}x${JSON.stringify(rows)}`)
}

/** Calls `onLine` with each complete newline-delimited line received on `sock`, a socket as far as lines are read from one. */
export const onLines = (sock: { setEncoding(encoding: 'utf8'): unknown; on(event: 'data', listener: (chunk: string) => void): unknown }, onLine: (line: string) => void): void => {
  let buffered = ''
  sock.setEncoding('utf8')
  sock.on('data', (chunk: string) => {
    const lines = (buffered + chunk).split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) if (line) onLine(line)
  })
}

/**
 * Claude shows a paste over 800 characters or 3 lines as a placeholder, and sends it wrapped in `<pasted_content>`,
 * which the model reads as material handed to it, not as the user's words. Smaller pastes land in the composer as
 * typed text.
 */
const PASTE_CHARS = 400
const PASTE_NEWLINES = 2

/** Text split into bracketed pastes small enough to land as typed text, in order. Newlines inside don't submit. */
export const promptPastes = (text: string): string[] => {
  const pastes: string[] = []
  let current: string[] = []
  let newlines = 0
  for (const ch of text.replaceAll('\r\n', '\n')) {
    current.push(ch)
    if (ch === '\n') newlines++
    if (current.length === PASTE_CHARS || newlines === PASTE_NEWLINES) {
      pastes.push(current.join(''))
      current = []
      newlines = 0
    }
  }
  if (current.length) pastes.push(current.join(''))
  return pastes.map((p) => `\x1b[200~${p}\x1b[201~`)
}

/** What submits the composer, sent on its own once every paste has been written. */
export const SUBMIT_KEY = '\r'

/**
 * Ctrl+Z makes Claude leave its screen and stop itself, waiting for the `fg` of a job-control shell. A session's
 * Claude leads its own PTY with no shell above it, so the stop is discarded and nothing ever continues it: the
 * worker sits on a blank screen. Keys bound for a session drop it.
 */
const SUSPEND_KEY = '\x1a'

export const sessionKeys = (data: string): string => data.replaceAll(SUSPEND_KEY, '')
