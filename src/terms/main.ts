/**
 * The terms daemon: owns the shells started in project directories. Nothing is logged: each shell's screen
 * lives in memory with a bounded scrollback, and the shell lives until it is killed or exits.
 *
 *   terms.sock  newline-delimited JSON commands (see ToTerms); `attach` turns its connection into the shell's stream
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import * as pty from '@lydell/node-pty'
import { endOnReadError } from '../shared/pty.ts'
import { headlessTerminal, serializer } from '../bridge/screen.ts'
import { withoutParentSession, withoutTerminal } from '../shared/env.ts'
import { sessionDirs, type Config } from '../shared/model.ts'
import { configPath, systemPaths } from '../shared/paths.ts'
import { checkSize, frame, jsonObject, onLines } from '../shared/protocol.ts'
import { claimSocket } from '../shared/socket.ts'
import { broadcast, joinViewer, socketViewer, type Screened } from '../shared/viewers.ts'
import { SHELL_SCROLLBACK, type FromTerms, type Shell, type ShellStream, type ToTerms } from '../shared/terms.ts'

const SHELL = process.env.SHELL
if (!SHELL) throw new Error('SHELL is not set: the terms daemon starts every shell with it')

type LiveShell = Screened<ShellStream> & {
  shell: Omit<Shell, 'process' | 'title'>
  proc: pty.IPty
  title?: string
}

const paths = systemPaths(configPath())
const shells = new Map<string, LiveShell>()

/** A shell's time to end on its hangup, which it may trap or ignore, before it is killed. */
const HANGUP_GRACE_MS = 2000

const endShell = (s: LiveShell) => {
  s.proc.kill()
  setTimeout(() => {
    if (shells.get(s.shell.id) === s) s.proc.kill('SIGKILL')
  }, HANGUP_GRACE_MS)
}

const liveShell = (id: string): LiveShell => {
  const s = shells.get(id)
  if (!s) throw Object.assign(new Error(`No shell "${id}"`), { code: 'not_found' as const })
  return s
}

function spawnShell({ project: projectId, cwd, cols, rows }: Extract<ToTerms, { t: 'spawn' }>): string {
  const config: Config = JSON.parse(readFileSync(paths.config, 'utf8'))
  const project = config.projects[projectId]
  if (!project) throw new Error(`Unknown project "${projectId}". Projects: ${Object.keys(config.projects).join(', ')}`)
  sessionDirs(project, cwd) // throws for a directory the project's sessions don't work in
  checkSize(cols, rows)

  const id = `sh-${randomBytes(3).toString('hex')}`
  const proc = pty.spawn(SHELL!, ['-l'], { name: 'xterm-256color', cols, rows, cwd, env: withoutTerminal(withoutParentSession(process.env)) })
  const screen = headlessTerminal({ cols, rows, scrollback: SHELL_SCROLLBACK })
  const s: LiveShell = { shell: { id, project: projectId, cwd, startedAt: Date.now(), cols, rows }, proc, screen, snapshot: serializer(screen), viewers: new Set() }
  shells.set(id, s)

  screen.onTitleChange((title) => (s.title = title || undefined))
  proc.onData((data) => {
    screen.write(data)
    broadcast(s, { t: 'o', data })
  })
  endOnReadError(proc, `shell ${id}`)
  proc.onExit(({ exitCode }) => {
    broadcast(s, { t: 'x', exitCode })
    screen.dispose()
    shells.delete(id)
    if (stopping && !shells.size) process.exit(0)
  })
  return id
}

/** The screen is resized once it has parsed everything written before, so earlier output lays out at its own size. */
function resizeShell({ id, cols, rows }: Extract<ToTerms, { t: 'resize' }>) {
  const s = liveShell(id)
  checkSize(cols, rows)
  s.proc.resize(cols, rows)
  s.shell = { ...s.shell, cols, rows }
  s.screen.write('', () => s.screen.resize(cols, rows))
  broadcast(s, { t: 'r', cols, rows })
}

const listed = (s: LiveShell): Shell => ({ ...s.shell, process: s.proc.process, title: s.title })

function handle(msg: Exclude<ToTerms, { t: 'attach' }>): FromTerms {
  switch (msg.t) {
    case 'spawn':
      return { t: 'spawned', id: spawnShell(msg) }
    case 'write':
      liveShell(msg.id).proc.write(msg.data)
      return { t: 'ok' }
    case 'resize':
      resizeShell(msg)
      return { t: 'ok' }
    case 'kill':
      endShell(liveShell(msg.id))
      return { t: 'ok' }
    case 'list':
      return { t: 'shells', shells: [...shells.values()].map(listed) }
    default:
      throw new Error(`Unknown message "${(msg as { t: unknown }).t}"`)
  }
}

/** A shell's exit ends its viewers' connections. */
function attach(sock: net.Socket, id: string) {
  const viewer = socketViewer<ShellStream>(sock)
  const s = shells.get(id)
  if (!s) return viewer({ t: 'error', message: `No shell "${id}"` })
  void joinViewer<ShellStream>(s, viewer, sock, (data) => ({ t: 'snapshot', data, cols: s.shell.cols, rows: s.shell.rows }), () => shells.has(id))
}

const reply = (msg: Exclude<ToTerms, { t: 'attach' }>): FromTerms => {
  try {
    return handle(msg)
  } catch (err) {
    const { message, code } = err as Error & { code?: unknown }
    return { t: 'error', message, ...(code === 'not_found' && { code }) }
  }
}

const control = net.createServer((sock) => {
  sock.on('error', (err) => console.error('terms client:', err.message))
  onLines(sock, (line) => {
    let msg: ToTerms
    try {
      msg = jsonObject(line) as ToTerms
    } catch (err) {
      return sock.write(frame({ t: 'error', message: (err as Error).message } satisfies FromTerms))
    }
    if (msg.t === 'attach') return attach(sock, msg.id)
    sock.write(frame(reply(msg)))
  })
})

let stopping = false

function stop() {
  stopping = true
  control.close()
  if (!shells.size) process.exit(0)
  for (const s of shells.values()) endShell(s)
}

mkdirSync(path.dirname(paths.terms), { recursive: true })
await claimSocket(paths.terms)
process.umask(0o077)
control.listen(paths.terms)
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('SIGHUP', stop)
console.log(`terms up: ${paths.terms}`)
