/**
 * The tower's edge to git: every call runs with no prompt for credentials, with the user's config that changes what
 * the tower reads set back to git's defaults (`PINNED`), and is stopped past a timeout, so a hook or an fsmonitor that
 * hangs fails one verb with its name instead of holding every verb queued behind it.
 */
import { spawn } from 'node:child_process'
import { withoutParentSession } from './shared/env.ts'

/**
 * Every config of the user's that changes what a read reports, or what a removal checks, set back to git's default.
 * `status.showUntrackedFiles=no` hides new files from `status --porcelain` and from the check `worktree remove` runs
 * before it deletes a folder (`-c` reaches the git it runs). `log.showSignature` prints verification lines into `log`.
 */
const PINNED = ['-c', 'status.showUntrackedFiles=normal', '-c', 'log.showSignature=false']

/** How long a git call runs before it is stopped. */
const GIT_TIMEOUT_MS = 60_000
/** How long a call writing or deleting a whole worktree runs before it is stopped: every file, ignored ones and hooks (LFS, husky) included. */
const TREE_TIMEOUT_MS = 10 * 60_000
/**
 * How many git processes run at once. Starting a process holds the event loop about 3 ms on macOS, and one read of the
 * board's repos starts about 85: started together, they hold back every keystroke and screen the tower relays.
 */
const GIT_CONCURRENCY = 8

export type Run = { stdout: string; stderr: string; code: number }
/** A run's output as git wrote it, bytes undecoded. */
type RawRun = { stdout: Buffer; stderr: string; code: number }

/** A git call stopped after its timeout. */
export class GitTimeout extends Error {}

/**
 * Git in a process group of its own, so a timeout stops the hooks and the fsmonitor it started with it: SIGTERM, which
 * git answers by removing its lock files.
 */
const spawnGit = (dir: string, args: string[], timeout: number, env: NodeJS.ProcessEnv, input?: string): Promise<RawRun> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', dir, '--no-optional-locks', ...PINNED, ...args], {
      detached: true,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      env: { ...withoutParentSession(process.env), GIT_TERMINAL_PROMPT: '0', ...env },
    })
    const stdout: Buffer[] = []
    let stderr = ''
    child.stdout!.on('data', (d: Buffer) => stdout.push(d))
    child.stderr!.setEncoding('utf8').on('data', (d: string) => (stderr += d))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid!, 'SIGTERM')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
    }, timeout)
    child.on('error', (err) => (clearTimeout(timer), reject(err)))
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut)
        return reject(new GitTimeout(`git ${args.slice(0, 2).join(' ')} in ${dir} took over ${timeout / 1000}s and was stopped: a hook or an fsmonitor of the repo may hang, or its disk is slow; run it there by hand to see`))
      if (code === null) return reject(new Error(`git ${args.join(' ')} in ${dir} ended on ${signal}`))
      resolve({ stdout: Buffer.concat(stdout), stderr, code })
    })
    // A git that exits before reading all of `input` breaks the pipe: its exit code and stderr say why, through `close`.
    if (input !== undefined) child.stdin!.on('error', () => {}).end(input)
  })

/** At most `n` tasks run at once; the rest start in the order they came, each as a running one settles and hands it its place. */
const limited = (n: number) => {
  let running = 0
  const waiting: (() => void)[] = []
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running === n) await new Promise<void>((start) => waiting.push(start))
    else running++
    try {
      return await task()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else running--
    }
  }
}

const inTurn = limited(GIT_CONCURRENCY)

/** A call's timeout counts from its start, not from when it was queued. */
const exec = async (dir: string, args: string[], timeout: number, env: NodeJS.ProcessEnv): Promise<Run> => {
  const r = await inTurn(() => spawnGit(dir, args, timeout, env))
  return { ...r, stdout: r.stdout.toString('utf8') }
}

/** Git, its exit code returned for the caller to read; a timeout throws `GitTimeout`. */
export const run = (dir: string, args: string[], timeout = GIT_TIMEOUT_MS): Promise<Run> => exec(dir, args, timeout, {})

const succeeded = <T>(dir: string, args: string[], r: { stdout: T; stderr: string; code: number }): T => {
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} in ${dir}: ${r.stderr.trim()}`)
  return r.stdout
}

/** Git that must succeed, fed `input` on its stdin, its output as bytes: for output that counts its own lengths in bytes (`cat-file --batch`). */
export const gitBytes = async (dir: string, args: string[], input: string): Promise<Buffer> =>
  succeeded(dir, args, await inTurn(() => spawnGit(dir, args, GIT_TIMEOUT_MS, {}, input)))

/** Git that must succeed, with `env` added to its environment: a failure throws with its stderr. */
export const gitWith = (env: NodeJS.ProcessEnv) => async (dir: string, args: string[]): Promise<string> => succeeded(dir, args, await exec(dir, args, GIT_TIMEOUT_MS, env))

/** Git writing or deleting a whole worktree (`worktree add`, `worktree remove`, `checkout`) that must succeed, given TREE_TIMEOUT_MS. */
export const wholeTree = async (dir: string, args: string[]): Promise<string> => succeeded(dir, args, await run(dir, args, TREE_TIMEOUT_MS))

/** Git that must succeed: a failure throws with its stderr. */
export const git = gitWith({})
