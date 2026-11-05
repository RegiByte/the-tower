/**
 * Jobs: one command run to its end by the jobs daemon, outside the tower, in a PTY nobody types into. What happened to
 * each is a fact in the jobs log (`jobs/YYYY-MM.jsonl`, the streams' format), which the daemon alone writes; its
 * screen lives in the daemon's memory while it runs and for `JOB_KEEP_MS` after.
 */

/**
 * What starts a job. `argv` is kept in the jobs log, which every renderer and worker reads, for as long as the log is
 * kept: a secret goes in `env`, which is set over the daemon's scrubbed environment and never logged. Nothing can
 * answer a prompt, so `env` is also how a caller stops one (`GIT_TERMINAL_PROMPT=0`). `owner` is who started it: an
 * extension's capability, `user`, or a worker's session.
 */
export type JobStart = { argv: string[]; cwd: string; env?: Record<string, string>; owner: string; label: string }

/** How a job ended: a signal by name with no exit status, or an exit status with no signal. */
export type JobEnd = { exit: number; signal: null } | { exit: null; signal: string }

/** The facts of the jobs log, each `[t, code, fact]` in the streams' format. */
export type JobFact =
  /** Written as the job is spawned, before anyone is told it started. `pid` is also its process group. */
  | ['started', { id: string; pid: number; argv: string[]; cwd: string; owner: string; label: string }]
  /** Someone asked the job to stop; its `ended` follows. */
  | ['cancelled', { id: string; by: string }]
  | ['ended', { id: string } & JobEnd]

/** A job the daemon holds: running, or ended with its screen still kept. */
export type HeldJob = { id: string; pid: number; startedAt: number; cols: number; rows: number; endedAt?: number }

/** Control messages to the jobs daemon. Every request gets exactly one reply, in order, except `attach`. */
export type ToJobs =
  | ({ t: 'start' } & JobStart)
  | { t: 'cancel'; id: string; by: string }
  | { t: 'resize'; id: string; cols: number; rows: number }
  | { t: 'list' }
  /** Turns the connection into the job's stream (see JobStream) until either side closes it. */
  | { t: 'attach'; id: string }

export type FromJobs =
  | { t: 'started'; id: string }
  | { t: 'ok' }
  | { t: 'jobs'; jobs: HeldJob[] }
  /**
   * `not_found`: the message names a job the daemon doesn't hold, or `argv[0]` is no program on the job's PATH.
   * `ended`: a cancel or resize of a job that already ended.
   */
  | { t: 'error'; message: string; code?: 'not_found' | 'ended' }

/** A snapshot of the job's screen, then its output, resizes and end as they happen; a job already ended sends its end right after the snapshot. */
export type JobStream =
  | { t: 'snapshot'; data: string; cols: number; rows: number }
  | { t: 'o'; data: string }
  | { t: 'r'; cols: number; rows: number }
  | ({ t: 'x' } & JobEnd)
  | { t: 'error'; message: string }

/** Jobs start at this size: tools print progress only to a terminal, and a viewer fits it to its pane. */
export const JOB_SIZE = { cols: 120, rows: 40 }

/** How long an ended job's screen stays to be read, and how many ended screens at most. */
export const JOB_KEEP_MS = 10 * 60_000
export const JOB_KEEP_COUNT = 20
