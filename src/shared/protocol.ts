import type net from 'node:net'
import type { ModEvent } from './model.ts'

/**
 * The host protocol's version, sent in every `live` reply. A change to a message to or from the host bumps it, so a
 * client that outlived a host restart's code change can say the running host is older than itself.
 */
export const HOST_PROTOCOL = 2

/** Control messages to the host. Every request gets exactly one reply, in order. */
export type ToHost =
  /** `cwd` is the project's hub or one of its repos; `args` follow the host's own Claude arguments. */
  | { t: 'spawn'; id: string; project: string; cwd: string; args: string[]; cols: number; rows: number }
  | { t: 'write'; id: string; data: string }
  | { t: 'resize'; id: string; cols: number; rows: number }
  | { t: 'kill'; id: string }
  /**
   * Appends a `tower.*` fact to a session's log, as a hook event at the host's time: a running session's, or the log
   * of one this host does not run (stopped or lost with an earlier host), which no other process writes.
   */
  | { t: 'fact'; id: string; fact: ModEvent }
  | { t: 'live' }

/** What a running host says of itself: the ids of its running sessions and the protocol it speaks. */
export type HostLive = { ids: Set<string>; protocol: number }

export type FromHost =
  | { t: 'spawned'; id: string }
  | { t: 'ok' }
  /** A host older than `HOST_PROTOCOL` 1 sends no `protocol`. */
  | { t: 'live'; ids: string[]; protocol: number }
  | { t: 'error'; message: string }

export const frame = (msg: object): string => `${JSON.stringify(msg)}\n`

/** Calls `onLine` with each complete newline-delimited line received on `sock`. */
export const onLines = (sock: net.Socket, onLine: (line: string) => void): void => {
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
