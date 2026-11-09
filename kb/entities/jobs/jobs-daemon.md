---
{
  "type": "container",
  "name": "Jobs daemon",
  "summary": "The detached Node process that runs each job, one command, to its end in a PTY nobody types into, streams its screen to viewers, and is the one writer of the jobs log.",
  "in": "jobs",
  "reviewed": "2026-11-09",
  "refs": ["hub/src/jobs/main.ts#startJob", "hub/src/jobs/main.ts#cancelJob", "hub/src/jobs/main.ts#attach", "hub/src/jobs/main.ts#endLeftovers", "hub/src/jobs/main.ts#keep", "hub/src/jobs/main.ts#programFile", "hub/src/jobs/main.ts#jobEnd", "hub/src/jobs/groups.ts#jobGroup", "hub/src/jobs/groups.ts#endGroup", "hub/src/jobs/groups.ts#endGroupWithin", "hub/src/jobs/groups.ts#bootTime", "hub/src/shared/jobs.ts#ToJobs", "hub/src/shared/jobs.ts#JobFact", "hub/src/shared/jobs.ts#JobStream", "hub/src/shared/viewers.ts#joinViewer", "hub/src/bridge/jobs.ts#jobsOf", "hub/test/jobs-daemon.test.ts"],
  "links": [
    { "to": "system-root", "verb": "writes", "carries": "jobs/YYYY-MM.jsonl in the streams' format: started {id, pid, argv, cwd, owner, label}, cancelled {id, by}, ended {id, exit, signal}" },
    { "to": "system-root", "verb": "reads", "carries": "every month of jobs/ on start, archived ones too: the jobs an earlier daemon left without an end" }
  ]
}
---
Started by `tower up` or `npm run jobs` ([[bring-up]]). `jobs.sock` takes newline-delimited JSON, one reply per
request in order ([`ToJobs`](ref:hub/src/shared/jobs.ts#ToJobs)): `start | cancel | resize | list | attach`. There is
no `write`: nobody types into a job.

- **Start** ([`startJob`](ref:hub/src/jobs/main.ts#startJob)) takes `{argv, cwd, env?, owner, label}`. It refuses an
  argv that is no list of strings, a cwd that isn't an absolute folder that exists (any folder: a clone runs in the
  parent of a folder that doesn't exist yet), and a program not found from the cwd or on the job's PATH, `not_found`
  ([`programFile`](ref:hub/src/jobs/main.ts#programFile)): node-pty runs a missing program as a job that exits 1. The
  job runs at [`JOB_SIZE`](ref:hub/src/shared/jobs.ts#JOB_SIZE) in a PTY, since tools print progress only to a terminal, with `env` set over the daemon's
  environment scrubbed of the parent session and the launching terminal ([[env-scrub]]). Its `started` is appended
  synchronously right after the spawn, before the reply, with the pid, which is also its process group.
- **Its end** is appended as `ended`, normalized from node-pty's pair ([`jobEnd`](ref:hub/src/jobs/main.ts#jobEnd)):
  a signal by name and `exit: null`, or the exit status and `signal: null`. Never a verdict. An append that fails is said in the daemon's log, and the job still ends for its viewers and its held list.
- **Cancel** appends `cancelled {id, by}`, then sends the job's group SIGTERM and, after
  [`TERM_GRACE_MS`](ref:hub/src/jobs/groups.ts#TERM_GRACE_MS), SIGKILL to what still runs in the group ([`cancelJob`](ref:hub/src/jobs/main.ts#cancelJob), [`endGroup`](ref:hub/src/jobs/groups.ts#endGroup), which is [`endGroupWithin`](ref:hub/src/jobs/groups.ts#endGroupWithin) the grace):
  the group decides, not its leader, since a member that ignores TERM outlives a leader that ends on it. Its `ended`
  follows when the leader exits. A cancel or resize of a job that
  already ended is refused, `ended`. Stopping the daemon (`tower down jobs`) stops every running job the same way and
  exits once their groups have ended and their ends are written.
- **Attach** turns the connection into the job's stream ([`JobStream`](ref:hub/src/shared/jobs.ts#JobStream)): a
  snapshot, then `o`, `r` and `x` as they happen, held and sent in order as terms does
  ([`joinViewer`](ref:hub/src/shared/viewers.ts#joinViewer)); a job already ended sends its `x` right after the
  snapshot. An ended job's screen is kept for a while, only the last few
  ([`keep`](ref:hub/src/jobs/main.ts#keep)), each with the shells' scrollback; all are gone when the daemon restarts.
- **List** answers the jobs it holds, running or kept, which is what tells a job running from a job lost.

**After a crash.** Each job leads its own session on its PTY, so a daemon killed outright takes its jobs with it as
their PTYs hang up, except a job that ignores SIGHUP and what it started. On start, the daemon reads every month of the jobs log,
archived ones too since a job's end may fall in a later month than its start, for jobs without an end ([`jobsOf`](ref:hub/src/bridge/jobs.ts#jobsOf)) and ends what is left of each
([`endLeftovers`](ref:hub/src/jobs/main.ts#endLeftovers)): one started before the machine booted is skipped
([`bootTime`](ref:hub/src/jobs/groups.ts#bootTime)); otherwise its group is listed by exact pgid and taken as the
job's only while every member started at or after the job, since no process takes a pid that still names a group, and
while its leader, if it runs, started with the job: a group that emptied gave its pid away, perhaps to a terminal's
shell leading a group of its own ([`jobGroup`](ref:hub/src/jobs/groups.ts#jobGroup)). Then it is ended as a cancel ends it
([`endGroup`](ref:hub/src/jobs/groups.ts#endGroup)). git clone removes its partial folder on TERM. This is an action,
never a fact: such a job stays without an end, and reads as lost. A process that leaves the job's group (`setsid`, a
server that daemonizes) is not followed. The [integration tests](ref:hub/test/jobs-daemon.test.ts) hold both
halves, and a cancel's whole-group end, on whatever runs the tests, CI's Linux included; the SIGKILL after a grace is held in-process against `endGroupWithin` with a short one.
