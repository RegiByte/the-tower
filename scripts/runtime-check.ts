/**
 * Runtime check: runbooks `new-claude-release` and `new-opencode-release` as a tool. It records every scenario of a
 * runtime (`runtime-check.<runtime>.scenarios.ts`) on the installed release, in a throwaway system of its own, and
 * says whether the release reads to the tower as the tested ones do: what the runtime posts against the baseline's
 * shapes (`test/<runtime>-shapes.json`), each recording's statuses against its fixture's, and the surfaces no fixture
 * covers, which are the runtime's own (`runtime-check.<runtime>.ts`).
 *
 *   npm run tool:runtime-check -- <claude|opencode> <command>    `tool:claude-check` and `tool:opencode-check` name the
 *                                                              runtime for you: `npm run tool:opencode-check -- due`
 *   run [--only <scenario,...>] [--retries <n>]                start a throwaway system, record, stop it, report.
 *                                                              Claude: about 30 Haiku sessions, 5 at a time, ~6
 *                                                              minutes; opencode: 12 sessions on its model and 4 on a
 *                                                              local fake provider, ~5 minutes. A scenario that
 *                                                              stopped short, replays differently or misses a check of
 *                                                              its own sessions is recorded again, up to `--retries`
 *                                                              times (default 1), before the report, which reads its
 *                                                              last attempt and says it was retried
 *   report                                                     the report of the last run again
 *   due                                                        exit 0 when the installed release reads above the
 *                                                              tested range and no pull request titled
 *                                                              `<word> <release>` (`Claude 2.1.330`, `opencode 2.3.0`)
 *                                                              is open or merged, 1 when not, 2 when it can't tell:
 *                                                              the check line of a policy that runs the check on each
 *                                                              new release
 *   accept                                                     the last run's shapes become the baseline: on the
 *                                                              baseline's release they are merged with its own (a key
 *                                                              some take missed is optional), on a new one they
 *                                                              replace it; an `--only` run's touch only its recordings
 *
 *   --root <dir>   the throwaway system's root (Claude /tmp/tower-claude-check, opencode /tmp/tower-opencode-check,
 *                  under ~80 bytes: sockets cap it); `run` empties it but for `scenarios/`, and refuses a directory
 *                  it did not make
 *   --port <n>     its tower's port (Claude 4396, opencode 4397)
 *
 * `report` and `run` exit 0 when the release reads clean: no scenario failed, no shape changed, every recording
 * replays as its fixture, and every surface check holds. Raising the runtime's tested range is then mechanical. Exit
 * 1: the report names each difference by scenario and event, to read. The report is printed and written to
 * `<root>/report.md`; the recordings stay in `<root>/recordings/`, never in the repo. Replacing a fixture and reading
 * the changelog stay human.
 *
 * Each step of a scenario waits on what the session's log says, read from the file: never on a sleep or the board.
 * Each scenario runs in `<root>/scenarios/<scenario>`, kept across runs and seeded again on each, so Claude's folder
 * trust is granted once per directory and `~/.claude.json` doesn't grow with every run. A `fresh` scenario's directory
 * is named for the run (`<root>/fresh/<stamp>/<scenario>`), as Claude remembers trusting a path.
 */
import { execFileSync } from 'node:child_process'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { factsAfter, initialFacts } from '../src/bridge/facts.ts'
import { parseLog } from '../src/bridge/log.ts'
import { initialConfig } from '../src/init.ts'
import { bringAllDown, bringAllUp, daemons } from '../src/machine.ts'
import { releaseRange } from '../src/shared/claude.ts'
import type { Config, LogEvent } from '../src/shared/model.ts'
import { sessionLogPath, systemPaths } from '../src/shared/paths.ts'
import { CLAUDE } from './runtime-check.claude.ts'
import { OPENCODE } from './runtime-check.opencode.ts'
import { mergedShapes, shapesOf, type Baseline } from './runtime-check.read.ts'
import { scenarioDifferences } from './runtime-check.report.ts'
import type { Act, Launch, Live, On, Run, Runtime, Scenario, ScenarioRun, Step, Tail } from './runtime-check.scenario.ts'

const RUNTIMES: Record<string, unknown> = { claude: CLAUDE, opencode: OPENCODE }

const REPO = path.join(import.meta.dirname, '..')
const AT_ONCE = 5
const STEP_TIMEOUT_MS = 180_000
const USAGE = 'usage: npm run tool:runtime-check -- <claude|opencode> run [--only <scenario,...>] [--retries <n>] | report | due | accept   [--root <dir>] [--port <n>]'

const { positionals: [runtimeId, command], values } = parseArgs({
  allowPositionals: true,
  options: { only: { type: 'string' }, retries: { type: 'string', default: '1' }, root: { type: 'string' }, port: { type: 'string' } },
})
if (!RUNTIMES[runtimeId]) throw new Error(USAGE)
const RUNTIME = RUNTIMES[runtimeId] as Runtime<Launch>
const ROOT = path.resolve(values.root ?? RUNTIME.root)
const CONFIG = path.join(ROOT, 'config.json')
const RUN = path.join(ROOT, 'run.json')
const RECORDINGS = path.join(ROOT, 'recordings')
const KEPT = 'scenarios'
const MARKER = `.${RUNTIME.id}-check`
const PORT = Number(values.port ?? RUNTIME.port)
const RETRIES = Number(values.retries)
const TOWER = `http://127.0.0.1:${PORT}`
const paths = systemPaths(CONFIG)

process.env.TOWER_CONFIG = CONFIG
/** A runtime appends the mod's bin to PATH, behind any global `tower`: the sessions run this checkout's first. */
process.env.PATH = `${path.join(REPO, 'src', 'mod', 'bin')}${path.delimiter}${process.env.PATH}`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...line: unknown[]) => console.error(new Date().toISOString().slice(11, 19), ...line)
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file: string, value: unknown) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

/**
 * A root the tool made carries its marker: any other directory is refused. A run that stopped short is stopped first.
 * Everything in it but the scenario directories goes.
 */
async function emptiedRoot() {
  if (existsSync(ROOT)) {
    if (!existsSync(path.join(ROOT, MARKER))) throw new Error(`${ROOT} exists and was not made by the ${RUNTIME.id} check: pick another --root`)
    if (existsSync(CONFIG)) await bringAllDown(daemons(paths, readJson<Config>(CONFIG).port!))
    for (const entry of readdirSync(ROOT)) if (entry !== KEPT) rmSync(path.join(ROOT, entry), { recursive: true })
  }
  mkdirSync(RECORDINGS, { recursive: true })
  writeFileSync(path.join(ROOT, MARKER), '')
}

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })

/** The run's places as seeds, prompts and launches name them: `{root}`, and each of `vars` (`{dir}`, `{provider}`). */
const expand = (text: string, vars: Record<string, string>) => Object.entries({ root: ROOT, ...vars }).reduce((t, [name, value]) => t.replaceAll(`{${name}}`, value), text)

function seedDir(dir: string, seed: Record<string, string>, vars: Record<string, string>) {
  rmSync(dir, { recursive: true, force: true })
  for (const [file, text] of Object.entries(seed)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), expand(text, { ...vars, dir }))
  }
  execFileSync('git', ['init', '-q', dir])
  git(dir, 'add', '.')
  git(dir, '-c', 'user.name=runtime-check', '-c', 'user.email=runtime-check@localhost', 'commit', '-q', '--allow-empty', '-m', 'seed')
}

/** Every string in a launch's config expanded: its argv and its environment. */
const expandedConfig = (launch: Launch, vars: Record<string, string>) => JSON.parse(JSON.stringify(RUNTIME.configOf(launch)), (_, v) => (typeof v === 'string' ? expand(v, vars) : v)) as Pick<Config, 'runtimes' | 'env'>

/** This process is the config's only writer: the tower reads it again on every request. */
const writeConfig = (config: Config) => writeJson(CONFIG, config)

const configFor = (hub: string, dirs: string[], launch: Launch, vars: Record<string, string>): Config => ({
  ...initialConfig(hub, [], undefined),
  ...expandedConfig(launch, vars),
  port: PORT,
  projects: { check: { name: 'check', color: '#e0a040', hub, repos: dirs } },
  extensions: { quota: { off: true } },
})

async function post<T>(verb: string, body: unknown): Promise<T> {
  const res = await fetch(`${TOWER}/${verb}`, { method: 'POST', headers: { origin: TOWER, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`POST /${verb}: ${res.status} ${text}`)
  return JSON.parse(text)
}

/** `POST /submit/at-prompt`, which must answer the error `refused` when one is named, else succeed. */
async function promptAt(id: string, text: string, refused: string | undefined): Promise<void> {
  const res = await fetch(`${TOWER}/submit/at-prompt`, { method: 'POST', headers: { origin: TOWER, 'content-type': 'application/json' }, body: JSON.stringify({ id, text }) })
  const reply = await res.text()
  const code = res.ok ? undefined : (JSON.parse(reply) as { code: string }).code
  if (code !== refused) throw new Error(`POST /submit/at-prompt: ${res.status} ${reply}${refused ? `, expected ${refused}` : ''}`)
}

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
    tail.facts = factsAfter(tail.header!)(tail.facts!, event)
    tail.events.push(event)
    const after = tail.facts.state
    if (after.status !== before.status || after.blocked !== before.blocked) tail.entered.push({ at: tail.events.length - 1, status: after.status, ...(after.blocked && { blocked: after.blocked }) })
  }
}

const matches = (want: string | RegExp, value: unknown) => (typeof want === 'string' ? value === want : typeof value === 'string' && want.test(value))

const exitAt = (tail: Tail, from: number) => {
  const at = tail.events.findIndex((e, i) => i >= from && e[1] === 'x')
  return at === -1 ? undefined : at
}

/** The index of the event `on` waits for, at or after `from`, if it has come. */
const foundOne = (tail: Tail, on: On, from: number): number | undefined => {
  if ('exit' in on) return exitAt(tail, from)
  const count = on.count ?? 1
  if ('status' in on) return tail.entered.filter((e) => e.at >= from && e.status === on.status)[count - 1]?.at
  const hits = tail.events.flatMap((e, i) => {
    if (i < from || e[1] !== 'h') return []
    const hook = e[2] as Record<string, unknown>
    if (hook.hook_event_name !== on.event || (!on.agents && RUNTIME.subagent(hook))) return []
    return Object.entries(on.where ?? {}).every(([k, want]) => matches(want, hook[k])) ? [i] : []
  })
  return hits[count - 1]
}

/** The index of the first event any of `ons` waits for, at or after `from`. */
const found = (tail: Tail, ons: On[], from: number): number | undefined =>
  ons.map((on) => foundOne(tail, on, from)).filter((at) => at !== undefined).sort((a, b) => a - b)[0]

const describe = (on: On) =>
  'exit' in on ? 'exit' : ('status' in on ? `status ${on.status}` : `${on.event}${on.where ? ` ${JSON.stringify(Object.fromEntries(Object.entries(on.where).map(([k, v]) => [k, String(v).slice(0, 40)])))}` : ''}`) + (on.count ? ` ×${on.count}` : '')

async function waitForFirst(tail: Tail, ons: On[], from: number): Promise<number> {
  const within = Math.max(...ons.map((on) => on.within ?? STEP_TIMEOUT_MS))
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    readTail(tail)
    const at = found(tail, ons, from)
    if (at !== undefined) return at
    if (tail.events.some((e) => e[1] === 'x')) break
    await sleep(200)
  }
  const now = tail.facts?.state
  throw new Error(`no ${ons.map(describe).join(' or ')} within ${within / 1000} s (status ${now?.status}${now?.blocked ? ` ${now.blocked}` : ''})`)
}

const waitFor = (tail: Tail, on: On, from: number) => waitForFirst(tail, [on], from)

/** A runtime draws a screen in a few writes and redraws it once more: keys sent before then are lost. */
async function quiet(tail: Tail, ms = 1000) {
  let size = -1
  while (size !== tail.offset) {
    size = tail.offset
    await sleep(ms)
    readTail(tail)
  }
}

const io = { waitForFirst, quiet, keys: (id: string, data: string) => post('keys', { id, data }), sleep }

async function exited(live: Live, within: string) {
  const deadline = Date.now() + 30_000
  while (!live.tail.events.some((e) => e[1] === 'x')) {
    if (Date.now() > deadline) throw new Error(`${live.name} did not exit within 30 s of ${within}`)
    await sleep(200)
    readTail(live.tail)
  }
}

async function kill(live: Live, result: ScenarioRun) {
  readTail(live.tail)
  const registered = RUNTIME.registered?.({ header: live.tail.header!, events: live.tail.events })
  if (registered !== undefined) result.registry[live.name] = registered
  await post('kill', { id: live.id })
  live.exited = true
  await exited(live, 'its kill')
}

/**
 * The process of a session this run spawned, by the `TOWER_SESSION_ID` the host gave it, as `ps -E` shows it, and only
 * that: every process the session started inherits the variable, so the one whose parent doesn't carry it is the
 * session's own. The id must be one of this run's own sessions, its log under this run's root; anything else, no
 * process with it, or more than one, is refused and fails the scenario. The match is never widened: a pattern kill
 * once took down the real tower.
 */
function sessionPid(live: Live, ours: Map<string, Live>): number {
  if (![...ours.values()].some((s) => s.id === live.id) || !live.tail.file.startsWith(`${paths.sessions}${path.sep}`) || !paths.sessions.startsWith(`${ROOT}${path.sep}`))
    throw new Error(`${live.name} (${live.id}) is not a session this run spawned under ${ROOT}: refusing to signal it`)
  const carrying = new Map(
    execFileSync('ps', ['-Eww', '-ax', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .flatMap((line) => {
        const [, pid, ppid, rest] = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/) ?? []
        return pid && new RegExp(`(^|\\s)TOWER_SESSION_ID=${live.id}(\\s|$)`).test(rest) ? [[Number(pid), Number(ppid)] as const] : []
      }),
  )
  const roots = [...carrying].filter(([, ppid]) => !carrying.has(ppid)).map(([pid]) => pid)
  if (roots.length !== 1) throw new Error(`${roots.length} processes carry TOWER_SESSION_ID=${live.id} as their own (${roots.join(', ') || 'none'}): refusing to signal any`)
  return roots[0]
}

async function killOutside(live: Live, sessions: Map<string, Live>) {
  readTail(live.tail)
  process.kill(sessionPid(live, sessions), 'SIGTERM')
  live.exited = true
  await exited(live, 'its SIGTERM')
}

async function act(scenario: Scenario, dir: string, vars: Record<string, string>, sessions: Map<string, Live>, live: Live | undefined, what: Act, result: ScenarioRun) {
  const text = (t: string) => expand(t, { ...vars, dir })
  if ('spawn' in what) {
    const { id } = await post<{ id: string }>('spawn', {
      project: 'check', cwd: dir, runtime: RUNTIME.id, model: what.model ?? RUNTIME.model,
      ...(what.effort && { effort: what.effort }), ...(what.prompt && { prompt: text(what.prompt) }), ...(what.callsign && { callsign: what.callsign }),
    })
    const spawned: Live = { name: what.spawn, id, tail: tailOf(sessionLogPath(paths, id)), cursor: 0, exited: false }
    const first = sessions.size === 0
    sessions.set(what.spawn, spawned)
    log(scenario.name, 'spawned', what.spawn, id)
    if (what.blocked || first) spawned.cursor = (await RUNTIME.started(spawned, what.blocked, io)) + 1
    return
  }
  if ('resume' in what) {
    const from = sessions.get(what.from)!
    const conversation = RUNTIME.conversation(from.tail.events)
    if (!conversation) throw new Error(`${what.from} has no conversation to resume`)
    const { id } = await post<{ id: string }>('resume', { id: from.id, conversation })
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
  if ('submit' in what) return post('submit', { id: live.id, text: text(what.submit) })
  if ('atPrompt' in what) return promptAt(live.id, what.atPrompt, what.refused)
  if ('killOutside' in what) return killOutside(live, sessions)
  return kill(live, result)
}

async function runScenario(scenario: Scenario, dir: string, vars: Record<string, string>): Promise<ScenarioRun> {
  const result: ScenarioRun = { name: scenario.name, recordings: [], registry: {}, resumed: [] }
  const sessions = new Map<string, Live>()
  const sessionOf = (step: Step) => (step.in ? sessions.get(step.in) : sessions.values().next().value)
  try {
    for (const [i, step] of scenario.steps.entries()) {
      const live = sessionOf(step)
      try {
        if (step.on) {
          live!.cursor = (await waitFor(live!.tail, step.on, live!.cursor)) + 1
          if ('exit' in step.on) live!.exited = true
        }
        if (step.pause) await sleep(step.pause)
        if (step.do) await act(scenario, dir, vars, sessions, live, step.do, result)
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

/**
 * Each scenario of `group` recorded once, in its directory seeded again: the scenarios with the same launch together,
 * the config written for them. A recording replaces the one an earlier attempt left under its name.
 */
async function recorded(hub: string, group: Scenario[], vars: Record<string, string>): Promise<ScenarioRun[]> {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const dirOf = (s: Scenario) => (s.fresh ? path.join(ROOT, 'fresh', stamp, s.name) : path.join(ROOT, KEPT, s.name))
  for (const s of group) seedDir(dirOf(s), s.seed, vars)
  rmSync(path.join(ROOT, 'signed-out'), { recursive: true, force: true })
  mkdirSync(path.join(ROOT, 'signed-out'))
  const dirs = group.map(dirOf)
  const scenarios: ScenarioRun[] = []
  for (const launch of RUNTIME.launches) {
    const launched = group.filter((s) => s.launch === launch)
    if (!launched.length) continue
    writeConfig(configFor(hub, dirs, launch, vars))
    log(`launch ${launch.name}: ${launched.map((s) => s.name).join(', ')}`)
    scenarios.push(...(await pooled(launched.map((s) => () => runScenario(s, dirOf(s), vars)), AT_ONCE)))
  }
  return scenarios
}

const fixtureOf = (name: string) => parseLog(readFileSync(path.join(REPO, 'test', 'fixtures', `${name}.jsonl`), 'utf8'))

const recordingsOf = (scenarios: ScenarioRun[]) =>
  Object.fromEntries(scenarios.flatMap((s) => s.recordings).map(({ name }) => [name, parseLog(readFileSync(path.join(RECORDINGS, `${name}.jsonl`), 'utf8'))]))

async function run() {
  const only = values.only?.split(',')
  const picked = only ? RUNTIME.scenarios.filter((s) => only.includes(s.name)) : RUNTIME.scenarios
  const unknown = only?.filter((name) => !RUNTIME.scenarios.some((s) => s.name === name))
  if (unknown?.length) throw new Error(`no scenario ${unknown.join(', ')}: ${RUNTIME.scenarios.map((s) => s.name).join(', ')}`)
  const release = RUNTIME.installed()
  await emptiedRoot()
  const hub = path.join(ROOT, 'hub')
  seedDir(hub, { 'README.md': '# check\n' }, {})
  const services = await RUNTIME.services?.()
  const vars = services?.vars ?? {}
  writeConfig(configFor(hub, [], RUNTIME.plain, vars))
  const startedAt = Date.now()
  log(`${RUNTIME.word} ${release}, ${picked.length} scenarios in ${ROOT}, ${RETRIES} retr${RETRIES === 1 ? 'y' : 'ies'}`)
  let scenarios: ScenarioRun[]
  try {
    for (const [daemon, answer] of await bringAllUp(daemons(paths, PORT))) log(daemon.name, answer)
    try {
      scenarios = await recorded(hub, picked, vars)
      for (let attempt = 1; attempt <= RETRIES; attempt++) {
        const differing = scenarioDifferences(RUNTIME, { run: { release, scenarios }, recordings: recordingsOf(scenarios), fixture: fixtureOf })
        if (!differing.size) break
        log(`retry ${attempt} of ${RETRIES}: ${[...differing.keys()].join(', ')}`)
        const again = await recorded(hub, picked.filter((s) => differing.has(s.name)), vars)
        scenarios = scenarios.map((s) => {
          const retry = again.find((a) => a.name === s.name)
          return retry ? { ...retry, retried: [...(s.retried ?? []), differing.get(s.name)!] } : s
        })
      }
    } finally {
      for (const [daemon, answer] of await bringAllDown(daemons(paths, PORT))) log(daemon.name, answer instanceof Error ? answer.message : answer)
    }
  } finally {
    await services?.close()
  }
  writeConfig(configFor(hub, [], RUNTIME.plain, vars))
  const after = (await RUNTIME.afterRun?.(readJson<Config>(CONFIG))) ?? {}
  const result: Run = { release, startedAt, minutes: Math.round((Date.now() - startedAt) / 60_000), scenarios, ...after }
  writeJson(RUN, result)
  return report()
}

/** An empty baseline, before a runtime's first `accept`. */
const baselineOf = (file: string): Baseline => (existsSync(file) ? readJson<Baseline>(file) : { release: '', recordings: {} })

function report() {
  if (!existsSync(RUN)) throw new Error(`no run in ${ROOT}: npm run tool:runtime-check -- ${RUNTIME.id} run`)
  const result = readJson<Run>(RUN)
  const { markdown, clean } = RUNTIME.report({ run: result, recordings: recordingsOf(result.scenarios), baseline: baselineOf(RUNTIME.baseline), fixture: fixtureOf, root: ROOT })
  writeFileSync(path.join(ROOT, 'report.md'), markdown)
  console.log(markdown)
  process.exitCode = clean ? 0 : 1
}

function accept() {
  const result = readJson<Run>(RUN)
  const baseline = baselineOf(RUNTIME.baseline)
  const taken = result.scenarios.filter((s) => !s.error).flatMap((s) => s.recordings)
  const shapes = Object.fromEntries(taken.map(({ name }) => [name, shapesOf(parseLog(readFileSync(path.join(RECORDINGS, `${name}.jsonl`), 'utf8')))]))
  const sameRelease = baseline.release === result.release
  const recordings = { ...baseline.recordings, ...Object.fromEntries(Object.entries(shapes).map(([name, s]) => [name, sameRelease && baseline.recordings[name] ? mergedShapes(baseline.recordings[name], s) : s])) }
  const sorted: Baseline = { release: result.release, recordings: Object.fromEntries(Object.entries(recordings).sort(([a], [b]) => a.localeCompare(b))) }
  /** An event's keys on its own line: the baseline diffs one event per line. */
  writeFileSync(RUNTIME.baseline, `${JSON.stringify(sorted, null, 2).replace(/\[\n\s+("[^\]]*?)\n\s+\]/g, (_, keys: string) => `[${keys.replace(/,\n\s+/g, ', ')}]`)}\n`)
  console.log(`${RUNTIME.baseline}: ${taken.length} recordings taken on ${RUNTIME.word} ${result.release}`)
}

/**
 * Whether the installed release is due a run, said in one line. A run that reads clean opens a pull request titled
 * `<word> <release>` raising the range, so once one is open or merged the release has passed.
 */
function due(): 0 | 1 {
  const { word, tested } = RUNTIME
  const release = RUNTIME.installed()
  const reads = releaseRange(tested, release)
  if (reads !== 'above') {
    console.log(`${word} ${release} reads ${reads} against the tested ${tested.lowest} to ${tested.highest}: nothing to check`)
    return 1
  }
  const prs: { number: number; state: string; title: string }[] = JSON.parse(
    execFileSync('gh', ['pr', 'list', '--state', 'all', '--search', `"${word} ${release}" in:title`, '--json', 'number,state,title'], { cwd: REPO, encoding: 'utf8' }),
  )
  const passed = prs.find((pr) => pr.state !== 'CLOSED' && new RegExp(`^${word} ${release.replaceAll('.', '\\.')}\\b`).test(pr.title))
  if (passed) {
    console.log(`${word} ${release} reads above ${tested.highest}, and #${passed.number} (${passed.state.toLowerCase()}) raises the range to it: nothing to check`)
    return 1
  }
  console.log(`${word} ${release} reads above the tested ${tested.lowest} to ${tested.highest}, and no pull request raises the range to it`)
  return 0
}

if (command === 'run') await run()
else if (command === 'due') {
  try {
    process.exitCode = due()
  } catch (err) {
    console.error((err as Error).message)
    process.exitCode = 2
  }
}
else if (command === 'report') report()
else if (command === 'accept') accept()
else throw new Error(USAGE)
