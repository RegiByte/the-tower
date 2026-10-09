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

export type Run = { stdout: string; stderr: string; code: number }

/** A git call stopped after its timeout. */
export class GitTimeout extends Error {}

/**
 * Git in a process group of its own, so a timeout stops the hooks and the fsmonitor it started with it: SIGTERM, which
 * git answers by removing its lock files.
 */
const exec = (dir: string, args: string[], timeout: number, env: NodeJS.ProcessEnv): Promise<Run> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', dir, '--no-optional-locks', ...PINNED, ...args], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...withoutParentSession(process.env), GIT_TERMINAL_PROMPT: '0', ...env },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d))
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d))
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
      resolve({ stdout, stderr, code })
    })
  })

/** Git, its exit code returned for the caller to read; a timeout throws `GitTimeout`. */
export const run = (dir: string, args: string[], timeout = GIT_TIMEOUT_MS): Promise<Run> => exec(dir, args, timeout, {})

const succeeded = (dir: string, args: string[], r: Run) => {
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} in ${dir}: ${r.stderr.trim()}`)
  return r.stdout
}

/** Git that must succeed, with `env` added to its environment: a failure throws with its stderr. */
export const gitWith = (env: NodeJS.ProcessEnv) => async (dir: string, args: string[]): Promise<string> => succeeded(dir, args, await exec(dir, args, GIT_TIMEOUT_MS, env))

/** Git writing or deleting a whole worktree (`worktree add`, `worktree remove`, `checkout`) that must succeed, given TREE_TIMEOUT_MS. */
export const wholeTree = async (dir: string, args: string[]): Promise<string> => succeeded(dir, args, await run(dir, args, TREE_TIMEOUT_MS))

/** Git that must succeed: a failure throws with its stderr. */
export const git = gitWith({})
