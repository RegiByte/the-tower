import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, watch } from 'node:fs'
import { constants, gunzipSync } from 'node:zlib'
import { nextState, readsOutput, type SessionState } from './bridge/status.ts'
import type { LogEvent, SessionHeader, SessionLog } from './shared/model.ts'
import { sessionLogPath, type SystemPaths } from './shared/paths.ts'

const READ_CHUNK = 64 * 1024

/**
 * Reads one of a log's event lines as the event a reader needs, or `undefined` for a line it ignores, told from the
 * line's bytes without decoding or parsing it: output and tool responses are most of a log's bytes.
 */
export type EventFilter = (line: Buffer) => LogEvent | undefined

const parse = (line: Buffer): LogEvent => JSON.parse(line.toString('utf8'))

/** The host writes each event as `[t,"code",data]`, with no spaces. */
const codeOf = (line: Buffer): string => String.fromCharCode(line[line.indexOf(',') + 2])

export const everyEvent: EventFilter = parse

/** What a broken session's facts fold from: only the user letting it go (`tower.letGo`), as nothing else after its break is folded. */
export const afterBreak: EventFilter = (line) => (codeOf(line) === 'h' && line.includes('"hook_event_name":"tower.letGo"') ? parse(line) : undefined)

/** What draws a session's screen, and the exit that ends it. */
export const screenEvents: EventFilter = (line) => ('orx'.includes(codeOf(line)) ? parse(line) : undefined)

const HOOK_NAME = '"hook_event_name":"'
const POST_TOOL_USE = `${HOOK_NAME}PostToolUse"`
const AGENT_ID = /"agent_id":"([^"]*)"/

/**
 * A hook line's own event is `PostToolUse` when the payload's first `hook_event_name` key says so and no object opens
 * before it: the key can't sit inside a string with its quotes unescaped, so it is a key of the payload itself.
 */
const isPostToolUse = (line: Buffer): boolean => {
  const name = line.indexOf(HOOK_NAME)
  return name !== -1 && line.toString('latin1', name, name + POST_TOOL_USE.length) === POST_TOOL_USE && line.lastIndexOf('{', name) === line.indexOf('{')
}

/**
 * Everything a session's facts fold from, for one log read on from where its state was `state` (`BOOTING` at its
 * start): output only until the session starts (a blocking screen is the only fact output holds), and of a
 * `PostToolUse` only its name, its tool's response unread. The filter folds the session's state over what it keeps to
 * know when it has started. An event whose state it can't follow is kept, for the fold to break on it (`factsAfter`),
 * and nothing after it.
 */
export const factEvents = (from: SessionState): EventFilter => {
  let state: SessionState | undefined = from
  const keep = (event: LogEvent) => {
    try {
      state = nextState(state!, event)
    } catch {
      state = undefined
    }
    return event
  }
  return (line) => {
    if (!state) return undefined
    const code = codeOf(line)
    if (code === 'o') return readsOutput(state) ? keep(parse(line)) : undefined
    if (code === 'h' && isPostToolUse(line)) {
      const agent = AGENT_ID.exec(line.toString('latin1', 0, line.indexOf(HOOK_NAME)))?.[1]
      return keep([Number(line.subarray(1, line.indexOf(',')).toString()), 'h', { hook_event_name: 'PostToolUse', ...(agent && { agent_id: agent }) }])
    }
    return keep(parse(line))
  }
}

/** Splits at the last newline: the complete lines, and the start of a line still being written. */
const completeLines = (buf: Buffer): { lines: Buffer[]; rest: Buffer } => {
  const lines: Buffer[] = []
  let start = 0
  for (let end = buf.indexOf(0x0a); end !== -1; end = buf.indexOf(0x0a, start)) {
    lines.push(buf.subarray(start, end))
    start = end + 1
  }
  return { lines, rest: buf.subarray(start) }
}

const eventsIn = (lines: Buffer[], filter: EventFilter): LogEvent[] =>
  lines.flatMap((line) => {
    const event = filter(line)
    return event ? [event] : []
  })

/**
 * A log archived by Tidy is gzipped in place, `<id>.jsonl.gz`, whole and never appended to again: every reader reads it
 * as the plain log it was, its offsets counted in the plain bytes (decision `log-retention`).
 */
export const ARCHIVED = '.gz'

export const isArchived = (logPath: string) => logPath.endsWith(ARCHIVED)

/** The id of the session a log file is of. */
export const logIdOf = (file: string) => file.slice(0, file.lastIndexOf('.jsonl'))

/**
 * The session logs among the sessions directory's files, one per session: while Tidy archives a log both files are
 * there, and the plain one is the log until it is removed.
 */
export const logFilesIn = (files: string[]): string[] => {
  const plain = new Set(files.filter((file) => file.endsWith('.jsonl')).map(logIdOf))
  return files.filter((file) => file.endsWith('.jsonl') || (file.endsWith(`.jsonl${ARCHIVED}`) && !plain.has(logIdOf(file))))
}

/** Where the session's log is: plain while it is, else archived. */
export const logFileOf = (paths: SystemPaths, id: string): string => {
  const plain = sessionLogPath(paths, id)
  return existsSync(plain) ? plain : `${plain}${ARCHIVED}`
}

/**
 * The log's size in plain bytes. An archived log's is the gzip trailer's, the plain size modulo 2³², exact for any log
 * under 4 GiB.
 */
export const logSize = (logPath: string): number => {
  const fd = openSync(logPath, 'r')
  try {
    const size = fstatSync(fd).size
    if (!isArchived(logPath)) return size
    const trailer = Buffer.alloc(4)
    readSync(fd, trailer, 0, 4, size - 4)
    return trailer.readUInt32LE(0)
  } finally {
    closeSync(fd)
  }
}

/** The whole log's plain bytes. */
export const logBytes = (logPath: string): Buffer => (isArchived(logPath) ? gunzipSync(readFileSync(logPath)) : readFileSync(logPath))

/** The bytes of the file from `offset` to its end. */
const readFrom = (logPath: string, offset: number): Buffer => {
  if (isArchived(logPath)) return logBytes(logPath).subarray(offset)
  const fd = openSync(logPath, 'r')
  try {
    const buf = Buffer.allocUnsafe(Math.max(0, fstatSync(fd).size - offset))
    let read = 0
    while (read < buf.length) {
      const n = readSync(fd, buf, read, buf.length - read, offset + read)
      if (n === 0) break
      read += n
    }
    return buf.subarray(0, read)
  } finally {
    closeSync(fd)
  }
}

/** The log's header and the byte offset where its events start; `undefined` while the host hasn't written a whole line. */
export const readHeader = (logPath: string): { header: SessionHeader; offset: number } | undefined => {
  if (isArchived(logPath)) return archivedHeader(logPath)
  const fd = openSync(logPath, 'r')
  try {
    const chunks: Buffer[] = []
    const buf = Buffer.alloc(READ_CHUNK)
    for (let position = 0, n = readSync(fd, buf, 0, READ_CHUNK, 0); n > 0; n = readSync(fd, buf, 0, READ_CHUNK, position)) {
      const end = buf.subarray(0, n).indexOf(0x0a)
      chunks.push(Buffer.from(buf.subarray(0, end === -1 ? n : end)))
      position += n
      if (end !== -1) {
        const line = Buffer.concat(chunks)
        return { header: JSON.parse(line.toString('utf8')), offset: line.length + 1 }
      }
    }
    return undefined
  } finally {
    closeSync(fd)
  }
}

/** Inflates the archive's first bytes, twice as many each time, until they hold the header's whole line. */
const archivedHeader = (logPath: string): { header: SessionHeader; offset: number } | undefined => {
  const fd = openSync(logPath, 'r')
  try {
    for (let want = READ_CHUNK; ; want *= 2) {
      const buf = Buffer.alloc(want)
      const n = readSync(fd, buf, 0, want, 0)
      const plain = gunzipSync(buf.subarray(0, n), { finishFlush: constants.Z_SYNC_FLUSH })
      const end = plain.indexOf(0x0a)
      if (end !== -1) return { header: JSON.parse(plain.toString('utf8', 0, end)), offset: end + 1 }
      if (n < want) return undefined
    }
  } finally {
    closeSync(fd)
  }
}

/**
 * The events `filter` keeps of the log's complete lines from byte `offset` (a line's start) on, and the byte offset
 * where the next line starts.
 */
export const readEvents = (logPath: string, offset: number, filter: EventFilter): { events: LogEvent[]; offset: number } => {
  if (offset === logSize(logPath)) return { events: [], offset }
  const buf = readFrom(logPath, offset)
  return { events: eventsIn(completeLines(buf).lines, filter), offset: offset + buf.lastIndexOf(0x0a) + 1 }
}

/** The log's header and the events `filter` keeps of its complete lines, and the byte offset where the next line starts. */
export const readLog = (logPath: string, filter: EventFilter): { log: SessionLog; offset: number } => {
  const buf = logBytes(logPath)
  const [header, ...events] = completeLines(buf).lines
  return { log: { header: header && JSON.parse(header.toString('utf8')), events: eventsIn(events, filter) }, offset: buf.lastIndexOf(0x0a) + 1 }
}

/**
 * Calls `onEvent` with each event `filter` keeps in the log from byte `offset` on, as the host appends them, until the
 * returned function is called. The first events arrive after this returns, so `onEvent` may stop the tail.
 */
export const tailLog = (logPath: string, offset: number, filter: EventFilter, onEvent: (event: LogEvent) => void): (() => void) => {
  const fd = openSync(logPath, 'r')
  let position = offset
  let partial: Buffer = Buffer.alloc(0)
  let closed = false

  const drain = () => {
    if (closed) return
    const chunks: Buffer[] = [partial]
    const buf = Buffer.alloc(READ_CHUNK)
    for (let n = readSync(fd, buf, 0, READ_CHUNK, position); n > 0; n = readSync(fd, buf, 0, READ_CHUNK, position)) {
      chunks.push(Buffer.from(buf.subarray(0, n)))
      position += n
    }
    const { lines, rest } = completeLines(Buffer.concat(chunks))
    partial = rest
    for (const event of eventsIn(lines, filter)) if (!closed) onEvent(event)
  }

  const watcher = watch(logPath, drain)
  queueMicrotask(drain)
  return () => {
    if (closed) return
    closed = true
    watcher.close()
    closeSync(fd)
  }
}
