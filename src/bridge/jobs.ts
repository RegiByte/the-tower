/**
 * The jobs log folded: each job as its facts say, and its state derived with what the jobs daemon holds now. Nothing
 * here is logged: a job whose end was never written is `lost` once the daemon doesn't hold it, as a session is once
 * the host doesn't run it (`withLiveness`).
 */
import type { JobEnd, JobFact } from '../shared/jobs.ts'
import type { StreamFact } from './streams.ts'

/** A job as the log tells it. Times are epoch ms. */
export type JobRecord = {
  id: string
  pid: number
  argv: string[]
  cwd: string
  owner: string
  label: string
  startedAt: number
  cancelled?: { by: string; at: number }
  ended?: JobEnd & { at: number }
}

/** `cancelled`: it ended after someone asked it to stop. `lost`: its end was never written, and the daemon doesn't hold it. */
export type JobState = 'running' | 'ended' | 'cancelled' | 'lost'

/** Every job the facts start, in the order they started. A fact about a job no `started` began, or of a code the log never holds, throws. */
export const jobsOf = (facts: StreamFact[]): JobRecord[] => {
  const jobs = new Map<string, JobRecord>()
  const job = (id: string, code: string): JobRecord => {
    const found = jobs.get(id)
    if (!found) throw new Error(`The jobs log has "${code}" for job "${id}", which no "started" before it began`)
    return found
  }
  for (const [at, ...[code, fact]] of facts as [number, ...JobFact][]) {
    switch (code) {
      case 'started':
        jobs.set(fact.id, { ...fact, startedAt: at })
        break
      case 'cancelled':
        jobs.set(fact.id, { ...job(fact.id, code), cancelled: { by: fact.by, at } })
        break
      case 'ended': {
        const { id, ...end } = fact
        jobs.set(id, { ...job(id, code), ended: { ...end, at } })
        break
      }
      default:
        throw new Error(`The jobs log holds a fact "${code as string}", which no jobs daemon writes`)
    }
  }
  return [...jobs.values()]
}

/** `held`: the ids the jobs daemon holds now; `undefined` while it isn't running, when every job not ended is lost. */
export const jobState = (job: JobRecord, held: ReadonlySet<string> | undefined): JobState =>
  job.ended ? (job.cancelled ? 'cancelled' : 'ended') : held?.has(job.id) ? 'running' : 'lost'

/** A job as renderers and extensions read it: its facts and its state, its end flattened. Times are epoch ms. */
export type Job = {
  id: string
  owner: string
  label: string
  argv: string[]
  cwd: string
  state: JobState
  startedAt: number
  /** When it ended; none while it runs, or when it was lost. */
  endedAt?: number
  /** Its exit status, `null` when a signal ended it; none until it ended. */
  exit?: number | null
  /** The signal that ended it, by name, `null` when it exited; none until it ended. */
  signal?: string | null
}

/** Every job, newest first, each in its state: `held`, the ids the jobs daemon holds now (`jobState`). */
export const jobsNow = (jobs: JobRecord[], held: ReadonlySet<string> | undefined): Job[] =>
  jobs
    .map((job) => {
      const { id, owner, label, argv, cwd, startedAt, ended } = job
      return { id, owner, label, argv, cwd, state: jobState(job, held), startedAt, ...(ended && { endedAt: ended.at, exit: ended.exit, signal: ended.signal }) }
    })
    .sort((a, b) => b.startedAt - a.startedAt)

const DAY_MS = 86_400_000

/** The jobs the board keeps: running, or over within the last day (a lost one by when it started). */
export const recentJobs = (jobs: Job[], now: number): Job[] => jobs.filter((j) => j.state === 'running' || (j.endedAt ?? j.startedAt) > now - DAY_MS)
