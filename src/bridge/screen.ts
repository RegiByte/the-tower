import headless from '@xterm/headless'
import serialize from '@xterm/addon-serialize'
import type { LogEvent, SessionLog } from '../shared/model.ts'

export type Terminal = InstanceType<typeof headless.Terminal>

/** The DECSET modes xterm reads as a mouse report encoding: SGR and SGR pixels. */
const MOUSE_ENCODINGS = [1006, 1016]

/** xterm parses writes asynchronously; resolves once everything written so far is on screen. */
const flushed = (term: Terminal): Promise<void> => new Promise((resolve) => term.write('', resolve))

const visibleRows = (term: Terminal): string[] => {
  const buf = term.buffer.active
  return Array.from({ length: term.rows }, (_, i) => buf.getLine(buf.baseY + i)?.translateToString(true) ?? '')
}

/**
 * The serialize addon restores mouse tracking but not its encoding. A terminal attached without
 * it reports the mouse in the default encoding, which Claude reads as typed garbage.
 */
const trackMouseEncoding = (term: Terminal): (() => number | undefined) => {
  let encoding: number | undefined
  const decset = (on: boolean) => (params: (number | number[])[]) => {
    for (const p of params) if (typeof p === 'number' && MOUSE_ENCODINGS.includes(p)) encoding = on ? p : undefined
    return false
  }
  term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, decset(true))
  term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, decset(false))
  return () => encoding
}

const ENTER_ALTERNATE = '\x1b[?1049h'
const LEAVE_ALTERNATE = '\x1b[?1049l'

/**
 * The log as far as its last frame. Claude draws in the alternate screen and leaves it as it exits, back to an empty
 * normal screen under its resume line; an ended session is cut just before that last exit, so its screen is the one
 * it worked on. A session that ended still in the alternate screen, or that is still running, is whole.
 */
export function lastFrame(log: SessionLog): SessionLog {
  if (!log.events.some((event) => event[1] === 'x')) return log
  const outputs = log.events.flatMap((event, index) => (event[1] === 'o' ? [{ index, data: event[2] }] : []))
  const output = outputs.map((o) => o.data).join('')
  const cut = output.lastIndexOf(LEAVE_ALTERNATE)
  if (cut === -1 || cut < output.lastIndexOf(ENTER_ALTERNATE)) return log
  let at = 0
  let start = 0
  while (start + outputs[at].data.length <= cut) start += outputs[at++].data.length
  const { index, data } = outputs[at]
  const before = data.slice(0, cut - start)
  const kept: LogEvent[] = before ? [[log.events[index][0], 'o', before]] : []
  return { header: log.header, events: [...log.events.slice(0, index), ...kept] }
}

const terminalFor = ({ header }: SessionLog): Terminal =>
  new headless.Terminal({ cols: header.cols, rows: header.rows, allowProposedApi: true })

/**
 * How much output a replay writes before waiting for xterm to parse it: xterm throws away writes once ~50 MB wait
 * unparsed, so a log with more output than that replays in bounded steps.
 */
const REPLAY_CHUNK = 4 * 1024 * 1024

/** Replays the log's output and resizes up to `until` seconds into `term`. */
async function replayInto(term: Terminal, { events }: SessionLog, until: number): Promise<void> {
  let unparsed = 0
  for (const event of events) {
    if (event[0] > until) break
    if (event[1] === 'o') {
      term.write(event[2])
      unparsed += event[2].length
      if (unparsed >= REPLAY_CHUNK) {
        await flushed(term)
        unparsed = 0
      }
    }
    if (event[1] === 'r') {
      const [cols, rows] = event[2].split('x').map(Number)
      await flushed(term)
      unparsed = 0
      term.resize(cols, rows)
    }
  }
  await flushed(term)
}

/** The screen as text, as it stood `until` seconds into the session. */
export async function screenAt(log: SessionLog, until = Infinity): Promise<string[]> {
  const term = terminalFor(log)
  await replayInto(term, log, until)
  const rows = visibleRows(term)
  term.dispose()
  return rows
}

/** Watches `term` from now on; the returned function gives bytes that redraw its screen, modes included, on a real terminal. */
export const serializer = (term: Terminal): (() => string) => {
  const ser = new serialize.SerializeAddon()
  term.loadAddon(ser as never)
  const mouseEncoding = trackMouseEncoding(term)
  return () => {
    const encoding = mouseEncoding()
    return ser.serialize() + (encoding ? `\x1b[?${encoding}h` : '')
  }
}

/** Bytes that redraw the session's current screen, or an ended session's last frame, modes included, on a real terminal. */
export async function snapshot(log: SessionLog): Promise<string> {
  const term = terminalFor(log)
  const serialized = serializer(term)
  await replayInto(term, lastFrame(log), Infinity)
  const bytes = serialized()
  term.dispose()
  return bytes
}
