---
{
  "type": "decision",
  "name": "Logs are the facts; everything else is derived",
  "summary": "The only stored state is the config (intent) and the append-only session logs (facts); status, facts, screens, resume chains and the workers they make (callsign and showings across resumes) are computed from them.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-09-30",
  "reviewed": "2026-10-10",
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

Amended by [[collections]]: a third stored state, the files a project keeps for later (unsent prompts among
them), which are neither intent nor facts about a session.

Amended on 2026-10-06 by [[log-diet]] (D1): a fact is what happened in a session, not a copy of what a tool
returned. The host logs `PostToolUse` without its `tool_response`, which Claude's own transcript keeps.

Amended on 2026-10-06 (D2): a checkpoint (a screen snapshot or a fold's result at a byte offset of a log) is a
cache, not a fourth kind of stored state. Logs are append-only, so a checkpoint keyed by its log, offset and
the version of the reduction that made it stays valid; it is never authoritative, always safe to delete, and
recomputed from the log when missing. The facts fold's checkpoints: [[fold-checkpoints]].

**Consequences.** A new fact is a new fold step, and it applies to every past session retroactively. Logs
are replayed to answer questions, which costs time on large logs (`/screen` replays the whole log).
