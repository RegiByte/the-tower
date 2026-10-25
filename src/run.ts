/**
 * A command the tower runs and waits on: a policy's check, an extension's check and `ctx.run`. Its env is the tower's,
 * with what the caller sets over it, and the parent session scrubbed (decision `env-scrub`), and it runs in a process group of its own, killed by its
 * pid when it outlives its timeout or its `signal` aborts, so nothing it started is left behind.
 */
import { spawn } from 'node:child_process'
import { withoutParentSession } from './shared/env.ts'
import type { RunResult } from './shared/extensions.ts'

/** The most of each stream kept: stdout's beginning, stderr's end. */
const KEPT = 64 * 1024

export type RunOptions = { cwd: string; timeoutMs: number; stdin?: string; env?: Record<string, string>; signal?: AbortSignal }

/** Runs `argv` to its end; rejects when it can't start (`ENOENT`: not on the PATH). */
export const runProcess = (argv: string[], { cwd, timeoutMs, stdin, env, signal }: RunOptions): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const started = Date.now()
    const child = spawn(argv[0], argv.slice(1), { cwd, env: withoutParentSession({ ...process.env, ...env }), stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], detached: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const kill = () => {
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeoutMs)
    signal?.addEventListener('abort', kill, { once: true })
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', kill)
    }
    child.stdout!.on('data', (chunk) => (stdout = (stdout + chunk).slice(0, KEPT)))
    child.stderr!.on('data', (chunk) => (stderr = (stderr + chunk).slice(-KEPT)))
    child.stdin?.end(stdin)
    child.on('error', (err) => (done(), reject(err)))
    child.on('close', (exit, killedBy) => {
      done()
      resolve({ exit, ...(killedBy && { signal: killedBy }), stdout, stderr, ms: Date.now() - started, timedOut })
    })
  })
