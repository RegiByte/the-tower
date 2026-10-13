/**
 * The tower's probes, run on a tick: the first probe due by its stream and the board reads, one read at a time, and
 * what it read is appended to its stream. A read only reads: none sends a prompt, starts a session or calls a verb.
 */
import { spawn } from 'node:child_process'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Session } from './bridge/facts.ts'
import {
  due, eventLine, newestReading, FLOOR_MS, monthFile, monthStart, NO_READS, probesOf, streamName, usageAnswer, USAGE_REQUEST,
  type Probe, type ProbeFacts, type ProbeRead, type Reader, type StreamHeader,
} from './bridge/probes.ts'
import { apiError, type ApiError } from './shared/api.ts'
import { withoutParentSession } from './shared/env.ts'
import type { Config } from './shared/model.ts'
import { systemStreamsPath, type SystemPaths } from './shared/paths.ts'

const TICK_MS = 30_000
const READ_TIMEOUT_MS = 30_000

/** Claude in print mode answering control requests on stdin: no tools, no settings, no MCP, no slash commands, nothing saved. */
const USAGE_ARGS = [
  '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
  '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
]

/**
 * Asks Claude for `/usage`'s data: the request is its only input, and it exits as its stdin closes. Run as the
 * sessions' `argv` (the same Claude, through any wrapper), from the temp dir, with the config's `env` and the parent
 * session scrubbed, and killed if it has not exited within the timeout.
 */
const readUsage = (config: Config): Promise<{ answer: unknown } | { error: string }> =>
  new Promise((resolve) => {
    const [command, ...args] = config.argv
    const child = spawn(command, [...args, ...USAGE_ARGS], { cwd: os.tmpdir(), env: withoutParentSession({ ...process.env, ...config.env }), stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let timedOut = false
    const timer = setTimeout(() => ((timedOut = true), child.kill('SIGKILL')), READ_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (err += chunk))
    child.on('error', (e) => (clearTimeout(timer), resolve({ error: e.message })))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return resolve({ error: `no answer within ${READ_TIMEOUT_MS / 1000}s` })
      const read = usageAnswer(out)
      resolve('error' in read && code ? { error: `${read.error}: claude exited ${code}: ${err.trim().split('\n').at(-1) ?? ''}` } : read)
    })
    /** A claude that exits before reading its stdin says why as it closes. */
    child.stdin.on('error', () => {})
    child.stdin.end(`${JSON.stringify(USAGE_REQUEST)}\n`)
  })

const READS: Record<Reader, (config: Config) => Promise<{ answer: unknown } | { error: string }>> = { 'claude.usage': readUsage }

/** Whether the file's last byte ends a line: an append torn by a crash leaves it open. */
const endsLine = (file: string): boolean => {
  const { size } = statSync(file)
  if (size === 0) return true
  const fd = openSync(file, 'r')
  try {
    const last = Buffer.alloc(1)
    readSync(fd, last, 0, 1, size - 1)
    return last[0] === 0x0a
  } finally {
    closeSync(fd)
  }
}

/**
 * Appends a read to its probe's stream, in the file of its month, which starts with its header. After a torn append
 * the read starts a line of its own, so the torn text costs only its own read.
 */
const append = (paths: SystemPaths, probe: string, at: number, read: ProbeRead) => {
  const dir = path.join(systemStreamsPath(paths), streamName(probe))
  const file = path.join(dir, monthFile(at))
  mkdirSync(dir, { recursive: true })
  const header: StreamHeader = { stream: streamName(probe), startedAt: monthStart(at), version: 1 }
  const before = !existsSync(file) ? `${JSON.stringify(header)}\n` : endsLine(file) ? '' : '\n'
  appendFileSync(file, `${before}${eventLine(at, read)}\n`)
}

/**
 * Runs the probes until the process ends. The one read in flight and when the last one started are all it holds:
 * whatever the config or a stream says, reads start at least `FLOOR_MS` apart. `readNow` reads a probe at once.
 */
export const runProbes = (paths: SystemPaths, readConfig: () => Config, sessions: () => Session[], probes: () => Map<string, ProbeFacts>) => {
  let reading = false
  let lastStart = -Infinity
  const read = async (probe: Probe, config: Config, now: number): Promise<ProbeRead> => {
    reading = true
    lastStart = now
    try {
      const answer = await READS[probe.reads](config)
      const ms = Date.now() - now
      const read: ProbeRead = 'answer' in answer ? { reads: probe.reads, ms, ok: true, answer: answer.answer } : { reads: probe.reads, ms, ok: false, error: answer.error }
      append(paths, probe.name, now, read)
      return read
    } finally {
      reading = false
    }
  }
  const tick = async () => {
    const now = Date.now()
    if (reading || now - lastStart < FLOOR_MS) return
    const config = readConfig()
    const facts = probes()
    const measured = newestReading(sessions().map((s) => s.facts.rateLimits))
    const probe = probesOf(config).find((p) => due(p, facts.get(p.name) ?? NO_READS, measured, now))
    if (probe) await read(probe, config, now)
  }
  setInterval(() => void tick().catch((err) => console.error('probes:', err)), TICK_MS)

  /** The probe named, read now: refused while it is off, while a read is in flight, or within the floor of the last start. */
  const readNow = async (name: string): Promise<{ at: number; read: ProbeRead } | ApiError> => {
    const config = readConfig()
    const probe = probesOf(config).find((p) => p.name === name)
    if (!probe) return apiError('not_found', `No probe "${name}": the config runs ${probesOf(config).map((p) => p.name).join(', ')}`)
    if (probe.off) return apiError('refused', `The probe "${name}" is off in the config (probes.${name}.off)`)
    if (reading) return apiError('refused', 'A probe is reading now: one read at a time')
    const now = Date.now()
    if (now - lastStart < FLOOR_MS) return apiError('refused', `Reads start at least ${FLOOR_MS / 1000}s apart: the next can start in ${Math.ceil((lastStart + FLOOR_MS - now) / 1000)}s`)
    return { at: now, read: await read(probe, config, now) }
  }
  return { readNow }
}
