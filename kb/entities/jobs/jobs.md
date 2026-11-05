---
{
  "type": "system",
  "name": "Jobs",
  "summary": "Commands run to their end outside the tower, each a job whose start, cancel and end are facts in the jobs log, so a clone or a build outlives a tower restart and its outcome survives it.",
  "in": "tower",
  "reviewed": "2026-11-05"
}
---
The [[jobs-daemon]] is the only part, and the only writer of the jobs log in [[system-root]]. A job is one command
run to its end: what happened to it is a fact, and what it leads to is decided by whoever reads those facts and
records what it did in its own stream ([[jobs-own-daemon]]). A job's screen lives in the daemon's memory while it runs
and for a while after; its output is never logged.

**The tower's side.** The tower watches `jobs/` and polls the daemon's `list` beside the shells ([[live-system]]).
The board's `jobs` holds every owner's jobs running or over within the last day, newest first, and `jobsUp` whether
the daemon answers; `GET /jobs` holds them all ([`jobsNow`](ref:hub/src/bridge/jobs.ts#jobsNow),
[`recentJobs`](ref:hub/src/bridge/jobs.ts#recentJobs)). `job/start {argv, cwd, env?, label}` and `job/cancel {id}` act
for their caller, who owns the job: a worker's session, an extension's capability (`ctx.jobs`, as the capability even
inside a handler answering someone else), or the user. A job answers once the tower holds it, since the daemon logs
its start before replying. Its screen streams at `/job/<id>/screen`, and on the mux; a view draws it with the kit's
`terminal(host, 'job/<id>')`, read only and at the job's size, as floors' Watch does ([[new-floors]]). Tidy archives the log's closed
months with the system's streams ([[log-retention]]).

A job's state is derived, never logged ([`jobState`](ref:hub/src/bridge/jobs.ts#jobState)): `ended` or `cancelled`
from its facts, and without an end, `running` while the daemon holds it, `lost` once it doesn't, as a session is lost
once the host doesn't run it.
