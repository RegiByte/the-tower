/**
 * The host: owns every session's PTY and is the single writer of every session log.
 *
 *   control.sock  newline-delimited JSON commands (see ToHost)
 *   hooks.sock    HTTP; Claude Code hooks POST their input to /hooks/<session id>
 *
 * Sessions live exactly as long as this process.
 */
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, type WriteStream } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import * as pty from '@lydell/node-pty'
import { sessionDirs, type ClaudeHookInput, type Config, type LogEvent, type ModEvent, type SessionHeader } from '../shared/model.ts'
import { configPath, sessionLogPath, systemPaths } from '../shared/paths.ts'
import { frame, HOST_PROTOCOL, jsonObject, onLines, type FromHost, type ToHost } from '../shared/protocol.ts'
import { endsLine, firstLine } from '../shared/log-file.ts'
import { claimSocket } from '../shared/socket.ts'
import { elapsed, hookFact, sessionArgv, sessionEnv } from './session.ts'

type LiveSession = { header: SessionHeader; proc: pty.IPty; log: WriteStream }

const MOD_DIR = path.join(import.meta.dirname, '..', 'mod')
/** What a log may hold unwritten before its session's output waits: a burst still lands at once, a stalled disk stops it. */
const LOG_BUFFER_BYTES = 1 << 20

const paths = systemPaths(configPath())
const live = new Map<string, LiveSession>()

/** `false` once the log holds more than `LOG_BUFFER_BYTES` unwritten. */
const append = (s: LiveSession, event: LogEvent): boolean => s.log.write(`${JSON.stringify(event)}\n`)
const now = (s: LiveSession) => elapsed(s.header.startedAt, Date.now())

const liveSession = (id: string): LiveSession => {
  const s = live.get(id)
  if (!s) throw new Error(`No live session "${id}"`)
  return s
}

function spawnSession({ id, project: projectId, cwd, args, cols, rows }: Extract<ToHost, { t: 'spawn' }>): string {
  const config: Config = JSON.parse(readFileSync(paths.config, 'utf8'))
  const project = config.projects[projectId]
  if (!project) throw new Error(`Unknown project "${projectId}". Projects: ${Object.keys(config.projects).join(', ')}`)
  sessionDirs(project, cwd) // throws for a directory the project's sessions don't work in

  if (live.has(id) || existsSync(sessionLogPath(paths, id))) throw new Error(`Session "${id}" already exists`)

  const startedAt = Date.now()
  const argv = sessionArgv(config, args, MOD_DIR)
  const header: SessionHeader = { id, project: projectId, cwd, argv, startedAt, cols, rows }
  const [file, ...rest] = argv

  const proc = pty.spawn(file, rest, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: sessionEnv(process.env, config, id, paths.hooks),
  })
  const log = createWriteStream(sessionLogPath(paths, id), { flags: 'wx', highWaterMark: LOG_BUFFER_BYTES })
  /** A session nobody can see is ended: its conversation stays resumable from Claude's transcript. */
  log.on('error', (err) => {
    console.error(`session ${id}: its log failed (${err.message}), ending it`)
    if (live.has(id)) proc.kill()
  })
  log.write(`${JSON.stringify(header)}\n`)
  const s: LiveSession = { header, proc, log }
  live.set(id, s)

  /**
   * Output waits in the PTY while the log is behind, so a slow disk slows the session down and never grows the host's
   * memory. Input, resizes and hooks are small and always appended.
   */
  proc.onData((data) => {
    if (append(s, [now(s), 'o', data]) || log.listenerCount('drain')) return
    proc.pause()
    log.once('drain', () => proc.resume())
  })
  proc.onExit(({ exitCode }) => {
    live.delete(id)
    if (!log.destroyed) {
      append(s, [now(s), 'x', stopping ? { exitCode, hostStopped: true } : { exitCode }])
      ending.add(log)
      log.end(() => (ending.delete(log), exitOnceFlushed()))
    }
    exitOnceFlushed()
  })
  return id
}

/**
 * A `tower.*` fact about a session: a running one's goes where its output does, any other's is appended to its log,
 * once the host that ran it, this one or an earlier one, has closed it, on a line of its own after a last line a host
 * that died left unfinished.
 */
function appendFact(id: string, fact: ModEvent) {
  if (!fact.hook_event_name.startsWith('tower.')) throw new Error(`Only tower.* facts are appended, not "${fact.hook_event_name}"`)
  const s = live.get(id)
  if (s) return void append(s, [now(s), 'h', fact])
  const file = sessionLogPath(paths, id)
  if (!existsSync(file)) throw new Error(`No log of session "${id}" to append to`)
  if ([...ending].some((log) => log.path === file)) throw new Error(`Session "${id}" is still writing its exit`)
  const header: SessionHeader = JSON.parse(firstLine(file)!.toString('utf8'))
  const event: LogEvent = [elapsed(header.startedAt, Date.now()), 'h', fact]
  appendFileSync(file, `${endsLine(file) ? '' : '\n'}${JSON.stringify(event)}\n`)
}

function handle(msg: ToHost): FromHost {
  switch (msg.t) {
    case 'spawn':
      return { t: 'spawned', id: spawnSession(msg) }
    case 'write': {
      const s = liveSession(msg.id)
      append(s, [now(s), 'i', msg.data])
      s.proc.write(msg.data)
      return { t: 'ok' }
    }
    case 'resize': {
      const s = liveSession(msg.id)
      append(s, [now(s), 'r', `${msg.cols}x${msg.rows}`])
      s.proc.resize(msg.cols, msg.rows)
      return { t: 'ok' }
    }
    case 'kill':
      liveSession(msg.id).proc.kill()
      return { t: 'ok' }
    case 'fact':
      appendFact(msg.id, msg.fact)
      return { t: 'ok' }
    case 'live':
      return { t: 'live', ids: [...live.keys()], protocol: HOST_PROTOCOL }
    default:
      throw new Error(`Unknown message "${(msg as { t: unknown }).t}": this host speaks protocol ${HOST_PROTOCOL}`)
  }
}

const reply = (line: string): FromHost => {
  try {
    return handle(jsonObject(line) as ToHost)
  } catch (err) {
    return { t: 'error', message: (err as Error).message }
  }
}

const control = net.createServer((sock) => {
  sock.on('error', (err) => console.error('control client:', err.message))
  onLines(sock, (line) => sock.write(frame(reply(line))))
})

const hooks = http.createServer((req, res) => {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', (chunk: string) => (body += chunk))
  req.on('end', () => {
    const id = /^\/hooks\/([\w-]+)$/.exec(req.url ?? '')?.[1]
    const s = id === undefined ? undefined : live.get(id)
    if (req.method !== 'POST' || !s) {
      res.writeHead(404).end()
      return
    }
    let input: ClaudeHookInput | ModEvent
    try {
      input = jsonObject(body) as ClaudeHookInput | ModEvent
    } catch (err) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end((err as Error).message)
      return
    }
    append(s, [now(s), 'h', hookFact(input)])
    res.writeHead(204).end()
  })
})

let stopping = false
/** Logs of exited sessions still writing their last lines: the host exits only once they are on disk. */
const ending = new Set<WriteStream>()
const exitOnceFlushed = () => stopping && !live.size && !ending.size && process.exit(0)

function stop() {
  stopping = true
  control.close()
  hooks.close()
  exitOnceFlushed()
  for (const s of live.values()) s.proc.kill()
}

mkdirSync(paths.sessions, { recursive: true })
await claimSocket(paths.control)
await claimSocket(paths.hooks)
process.umask(0o077)
control.listen(paths.control)
hooks.listen(paths.hooks)
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('SIGHUP', stop)
console.log(`host up: ${paths.config}`)
