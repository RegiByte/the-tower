---
{
  "type": "decision",
  "name": "Log diet: a tool's output is not a fact the log keeps",
  "summary": "The host logs PostToolUse without its tool_response: the event stays (it is a status signal), the body was 41% of every log's bytes, read by nothing, and copied whatever tools read, secrets included, forever.",
  "in": "host",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/host/session.ts#hookFact", "hub/src/host/main.ts#hooks", "hub/src/bridge/status.ts#HOOK_STATUS"]
}
---
**Problem.** On 2026-10-06 the system root held 157 logs, 608 MB over about 7 days. `PostToolUse.tool_response`
alone was 260 MB of it (41% of all bytes, 83% of the largest log): the full output of every tool call, about
34 KB each. Nothing in the bridge or any renderer reads it; the bridge uses `PostToolUse` only as a `working`
signal ([`HOOK_STATUS`](ref:hub/src/bridge/status.ts#HOOK_STATUS)). Every reader still paid for it (a screen
replay JSON-parses every line), and every secret a tool read (`cat .env`, tokens in command output) was written
a second time, to a file nothing prunes.

**Why.** [[logs-are-facts]] keeps everything the host saw so that a new fold step can apply to every past
session. That argument holds for facts about the session (what happened, when, in what order). A tool's output
is a copy of something Claude already keeps in its own transcript, the one place it is needed if it is ever
needed (a resume reads it there).

**How.** The host appends a hook event as [`hookFact`](ref:hub/src/host/session.ts#hookFact) of its body: a
`PostToolUse` without `tool_response`, everything else as posted. The event, its `tool_name`, `tool_input` and
`tool_use_id` stay, and so does the mod's digest `tower.tool.result` (0.9 MB over the same week).
`PostToolUseFailure` carries no tool output, only a short `error`, and is kept whole. The trim lives where the
host appends a hook, so it holds for every transport that posts one. Logs written before stay as they are.

**Alternatives considered.**
- Keep every body forever: the logs grow about 3 GB a month, startup folds every log ever written, and
  secrets outlive the files they came from.
- Keep bodies with a retention window: a pruner rewrites append-only files, and it is a second process with a
  schedule to keep right, for bytes nothing reads.
- Trim at the hook command (curl through `jq`) or in the mod: it would ship without a host restart, but any
  other poster would bring the bodies back. The host is the single writer, so the rule is stated once there.

**Impact.** Logs shrink by roughly 40% from the next host restart, screen replays and startup parse less, and
tool output is no longer persisted by the tower. A fold step that ever wants a tool's output reads Claude's
transcript (`transcript_path` is on every hook), and cannot apply to sessions logged after this change from the
log alone.
