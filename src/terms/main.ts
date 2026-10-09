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
import headless from '@xterm/headless'
import { serializer, type Terminal } from '../bridge/screen.ts'
import { withoutParentSession, withoutTerminal } from '../shared/env.ts'
import { sessionDirs, type Config } from '../shared/model.ts'
import { configPath, systemPaths } from '../shared/paths.ts'
import { frame, onLines } from '../shared/protocol.ts'
import { claimSocket } from '../shared/socket.ts'
import { SHELL_SCROLLBACK, type FromTerms, type Shell, type ShellStream, type ToTerms } from '../shared/terms.ts'

const SHELL = process.env.SHELL
if (!SHELL) throw new Error('SHELL is not set: the terms daemon starts every shell with it')

type Viewer = (msg: ShellStream) => void

type LiveShell = {
  shell: Omit<Shell, 'process' | 'title'>
  proc: pty.IPty
  screen: Terminal
  snapshot: () => string
  title?: string
  viewers: Set<Viewer>
}

const paths = systemPaths(configPath())
const shells = new Map<string, LiveShell>()

const liveShell = (id: string): LiveShell => {
  const s = shells.get(id)
  if (!s) throw new Error(`No shell "${id}"`)
  return s
}

const broadcast = (s: LiveShell, msg: ShellStream) => {
  for (const viewer of s.viewers) viewer(msg)
}

/** A shell's exit ends its viewers' connections. */
const socketViewer = (sock: net.Socket): Viewer => (msg) => {
  sock.write(frame(msg))
  if (msg.t === 'x' || msg.t === 'error') sock.end()
}

function spawnShell({ project: projectId, cwd, cols, rows }: Extract<ToTerms, { t: 'spawn' }>): string {
  const config: Config = JSON.parse(readFileSync(paths.config, 'utf8'))
  const project = config.projects[projectId]
  if (!project) throw new Error(`Unknown project "${projectId}". Projects: ${Object.keys(config.projects).join(', ')}`)
  sessionDirs(project, cwd) // throws for a directory the project's sessions don't work in

  const id = `sh-${randomBytes(3).toString('hex')}`
  const proc = pty.spawn(SHELL!, ['-l'], { name: 'xterm-256color', cols, rows, cwd, env: withoutTerminal(withoutParentSession(process.env)) })
  const screen = new headless.Terminal({ cols, rows, scrollback: SHELL_SCROLLBACK, allowProposedApi: true })
  const s: LiveShell = { shell: { id, project: projectId, cwd, startedAt: Date.now(), cols, rows }, proc, screen, snapshot: serializer(screen), viewers: new Set() }
  shells.set(id, s)

  screen.onTitleChange((title) => (s.title = title || undefined))
  proc.onData((data) => {
    screen.write(data)
    broadcast(s, { t: 'o', data })
  })
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
      liveShell(msg.id).proc.kill()
      return { t: 'ok' }
    case 'list':
      return { t: 'shells', shells: [...shells.values()].map(listed) }
  }
}

/**
 * The viewer joins before the snapshot is taken, and the snapshot waits for the screen to parse everything written
 * before it: output that arrives meanwhile is held back and sent after the snapshot, so none is lost or repeated.
 */
function attach(sock: net.Socket, id: string) {
  const viewer = socketViewer(sock)
  const s = shells.get(id)
  if (!s) return viewer({ t: 'error', message: `No shell "${id}"` })
  const held: ShellStream[] = []
  const hold: Viewer = (msg) => held.push(msg)
  s.viewers.add(hold)
  s.screen.write('', () => {
    s.viewers.delete(hold)
    viewer({ t: 'snapshot', data: s.snapshot(), cols: s.shell.cols, rows: s.shell.rows })
    held.forEach(viewer)
    if (shells.has(id) && !sock.destroyed) s.viewers.add(viewer)
  })
  sock.on('close', () => s.viewers.delete(viewer))
}

const reply = (msg: Exclude<ToTerms, { t: 'attach' }>): FromTerms => {
  try {
    return handle(msg)
  } catch (err) {
    return { t: 'error', message: (err as Error).message }
  }
}

const control = net.createServer((sock) => {
  sock.on('error', (err) => console.error('terms client:', err.message))
  onLines(sock, (line) => {
    let msg: ToTerms
    try {
      msg = JSON.parse(line)
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
  for (const s of shells.values()) s.proc.kill()
}

mkdirSync(path.dirname(paths.terms), { recursive: true })
await claimSocket(paths.terms)
process.umask(0o077)
control.listen(paths.terms)
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('SIGHUP', stop)
console.log(`terms up: ${paths.terms}`)
