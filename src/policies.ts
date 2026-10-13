/**
 * The tower's runner: on a tick it reads the board and, floor by floor, what its policies' due slots get (`decide`):
 * the checks it asks for are run here, then each run or pass goes through the public verbs, as any other runner's
 * would. It holds only the checks' results until their slots are past.
 */
import { spawn } from 'node:child_process'
import type { Board, Floor } from './bridge/board.ts'
import type { CheckResult } from './bridge/policies.ts'
import type { RouteInput } from './shared/api.ts'
import { withoutParentSession } from './shared/env.ts'
import { checkKey, decide, ON_TIME_MS, type Action } from './shared/policies.ts'

const TICK_MS = 30_000
const CHECK_TIMEOUT_MS = 60_000
const OUT_MAX = 2048
const STDERR_MAX = 500

type Reply = { t: string; message?: string }

/**
 * A check: its line run with `sh -c` from the floor's hub, its env the tower's with the parent session scrubbed, and
 * its process group killed by its pid if it has not exited within the timeout. Its stdout is kept when it finds work,
 * the end of its stderr when it fails.
 */
export const runCheck = (line: string, cwd: string): Promise<CheckResult> =>
  new Promise((resolve) => {
    const started = Date.now()
    const child = spawn('sh', ['-c', line], { cwd, env: withoutParentSession(process.env), stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    let out = ''
    let err = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      process.kill(-child.pid!, 'SIGKILL')
    }, CHECK_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => (out = (out + chunk).slice(0, OUT_MAX)))
    child.stderr.on('data', (chunk) => (err = (err + chunk).slice(-STDERR_MAX)))
    child.on('error', (e) => (clearTimeout(timer), resolve({ ms: Date.now() - started, error: `could not start: ${e.message}` })))
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      const ms = Date.now() - started
      const stderr = err.trim() ? { stderr: err.trim() } : {}
      if (timedOut) return resolve({ ms, error: `timed out after ${CHECK_TIMEOUT_MS / 1000}s`, ...stderr })
      if (code === null) return resolve({ ms, error: `ended by ${signal}`, ...stderr })
      if (code === 0) return resolve({ exit: 0, ms, ...(out.trim() && { out: out.trim() }) })
      resolve({ exit: code, ms, ...(code === 1 ? {} : stderr) })
    })
  })

/**
 * Runs the tower's runner until the process ends. `run` and `pass` are the verbs `policy/run` and `policy/pass`; a
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
  setInterval(() => void tick().catch((err) => console.error('policies:', err)), TICK_MS)
}
