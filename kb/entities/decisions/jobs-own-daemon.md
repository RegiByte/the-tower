---
{
  "type": "decision",
  "name": "Jobs run in a daemon of their own, which writes their facts",
  "summary": "A long-lived command (a clone, an install, a build) runs as a job in the jobs daemon, not as the tower's child: the daemon is the one writer of the jobs log, which keeps each job's start, cancel and end, its argv but never its env or output; running, ended and lost are derived from the log and the daemon's list.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-04",
  "reviewed": "2026-11-06",
  "refs": ["hub/src/jobs/main.ts", "hub/src/shared/jobs.ts#JobStart", "hub/src/shared/jobs.ts#JobFact", "hub/src/bridge/jobs.ts#jobState", "hub/src/machine.ts#daemons", "hub/src/update.ts#updateJobs"]
}
---
**Problem.** Some work outlives a request: a `git clone`, a dependency install for a new floor, a build. Run as a
child of the tower (`ctx.run`), it dies with every tower or extension restart, is orphaned on a crash, is invisible to
the user, and keeps its result in a promise a restart loses.

**Why.** A job's outcome has to survive the tower, so it has to be written down by something that outlives the tower,
and read back like every other fact ([[logs-are-facts]]).

**How.**

- **A daemon of its own** ([[jobs-daemon]]), a fourth beside the host, terms and the tower in `daemons()`, so
  `tower up`/`down`, setup, the sandbox and the doctor bring it up and check it with the others ([[bring-up]]).
- **One writer, facts only.** It alone appends to `jobs/YYYY-MM.jsonl`, in the streams' format, so it is read and
  kept as a stream is. Its facts are events: `started`, `cancelled` (the request; its `ended` follows) and `ended`
  (the exit status or the signal). `lost` is never logged: it is derived, a job without an end that the daemon's
  `list` doesn't hold, as a session's is from the host's live set ([`jobState`](ref:hub/src/bridge/jobs.ts#jobState)).
- **argv is kept, env and output never.** The log keeps each job's argv as long as the log is kept, and every renderer
  and worker reads it: a secret goes in `env`, set over the scrubbed environment and never logged
  ([`JobStart`](ref:hub/src/shared/jobs.ts#JobStart)). Output is not logged, not even a tail: a PTY merges stdout and
  stderr, tools echo tokens and URLs with credentials, and a tail is mostly progress-bar residue. Whoever wants to keep
  why a job failed reads its screen while the daemon keeps it and records its own conclusion in its own stream.
- **No input.** A job's PTY lets git and ssh prompt on `/dev/tty`, and nothing can answer: the caller's `env` is the
  stop (`GIT_TERMINAL_PROMPT=0`, `GIT_SSH_COMMAND='ssh -o BatchMode=yes'`).
- **What a job leads to is its reader's.** A reaction reads the ended jobs, acts through a verb of its own, and
  records what it did, keyed by the job, in its own stream: no core fact says a job was handled, and several readers
  may react to one job, each idempotent on its own record.
- **Updates.** `tower update` restarts the jobs daemon when its code changed since it started and it runs no job, and
  says so otherwise, as it does for the host ([`updateJobs`](ref:hub/src/update.ts#updateJobs)): a restart ends every
  running job.

- **The tower's verbs.** `job/start` and `job/cancel` act for their caller, who owns the job. They do no more than
  `spawn` can, so the same-user trust and the Origin rules cover them ([[agents-have-every-capability]]). Extensions
  start jobs through `ctx.jobs`, owned by their capability; `ctx.run` stays for short commands.

**Alternatives considered.**

- **Jobs in terms.** Terms keeps the user's shells and never logs, on purpose, since users paste credentials into
  shells; jobs exist to log. Apart, updating one doesn't end the other's work, and an interactive shell and a command
  run to its end have different lives. They share modules in `src/shared`, not a process.
- **Jobs in the host.** A host change ends every session, the host logs every output byte, and a job would become a
  card shaped like a session ([[host-owns-ptys]]).
- **Terms runs the PTY and the tower writes the facts.** An end while the tower is down would live only in terms'
  memory, lost if terms restarts.
- **A `lost` fact written by the next daemon.** It records an interpretation; deriving it needs nothing written.
- **A tail of the output in `ended`.** Rejected with output above.

**Consequences.** The log format is a contract read by every renderer and extension. A tower restart no longer stops a
job; a jobs daemon restart does, and a job's screen is lost with it. The tower's side, the verbs, `board.jobs` and the
extensions' `ctx.jobs`, reads this log and the daemon's list ([[jobs]]).
