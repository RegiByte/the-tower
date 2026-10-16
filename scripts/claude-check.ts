/**
 * Claude check: runbook `new-claude-release` as a tool. It records every scenario of `scripts/claude-check.scenarios.ts`
 * on the installed Claude, in a throwaway system of its own, and says whether the release reads to the tower as the
 * tested ones do: what Claude posts against the baseline's shapes (`test/claude-shapes.json`), each recording's
 * statuses against its fixture's, the surfaces no fixture covers, and the release's changelog with the entries about
 * those surfaces marked.
 *
 *   npm run tool:claude-check -- run [--only <scenario,...>]   start a throwaway system, record, stop it, report;
 *                                                              about 30 Haiku sessions, 5 at a time, half an hour
 *   npm run tool:claude-check -- report                        the report of the last run again
 *   npm run tool:claude-check -- accept                        the last run's shapes become the baseline: on the
 *                                                              baseline's release they are merged with its own (a key
 *                                                              some take missed is optional), on a new one they
 *                                                              replace it; an `--only` run's touch only its recordings
 *
 *   --root <dir>   the throwaway system's root (default /tmp/tower-claude-check, under ~80 bytes: sockets cap it);
 *                  `run` deletes and makes it again, and refuses a directory it did not make
 *   --port <n>     its tower's port (default 4396)
 *
 * `report` and `run` exit 0 when the release reads clean: no scenario failed, no shape changed, every recording
 * replays as its fixture, and every surface check holds. Raising `CLAUDE_TESTED.highest` (`src/shared/claude.ts`) is
 * then mechanical. Exit 1: the report names each difference by scenario and event, to read. The report is printed
 * and written to `<root>/report.md`; the recordings stay in `<root>/recordings/`, never in the repo. Replacing a
 * fixture and reading the changelog stay human.
 *
 * Each step of a scenario waits on what the session's log says, read from the file: never on a sleep or the board.
 * Scenario directories are named for the run (`<root>/<stamp>/<scenario>`), as Claude remembers trusting a path.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, closeSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { factsAfter, initialFacts, type Facts } from '../src/bridge/facts.ts'
import { parseLog } from '../src/bridge/log.ts'
import { initialConfig } from '../src/init.ts'
import { bringAllDown, bringAllUp, daemons } from '../src/machine.ts'
import { readUsage } from '../src/probes.ts'
import { claudeRange, CLAUDE_TESTED } from '../src/shared/claude.ts'
import type { Config, LogEvent, SessionHeader } from '../src/shared/model.ts'
import { sessionLogPath, systemPaths } from '../src/shared/paths.ts'
import { renderReport, type Run, type ScenarioRun } from './claude-check.report.ts'
import { mergedShapes, shapesOf, type Baseline } from './claude-check.read.ts'
import { LAUNCHES, SCENARIOS, type Act, type Launch, type On, type Scenario, type Step } from './claude-check.scenarios.ts'

const REPO = path.join(import.meta.dirname, '..')
const BASELINE = path.join(REPO, 'test', 'claude-shapes.json')
const AT_ONCE = 5
const STEP_TIMEOUT_MS = 180_000
const MARKER = '.claude-check'

const { positionals: [command], values } = parseArgs({
  allowPositionals: true,
  options: { only: { type: 'string' }, root: { type: 'string', default: '/tmp/tower-claude-check' }, port: { type: 'string', default: '4396' } },
})
const ROOT = path.resolve(values.root)
const CONFIG = path.join(ROOT, 'config.json')
const RUN = path.join(ROOT, 'run.json')
const RECORDINGS = path.join(ROOT, 'recordings')
const PORT = Number(values.port)
const TOWER = `http://127.0.0.1:${PORT}`
const paths = systemPaths(CONFIG)

process.env.TOWER_CONFIG = CONFIG
/** Claude appends the mod's bin to PATH, behind any global `tower`: the sessions run this checkout's first. */
process.env.PATH = `${path.join(REPO, 'src', 'mod', 'bin')}${path.delimiter}${process.env.PATH}`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...line: unknown[]) => console.error(new Date().toISOString().slice(11, 19), ...line)
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file: string, value: unknown) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

const installedClaude = () => execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim().split(/\s/)[0]

/** A root the tool made carries its marker: any other directory is refused. A run that stopped short is stopped first. */
async function freshRoot() {
  if (existsSync(ROOT)) {
    if (!existsSync(path.join(ROOT, MARKER))) throw new Error(`${ROOT} exists and was not made by claude-check: pick another --root`)
    if (existsSync(CONFIG)) await bringAllDown(daemons(paths, readJson<Config>(CONFIG).port!))
    rmSync(ROOT, { recursive: true })
  }
  mkdirSync(RECORDINGS, { recursive: true })
  writeFileSync(path.join(ROOT, MARKER), '')
}

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })

function seedDir(dir: string, seed: Record<string, string>) {
  for (const [file, text] of Object.entries(seed)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  execFileSync('git', ['init', '-q', dir])
  git(dir, 'add', '.')
  git(dir, '-c', 'user.name=claude-check', '-c', 'user.email=claude-check@localhost', 'commit', '-q', '--allow-empty', '-m', 'seed')
}

const expand = (text: string) => text.replaceAll('{root}', ROOT)

const argvOf = (launch: Launch) => ['claude', '--permission-mode', 'default', '--allowedTools', ...launch.tools, ...(launch.argv ?? []).map(expand)]
const envOf = (launch: Launch) => Object.fromEntries(Object.entries(launch.env ?? {}).map(([k, v]) => [k, expand(v)]))

/** This process is the config's only writer: the tower reads it again on every request. */
const writeConfig = (config: Config) => writeJson(CONFIG, config)

const configFor = (hub: string, dirs: string[], launch: Launch): Config => ({
  ...initialConfig(hub, [], undefined),
  argv: argvOf(launch),
  env: envOf(launch),
  port: PORT,
  projects: { check: { name: 'check', color: '#e0a040', hub, repos: dirs } },
  probes: { quota: { off: true } },
})

async function post<T>(verb: string, body: unknown): Promise<T> {
  const res = await fetch(`${TOWER}/${verb}`, { method: 'POST', headers: { origin: TOWER, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`POST /${verb}: ${res.status} ${text}`)
  return JSON.parse(text)
}

/**
 * A session's log as it grows, read from where the last read stopped: its events, and the statuses its facts enter,
 * each at the index of the event that moved it.
 */
type Tail = { file: string; offset: number; partial: string; header?: SessionHeader; events: LogEvent[]; facts?: Facts; entered: { at: number; status: string; blocked?: string }[] }

const tailOf = (file: string): Tail => ({ file, offset: 0, partial: '', events: [], entered: [] })

function readTail(tail: Tail) {
  if (!existsSync(tail.file)) return
  const size = statSync(tail.file).size
  if (size === tail.offset) return
  const fd = openSync(tail.file, 'r')
  const buffer = Buffer.alloc(size - tail.offset)
  readSync(fd, buffer, 0, buffer.length, tail.offset)
  closeSync(fd)
  tail.offset = size
  const lines = (tail.partial + buffer.toString('utf8')).split('\n')
  tail.partial = lines.pop()!
  for (const line of lines) {
    if (!tail.header) {
      tail.header = JSON.parse(line)
      tail.facts = initialFacts(tail.header!)
      continue
    }
    const event: LogEvent = JSON.parse(line)
    const before = tail.facts!.state
    tail.facts = factsAfter(tail.header!.startedAt)(tail.facts!, event)
    tail.events.push(event)
    const after = tail.facts.state
    if (after.status !== before.status || after.blocked !== before.blocked) tail.entered.push({ at: tail.events.length - 1, status: after.status, ...(after.blocked && { blocked: after.blocked }) })
  }
}

const matches = (want: string | RegExp, value: unknown) => (typeof want === 'string' ? value === want : typeof value === 'string' && want.test(value))

/** The index of the event `on` waits for, at or after `from`, if it has come. */
const found = (tail: Tail, on: On, from: number): number | undefined => {
  const count = on.count ?? 1
  if ('status' in on) return tail.entered.filter((e) => e.at >= from && e.status === on.status)[count - 1]?.at
  const hits = tail.events.flatMap((e, i) => {
    if (i < from || e[1] !== 'h') return []
    const hook = e[2] as Record<string, unknown>
    if (hook.hook_event_name !== on.event || (!on.agents && hook.agentId !== undefined)) return []
    return Object.entries(on.where ?? {}).every(([k, want]) => matches(want, hook[k])) ? [i] : []
  })
  return hits[count - 1]
}

const describe = (on: On) => ('status' in on ? `status ${on.status}` : `${on.event}${on.where ? ` ${JSON.stringify(Object.fromEntries(Object.entries(on.where).map(([k, v]) => [k, String(v).slice(0, 40)])))}` : ''}`) + (on.count ? ` ×${on.count}` : '')

async function waitFor(tail: Tail, on: On, from: number): Promise<number> {
  const deadline = Date.now() + (on.within ?? STEP_TIMEOUT_MS)
  while (Date.now() < deadline) {
    readTail(tail)
    const at = found(tail, on, from)
    if (at !== undefined) return at
    if (tail.events.some((e) => e[1] === 'x')) break
    await sleep(200)
  }
  const now = tail.facts?.state
  throw new Error(`no ${describe(on)} within ${(on.within ?? STEP_TIMEOUT_MS) / 1000} s (status ${now?.status}${now?.blocked ? ` ${now.blocked}` : ''})`)
}

/** A session a scenario started: its log, and where its next `on` starts reading. */
type Live = { name: string; id: string; tail: Tail; cursor: number; exited: boolean }

/** The callsign Claude registers the session under, from its argv. */
const callsignOf = (header: SessionHeader) => header.argv[header.argv.indexOf('--name') + 1]

/** Claude's registration of a running session, by the name the tower gave it. */
function registration(name: string): { pid: unknown; name: unknown } | undefined {
  const dir = path.join(os.homedir(), '.claude', 'sessions')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        return [readJson<{ pid: unknown; name: unknown }>(path.join(dir, file))]
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw err
      }
    })
    .find((entry) => entry.name === name)
}

/** Claude draws a screen in a few writes and redraws it once more: keys sent before then are lost. */
async function quiet(tail: Tail, ms = 1000) {
  let size = -1
  while (size !== tail.offset) {
    size = tail.offset
    await sleep(ms)
    readTail(tail)
  }
}

async function started(live: Live, blocked: string) {
  const at = await waitFor(live.tail, { status: 'blocked' }, 0)
  const screen = live.tail.entered.find((e) => e.at === at)?.blocked
  if (screen !== blocked) throw new Error(`${live.name} showed the ${screen} screen, not the ${blocked} one`)
  if (blocked === 'trust') {
    await quiet(live.tail)
    await post('keys', { id: live.id, data: '\x1b[B' })
    await sleep(500)
    await post('keys', { id: live.id, data: '\r' })
  }
  live.cursor = live.tail.events.length
}

async function kill(live: Live, result: ScenarioRun) {
  readTail(live.tail)
  if (live.tail.events.some((e) => e[1] === 'h' && e[2].hook_event_name === 'SessionStart')) {
    const entry = registration(callsignOf(live.tail.header!))
    result.registry[live.name] = entry ? typeof entry.pid === 'number' && typeof entry.name === 'string' : false
  }
  await post('kill', { id: live.id })
  live.exited = true
  const deadline = Date.now() + 30_000
  while (!live.tail.events.some((e) => e[1] === 'x')) {
    if (Date.now() > deadline) throw new Error(`${live.name} did not exit within 30 s of its kill`)
    await sleep(200)
    readTail(live.tail)
  }
}

async function act(scenario: Scenario, dir: string, sessions: Map<string, Live>, live: Live | undefined, what: Act, result: ScenarioRun) {
  if ('spawn' in what) {
    const { id } = await post<{ id: string }>('spawn', { project: 'check', cwd: dir, model: what.model ?? 'haiku', ...(what.prompt && { prompt: what.prompt }), ...(what.callsign && { callsign: what.callsign }) })
    const spawned: Live = { name: what.spawn, id, tail: tailOf(sessionLogPath(paths, id)), cursor: 0, exited: false }
    const first = sessions.size === 0
    sessions.set(what.spawn, spawned)
    log(scenario.name, 'spawned', what.spawn, id)
    if (what.blocked || first) return started(spawned, what.blocked ?? 'trust')
    return
  }
  if ('resume' in what) {
    const from = sessions.get(what.from)!
    const start = from.tail.events.find((e) => e[1] === 'h' && e[2].hook_event_name === 'SessionStart')
    if (!start) throw new Error(`${what.from} has no conversation to resume`)
    const { id } = await post<{ id: string }>('resume', { id: from.id, conversation: (start[2] as { session_id: string }).session_id })
    sessions.set(what.resume, { name: what.resume, id, tail: tailOf(sessionLogPath(paths, id)), cursor: 0, exited: false })
    result.resumed.push({ id, from: from.id })
    log(scenario.name, 'resumed', what.from, 'as', what.resume, id)
    return
  }
  if ('write' in what) return writeFileSync(path.join(dir, what.write), what.text)
  if (!live) throw new Error('no session to act in')
  readTail(live.tail)
  live.cursor = live.tail.events.length
  if ('keys' in what) return post('keys', { id: live.id, data: what.keys })
  if ('submit' in what) return post('submit', { id: live.id, text: what.submit })
  return kill(live, result)
}

async function runScenario(scenario: Scenario, dir: string): Promise<ScenarioRun> {
  const result: ScenarioRun = { name: scenario.name, recordings: [], registry: {}, resumed: [] }
  const sessions = new Map<string, Live>()
  const sessionOf = (step: Step) => (step.in ? sessions.get(step.in) : sessions.values().next().value)
  try {
    for (const [i, step] of scenario.steps.entries()) {
      const live = sessionOf(step)
      try {
        if (step.on) live!.cursor = (await waitFor(live!.tail, step.on, live!.cursor)) + 1
        if (step.pause) await sleep(step.pause)
        if (step.do) await act(scenario, dir, sessions, live, step.do, result)
      } catch (err) {
        throw new Error(`step ${i + 1}${step.in ? ` in ${step.in}` : ''}: ${(err as Error).message}`)
      }
    }
  } catch (err) {
    result.error = (err as Error).message
    log(scenario.name, 'FAILED', result.error)
  }
  for (const live of sessions.values()) {
    if (!live.exited) await kill(live, result).catch((err: Error) => (result.error ??= err.message))
    const file = path.join(RECORDINGS, `${live.name}.jsonl`)
    copyFileSync(live.tail.file, file)
    result.recordings.push({ name: live.name, id: live.id })
  }
  for (const { id, from } of result.resumed) result.chain = (await fetch(`${TOWER}/conversations/${id}`).then((r) => r.text())).includes(from)
  log(scenario.name, result.error ? 'recorded, failed' : 'recorded')
  return result
}

/** Runs `jobs` at most `limit` at a time, a second apart as they start. */
async function pooled<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = []
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++
      await sleep(1000)
      results[i] = await jobs[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker))
  return results
}

async function run() {
  const only = values.only?.split(',')
  const picked = only ? SCENARIOS.filter((s) => only.includes(s.name)) : SCENARIOS
  const unknown = only?.filter((name) => !SCENARIOS.some((s) => s.name === name))
  if (unknown?.length) throw new Error(`no scenario ${unknown.join(', ')}: ${SCENARIOS.map((s) => s.name).join(', ')}`)
  const claude = installedClaude()
  await freshRoot()
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const hub = path.join(ROOT, 'hub')
  const dirOf = (s: Scenario) => path.join(ROOT, stamp, s.name)
  seedDir(hub, { 'README.md': '# check\n' })
  for (const s of picked) seedDir(dirOf(s), s.seed)
  mkdirSync(path.join(ROOT, 'signed-out'))
  const dirs = picked.map(dirOf)
  writeConfig(configFor(hub, dirs, LAUNCHES.plain))
  const startedAt = Date.now()
  log(`Claude ${claude}, ${picked.length} scenarios in ${ROOT}`)
  for (const [daemon, answer] of await bringAllUp(daemons(paths, PORT))) log(daemon.name, answer)
  const scenarios: ScenarioRun[] = []
  try {
    for (const launch of Object.values(LAUNCHES)) {
      const group = picked.filter((s) => s.launch === launch)
      if (!group.length) continue
      writeConfig(configFor(hub, dirs, launch))
      log(`launch ${launch.name}: ${group.map((s) => s.name).join(', ')}`)
      scenarios.push(...(await pooled(group.map((s) => () => runScenario(s, dirOf(s))), AT_ONCE)))
    }
  } finally {
    for (const [daemon, answer] of await bringAllDown(daemons(paths, PORT))) log(daemon.name, answer instanceof Error ? answer.message : answer)
  }
  writeConfig(configFor(hub, dirs, LAUNCHES.plain))
  const usage = await readUsage(readJson<Config>(CONFIG))
  const result: Run = { claude, startedAt, minutes: Math.round((Date.now() - startedAt) / 60_000), scenarios, usage }
  writeJson(RUN, result)
  return report()
}

function report() {
  if (!existsSync(RUN)) throw new Error(`no run in ${ROOT}: npm run tool:claude-check -- run`)
  const result = readJson<Run>(RUN)
  const recordings = Object.fromEntries(result.scenarios.flatMap((s) => s.recordings).map(({ name }) => [name, parseLog(readFileSync(path.join(RECORDINGS, `${name}.jsonl`), 'utf8'))]))
  const changelog = path.join(os.homedir(), '.claude', 'cache', 'changelog.md')
  const debugLog = path.join(ROOT, 'debug.log')
  const { markdown, clean } = renderReport({
    run: result,
    recordings,
    baseline: readJson<Baseline>(BASELINE),
    fixture: (name) => parseLog(readFileSync(path.join(REPO, 'test', 'fixtures', `${name}.jsonl`), 'utf8')),
    usageFixture: readFileSync(path.join(REPO, 'test', 'fixtures', 'probe-usage.out'), 'utf8'),
    changelog: existsSync(changelog) ? readFileSync(changelog, 'utf8') : undefined,
    debugLog: existsSync(debugLog) ? readFileSync(debugLog, 'utf8') : undefined,
    range: { ...CLAUDE_TESTED, reads: claudeRange(result.claude) },
  })
  writeFileSync(path.join(ROOT, 'report.md'), markdown)
  console.log(markdown)
  process.exitCode = clean ? 0 : 1
}

function accept() {
  const result = readJson<Run>(RUN)
  const baseline = readJson<Baseline>(BASELINE)
  const taken = result.scenarios.filter((s) => !s.error).flatMap((s) => s.recordings)
  const shapes = Object.fromEntries(taken.map(({ name }) => [name, shapesOf(parseLog(readFileSync(path.join(RECORDINGS, `${name}.jsonl`), 'utf8')))]))
  const sameRelease = baseline.claude === result.claude
  const recordings = { ...baseline.recordings, ...Object.fromEntries(Object.entries(shapes).map(([name, s]) => [name, sameRelease && baseline.recordings[name] ? mergedShapes(baseline.recordings[name], s) : s])) }
  const sorted: Baseline = { claude: result.claude, recordings: Object.fromEntries(Object.entries(recordings).sort(([a], [b]) => a.localeCompare(b))) }
  /** An event's keys on its own line: the baseline diffs one event per line. */
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2).replace(/\[\n\s+("[^\]]*?)\n\s+\]/g, (_, keys: string) => `[${keys.replace(/,\n\s+/g, ', ')}]`)}\n`)
  console.log(`${BASELINE}: ${taken.length} recordings taken on Claude ${result.claude}`)
}

if (command === 'run') await run()
else if (command === 'report') report()
else if (command === 'accept') accept()
else throw new Error('usage: npm run tool:claude-check -- run [--only <scenario,...>] | report | accept   [--root <dir>] [--port <n>]')
