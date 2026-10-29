---
{
  "type": "decision",
  "name": "Logs are the facts; everything else is derived",
  "summary": "Three kinds of stored state: the config (intent), the append-only logs (facts, one writer per log, each fact what happened and not a copy of a tool's output) and the collections (files kept for later); status, facts, screens, resume chains and the workers they make (callsign and showings across resumes) are computed from them.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-09-30",
  "reviewed": "2026-10-29",
  "refs": ["hub/src/shared/model.ts#LogEvent", "hub/src/bridge/facts.ts#factsOf", "hub/src/bridge/chains.ts#resumes", "hub/src/host/session.ts#hookFact", "hub/src/bridge/status.ts#HOOK_STATUS"]
}
---
**Context.** Renderers come and go, and what a renderer wants to show keeps changing (status, waiting on
you, cost, resume chains). Stored derived state goes stale and needs migrations.

**Decision.** The host appends every fact about a session to one asciicast-shaped log: output, input,
resizes, hook and mod events, exit. Nothing else about a session is stored. Which session resumes which is
derived from Claude's `session_id` in the hooks, never written down. The rule:

- **Three kinds of stored state.** The config (intent), the logs (facts) and the collections ([[collections]]):
  files a project keeps for later, which are neither intent nor facts about a session.
- **One writer per log.** The host writes the session logs (`sessions/`) and stays the single writer of everything
  about a session; the tower writes the logs of what it observes that belong to no session, and each project's
  (`streams/`, [[probes]], [[policies]]). A stream is a log.
- **A fact is what happened, not a copy.** The host appends a hook as [`hookFact`](ref:hub/src/host/session.ts#hookFact)
  of its body: `PostToolUse` without its `tool_response`, everything else as posted. The event stays, with its
  `tool_name`, `tool_input` and `tool_use_id` (the bridge reads it only as a `working` signal,
  [`HOOK_STATUS`](ref:hub/src/bridge/status.ts#HOOK_STATUS)), and so does the mod's digest `tower.tool.result`. A tool's
  output is a copy of what Claude keeps in its own transcript (`transcript_path` is on every hook); kept in the log it
  was most of its bytes, read by nothing, and a second copy of every secret a tool read. The trim lives where the host
  appends, so it holds for every transport that posts a hook.
- **A cache is not state.** A fold's result at a byte offset of a log is a cache: logs are append-only, so a checkpoint
  keyed by its log, offset and the code that made it stays valid; it is never authoritative, always safe to delete,
  and recomputed from the log when missing ([[fold-checkpoints]]).

**Alternatives considered.**
- A status database or per-session state file updated by the host: it puts interpretation in the one process that
  cannot be restarted cheaply.
- Keeping tool output with a retention window: a pruner rewrites append-only files, for bytes nothing reads.
- Trimming tool output in the hook command or the mod: any other poster would bring the bodies back; the host is the
  single writer, so the rule is stated once there.

**Consequences.** A new fact is a new fold step, and it applies to every past session retroactively. Logs
are replayed to answer questions, which costs time on large logs (`/screen` replays the whole log). A fold step that
ever wants a tool's output reads Claude's transcript, not the log.
