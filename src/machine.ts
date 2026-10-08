/** The machine outside the logs: the host's live sessions, the terms daemon's shells, processes, git remotes, and the editor. */
import { execFile, execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { CliError } from './cli-error.ts'
import { parseListening, parseProcesses, peers, resources, type ClaudeRegistration, type Peer, type Process, type Resource } from './bridge/resources.ts'
import { connectHost, connectTerms } from './shared/client.ts'
import { withoutParentSession } from './shared/env.ts'
import type { SystemPaths } from './shared/paths.ts'
import { answers } from './shared/socket.ts'
import { promptPastes, SUBMIT_KEY, type FromHost, type HostLive, type ToHost } from './shared/protocol.ts'
import type { FromTerms, Shell, ToTerms } from './shared/terms.ts'

export const hostRequest = async (paths: SystemPaths, msg: ToHost): Promise<FromHost> => {
  const host = await connectHost(paths.control)
  const reply = await host.request(msg)
  host.close()
  return reply
}

/**
 * Types `text` into a session's composer and submits it, as the user would: in pastes small enough to land as typed
 * text, then Enter once the host has written the last one. Whatever the composer held stays, ahead of the text.
 */
export const submitText = async (paths: SystemPaths, id: string, text: string): Promise<FromHost> => {
  const host = await connectHost(paths.control)
  try {
    for (const data of [...promptPastes(text), SUBMIT_KEY]) {
      const reply = await host.request({ t: 'write', id, data })
      if (reply.t === 'error') return reply
    }
    return { t: 'ok' }
  } finally {
    host.close()
  }
}

/** What a request to a socket nobody listens on, or whose server went away mid-request, fails with. */
const NO_HOST = new Set(['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE'])

/** Whether a request failed because nothing listens on the daemon's socket. */
export const isNoHost = (err: unknown): boolean => NO_HOST.has(((err as Error).cause as NodeJS.ErrnoException | undefined)?.code ?? '')

/** `undefined` when no host is running. */
export const hostLive = async (paths: SystemPaths): Promise<HostLive | undefined> => {
  try {
    const reply = await hostRequest(paths, { t: 'live' })
    if (reply.t !== 'live') throw new Error(`Unexpected reply to live: ${JSON.stringify(reply)}`)
    return { ids: new Set(reply.ids), protocol: reply.protocol }
  } catch (err) {
    if (isNoHost(err)) return undefined
    throw err
  }
}

export const termsRequest = async (paths: SystemPaths, msg: ToTerms): Promise<FromTerms> => {
  const terms = await connectTerms(paths.terms)
  const reply = await terms.request(msg)
  terms.close()
  return reply
}

/** `undefined` when no terms daemon is running. */
export const termsShells = async (paths: SystemPaths): Promise<Shell[] | undefined> => {
  try {
    const reply = await termsRequest(paths, { t: 'list' })
    if (reply.t !== 'shells') throw new Error(`Unexpected reply to list: ${JSON.stringify(reply)}`)
    return reply.shells
  } catch (err) {
    if (isNoHost(err)) return undefined
    throw err
  }
}

/** With no host running, nothing is live. */
export const liveIds = async (paths: SystemPaths): Promise<Set<string>> => (await hostLive(paths))?.ids ?? new Set()

/** The full environment of every process runs to hundreds of KB. */
const run = async (file: string, args: string[]): Promise<string> =>
  (await promisify(execFile)(file, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).stdout

/** lsof exits 1 when nothing is listening. */
const listeningSockets = async (): Promise<string> => {
  try {
    return await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn'])
  } catch (err) {
    if ((err as { code?: unknown }).code === 1) return ''
    throw err
  }
}

/** A host's command ends with its script, wherever the system root is: throwaway systems run the same host. */
const HOST_SCRIPT = path.join(import.meta.dirname, 'host', 'main.ts')

export type ProcessScan = { procs: Process[]; hosts: Set<number> }

export const scanProcesses = async (): Promise<ProcessScan> => {
  const procs = parseProcesses(...(await Promise.all([run('ps', ['-A', '-ww', '-o', 'pid=,ppid=,command=']), run('ps', ['-A', '-ww', '-E', '-o', 'pid=,command='])])))
  return { procs, hosts: new Set(procs.filter((proc) => proc.command.endsWith(HOST_SCRIPT)).map((proc) => proc.pid)) }
}

export const resourcesIn = async ({ procs, hosts }: ProcessScan): Promise<Resource[]> => resources(procs, parseListening(await listeningSockets()), hosts)

export const resourcesOf = async (): Promise<Resource[]> => resourcesIn(await scanProcesses())

const CLAUDE_SESSIONS = path.join(os.homedir(), '.claude', 'sessions')

/** Claude registers its first session on this account as it runs one. */
const claudeSessionFiles = (): string[] => {
  try {
    return readdirSync(CLAUDE_SESSIONS)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

/** A Claude that exits between the listing and the read takes its file with it. */
const claudeRegistrations = (): ClaudeRegistration[] =>
  claudeSessionFiles()
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        const { pid, name } = JSON.parse(readFileSync(path.join(CLAUDE_SESSIONS, file), 'utf8'))
        return [{ pid, name }]
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw err
      }
    })

export const peersIn = ({ procs, hosts }: ProcessScan): Peer[] => peers(procs, claudeRegistrations(), hosts)

/** Sends each process SIGTERM and returns the ones signalled: a process that exited since it was listed is skipped. */
export const reap = (doomed: Resource[]): Resource[] =>
  doomed.filter((r) => {
    try {
      process.kill(r.pid, 'SIGTERM')
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
      throw err
    }
  })

/**
 * `git@github.com:org/repo.git` and `https://user:token@github.com/org/repo.git` → `https://github.com/org/repo`; a
 * remote on this machine, a path or `file://`, has no web page.
 */
const webUrl = (remote: string): string | undefined => {
  const scp = /^[\w.-]+@([^:/]+):(.+)$/.exec(remote)
  if (!scp && !URL.canParse(remote)) return undefined
  const url = new URL(scp ? `https://${scp[1]}/${scp[2]}` : remote)
  return url.protocol === 'file:' ? undefined : `https://${url.hostname}${url.pathname.replace(/\.git$/, '')}`
}

/** `git config --get` exits 1 when the key is unset, inside a repository or not. */
const NO_REMOTE = 1

/** The web page of the repository's `origin` remote; `undefined` when it has none or the dir is no repository. */
export const originUrl = async (dir: string): Promise<string | undefined> => {
  try {
    const { stdout } = await promisify(execFile)('git', ['-C', dir, 'config', '--get', 'remote.origin.url'], { encoding: 'utf8' })
    return webUrl(stdout.trim())
  } catch (err) {
    if ((err as { code?: number }).code === NO_REMOTE) return undefined
    throw err
  }
}

/** Shows `target` selected in a Finder window. */
export const revealInFinder = async (target: string): Promise<void> => {
  await promisify(execFile)('open', ['-R', target])
}

/** Runs one of the user's editor commands, an argv, to its end. */
export const runEditor = async ([command, ...args]: string[]): Promise<void> => {
  await promisify(execFile)(command, args)
}

/** The checkout this code runs from: the daemons start from it, and `tower update` moves it. */
export const REPO = path.join(import.meta.dirname, '..')

const UP_TIMEOUT_MS = 15000
const UP_POLL_MS = 200

/** What holds the place a daemon serves at: nothing, this system's daemon, or something else, described. */
export type Holder = { t: 'nothing' } | { t: 'ours' } | { t: 'other'; what: string }

/** `where`: the socket or URL it serves at; `script`, relative to the repo. */
/** `config`: the config of the system it belongs to, which every daemon reads from its environment. */
export type Daemon = { name: string; script: string; config: string; log: string; pid: string; where: string; holder: () => Promise<Holder> }

const socketHolder = (socket: string) => async (): Promise<Holder> => ((await answers(socket)) ? { t: 'ours' } : { t: 'nothing' })

const TOWER_SCRIPT = 'src/tower/server.ts'

/** The pid listening on a loopback TCP port; lsof exits 1 when none does. */
const listenerOn = async (port: number): Promise<number | undefined> => {
  try {
    return Number((await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])).split('\n')[0])
  } catch (err) {
    if ((err as { code?: unknown }).code === 1) return undefined
    throw err
  }
}

/**
 * Whether a daemon process serves `config`, read from its environment the way `configPath` reads it. `ps -E` runs a
 * command into its environment with nothing between values, so the environment is searched for this config's own
 * entries, spaces in paths included.
 */
const servesConfig = async (pid: number, config: string): Promise<boolean> => {
  const env = `${await run('ps', ['-E', '-ww', '-o', 'command=', '-p', String(pid)])} `.replace(/\n/g, ' ')
  if (env.includes(' TOWER_CONFIG=')) return env.includes(` TOWER_CONFIG=${config} `)
  const home = path.dirname(path.dirname(config))
  return config === path.join(home, '.tower', 'config.json') && env.includes(` HOME=${home} `)
}

/** The tower's port is ours while a tower serving this system's config listens on it. */
const towerHolder = (paths: SystemPaths, port: number) => async (): Promise<Holder> => {
  const pid = await listenerOn(port)
  if (pid === undefined) return { t: 'nothing' }
  const command = commandOf(pid) ?? ''
  if (!command.includes(TOWER_SCRIPT)) return { t: 'other', what: `pid ${pid}, ${command}` }
  return (await servesConfig(pid, paths.config)) ? { t: 'ours' } : { t: 'other', what: `the tower of another system (pid ${pid})` }
}

/** The processes that outlive every renderer, then the tower on `port` (`towerPort`): in the order they come up. */
export const daemons = (paths: SystemPaths, port: number): Daemon[] => [
  { name: 'host', script: 'src/host/main.ts', config: paths.config, log: paths.hostLog, pid: paths.hostPid, where: paths.control, holder: socketHolder(paths.control) },
  { name: 'terms', script: 'src/terms/main.ts', config: paths.config, log: paths.termsLog, pid: paths.termsPid, where: paths.terms, holder: socketHolder(paths.terms) },
  { name: 'tower', script: TOWER_SCRIPT, config: paths.config, log: paths.towerLog, pid: paths.towerPid, where: `http://127.0.0.1:${port}`, holder: towerHolder(paths, port) },
]

/** The daemons `names` picks, every one when it picks none: an unknown name is an error. */
export const daemonsNamed = (paths: SystemPaths, port: number, names: string[]): Daemon[] => {
  const all = daemons(paths, port)
  const unknown = names.find((name) => !all.some((d) => d.name === name))
  if (unknown !== undefined) throw new CliError(`No daemon "${unknown}": ${all.map((d) => d.name).join(', ')}`)
  return names.length ? all.filter((d) => names.includes(d.name)) : all
}

/** Runs `script` in a session of its own, so it outlives the caller and its terminal. Returns its pid. */
export const startDetached = (script: string, log: string): number => {
  const out = openSync(log, 'a')
  const child = spawn(process.execPath, ['--import', 'tsx', script], { cwd: REPO, detached: true, stdio: ['ignore', out, out], env: withoutParentSession(process.env) })
  child.unref()
  closeSync(out)
  return child.pid!
}

const heldBy = (daemon: Daemon, holder: Holder & { t: 'other' }): Error =>
  new CliError(`${daemon.name}: ${daemon.where} is held by ${holder.what}: stop it where it runs${daemon.name === 'tower' ? `, or serve this system on another port: set port in ${daemon.config}` : ''}`)

const strayAt = (daemon: Daemon, id: number): Error =>
  new CliError(`${daemon.name} runs as pid ${id} (${daemon.pid}) but does not answer at ${daemon.where}${daemon.name === 'tower' ? ": the config's port changed since it started" : ''}: tower down ${daemon.name}, then tower up`)

/** Where the daemon serves, unless something else holds it or this system's runs without answering there. */
const placeFor = async (daemon: Daemon): Promise<Holder> => {
  const holder = await daemon.holder()
  if (holder.t === 'other') throw heldBy(daemon, holder)
  const stray = holder.t === 'nothing' ? await startedPid(daemon) : undefined
  if (stray !== undefined) throw strayAt(daemon, stray)
  return holder
}

/** Brings each daemon up in order, once none of them is held by something else: a refusal starts nothing. */
export const bringAllUp = async (picked: Daemon[]): Promise<Array<[Daemon, 'started' | 'already up']>> => {
  for (const daemon of picked) await placeFor(daemon)
  const results: Array<[Daemon, 'started' | 'already up']> = []
  for (const daemon of picked) results.push([daemon, await bringUp(daemon)])
  return results
}

/** Starts the daemon unless this system's already answers where it serves, and waits until it does. */
export const bringUp = async (daemon: Daemon): Promise<'started' | 'already up'> => {
  if ((await placeFor(daemon)).t === 'ours') return 'already up'
  writeFileSync(daemon.pid, String(startDetached(path.join(REPO, daemon.script), daemon.log)))
  const deadline = Date.now() + UP_TIMEOUT_MS
  while ((await daemon.holder()).t !== 'ours') {
    if (Date.now() > deadline) throw new CliError(`${daemon.name} did not come up within ${UP_TIMEOUT_MS / 1000}s: see ${daemon.log}`)
    await new Promise((resolve) => setTimeout(resolve, UP_POLL_MS))
  }
  return 'started'
}

/** The command line of a running process; `undefined` when no process has that pid. */
const commandOf = (pid: number): string | undefined => {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

/**
 * The pid `tower up` wrote for the daemon, while its process still runs the daemon's script on this system's config:
 * pids are reused, and other systems run the same scripts. It may serve elsewhere than the daemon's `where` now: a
 * tower started before the config's port changed.
 */
export const startedPid = async ({ script, config, pid }: Daemon): Promise<number | undefined> => {
  if (!existsSync(pid)) return undefined
  const id = Number(readFileSync(pid, 'utf8'))
  return commandOf(id)?.includes(script) && (await servesConfig(id, config)) ? id : undefined
}

/** Stops the daemon `tower up` started, found by the pid it wrote (`startedPid`). */
export const bringDown = async (daemon: Daemon): Promise<'stopped' | 'not running'> => {
  const { name, where, pid, holder } = daemon
  const up = (await holder()).t === 'ours'
  const id = await startedPid(daemon)
  if (id === undefined) {
    rmSync(pid, { force: true })
    if (up) throw new Error(`${name} answers at ${where} but was not started by tower up from this system: stop it where it runs`)
    return 'not running'
  }
  process.kill(id, 'SIGTERM')
  const deadline = Date.now() + UP_TIMEOUT_MS
  while (commandOf(id)) {
    if (Date.now() > deadline) throw new Error(`${name} (pid ${id}) did not stop within ${UP_TIMEOUT_MS / 1000}s`)
    await new Promise((resolve) => setTimeout(resolve, UP_POLL_MS))
  }
  rmSync(pid)
  return 'stopped'
}

/** Stops each daemon in reverse order of coming up; one refused is reported as its error, and the rest still stop. */
export const bringAllDown = async (picked: Daemon[]): Promise<Array<[Daemon, 'stopped' | 'not running' | Error]>> => {
  const results: Array<[Daemon, 'stopped' | 'not running' | Error]> = []
  for (const daemon of [...picked].reverse()) results.push([daemon, await bringDown(daemon).catch((err: Error) => err)])
  return results
}
