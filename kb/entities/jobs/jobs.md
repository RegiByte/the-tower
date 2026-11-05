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

A job's state is derived, never logged ([`jobState`](ref:hub/src/bridge/jobs.ts#jobState)): `ended` or `cancelled`
from its facts, and without an end, `running` while the daemon holds it, `lost` once it doesn't, as a session is lost
once the host doesn't run it.
