/**
 * The tower's runner: on a tick it reads the board and, floor by floor, what its policies' due slots get (`decide`):
 * the checks it asks for are run here, then each run or pass goes through the public verbs, as any other runner's
 * would. It holds only the checks' results until their slots are past.
 */
import type { Board, Floor } from './bridge/board.ts'
import type { CheckResult } from './bridge/policies.ts'
import type { RouteInput } from './shared/api.ts'
import { runProcess } from './run.ts'
import type { RunResult } from './shared/extensions.ts'
import { checkKey, decide, ON_TIME_MS, type Action } from './shared/policies.ts'

const TICK_MS = 30_000
const CHECK_TIMEOUT_MS = 60_000
const OUT_MAX = 2048
const STDERR_MAX = 500

type Reply = { t: string; message?: string }

/**
 * A check: its line run with `sh -c` from the floor's hub (`runProcess`: env scrubbed, killed by pid past its timeout).
 * Its stdout is kept when it finds work, the end of its stderr when it fails.
 */
export const runCheck = async (line: string, cwd: string): Promise<CheckResult> => {
  const started = Date.now()
  let ran: RunResult
  try {
    ran = await runProcess(['sh', '-c', line], { cwd, timeoutMs: CHECK_TIMEOUT_MS })
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

/**
 * Runs the tower's runner until stopped. `run` and `pass` are the verbs `policy/run` and `policy/pass`; a
 * refusal goes to the tower's log, and the slot is decided again at the next tick while it is on time.
 */
export const runPolicies = (
  board: () => Board,
  verbs: { run: (input: RouteInput['policy/run']) => Promise<Reply>; pass: (input: RouteInput['policy/pass']) => Promise<Reply> },
) => {
  const checked = new Map<string, CheckResult>()
  let ticking = false

  const act = async (project: string, action: Exclude<Action, { t: 'check' }>) => {
    const reply =
      action.t === 'run'
        ? await verbs.run({ project, policy: action.policy, start: 'auto', slot: action.slot, ...(action.check && { check: action.check }) })
        : await verbs.pass({ project, policy: action.policy, slot: action.slot, outcome: action.outcome, ...(action.check && { check: action.check }) })
    if (reply.t === 'error') console.error(`policies: ${project}/${action.policy} ${action.t} at ${new Date(action.slot).toISOString()}: ${reply.message}`)
  }

  /** A floor's actions: its checks first, then what it decides once they ran, on the board as it is then. */
  const floorTick = async (floor: Floor) => {
    const checks = decide(floor, checked, Date.now()).flatMap((a) => (a.t === 'check' ? [a] : []))
    await Promise.all(checks.map(async ({ policy, slot, line }) => checked.set(checkKey(policy, slot), await runCheck(line, floor.hub))))
    const now = board().floors.find((f) => f.id === floor.id)
    if (!now) return
    for (const action of decide(now, checked, Date.now())) if (action.t !== 'check') await act(floor.id, action)
  }

  const tick = async () => {
    if (ticking) return
    ticking = true
    try {
      for (const floor of board().floors) if (floor.policies.length) await floorTick(floor)
      for (const key of checked.keys()) if (Date.now() - Number(key.slice(key.lastIndexOf('@') + 1)) > ON_TIME_MS + TICK_MS) checked.delete(key)
    } finally {
      ticking = false
    }
  }
  const ticks = setInterval(() => void tick().catch((err) => console.error('policies:', err)), TICK_MS)
  /** No more ticks: a tick in flight finishes its floors. */
  return { stop: () => clearInterval(ticks) }
}
