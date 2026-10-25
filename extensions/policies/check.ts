/** A policy's check: its line run with `sh -c` from the floor's hub, as the policies extension runs it at a slot. */
import type { RunResult, StartCtx } from '../../src/shared/extensions.ts'
import type { CheckResult } from './policies.ts'

export const CHECK_TIMEOUT_MS = 60_000
const OUT_MAX = 2048
const STDERR_MAX = 500

/**
 * A check through `ctx.run` (env scrubbed, killed by pid past its timeout). Its stdout is kept when it finds work, the
 * end of its stderr when it fails.
 */
export const runCheck = async (run: StartCtx['run'], line: string, cwd: string): Promise<CheckResult> => {
  const started = Date.now()
  let ran: RunResult
  try {
    ran = await run(['sh', '-c', line], { cwd, timeoutMs: CHECK_TIMEOUT_MS })
  } catch (err) {
    return { ms: Date.now() - started, error: `could not start: ${(err as Error).message}` }
  }
  const { exit, signal, ms, timedOut } = ran
  const out = ran.stdout.slice(0, OUT_MAX).trim()
  const err = ran.stderr.slice(-STDERR_MAX).trim()
  const stderr = err ? { stderr: err } : {}
  if (timedOut) return { ms, error: `timed out after ${CHECK_TIMEOUT_MS / 1000}s`, ...stderr }
  if (exit === null) return { ms, error: `ended by ${signal}`, ...stderr }
  if (exit === 0) return { exit: 0, ms, ...(out && { out }) }
  return { exit, ms, ...(exit === 1 ? {} : stderr) }
}
