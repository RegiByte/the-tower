/**
 * The tower's edge to git: every call runs with no prompt for credentials and with the user's config that changes what
 * the tower reads set back to git's defaults (`PINNED`).
 */
import { execFile } from 'node:child_process'
import { withoutParentSession } from './shared/env.ts'

/**
 * Every config of the user's that changes what a read reports, or what a removal checks, set back to git's default.
 * `status.showUntrackedFiles=no` hides new files from `status --porcelain` and from the check `worktree remove` runs
 * before it deletes a folder (`-c` reaches the git it runs). `log.showSignature` prints verification lines into `log`.
 */
const PINNED = ['-c', 'status.showUntrackedFiles=normal', '-c', 'log.showSignature=false']

export type Run = { stdout: string; stderr: string; code: number }

/** A git call stopped after `timeout`. */
export class GitTimeout extends Error {}

const exec = (dir: string, args: string[], timeout: number | undefined, env: NodeJS.ProcessEnv): Promise<Run> =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', dir, '--no-optional-locks', ...PINNED, ...args],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout, env: { ...withoutParentSession(process.env), GIT_TERMINAL_PROMPT: '0', ...env } },
      (err, stdout, stderr) => {
        if (err?.killed) return reject(new GitTimeout(`git ${args[0]} in ${dir} took over ${timeout! / 1000}s`))
        if (err && typeof err.code !== 'number') return reject(err)
        resolve({ stdout, stderr, code: err ? (err.code as number) : 0 })
      },
    )
  })

/** Git, its exit code returned for the caller to read; a timeout throws `GitTimeout`. */
export const run = (dir: string, args: string[], timeout?: number): Promise<Run> => exec(dir, args, timeout, {})

/** Git that must succeed, with `env` added to its environment: a failure throws with its stderr. */
export const gitWith = (env: NodeJS.ProcessEnv) => async (dir: string, args: string[]): Promise<string> => {
  const r = await exec(dir, args, undefined, env)
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} in ${dir}: ${r.stderr.trim()}`)
  return r.stdout
}

/** Git that must succeed: a failure throws with its stderr. */
export const git = gitWith({})
