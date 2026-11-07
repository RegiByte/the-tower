import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, watch } from 'node:fs'
import path from 'node:path'
import { constants, gunzipSync } from 'node:zlib'
import { nextState, readsOutput, type SessionState } from './bridge/status.ts'
import type { Broken, FoldEvent, Unreadable } from './bridge/facts.ts'
import type { LogEvent, SessionHeader } from './shared/model.ts'
import { startOfSessionId } from './shared/launch.ts'
import { firstLine } from './shared/log-file.ts'
import { sessionLogPath } from './shared/paths.ts'
import type { SystemPaths } from './shared/model.ts'
import { logged, watchedLoudly } from './logged.ts'

const READ_CHUNK = 64 * 1024

/**
 * Reads one of a log's event lines as the event a reader needs, or `undefined` for a line it ignores, told from the
 * line's bytes without decoding or parsing it: output and tool responses are most of a log's bytes.
 */
export type EventFilter<E = LogEvent> = (line: Buffer) => E | undefined

const PREFIX_BYTES = 32

/** A line's JSON, or the parser's reason it holds none. */
const jsonOf = (line: Buffer): { value: unknown } | { notJson: string } => {
  try {
    return { value: JSON.parse(line.toString('utf8')) }
  } catch (err) {
    if (err instanceof SyntaxError) return { notJson: err.message }
    throw err
  }
}

const TIME_AND_CODE = /^\[(\d+(?:\.\d+)?),"(\w)"/

/** A line that holds no event, read as far as its prefix goes: its time (the session's start if cut before it) and code. */
const unreadable = (line: Buffer, message: string): Unreadable => {
  const [, at = '0', code = '?'] = TIME_AND_CODE.exec(line.toString('latin1', 0, PREFIX_BYTES)) ?? []
  return { unreadable: { message, at: Number(at), code } }
}

const isEvent = (value: unknown): value is LogEvent => Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'string'

/**
 * A line's event. A complete line that isn't JSON is a write the host never finished, ended by a later append (a
 * fact appended to the log of a session whose host died mid-write), and JSON of another shape is no line the host
 * wrote: neither holds an event.
 */
const eventOf = (line: Buffer): LogEvent | Unreadable => {
  const read = jsonOf(line)
  if ('notJson' in read) return unreadable(line, `a line that isn't JSON (${read.notJson})`)
  return isEvent(read.value) ? read.value : unreadable(line, `a line that isn't an event (${line.toString('utf8', 0, PREFIX_BYTES)})`)
}

const parseWhole = (line: Buffer): LogEvent | undefined => {
  const event = eventOf(line)
  return 'unreadable' in event ? undefined : event
}

/** The host writes each event as `[t,"code",data]`, with no spaces. */
const codeOf = (line: Buffer): string => String.fromCharCode(line[line.indexOf(',') + 2])

export const everyEvent: EventFilter = parseWhole

/** What a broken session's facts fold from: only the user letting it go (`tower.letGo`), as nothing else after its break is folded. */
export const afterBreak: EventFilter = (line) => (codeOf(line) === 'h' && line.includes('"hook_event_name":"tower.letGo"') ? parseWhole(line) : undefined)

/** What draws a session's screen, and the exit that ends it. */
export const screenEvents: EventFilter = (line) => ('orx'.includes(codeOf(line)) ? parseWhole(line) : undefined)

/** What a worker's brief and its tool calls are read from (`turns.ts`): Claude's hooks and the mod's events, its output and input unread. */
export const hookEvents: EventFilter = (line) => (codeOf(line) === 'h' ? parseWhole(line) : undefined)

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
 * know when it has started. An event whose state it can't follow is kept, and a line that holds no event is read as
 * `Unreadable`, for the fold to break on it (`factsAfter`); after it, only what `afterBreak` keeps.
 */
export const factEvents = (from: SessionState): EventFilter<FoldEvent> => {
  let state: SessionState | undefined = from
  const keep = (event: FoldEvent) => {
    try {
      state = 'unreadable' in event ? undefined : nextState(state!, event)
    } catch {
      state = undefined
    }
    return event
  }
  const follow = (line: Buffer): FoldEvent | undefined => {
    const code = codeOf(line)
    if (code === 'o') return readsOutput(state!) ? keep(eventOf(line)) : undefined
    if (code === 'h' && isPostToolUse(line)) {
      const agent = AGENT_ID.exec(line.toString('latin1', 0, line.indexOf(HOOK_NAME)))?.[1]
      return keep([Number(line.subarray(1, line.indexOf(',')).toString()), 'h', { hook_event_name: 'PostToolUse', ...(agent && { agent_id: agent }) }])
    }
    return keep(eventOf(line))
  }
  return (line) => (state ? follow(line) : afterBreak(line))
}

/** The events `filter` keeps of `buf`'s complete lines from byte `start` (a line's start) on, each line let go once read. */
const eventsFrom = <E>(buf: Buffer, start: number, filter: EventFilter<E>): E[] => {
  const events: E[] = []
  for (let end = buf.indexOf(0x0a, start); end !== -1; start = end + 1, end = buf.indexOf(0x0a, start)) {
    const event = filter(buf.subarray(start, end))
    if (event) events.push(event)
  }
  return events
}

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

/** A log's first line as read: the byte offset where its events start and, when the line holds no header, why (`lostHeader`). */
export type Head = { header: SessionHeader; offset: number; unreadable?: Broken }

const isHeader = (value: unknown): value is SessionHeader => {
  const { id, project, cwd, argv, startedAt, cols, rows } = (value ?? {}) as Partial<SessionHeader>
  return typeof id === 'string' && typeof project === 'string' && typeof cwd === 'string' && Array.isArray(argv) && typeof startedAt === 'number' && typeof cols === 'number' && typeof rows === 'number'
}

/** The directory a hook line says its session ran in. */
const hookCwd: EventFilter<string> = (line) => {
  const event = hookEvents(line)
  const cwd = event && (event[2] as { cwd?: unknown } | null)?.cwd
  return typeof cwd === 'string' ? cwd : undefined
}

/**
 * The header of a log whose first line holds none, from what is left: the id in the log's file name, the start in that
 * id, the directory in its first hook that names one (none: `''`), no floor (`project: ''`, `floorOf` finds it from
 * the directory) and no launch.
 */
const lostHeader = (logPath: string, offset: number): SessionHeader => {
  const id = logIdOf(path.basename(logPath))
  return { id, project: '', cwd: readEvents(logPath, offset, hookCwd).events[0] ?? '', argv: [], startedAt: startOfSessionId(id), cols: 80, rows: 24 }
}

const headOf = (logPath: string, line: Buffer): Head => {
  const offset = line.length + 1
  const read = jsonOf(line)
  if ('value' in read && isHeader(read.value)) return { header: read.value, offset }
  const why = 'notJson' in read ? `isn't JSON (${read.notJson})` : `isn't a session's header (${line.toString('utf8', 0, PREFIX_BYTES)})`
  return { header: lostHeader(logPath, offset), offset, unreadable: { message: `its first line ${why}`, at: 0, code: 'header' } }
}

/** The log's first line as read; `undefined` while the host hasn't written a whole line. */
export const readHeader = (logPath: string): Head | undefined => {
  if (isArchived(logPath)) return archivedHeader(logPath)
  const line = firstLine(logPath)
  return line && headOf(logPath, line)
}

/** Inflates the archive's first bytes, twice as many each time, until they hold the header's whole line. */
const archivedHeader = (logPath: string): Head | undefined => {
  const fd = openSync(logPath, 'r')
  try {
    for (let want = READ_CHUNK; ; want *= 2) {
      const buf = Buffer.alloc(want)
      const n = readSync(fd, buf, 0, want, 0)
      const plain = gunzipSync(buf.subarray(0, n), { finishFlush: constants.Z_SYNC_FLUSH })
      const end = plain.indexOf(0x0a)
      if (end !== -1) return headOf(logPath, plain.subarray(0, end))
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
export const readEvents = <E>(logPath: string, offset: number, filter: EventFilter<E>): { events: E[]; offset: number } => {
  if (offset === logSize(logPath)) return { events: [], offset }
  const buf = readFrom(logPath, offset)
  return { events: eventsFrom(buf, 0, filter), offset: offset + buf.lastIndexOf(0x0a) + 1 }
}

/** The log's header and the events `filter` keeps of its complete lines, and the byte offset where the next line starts. */
export const readLog = <E>(logPath: string, filter: EventFilter<E>): { log: { header: SessionHeader; events: E[] }; offset: number } => {
  const buf = logBytes(logPath)
  const headerEnd = buf.indexOf(0x0a)
  return { log: { header: (headerEnd === -1 ? undefined : headOf(logPath, buf.subarray(0, headerEnd)).header)!, events: eventsFrom(buf, headerEnd + 1, filter) }, offset: buf.lastIndexOf(0x0a) + 1 }
}

/**
 * Calls `onEvent` with each event `filter` keeps in the log from byte `offset` on, as the host appends them, until the
 * returned function is called. The first events arrive after this returns, so `onEvent` may stop the tail.
 */
export const tailLog = <E>(logPath: string, offset: number, filter: EventFilter<E>, onEvent: (event: E) => void): (() => void) => {
  const fd = openSync(logPath, 'r')
  let position = offset
  let partial: Buffer = Buffer.alloc(0)
  let closed = false

  const drain = logged(`tail of ${logPath}`, () => {
    if (closed) return
    const chunks: Buffer[] = [partial]
    const buf = Buffer.alloc(READ_CHUNK)
    for (let n = readSync(fd, buf, 0, READ_CHUNK, position); n > 0; n = readSync(fd, buf, 0, READ_CHUNK, position)) {
      chunks.push(Buffer.from(buf.subarray(0, n)))
      position += n
    }
    const read = Buffer.concat(chunks)
    partial = read.subarray(read.lastIndexOf(0x0a) + 1)
    for (const event of eventsFrom(read, 0, filter)) if (!closed) onEvent(event)
  })

  const watcher = watchedLoudly(watch(logPath, drain), logPath)
  queueMicrotask(drain)
  return () => {
    if (closed) return
    closed = true
    watcher.close()
    closeSync(fd)
  }
}
