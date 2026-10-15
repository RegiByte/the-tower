---
{
  "type": "decision",
  "name": "Logs are the facts; everything else is derived",
  "summary": "Three kinds of stored state: the config (intent), the append-only logs (facts, one writer per log) and the collections (files kept for later); status, facts, screens, resume chains and the workers they make (callsign and showings across resumes) are computed from them.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-09-30",
  "reviewed": "2026-10-15",
  "refs": ["hub/src/shared/model.ts#LogEvent", "hub/src/bridge/facts.ts#factsOf", "hub/src/bridge/chains.ts#resumes"]
}
---
**Context.** Renderers come and go, and what a renderer wants to show keeps changing (status, waiting on
you, cost, resume chains). Stored derived state goes stale and needs migrations.

**Decision.** The host appends every fact about a session to one asciicast-shaped log: output, input,
resizes, hook and mod events, exit. Nothing else about a session is stored. Which session resumes which is
derived from Claude's `session_id` in the hooks, never written down.

**Alternatives considered.** A status database or per-session state file updated by the host: rejected, it
puts interpretation in the one process that cannot be restarted cheaply.

The rule as it stands, with the decisions that shaped it:

- **Three kinds of stored state.** The collections ([[collections]]) are the third: files a project keeps for later
  (unsent prompts among them), which are neither intent nor facts about a session.
- **A fact is what happened, not a copy.** The host logs `PostToolUse` without its `tool_response`, which Claude's own
  transcript keeps ([[log-diet]]).
- **A cache is not state.** A fold's result at a byte offset of a log is a cache: logs are append-only, so a checkpoint
  keyed by its log, offset and the code that made it stays valid; it is never authoritative, always safe to delete,
  and recomputed from the log when missing ([[fold-checkpoints]]).
- **One writer per log.** The host writes the session logs (`sessions/`) and stays the single writer of everything
  about a session; the tower writes the logs of what it observes that belong to no session, and each project's
  (`streams/`, [[probes]], [[policies]]). A stream is a log.

**Consequences.** A new fact is a new fold step, and it applies to every past session retroactively. Logs
are replayed to answer questions, which costs time on large logs (`/screen` replays the whole log).
