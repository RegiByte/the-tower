---
{
  "type": "decision",
  "name": "A worker's callsign is read from its log",
  "summary": "The board names a worker by the --name its first session's Claude ran under, read from that log's header argv; only a log from before sessions were named derives its callsign from its id. A changed callsigns list names new workers only.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-10",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/bridge/chains.ts#workerName", "hub/src/bridge/chains.ts#runsAs", "hub/src/bridge/chains.ts#namer", "hub/src/bridge/chains.ts#resumeName", "hub/src/shared/launch.ts#spawnRequest"]
}
---
**Problem.** Callsigns were derived from the session id over the current names list every time a board was built. Any
change to the list (the tower's `CALLSIGNS` or the config's `callsigns`) renamed past and running workers alike:
adding 74 names to 81 would have renamed 208 of 432 real sessions. A running worker kept the `--name` it started with,
so its card and its peer name split, and review notes signed with the old callsign pointed at a worker the board now
called something else.

**Why.** Every spawn and resume already passes the callsign to Claude as `--name`, and the host keeps the argv in the
log's header. The name a worker ran under is a fact in its log ([[logs-are-facts]]); deriving it again from a list that
can change computes something the log already says, and can say it wrongly.

**How.** [`workerName`](ref:hub/src/bridge/chains.ts#workerName) takes the first session of the worker's lineage and
reads its `--name` ([`runsAs`](ref:hub/src/bridge/chains.ts#runsAs)); a log without one (written before 2026-10-04)
falls back to the id's callsign over the current list. [`namer`](ref:hub/src/bridge/chains.ts#namer) (the board, kept
items, hires, briefs) and [`resumeName`](ref:hub/src/bridge/chains.ts#resumeName) (the name a carry-on resume runs
under) both go through it. The first session's stamp, not each session's own: a few continuations recorded before
resumes carried their worker's name were stamped with their own, and a worker keeps its first session's callsign
([[callsign]]). Since then a continuation's stamp is its first session's anyway.

**Alternatives considered.**

- *A new `tower.name` fact in the log.* Rejected: `--name` in the header argv already records it from the first
  moment, so a new event would store the same fact twice and need a host or mod change.
- *Names lists versioned by the start time in the id* (names added at a release only compete for ids after it).
  Rejected: a dated generation concept in the config and code for what the log already holds.
- *Each session's own stamp.* Rejected: it splits a worker whose continuation was recorded before resumes carried the
  worker's name.

**Impact.** Changing `callsigns` renames no worker named since 2026-10-04, running or past; it names new workers only.
On the real logs at the change, 18 sessions from 2026-10-04/05 got back the names they ran under (the default list was
different then) and the 59 logs from before naming still derive theirs. A name removed from the list keeps naming the
workers that ran under it.
