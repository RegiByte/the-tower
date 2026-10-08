/**
 * `tower`, the one command for the user and the workers. The user's verbs, read from the system root and sent to the
 * daemons, are here; every other verb is a worker's, read from the running tower (`src/directory.ts`).
 *
 *   tower init [hub] [repos...]  write a first config: one project, its hub here or at [hub], beside [repos]
 *   tower doctor                 check what the tower needs, with a fix for each failure; exits 1 on any
 *   tower config check           check the config as the tower reads it, each problem at its key; exits 1 on any
 *   tower up [host|terms|tower...]    start the host, the terms daemon and the tower in the background, each unless
 *                                already running; only the ones named, when named
 *   tower down [host|terms|tower...]  stop what tower up started (the host's end ends every session, terms' every
 *                                shell); only the ones named, when named: `tower down tower && tower up tower`
 *                                restarts the tower alone. One it refuses (started by hand) is reported, the rest
 *                                still stopped, and it exits 1
 *   tower update                 move this checkout to the newest release (a tag vX.Y.Z): show its CHANGELOG entries,
 *                                check it out, install, rebuild Tower 3D if built, restart the tower if running; say
 *                                when the host needs a restart, never restart it
 *   tower spawn <project> [--cwd <dir>] [--model <m>] [--effort <e>] [-- <prompt...>]
 *                                start a session (in the project's hub by default), print its id
 *   tower resume <id>            start a session that continues <id>'s conversation, print its id
 *   tower submit <id> <text...>  type a prompt and submit it
 *   tower kill <id>
 *   tower live                   ids of running sessions
 *   tower ls                     every session, with project, status and what it left running
 *   tower ps                     every process a session left running, with the ports it listens on
 *   tower reap [id]              end what <id> left running, or what every session no longer live left running
 *   tower screen <id> [seconds]  the session's screen, now or at a moment, rebuilt from its log
 *   tower attach <id>            sit at the session: its live screen, your keyboard. Ctrl-] detaches
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { attach } from './attach.ts'
import { CliError, reported } from './cli-error.ts'
import { checkConfigFile, CONFIG_DOCS, problemLines } from './config-check.ts'
import { doctor, verdictLines } from './doctor.ts'
import { init } from './init.ts'
import { update } from './update.ts'
import { foldLog } from './checkpoints.ts'
import { bringAllDown, bringAllUp, daemonsNamed, isNoHost, liveIds, hostRequest, reap, resourcesOf, submitText } from './machine.ts'
import { resumeName } from './bridge/chains.ts'
import { conversationsOf, latestSaved } from './bridge/conversation.ts'
import type { Session } from './bridge/facts.ts'
import type { Resource } from './bridge/resources.ts'
import { screenAt } from './bridge/screen.ts'
import { withLiveness } from './bridge/status.ts'
import { callsignsOf, configuredUser, projectPlugins, towerPort, worktreesConfig, type Config, type SessionLog } from './shared/model.ts'
import { readConfig } from './system.ts'
import { newSessionId, resumeRequest, spawnRequest } from './shared/launch.ts'
import { briefFor } from './worktrees.ts'
import { configPath, projectCollectionsPath, systemPaths } from './shared/paths.ts'
import { everyEvent, logFileOf, logFilesIn, readLog } from './tail.ts'
import type { FromHost, ToHost } from './shared/protocol.ts'

const paths = systemPaths(configPath())

/** A request to the host, which can only fail to arrive by the host not running. */
const fromHost = <T>(request: Promise<T>): Promise<T> =>
  request.catch((err) => {
    if (isNoHost(err)) throw new CliError(`No host answers at ${paths.control}`, 'tower up')
    throw err
  })

const request = (msg: ToHost) => fromHost(hostRequest(paths, msg))

/** The log of a session the user named: a name no session has is a usage slip. */
const sessionLogFile = (id: string | undefined): string => {
  if (!id) throw new CliError(`Usage: tower ${command} <id>`, '`tower ls` lists every session by its id')
  const file = logFileOf(paths, id)
  if (!existsSync(file)) throw new CliError(`No session "${id}" in ${paths.sessions}`, '`tower ls` lists every session by its id')
  return file
}

const readSessionLog = (id: string | undefined): SessionLog => readLog(sessionLogFile(id), everyEvent).log

const readConfigFile = (): Config => JSON.parse(readFileSync(paths.config, 'utf8'))

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What a config check found nothing wrong with, so a pass says what it covered. */
const checkedSummary = (config: Config): string => {
  const projects = Object.values(config.projects)
  return `${counted(projects.length, 'project', 'projects')} and ${counted(projects.reduce((n, p) => n + (p.shelf?.length ?? 0), 0), 'shelf entry', 'shelf entries')} checked, each directory and html page found`
}

const readSessions = (): Session[] =>
  logFilesIn(readdirSync(paths.sessions))
    .sort()
    .flatMap((file) => foldLog(paths.cache, path.join(paths.sessions, file))?.session ?? [])

const summary = (running: Resource[]): string => {
  if (!running.length) return ''
  const orphans = running.filter((r) => r.orphan).length
  const ports = running.flatMap((r) => r.ports.map((port) => `:${port}`))
  return [`${running.length} running`, orphans ? `(${orphans} orphaned)` : '', ...ports].filter(Boolean).join(' ')
}

const ago = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
}

const print = (reply: FromHost) => {
  if (reply.t === 'error') throw new CliError(reply.message)
  if (reply.t === 'spawned') console.log(reply.id)
  if (reply.t === 'live') console.log(reply.ids.join('\n'))
}

const [command, id, ...rest] = process.argv.slice(2)

const main = async (): Promise<void> => {
  switch (command) {
    case 'init': {
      const [hub = process.cwd(), ...repos] = process.argv.slice(3)
      const config = await init(paths.config, hub, repos)
      console.log(`Wrote ${paths.config}:\n${JSON.stringify(config, null, 2)}\n\nNext: tower doctor, then tower up. The README shows the rest of the config.`)
      break
    }
    case 'doctor': {
      const verdicts = await doctor(paths)
      console.log(verdictLines(verdicts).join('\n'))
      if (verdicts.some((v) => v.level === 'fail')) process.exitCode = 1
      break
    }
    case 'up':
      for (const [daemon, answer] of await bringAllUp(daemonsNamed(paths, towerPort(readConfig(paths.config)), process.argv.slice(3)))) console.log(`${daemon.name}: ${answer} · ${daemon.where} · log ${daemon.log}`)
      break
    case 'down':
      for (const [daemon, result] of await bringAllDown(daemonsNamed(paths, towerPort(readConfig(paths.config)), process.argv.slice(3)))) {
        if (result instanceof Error) {
          console.error(result.message)
          process.exitCode = 1
        } else console.log(`${daemon.name}: ${result}`)
      }
      break
    case 'update':
      await update(paths)
      break
    case 'spawn': {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { cwd: { type: 'string' }, model: { type: 'string' }, effort: { type: 'string' } },
      })
      const config = readConfigFile()
      const project = config.projects[id]
      if (!project) throw new CliError(`No project "${id ?? ''}". Projects: ${Object.keys(config.projects).join(', ')}`, 'Usage: tower spawn <project> [--cwd <dir>] [--model <m>] [--effort <e>] [-- <prompt...>]')
      const prompt = positionals.join(' ') || undefined
      const cwd = values.cwd ?? project.hub
      const session = newSessionId()
      print(await request(spawnRequest(session, callsignsOf(config)(session), id, cwd, { ...values, prompt }, configuredUser(config), await briefFor(project, worktreesConfig(config, id).links, cwd), projectCollectionsPath(paths, id), projectPlugins(config, id))))
      break
    }
    case 'resume': {
      const log = readSessionLog(id)
      const conversation = latestSaved(conversationsOf(log))
      if (!conversation) throw new CliError(`Session "${id}" never started a conversation: nothing to resume`)
      const sessions = readSessions()
      const source = sessions.find((s) => s.header.id === id)!
      const heir = newSessionId()
      const config = readConfigFile()
      const brief = await briefFor(config.projects[log.header.project], worktreesConfig(config, log.header.project).links, log.header.cwd)
      print(await request(resumeRequest(log.header, conversation.id, heir, resumeName(source, conversation.id, heir, sessions, callsignsOf(config)), configuredUser(config), brief, projectCollectionsPath(paths, log.header.project), projectPlugins(config, log.header.project))))
      break
    }
    case 'submit':
      print(await fromHost(submitText(paths, id, rest.join(' '))))
      break
    case 'kill':
      print(await request({ t: 'kill', id }))
      break
    case 'live':
      print(await request({ t: 'live' }))
      break
    case 'ls': {
      const live = await liveIds(paths)
      const running = await resourcesOf()
      for (const { header, facts } of readSessions()) {
        const { status, since } = withLiveness(facts.state, header.id, live)
        const entered = header.startedAt + since * 1000
        const own = running.filter((r) => r.session === header.id)
        console.log([header.id, header.project.padEnd(8), status.padEnd(11), `for ${ago(Date.now() - entered)}`.padEnd(10), summary(own)].join('  ').trimEnd())
      }
      break
    }
    case 'ps':
      for (const r of await resourcesOf()) {
        const ports = r.ports.map((port) => `:${port}`).join(' ')
        console.log([r.session, String(r.pid).padStart(6), (r.orphan ? 'orphan' : '').padEnd(6), ports.padEnd(12), r.command].join('  '))
      }
      break
    case 'reap': {
      const live = await liveIds(paths)
      const doomed = (await resourcesOf()).filter((r) => (id === undefined ? !live.has(r.session) : r.session === id))
      for (const r of reap(doomed)) console.log([r.session, String(r.pid).padStart(6), r.command].join('  '))
      break
    }
    case 'attach':
      sessionLogFile(id)
      await fromHost(attach(paths, id))
      break
    case 'screen': {
      const log = readSessionLog(id)
      const until = rest[0] === undefined ? Infinity : Number(rest[0])
      console.log((await screenAt(log, until)).join('\n'))
      break
    }
    case 'config': {
      if (id !== 'check') throw new CliError('Usage: tower config check', 'it checks the config as the tower reads it, and changes nothing')
      if (!existsSync(paths.config)) throw new CliError(`No config at ${paths.config}`, 'tower init [hub] [repos...]: a first project from a directory')
      const problems = checkConfigFile(paths.config)
      const fails = problems.filter((p) => p.level === 'fail').length
      console.log([`${paths.config}: ${fails ? `${fails} problem${fails === 1 ? '' : 's'} the tower can't take` : `the tower takes it, ${checkedSummary(readConfigFile())}`}${problems.length > fails ? `, ${problems.length - fails} key${problems.length - fails === 1 ? '' : 's'} it ignores` : ''}.`, ...problemLines(problems), `Every key is documented in ${CONFIG_DOCS}. The tower reads the file again on every change, so an edit needs no restart, but for port.`].join('\n'))
      if (fails) process.exitCode = 1
      break
    }
    default:
      await import('./directory.ts')
  }
}

await main().catch(reported)
