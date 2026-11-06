/**
 * A job's process group, found again after the daemon that started it died. Each job leads its own group on its PTY
 * (`pgid == pid`). A daemon killed outright takes its jobs with it as their PTYs hang up, except a job that ignores
 * SIGHUP and what it started: those live on in the job's group, and the next daemon ends them.
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { signalGroup } from '../signal-group.ts'

const run = async (file: string, args: string[]): Promise<string> => (await promisify(execFile)(file, args, { encoding: 'utf8' })).stdout

/**
 * When the machine booted, epoch ms: a job started before it is dead, and its pid is someone else's now. Read the same
 * on every Linux, WSL's and CI's.
 */
export const bootTime = async (): Promise<number> => {
  if (process.platform === 'darwin') {
    const boot = /sec = (\d+)/.exec(await run('sysctl', ['-n', 'kern.boottime']))
    if (!boot) throw new Error('sysctl kern.boottime printed no "sec ="')
    return Number(boot[1]) * 1000
  }
  const boot = /^btime (\d+)$/m.exec(readFileSync('/proc/stat', 'utf8'))
  if (!boot) throw new Error('/proc/stat has no btime line')
  return Number(boot[1]) * 1000
}

/** `ps`'s elapsed time, `[[dd-]hh:]mm:ss`, in ms. */
const elapsedMs = (etime: string): number => {
  const [days, clock] = etime.includes('-') ? etime.split('-') : ['0', etime]
  const [s = 0, m = 0, h = 0] = clock.split(':').map(Number).reverse()
  return (((Number(days) * 24 + h) * 60 + m) * 60 + s) * 1000
}

/** A process of a group, and when it started (epoch ms, to the second, rounded late). */
export type Member = { pid: number; startedAt: number }

/** The processes in group `pgid`, from `ps -A -o pid=,pgid=,etime=` read at `now`. */
export const membersIn = (ps: string, pgid: number, now: number): Member[] =>
  ps
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length === 3 && Number(cols[1]) === pgid)
    .map(([pid, , etime]) => ({ pid: Number(pid), startedAt: now - elapsedMs(etime) }))

const groupMembers = async (pgid: number): Promise<Member[]> => {
  const ps = await run('ps', ['-A', '-o', 'pid=,pgid=,etime='])
  return membersIn(ps, pgid, Date.now())
}

/** `ps` counts whole seconds, and the job's process starts just after its `started` is timed. */
const CLOCK_SLACK_MS = 2000

/**
 * The job's group: empty once it is gone, or when it is someone else's. No process takes a pid that still names a
 * group, so a group that never emptied is still the job's, and every member of it started at or after the job. One
 * that emptied lets its pid go to another process, which may lead a group of its own (a terminal's shell): while the
 * group's leader runs, it is the job only if it started with the job.
 */
export const jobGroup = async (pgid: number, startedAt: number): Promise<Member[]> => {
  const members = await groupMembers(pgid)
  const leader = members.find((m) => m.pid === pgid)
  const ours = members.every((m) => m.startedAt >= startedAt - CLOCK_SLACK_MS) && (!leader || leader.startedAt <= startedAt + CLOCK_SLACK_MS)
  return ours ? members : []
}

/** How long a group has to end on SIGTERM before it gets SIGKILL: git clone removes its partial folder on TERM. */
export const TERM_GRACE_MS = 5000

const GROUP_POLL_MS = 200

/**
 * Ends a job's group: SIGTERM, then SIGKILL to whatever still runs in it after `TERM_GRACE_MS`. The group decides, not
 * its leader: a member that ignores TERM outlives a leader that ends on it. Answers how many members it found.
 */
export const endGroup = async (pgid: number, startedAt: number): Promise<number> => {
  const found = await jobGroup(pgid, startedAt)
  if (!found.length) return 0
  signalGroup(pgid, 'SIGTERM')
  for (const deadline = Date.now() + TERM_GRACE_MS; Date.now() < deadline; await new Promise((resolve) => setTimeout(resolve, GROUP_POLL_MS)))
    if (!(await jobGroup(pgid, startedAt)).length) return found.length
  if ((await jobGroup(pgid, startedAt)).length) signalGroup(pgid, 'SIGKILL')
  return found.length
}
