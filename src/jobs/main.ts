/**
 * The jobs daemon: runs each job, one command, to its end in a PTY nobody types into, and is the one writer of the jobs
 * log (`jobs/YYYY-MM.jsonl`): a job's start, a request to stop it, and its end. Never its output and never its env. Its
 * screen lives in memory while it runs and for `JOB_KEEP_MS` after, the last `JOB_KEEP_COUNT` of them.
 *
 *   jobs.sock  newline-delimited JSON commands (see ToJobs); `attach` turns its connection into the job's stream
 *
 * A job that ignores SIGHUP outlives a daemon killed outright; the next daemon ends what is left of every job the log
 * leaves open (`groups.ts`). A job that leaves its group (`setsid`, a daemonizing server) is not followed: a job is one
 * command run to its end, not a supervisor of what it starts.
 */
import { randomBytes } from 'node:crypto'
import { accessSync, constants, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import * as pty from '@lydell/node-pty'
import { jobsOf } from '../bridge/jobs.ts'
import { headlessTerminal, serializer } from '../bridge/screen.ts'
import { streamFacts } from '../bridge/streams.ts'
import { logged } from '../logged.ts'
import { withoutParentSession, withoutTerminal } from '../shared/env.ts'
import { JOB_KEEP_COUNT, JOB_KEEP_MS, JOB_SIZE, type FromJobs, type HeldJob, type JobEnd, type JobFact, type JobStart, type JobStream, type ToJobs } from '../shared/jobs.ts'
import { configPath, systemPaths } from '../shared/paths.ts'
import { checkSize, frame, jsonObject, onLines } from '../shared/protocol.ts'
import { endOnReadError } from '../shared/pty.ts'
import { claimSocket } from '../shared/socket.ts'
import { SHELL_SCROLLBACK } from '../shared/terms.ts'
import { broadcast, joinViewer, socketViewer, type Screened } from '../shared/viewers.ts'
import { signalGroup } from '../signal-group.ts'
import { appendFact } from '../streams.ts'
import { logBytes, logFilesIn } from '../tail.ts'
import { bootTime, endGroup } from './groups.ts'

type LiveJob = Screened<JobStream> & { job: HeldJob; proc: pty.IPty; end?: JobEnd; forget?: NodeJS.Timeout }

const paths = systemPaths(configPath())
const jobs = new Map<string, LiveJob>()

const log = (at: number, ...[code, fact]: JobFact) => appendFact(paths.jobs, 'jobs', at, code, fact)

const failure = (message: string, code?: 'not_found' | 'ended') => Object.assign(new Error(message), code && { code })

const heldJob = (id: string): LiveJob => {
  const j = jobs.get(id)
  if (!j) throw failure(`No job "${id}"`, 'not_found')
  return j
}

const runningJob = (id: string): LiveJob => {
  const j = heldJob(id)
  if (j.end) throw failure(`Job "${id}" already ended`, 'ended')
  return j
}

const isProgram = (file: string): boolean => {
  try {
    accessSync(file, constants.X_OK)
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/** The file `program` runs: a path, from `cwd`, or a name on the job's PATH. node-pty runs a missing one as a job that exits 1, so it is refused first. */
const programFile = (program: string, cwd: string, env: Record<string, string>): string => {
  const candidates = program.includes('/') ? [path.resolve(cwd, program)] : (env.PATH ?? '').split(':').filter(Boolean).map((dir) => path.join(dir, program))
  const file = candidates.find(isProgram)
  if (!file) throw failure(`No program "${program}" ${program.includes('/') ? `at ${candidates[0]}` : "on the job's PATH"}`, 'not_found')
  return file
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string')

/** Throws unless `start` holds what a job needs: an argv, an absolute folder that exists, string env values, an owner and a label. */
const checkStart = ({ argv, cwd, env, owner, label }: JobStart): void => {
  if (!isStrings(argv) || !argv.length || !argv[0]) throw new Error(`A job's argv is a list of strings, its program first, not ${JSON.stringify(argv)}`)
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error(`A job's cwd is an absolute path to a folder that exists, not ${JSON.stringify(cwd)}`)
  if (env !== undefined && (typeof env !== 'object' || env === null || !Object.values(env).every((v) => typeof v === 'string'))) throw new Error("A job's env maps names to string values")
  if (typeof owner !== 'string' || !owner || typeof label !== 'string') throw new Error("A job's owner is a non-empty string and its label a string")
}

const SIGNAL_NAMES = new Map(Object.entries(os.constants.signals).map(([name, n]) => [n as number, name]))

/** node-pty reports a signalled exit as exit 0 with the signal's number, and no signal as 0. Linux's real-time signals have no name in Node: they are named by number. */
const jobEnd = ({ exitCode, signal }: { exitCode: number; signal?: number }): JobEnd =>
  signal ? { exit: null, signal: SIGNAL_NAMES.get(signal) ?? `SIG${signal}` } : { exit: exitCode, signal: null }

const forget = (j: LiveJob) => {
  clearTimeout(j.forget)
  j.screen.dispose()
  jobs.delete(j.job.id)
}

/** An ended job's screen is kept `JOB_KEEP_MS`, and only the last `JOB_KEEP_COUNT` of them. */
const keep = (j: LiveJob) => {
  j.forget = setTimeout(() => forget(j), JOB_KEEP_MS)
  const ended = [...jobs.values()].filter((other) => other.end).sort((a, b) => a.job.endedAt! - b.job.endedAt!)
  ended.slice(0, Math.max(0, ended.length - JOB_KEEP_COUNT)).forEach(forget)
}

/** The job's `started` is written before it is answered, so a job the daemon reports always has its start in the log. */
function startJob(start: JobStart): string {
  checkStart(start)
  const { argv, cwd, owner, label } = start
  const env = { ...withoutTerminal(withoutParentSession(process.env)), ...start.env }
  const file = programFile(argv[0], cwd, env)
  const id = `job-${randomBytes(4).toString('hex')}`
  const { cols, rows } = JOB_SIZE
  const at = Date.now()
  const proc = pty.spawn(file, argv.slice(1), { name: 'xterm-256color', cols, rows, cwd, env })
  try {
    log(at, 'started', { id, pid: proc.pid, argv, cwd, owner, label })
  } catch (err) {
    signalGroup(proc.pid, 'SIGKILL')
    throw err
  }
  const screen = headlessTerminal({ cols, rows, scrollback: SHELL_SCROLLBACK })
  const j: LiveJob = { job: { id, pid: proc.pid, startedAt: at, cols, rows }, proc, screen, snapshot: serializer(screen), viewers: new Set() }
  jobs.set(id, j)

  proc.onData((data) => {
    screen.write(data)
    broadcast(j, { t: 'o', data })
  })
  endOnReadError(proc, `job ${id}`)
  proc.onExit((exit) => {
    const end = jobEnd(exit)
    const endedAt = Date.now()
    logged(`job ${id}: its end isn't in the log`, log)(endedAt, 'ended', { id, ...end })
    j.end = end
    j.job = { ...j.job, endedAt }
    broadcast(j, { t: 'x', ...end })
    keep(j)
    void stopping?.then(exitIfIdle)
  })
  return id
}

/** Ends the job's whole group (`endGroup`): its end is logged when its leader exits, whatever of its group outlived it. */
const stopJob = (j: LiveJob): Promise<void> =>
  endGroup(j.job.pid, j.job.startedAt).then(
    () => undefined,
    (err) => console.error(`job ${j.job.id}: ending its group failed:`, err),
  )

function cancelJob({ id, by }: Extract<ToJobs, { t: 'cancel' }>) {
  if (typeof by !== 'string' || !by) throw new Error('A cancel names who asked (`by`)')
  const j = runningJob(id)
  log(Date.now(), 'cancelled', { id, by })
  void stopJob(j)
}

/** The screen is resized once it has parsed everything written before, so earlier output lays out at its own size. */
function resizeJob({ id, cols, rows }: Extract<ToJobs, { t: 'resize' }>) {
  const j = runningJob(id)
  checkSize(cols, rows)
  j.proc.resize(cols, rows)
  j.job = { ...j.job, cols, rows }
  j.screen.write('', () => j.screen.resize(cols, rows))
  broadcast(j, { t: 'r', cols, rows })
}

const running = (): LiveJob[] => [...jobs.values()].filter((j) => !j.end)

function handle(msg: Exclude<ToJobs, { t: 'attach' }>): FromJobs {
  switch (msg.t) {
    case 'start': {
      const { t: _, ...start } = msg
      return { t: 'started', id: startJob(start) }
    }
    case 'cancel':
      cancelJob(msg)
      return { t: 'ok' }
    case 'resize':
      resizeJob(msg)
      return { t: 'ok' }
    case 'list':
      return { t: 'jobs', jobs: [...jobs.values()].map((j) => j.job) }
    default:
      throw new Error(`Unknown message "${(msg as { t: unknown }).t}"`)
  }
}

/** A job's end ends its viewers' connections; a job already ended sends its end right after the snapshot. */
function attach(sock: net.Socket, id: string) {
  const viewer = socketViewer<JobStream>(sock)
  const j = jobs.get(id)
  if (!j) return viewer({ t: 'error', message: `No job "${id}"` })
  const endedBefore = j.end
  void joinViewer<JobStream>(j, viewer, sock, (data) => ({ t: 'snapshot', data, cols: j.job.cols, rows: j.job.rows }), () => !j.end).then(
    () => endedBefore && viewer({ t: 'x', ...endedBefore }),
  )
}

const reply = (msg: Exclude<ToJobs, { t: 'attach' }>): FromJobs => {
  try {
    return handle(msg)
  } catch (err) {
    const { message, code } = err as Error & { code?: unknown }
    return { t: 'error', message, ...((code === 'not_found' || code === 'ended') && { code }) }
  }
}

const control = net.createServer((sock) => {
  sock.on('error', (err) => console.error('jobs client:', err.message))
  onLines(sock, (line) => {
    let msg: ToJobs
    try {
      msg = jsonObject(line) as ToJobs
    } catch (err) {
      return sock.write(frame({ t: 'error', message: (err as Error).message } satisfies FromJobs))
    }
    if (msg.t === 'attach') return attach(sock, msg.id)
    sock.write(frame(reply(msg)))
  })
})

const MONTH_FILE = /^\d{4}-\d{2}\.jsonl(\.gz)?$/

/**
 * The jobs an earlier daemon started and never logged the end of: read before this daemon starts any. Every month is
 * read, archived ones too, as the tower reads them: a job's end may fall in a later month than its start.
 */
const openJobs = () => {
  if (!existsSync(paths.jobs)) return []
  const files = logFilesIn(readdirSync(paths.jobs).filter((f) => MONTH_FILE.test(f))).sort()
  const facts = files.flatMap((f) => streamFacts(logBytes(path.join(paths.jobs, f)).toString('utf8')).facts)
  return jobsOf(facts).filter((job) => !job.ended)
}

/** Ends what is left of each job an earlier daemon left open in this boot: a job started before the machine booted is gone. */
async function endLeftovers(open: ReturnType<typeof openJobs>) {
  const booted = await bootTime()
  const ended = await Promise.all(open.filter((job) => job.startedAt >= booted).map(async (job) => [job.id, await endGroup(job.pid, job.startedAt)] as const))
  for (const [id, members] of ended) if (members) console.log(`job ${id}: ended ${members} process(es) left running by an earlier jobs daemon`)
}

/** Set once the daemon stops: settles when every running job's group has ended. */
let stopping: Promise<unknown> | undefined

/** The daemon exits once every group it stopped has ended and every job's end is logged. */
const exitIfIdle = () => running().length || process.exit(0)

function stop() {
  if (stopping) return
  control.close()
  stopping = Promise.all(running().map(stopJob))
  void stopping.then(exitIfIdle)
}

mkdirSync(paths.jobs, { recursive: true })
const open = openJobs()
await claimSocket(paths.jobsSocket)
process.umask(0o077)
control.listen(paths.jobsSocket)
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('SIGHUP', stop)
console.log(`jobs up: ${paths.jobsSocket}`)
endLeftovers(open).catch((err) => console.error('jobs: ending what earlier jobs left running failed:', err))
