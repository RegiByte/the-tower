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
import { CLAUDE_TESTED, claudeRange } from './shared/claude.ts'
import { configProblems } from './config-check.ts'
import { ConfigError, editorArgv, towerPort, type Config } from './shared/model.ts'
import type { SystemPaths } from './shared/paths.ts'
import { readConfig } from './system.ts'

export type Verdict = { level: 'ok' | 'warn' | 'fail'; what: string; fix?: string }

const NODE_MAJOR = 24

/** `git merge-tree --write-tree`, which the landing check runs, came in git 2.38. */
const GIT_MINIMUM = [2, 38]

type Ran = { code: number; stdout: string; stderr: string }

/** A command run to its end, whatever it exits with; `undefined` when it isn't on the PATH. */
const ran = async (file: string, args: string[]): Promise<Ran | undefined> => {
  try {
    const { stdout, stderr } = await promisify(execFile)(file, args, { encoding: 'utf8' })
    return { code: 0, stdout, stderr }
  } catch (err) {
    const failed = err as NodeJS.ErrnoException & { code: number | string; stdout: string; stderr: string }
    if (failed.code === 'ENOENT') return undefined
    if (typeof failed.code !== 'number') throw err
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
  }
}

const macos = (): Verdict =>
  process.platform === 'darwin'
    ? { level: 'ok', what: 'macOS' }
    : { level: 'fail', what: `${process.platform}: the tower runs on macOS only`, fix: 'run it on a Mac (it reads ps -E, lsof and launchd re-parenting)' }

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
  if (!run) return { level: 'fail', what: 'git is not on the PATH', fix: 'xcode-select --install' }
  const what = run.stdout.trim()
  const [major, minor] = (/(\d+)\.(\d+)/.exec(what) ?? []).slice(1).map(Number)
  const [wantMajor, wantMinor] = GIT_MINIMUM
  return major > wantMajor || (major === wantMajor && minor >= wantMinor)
    ? { level: 'ok', what }
    : { level: 'fail', what: `${what}, older than ${GIT_MINIMUM.join('.')}`, fix: 'brew install git, or update the Command Line Tools: xcode-select --install' }
}

const claudeVersion = async (): Promise<Verdict> => {
  const run = await ran('claude', ['--version'])
  if (!run) return { level: 'fail', what: 'claude is not on the PATH', fix: 'install Claude Code: https://docs.claude.com/en/docs/claude-code/setup' }
  const version = run.stdout.trim()
  const range = `${CLAUDE_TESTED.lowest} to ${CLAUDE_TESTED.highest}`
  switch (claudeRange(version)) {
    case 'tested':
      return { level: 'ok', what: `claude ${version}, tested (${range})` }
    case 'below':
      return { level: 'fail', what: `claude ${version}, older than the tower was tested with (${range})`, fix: 'claude update' }
    case 'above':
      return { level: 'warn', what: `claude ${version}, newer than the tower was tested with (${range}): the board may read it wrong`, fix: 'carry on, and report what looks wrong' }
    case 'unknown':
      return { level: 'warn', what: `claude --version printed ${JSON.stringify(version)}, no version the tower can place against its tested range (${range})`, fix: 'check that claude on the PATH is Claude Code' }
  }
}

/** `claude auth status` exits 1 when no one is signed in. */
const claudeSignedIn = async (): Promise<Verdict> => {
  const run = await ran('claude', ['auth', 'status'])
  if (!run) return { level: 'fail', what: 'claude sign-in: claude is not on the PATH', fix: 'install Claude Code first' }
  return run.code === 0
    ? { level: 'ok', what: 'claude signed in' }
    : { level: 'warn', what: 'claude is not signed in: the first worker stops at its sign-in screen', fix: 'run claude once in a terminal and sign in, or sign in at the first worker' }
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
    macos(),
    node(),
    await claudeVersion(),
    await claudeSignedIn(),
    await gitVersion(),
    await onPath('curl', ['--version'], 'xcode-select --install'),
    writable(paths),
    configValid(paths, config),
    await editor(config),
  ]
}

/** Whether each daemon of this system runs, and whether something else holds its place: the tower's place is the config's port. */
export const running = async (paths: SystemPaths): Promise<Verdict[]> => {
  const config = readable(paths)
  if (config instanceof Error) return [{ level: 'warn', what: 'the daemons: unchecked until the config reads', fix: 'fix the config first' }]
  let port: number
  try {
    port = towerPort(config)
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    return [{ level: 'warn', what: 'the daemons: unchecked until the config names a port', fix: 'fix the config first' }]
  }
  return Promise.all(
    daemons(paths, port).map(async (d) => {
      const holder = await d.holder()
      return daemon(d, holder, holder.t === 'nothing' ? await startedPid(d) : undefined)
    }),
  )
}

export const doctor = async (paths: SystemPaths): Promise<Verdict[]> => [...(await readiness(paths)), ...(await running(paths))]

const LABEL: Record<Verdict['level'], string> = { ok: 'ok  ', warn: 'warn', fail: 'FAIL' }

export const verdictLines = (verdicts: Verdict[]): string[] =>
  verdicts.flatMap((v) => [`${LABEL[v.level]}  ${v.what}`, ...(v.fix && v.level !== 'ok' ? [`      → ${v.fix}`] : [])])
