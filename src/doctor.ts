/**
 * `tower doctor`: what this machine and system need for the tower to run, each checked, with one fix for each that
 * fails. It changes nothing. A `fail` stops the tower from working; a `warn` leaves it working with less, or names
 * what `tower up` or a first worker will do.
 */
import { execFile } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { daemons, startedPid, type Daemon, type Holder } from './machine.ts'
import { resolve, type Accepted } from './bridge/extensions.ts'
import { respelled } from './bridge/legacy.ts'
import { discover } from './extensions.ts'
import { runProcess } from './run.ts'
import { API_VERSION, isApiError, type ApiError } from './shared/api.ts'
import type { Check, RunResult } from './shared/extensions.ts'
import { extensionLine, PROBLEM_FIX, problemLine } from './shared/cards.ts'
import { CLAUDE_TESTED, claudeRange } from './shared/claude.ts'
import { configProblems } from './config-check.ts'
import { ConfigError, commandNames, editorArgv, resolveCommand, towerPort, type Config } from './shared/model.ts'
import { withoutParentSession } from './shared/env.ts'
import type { SystemPaths } from './shared/paths.ts'
import type { Reads } from './shared/shelf-page.ts'
import { readConfig } from './system.ts'
import { detected } from './platform.ts'

export type Verdict = { level: 'ok' | 'warn' | 'fail'; what: string; fix?: string }

const NODE_MAJOR = 24

/** `git merge-tree --write-tree`, which the landing check runs, came in git 2.38. */
const GIT_MINIMUM = [2, 38]

type Ran = { code: number; stdout: string; stderr: string }

/** A command run to its end in `env`, whatever it exits with; `undefined` when it isn't on the PATH. */
const ranIn = async (env: NodeJS.ProcessEnv, file: string, args: string[]): Promise<Ran | undefined> => {
  try {
    const { stdout, stderr } = await promisify(execFile)(file, args, { encoding: 'utf8', env })
    return { code: 0, stdout, stderr }
  } catch (err) {
    const failed = err as NodeJS.ErrnoException & { code: number | string; stdout: string; stderr: string }
    if (failed.code === 'ENOENT') return undefined
    if (typeof failed.code !== 'number') throw err
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
  }
}

const ran = (file: string, args: string[]): Promise<Ran | undefined> => ranIn(process.env, file, args)

/** On a platform the tower doesn't run on, the platform's own check fails first and names the fix that matters. */
const installs = (tool: string): string => detected()?.installs(tool) ?? `install ${tool}`

const supported = (): Verdict => {
  const here = detected()
  return here
    ? { level: 'ok', what: here.name }
    : { level: 'fail', what: `${process.platform}: the tower runs on macOS and WSL 2 only`, fix: 'run it on a Mac or in WSL 2 (decision platforms)' }
}

const node = (): Verdict =>
  Number(process.versions.node.split('.')[0]) >= NODE_MAJOR
    ? { level: 'ok', what: `node ${process.versions.node}` }
    : { level: 'fail', what: `node ${process.versions.node}, below ${NODE_MAJOR}`, fix: `install Node ${NODE_MAJOR} or later (nvm install ${NODE_MAJOR})` }

const onPath = async (command: string, args: string[], fix: string): Promise<Verdict> => {
  const run = await ran(command, args)
  return run ? { level: 'ok', what: `${command} ${(run.stdout || run.stderr).split('\n')[0].trim()}` } : { level: 'fail', what: `${command} is not on the PATH`, fix }
}

const gitVersion = async (): Promise<Verdict> => {
  const run = await ran('git', ['--version'])
  if (!run) return { level: 'fail', what: 'git is not on the PATH', fix: installs('git') }
  const what = run.stdout.trim()
  const [major, minor] = (/(\d+)\.(\d+)/.exec(what) ?? []).slice(1).map(Number)
  const [wantMajor, wantMinor] = GIT_MINIMUM
  return major > wantMajor || (major === wantMajor && minor >= wantMinor)
    ? { level: 'ok', what }
    : { level: 'fail', what: `${what}, older than ${GIT_MINIMUM.join('.')}`, fix: detected()?.newerGit ?? 'install a newer git' }
}

/**
 * A Claude the config's `argv` starts: `file`, the binary one or more of its commands name, checked alone (a command's
 * own arguments may not be valid beside `--version` or `auth status`), in the config's `env` over the scrubbed
 * environment, as the host builds it. `names`: the commands that start it, none for the legacy array.
 */
type Claude = { file: string; names: string[]; env: NodeJS.ProcessEnv }

/** Each distinct binary the config's `argv` commands start, so a Claude under several names is checked once. */
const claudesOf = (config: Config): Claude[] => {
  const byFile = new Map<string, string[]>()
  for (const name of commandNames(config) ?? [undefined]) {
    const [file] = resolveCommand(config, name)
    byFile.set(file, [...(byFile.get(file) ?? []), ...(name === undefined ? [] : [name])])
  }
  const env = withoutParentSession({ ...process.env, ...config.env })
  return [...byFile].map(([file, names]) => ({ file, names, env }))
}

/** How a line names a Claude: its binary, and the commands that start it when `argv` names several. */
const claudeLabel = ({ file, names }: Claude): string => (names.length ? `${file} (${names.map((n) => `argv.${n}`).join(', ')})` : file)

const missing = (claude: Claude): Verdict => ({
  level: 'fail',
  what: `${claudeLabel(claude)}: ${claude.file} ${claude.file.includes('/') ? 'does not exist' : 'is not on the PATH'}`,
  fix: `install Claude Code (https://docs.claude.com/en/docs/claude-code/setup), or fix argv${claude.names.length ? `.${claude.names[0]}` : ''} in the config`,
})

/** A Claude's version, from its `--version`, against the tested range. */
const claudeVersion = (claude: Claude, printed: string): Verdict => {
  const label = claudeLabel(claude)
  const version = printed.trim()
  const range = `${CLAUDE_TESTED.lowest} to ${CLAUDE_TESTED.highest}`
  switch (claudeRange(version)) {
    case 'tested':
      return { level: 'ok', what: `${label} ${version}, tested (${range})` }
    case 'below':
      return { level: 'fail', what: `${label} ${version}, older than the tower was tested with (${range})`, fix: `${claude.file} update` }
    case 'above':
      return { level: 'warn', what: `${label} ${version}, newer than the tower was tested with (${range}): the board may read it wrong`, fix: 'carry on, and report what looks wrong' }
    case 'unknown':
      return { level: 'warn', what: `${label} --version printed ${JSON.stringify(version)}, no version the tower can place against its tested range (${range})`, fix: `check that ${claude.file} runs Claude Code` }
  }
}

/** `claude auth status` exits 1 when no one is signed in. */
const claudeSignedIn = (claude: Claude, status: Ran): Verdict =>
  status.code === 0
    ? { level: 'ok', what: `${claudeLabel(claude)} signed in` }
    : { level: 'warn', what: `${claudeLabel(claude)} is not signed in: the first worker it starts stops at its sign-in screen`, fix: `run ${claude.file} once in a terminal and sign in, or sign in at the first worker` }

/** A Claude's version and sign-in, or the one line that says it isn't there. */
const claudeVerdicts = async (claude: Claude): Promise<Verdict[]> => {
  let version: Ran | undefined
  try {
    version = await ranIn(claude.env, claude.file, ['--version'])
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EACCES') throw err
    return [{ level: 'fail', what: `${claudeLabel(claude)}: ${claude.file} is not executable`, fix: claude.file.includes('/') ? `chmod +x ${claude.file}` : `chmod +x the ${claude.file} on the PATH` }]
  }
  if (!version) return [missing(claude)]
  const status = (await ranIn(claude.env, claude.file, ['auth', 'status']))!
  return [claudeVersion(claude, version.stdout), claudeSignedIn(claude, status)]
}

/**
 * The Claude each of the config's `argv` commands starts, checked as the host would start it: its version against the
 * tested range, and that someone is signed in. Unchecked until the config reads with an `argv` the tower can take.
 */
const claudes = async (config: Config | Error): Promise<Verdict[]> => {
  if (config instanceof Error) return [{ level: 'warn', what: 'claude: unchecked until the config reads', fix: 'fix the config first' }]
  if (configProblems(config).some((p) => p.key === 'argv')) return [{ level: 'warn', what: "claude: unchecked until the config's argv is fixed", fix: 'fix argv in the config' }]
  return (await Promise.all(claudesOf(config).map(claudeVerdicts))).flat()
}

const writable = (paths: SystemPaths): Verdict => {
  const root = path.dirname(paths.config)
  if (!existsSync(root)) return { level: 'fail', what: `the system root ${root} does not exist`, fix: 'tower init' }
  try {
    accessSync(root, constants.W_OK)
    return { level: 'ok', what: `the system root ${root} is writable` }
  } catch {
    return { level: 'fail', what: `the system root ${root} is not writable`, fix: `chmod u+w ${root}` }
  }
}

const configValid = (paths: SystemPaths, config: Config | Error): Verdict => {
  if (config instanceof Error) {
    return existsSync(paths.config)
      ? { level: 'fail', what: config.message, fix: `fix ${paths.config}` }
      : { level: 'fail', what: `no config at ${paths.config}`, fix: 'tower init [hub] [repos...]: a first project from a directory' }
  }
  const problems = configProblems(config)
  const fails = problems.filter((p) => p.level === 'fail')
  if (fails.length) return { level: 'fail', what: `the config: ${fails.map((p) => `${p.key}: ${p.problem}`).join('; ')}`, fix: `fix ${paths.config}; \`tower config check\` lists each problem` }
  if (problems.length) return { level: 'warn', what: `the config has keys the tower ignores: ${problems.map((p) => p.key).join(', ')}`, fix: '`tower config check` says why' }
  return { level: 'ok', what: `the config ${paths.config}` }
}

/** The user's editor opens projects and files from the tower: without it, only that is lost. */
const editor = async (config: Config | Error): Promise<Verdict> => {
  if (config instanceof Error) return { level: 'warn', what: 'the editor: unchecked until the config reads', fix: 'fix the config first' }
  const [command] = editorArgv(config, 'window', { dir: '.' })
  const found = await ran('/bin/sh', ['-c', `command -v '${command.replaceAll("'", `'\\''`)}'`])
  return found?.code === 0
    ? { level: 'ok', what: `the editor ${command}` }
    : {
        level: 'warn',
        what: `the editor ${command} is not on the PATH: the tower can't open projects and files in it`,
        fix: config.editor ? 'fix editor in the config' : "install VS Code's code command (Command Palette: Shell Command: Install 'code' command in PATH), or set editor in the config",
      }
}

/** `stray`: the pid of this system's daemon that runs without answering where it serves (`startedPid`). */
const daemon = ({ name, where, config }: Daemon, holder: Holder, stray: number | undefined): Verdict => {
  if (holder.t === 'ours') return { level: 'ok', what: `${name} answers at ${where}` }
  if (stray !== undefined) return { level: 'fail', what: `${name} runs as pid ${stray} but does not answer at ${where}${name === 'tower' ? ": the config's port changed since it started" : ''}`, fix: `tower down ${name}, then tower up` }
  if (holder.t === 'nothing') return { level: 'warn', what: `${name} is not running`, fix: 'tower up' }
  return { level: 'fail', what: `${name}: ${where} is held by ${holder.what}`, fix: name === 'tower' ? `stop it where it runs, or serve this system on another port: set port in ${config}` : 'stop it where it runs' }
}

/**
 * The extensions, read from the running tower that runs them: one line each, the ones not started with what to do, and
 * a line per error problem with its fix; `all`, the warnings too.
 */
const extensionVerdicts = async (tower: Daemon, answering: boolean, all: boolean): Promise<Verdict[]> => {
  if (!answering) return [{ level: 'warn', what: 'the extensions: unchecked while the tower is down', fix: 'tower up' }]
  const res = await fetch(`${tower.where}/extensions`)
  if (!res.ok) return [{ level: 'warn', what: `the extensions: the tower answers ${res.status}: ${((await res.json()) as ApiError).message}`, fix: 'a tower older than this checkout: tower down tower, then tower up tower' }]
  const { extensions }: Reads['extensions'] = await res.json()
  return extensions.flatMap((e): Verdict[] => [
    e.state === 'started' || e.state === 'off'
      ? { level: 'ok', what: `extension ${e.id}: ${extensionLine(e)}` }
      : { level: 'warn', what: `extension ${e.id}: ${extensionLine(e)}`, fix: 'the lines below say why, and what to do' },
    ...e.problems
      .filter((p) => (all ? p.level !== 'info' : p.level === 'error'))
      .map((p): Verdict => ({ level: 'warn', what: `extension ${e.id}: ${problemLine(p)}`, fix: PROBLEM_FIX[p.code] })),
  ])
}

/** How long an extension's `run` check may take. */
const CHECK_MS = 10_000

/** Why a check's command failed, in a line: `exit 2: no token`, `timed out after 10 s`. */
const ranWhy = (ran: RunResult): string => {
  const why = ran.timedOut ? `timed out after ${CHECK_MS / 1000} s` : ran.exit === null ? `ended by ${ran.signal}` : `exit ${ran.exit}`
  const said = ran.stderr.trim().split('\n').at(-1) || ran.stdout.trim().split('\n').at(-1)
  return said ? `${why}: ${said}` : why
}

/** Why a check failed, or nothing when it passed: its command exits 0, or its read answers. */
const checkFailure = async (a: Accepted, check: Check, tower: Daemon): Promise<string | undefined> => {
  if (check.run) {
    try {
      const ran = await runProcess(check.run, { cwd: a.dir, timeoutMs: CHECK_MS })
      return ran.exit === 0 ? undefined : ranWhy(ran)
    } catch (err) {
      return `could not start: ${(err as Error).message}`
    }
  }
  const res = await fetch(`${tower.where}/${a.provides}/${check.read}`)
  if (res.ok) return undefined
  const answer = await res.json()
  return isApiError(answer) ? `${answer.code}: ${answer.message}` : `the tower answers ${res.status}`
}

/**
 * The checks the extensions declare, each a line: those of every extension the config resolves to, read from the
 * folders as they are now. A `run` check works without the tower; a `read` check while the tower is down says so, and
 * fails nothing.
 */
const checkVerdicts = async (config: Config, tower: Daemon, answering: boolean): Promise<Verdict[]> => {
  const now = respelled(config).config
  const resolved = resolve(discover(now), now, API_VERSION)
  const checks = resolved.order.flatMap((id) => {
    const a = resolved.accepted.get(id)!
    return Object.entries(a.manifest.checks ?? {}).map(([name, check]) => ({ a, name, check }))
  })
  return Promise.all(
    checks.map(async ({ a, name, check }): Promise<Verdict> => {
      const what = `check ${a.provides}/${name}: ${check.words.label}`
      if (check.read && !answering) return { level: 'warn', what: `${what}: tower down`, fix: 'tower up: a read check asks the running tower' }
      const failure = await checkFailure(a, check, tower)
      if (failure === undefined) return { level: 'ok', what }
      return { level: 'warn', what: `${what}: ${failure}`, ...(check.fix && { fix: check.fix }) }
    }),
  )
}

const readable = (paths: SystemPaths): Config | Error => {
  try {
    return readConfig(paths.config)
  } catch (err) {
    if (err instanceof ConfigError) return err
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return err as Error
    throw err
  }
}

/** What the tower needs before it starts: the machine, Claude and the config. */
export const readiness = async (paths: SystemPaths): Promise<Verdict[]> => {
  const config = readable(paths)
  return [
    supported(),
    node(),
    ...(await claudes(config)),
    await gitVersion(),
    await onPath('curl', ['--version'], installs('curl')),
    await onPath('lsof', ['-h'], installs('lsof')),
    writable(paths),
    configValid(paths, config),
    await editor(config),
  ]
}

/**
 * Whether each daemon of this system runs, and whether something else holds its place: the tower's place is the config's
 * port. Then what the tower runs: the extensions, their warnings too with `all`, and the checks the
 * extensions declare.
 */
export const running = async (paths: SystemPaths, all: boolean): Promise<Verdict[]> => {
  const config = readable(paths)
  if (config instanceof Error) return [{ level: 'warn', what: 'the daemons: unchecked until the config reads', fix: 'fix the config first' }]
  let port: number
  try {
    port = towerPort(config)
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    return [{ level: 'warn', what: 'the daemons: unchecked until the config names a port', fix: 'fix the config first' }]
  }
  const every = daemons(paths, port)
  const verdicts = await Promise.all(
    every.map(async (d) => {
      const holder = await d.holder()
      return { verdict: daemon(d, holder, holder.t === 'nothing' ? await startedPid(d) : undefined), ours: holder.t === 'ours' }
    }),
  )
  const tower = every.findIndex((d) => d.name === 'tower')
  return [
    ...verdicts.map((v) => v.verdict),
    ...(await extensionVerdicts(every[tower], verdicts[tower].ours, all)),
    ...(await checkVerdicts(config, every[tower], verdicts[tower].ours)),
  ]
}

export const doctor = async (paths: SystemPaths, all: boolean): Promise<Verdict[]> => [...(await readiness(paths)), ...(await running(paths, all))]

const LABEL: Record<Verdict['level'], string> = { ok: 'ok  ', warn: 'warn', fail: 'FAIL' }

export const verdictLines = (verdicts: Verdict[]): string[] =>
  verdicts.flatMap((v) => [`${LABEL[v.level]}  ${v.what}`, ...(v.fix && v.level !== 'ok' ? [`      → ${v.fix}`] : [])])
