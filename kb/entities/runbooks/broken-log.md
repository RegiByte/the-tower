---
{
  "type": "runbook",
  "name": "A worker reads broken",
  "summary": "A card that reads broken has an event in its log the tower can't fold: its facts stop there and the reason is its gist. Drive or kill it while it runs, then resume its conversation into a new log.",
  "in": "tower",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/bridge/facts.ts#factsAfter", "hub/src/shared/cards.ts#statusTitle", "hub/src/bridge/verbs.ts#cardVerbs", "hub/src/cli.ts"]
}
---
**Symptom.** A worker's lamp is red and its status word is `broken`; its line reads `× log unreadable past a hook
(<time>): <error>`, and hovering the status says what follows. `tower ls` prints `broken` and `its log breaks at
<seconds>s: <error>`. Everything else in the tower carries on ([[broken-logs]]).

**Where to look first.** The session's log, `<root>/sessions/<id>.jsonl`: the event at the time the line names (`t`,
seconds since the start) is the one the fold threw on. Compare its payload with what Claude sends for that hook.

**Likely causes.**
- A hook posted by hand or by a script, missing fields Claude always sends (a `Stop` without `background_tasks`).
- A Claude Code release that changed a payload's shape: check its version on the card against the tested range
  ([[new-claude-release]]).
- A bug in the fold step: a new fold over an event it didn't expect.

**What to do.** Its status, cost and answers stand as they were before the event. While the host runs it, it can
still be driven (Claude itself is fine) and killed. Once it no longer runs it reads `lost` and broken, and offers
resume: the resumed session starts a new log, carries the same callsign and folds normally. The broken log stays as
it is, a fact; Tidy archives it once the worker is off duty and older than the retention. If the cause is the fold,
fix the step and every checkpoint retires with the code that made it ([[fold-checkpoints]]): the log folds again
from its start at the next read.
