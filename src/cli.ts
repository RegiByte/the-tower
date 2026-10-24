/**
 * `tower`, the one command for the user and the workers. Its verbs are a table (`src/cli-verbs.ts`); the user's,
 * read from the system root and sent to the daemons, run here, the workers' in `src/directory.ts`.
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { openApp } from './app.ts'
import { attach } from './attach.ts'
import { CliError, reported } from './cli-error.ts'
import { helpLines, unknownLine, usageLine, verbNamed, type Run, type VerbName, type VerbOf } from './cli-verbs.ts'
import { WORKER_RUNS } from './directory.ts'
import { checkConfigFile, CONFIG_DOCS, problemLines } from './config-check.ts'
import { doctor, verdictLines } from './doctor.ts'
import { init } from './init.ts'
import { update } from './update.ts'
import { foldLog } from './checkpoints.ts'
import { bringAllDown, bringAllUp, daemonsNamed, isNoHost, liveIds, hostRequest, reap, resourcesOf, submitText } from './machine.ts'
import { runningNamed } from './bridge/chains.ts'
import { conversationsOf, latestSaved } from './bridge/conversation.ts'
import { KILLED_BY, PROMPTED_BY, type Session } from './bridge/facts.ts'
import type { Resource } from './bridge/resources.ts'
import { lastFrame, screenAt } from './bridge/screen.ts'
import { withLiveness } from './bridge/status.ts'
import { callsignsOf, towerPort, towerUrl, type Config, type SessionLog } from './shared/model.ts'
import { callerHeaders } from './shared/api.ts'
import { readConfig } from './system.ts'
import { span } from './shared/cards.ts'
import { CARRY_ON } from './shared/launch.ts'
import { configPath, systemPaths } from './shared/paths.ts'
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
const sessionLogFile = (verb: VerbName, id: string | undefined): string => {
  if (!id) throw new CliError(`Usage: tower ${verb} <id>`, '`tower ls` lists every session by its id')
  const file = logFileOf(paths, id)
  if (!existsSync(file)) throw new CliError(`No session "${id}" in ${paths.sessions}`, '`tower ls` lists every session by its id')
  return file
}

const readSessionLog = (verb: VerbName, id: string | undefined): SessionLog => readLog(sessionLogFile(verb, id), everyEvent).log

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

const print = (reply: FromHost) => {
  if (reply.t === 'error') throw new CliError(reply.message)
  if (reply.t === 'spawned') console.log(reply.id)
  if (reply.t === 'live') console.log(reply.ids.join('\n'))
}

/** A verb asked of the tower, which builds every session's launch and holds its callsigns and conversations. */
const towerCommand = async (verb: 'spawn' | 'resume', body: unknown): Promise<FromHost> => {
  const tower = towerUrl(readConfig(paths.config))
  const res = await fetch(`${tower}/${verb}`, { method: 'POST', headers: { origin: tower, 'content-type': 'application/json', ...callerHeaders(process.env.TOWER_SESSION_ID) }, body: JSON.stringify(body) }).catch((err) => {
    if (err.cause?.code === 'ECONNREFUSED') throw new CliError(`The tower is not running: no tower answers at ${tower}`, 'tower up')
    throw err
  })
  return res.json()
}


const USER_RUNS: Record<VerbOf<'user'>, Run> = {
  init: async (args) => {
    const [hub = process.cwd(), ...repos] = args
    const config = await init(paths.config, hub, repos)
    console.log(`Wrote ${paths.config}:\n${JSON.stringify(config, null, 2)}\n\nNext: tower doctor, then tower up. The README shows the rest of the config.\nThen ask any worker: "give me a tour of the tower".`)
  },
  doctor: async ([all]) => {
    if (all !== undefined && all !== '--all') throw new CliError(usageLine('doctor'))
    const verdicts = await doctor(paths, all === '--all')
    console.log(verdictLines(verdicts).join('\n'))
    if (verdicts.some((v) => v.level === 'fail')) process.exitCode = 1
  },
  up: async (args) => {
    for (const [daemon, answer] of await bringAllUp(daemonsNamed(paths, towerPort(readConfig(paths.config)), args))) console.log(`${daemon.name}: ${answer} · ${daemon.where} · log ${daemon.log}`)
  },
  down: async (args) => {
    for (const [daemon, result] of await bringAllDown(daemonsNamed(paths, towerPort(readConfig(paths.config)), args))) {
      if (result instanceof Error) {
        console.error(result.message)
        process.exitCode = 1
      } else console.log(`${daemon.name}: ${result}`)
    }
  },
  update: () => update(paths),
  spawn: async ([project, ...rest]) => {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { cwd: { type: 'string' }, callsign: { type: 'string' }, model: { type: 'string' }, effort: { type: 'string' } },
    })
    if (!project) throw new CliError(usageLine('spawn'))
    const prompt = positionals.join(' ') || undefined
    print(await towerCommand('spawn', { project, ...values, prompt }))
  },
  resume: async ([id, ...rest]) => {
    const { values } = parseArgs({ args: rest, options: { 'carry-on': { type: 'boolean' } } })
    const prompt = values['carry-on'] ? CARRY_ON : undefined
    const log = readSessionLog('resume', id)
    const conversation = latestSaved(conversationsOf(log))
    if (!conversation) throw new CliError(`Session "${id}" never started a conversation: nothing to resume`)
    print(await towerCommand('resume', { id: log.header.id, conversation: conversation.id, prompt }))
  },
  submit: async ([id, ...rest]) => {
    const by = process.env.TOWER_SESSION_ID
    if (by) print(await request({ t: 'fact', id, fact: { hook_event_name: PROMPTED_BY, by } }))
    print(await fromHost(submitText(paths, id, rest.join(' '))))
  },
  kill: async ([id]) => {
    const by = process.env.TOWER_SESSION_ID
    const live = await liveIds(paths)
    const target = live.has(id) ? id : (runningNamed(readSessions(), live, id ?? '', callsignsOf(readConfig(paths.config)))?.header.id ?? id)
    if (by && live.has(target)) print(await request({ t: 'fact', id: target, fact: { hook_event_name: KILLED_BY, by } }))
    print(await request({ t: 'kill', id: target }))
  },
  live: async () => print(await request({ t: 'live' })),
  ls: async () => {
    const live = await liveIds(paths)
    const running = await resourcesOf()
    for (const { header, facts } of readSessions()) {
      const { status, since } = withLiveness(facts.state, header.id, live)
      const entered = header.startedAt + since * 1000
      const own = running.filter((r) => r.session === header.id)
      const word = facts.broken ? 'broken' : status
      const why = facts.broken && `its log breaks at ${facts.broken.at}s: ${facts.broken.message}`
      console.log([header.id, header.project.padEnd(8), word.padEnd(11), `for ${span(Date.now() - entered)}`.padEnd(11), summary(own), why].filter(Boolean).join('  ').trimEnd())
    }
  },
  ps: async () => {
    for (const r of await resourcesOf()) {
      const ports = r.ports.map((port) => `:${port}`).join(' ')
      console.log([r.session, String(r.pid).padStart(6), (r.orphan ? 'orphan' : '').padEnd(6), ports.padEnd(12), r.command].join('  '))
    }
  },
  reap: async ([id]) => {
    if (id !== undefined) sessionLogFile('reap', id)
    const live = await liveIds(paths)
    // The machine's processes carry the sessions of every system root on it: only this root's are its to end.
    const ours = (r: Resource) => existsSync(logFileOf(paths, r.session))
    const doomed = (await resourcesOf()).filter((r) => (id === undefined ? ours(r) && !live.has(r.session) : r.session === id))
    for (const r of reap(doomed)) console.log([r.session, String(r.pid).padStart(6), r.command].join('  '))
  },
  attach: async ([id]) => {
    sessionLogFile('attach', id)
    await fromHost(attach(paths, id))
  },
  screen: async ([id, seconds]) => {
    const log = readSessionLog('screen', id)
    const rows = seconds === undefined ? await screenAt(lastFrame(log)) : await screenAt(log, Number(seconds))
    console.log(rows.join('\n'))
  },
  app: async () => console.log(await openApp(paths)),
  config: async ([sub]) => {
    if (sub !== 'check') throw new CliError(usageLine('config'), 'it checks the config as the tower reads it, and changes nothing')
    if (!existsSync(paths.config)) throw new CliError(`No config at ${paths.config}`, 'tower init [hub] [repos...]: a first project from a directory')
    const problems = checkConfigFile(paths.config)
    const fails = problems.filter((p) => p.level === 'fail').length
    console.log([`${paths.config}: ${fails ? `${fails} problem${fails === 1 ? '' : 's'} the tower can't take` : `the tower takes it, ${checkedSummary(readConfig(paths.config))}`}${problems.length > fails ? `, ${problems.length - fails} key${problems.length - fails === 1 ? '' : 's'} it ignores` : ''}.`, ...problemLines(problems), `Every key is documented in ${CONFIG_DOCS}. The tower reads the file again on every change, so an edit needs no restart, but for port.`].join('\n'))
    if (fails) process.exitCode = 1
  },
}

const RUNS: Record<VerbName, Run> = { ...USER_RUNS, ...WORKER_RUNS }

const isHelp = (word: string | undefined) => word === '--help' || word === '-h'

const main = async ([name, ...args]: string[]): Promise<void> => {
  if (name === undefined || isHelp(name)) {
    console.log(helpLines().join('\n'))
    return
  }
  const verb = verbNamed(name)
  if (!verb) throw new CliError(unknownLine(name), '`tower --help` says what each takes and does; the tower:handbook skill says what each is for')
  if (isHelp(args[0])) {
    console.log(usageLine(verb))
    return
  }
  await RUNS[verb](args)
}

/** A reader that closed its end early (`tower read <tag> | head -1`) has all it asked for. */
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') throw err
  process.exit(0)
})

await main(process.argv.slice(2)).catch(reported)
