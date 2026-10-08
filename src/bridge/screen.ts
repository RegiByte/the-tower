import headless from '@xterm/headless'
import serialize from '@xterm/addon-serialize'
import type { SessionLog } from '../shared/model.ts'

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

const terminalFor = ({ header }: SessionLog): Terminal =>
  new headless.Terminal({ cols: header.cols, rows: header.rows, allowProposedApi: true })

/** Replays the log's output and resizes up to `until` seconds into `term`. */
async function replayInto(term: Terminal, { events }: SessionLog, until: number): Promise<void> {
  for (const event of events) {
    if (event[0] > until) break
    if (event[1] === 'o') term.write(event[2])
    if (event[1] === 'r') {
      const [cols, rows] = event[2].split('x').map(Number)
      await flushed(term)
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

/** Bytes that redraw the session's current screen, modes included, on a real terminal. */
export async function snapshot(log: SessionLog): Promise<string> {
  const term = terminalFor(log)
  const serialized = serializer(term)
  await replayInto(term, log, Infinity)
  const bytes = serialized()
  term.dispose()
  return bytes
}
