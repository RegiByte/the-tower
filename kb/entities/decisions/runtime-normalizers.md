---
{
  "type": "decision",
  "name": "Runtime normalizers: logs stay native, folds read what a line means",
  "summary": "A session's log stays as its runtime wrote it. Every fold reads it through a pure per-line normalizer chosen by the header's runtime, which turns each hook line into tagged plain data (neutral events, the tower's own facts, and the runtime's extras) in log order; a runtime's raw field names are read only inside its normalizer.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-11-15",
  "reviewed": "2026-11-15",
  "refs": [
    "hub/src/bridge/events.ts#NormalEvent",
    "hub/src/bridge/events.ts#Happening",
    "hub/src/bridge/events.ts#towerFact",
    "hub/src/bridge/events.ts#towerFactOf",
    "hub/src/bridge/normalize.ts#normalizerOf",
    "hub/src/bridge/normalize.ts#readableEvents",
    "hub/src/bridge/runtimes/claude.ts#normalizeClaude",
    "hub/src/bridge/events.ts#ToolFormat",
    "hub/src/bridge/runtimes/claude.ts#claudeTools",
    "hub/src/bridge/runtimes/claude-lines.ts#skimClaude",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/tail.ts#factEvents",
    "hub/src/bridge/turns.ts#turnsByConversation",
    "hub/src/bridge/turns.ts#toolCallOf",
    "hub/src/bridge/runtimes/opencode.ts#normalizeOpencode",
    "hub/src/bridge/runtimes/opencode.ts#opencodeTools"
  ]
}
---

**Problem.** The bridge was written against one runtime, Claude Code: status, facts, conversations, the composer and
the brief each switched on Claude's `hook_event_name` and read its payload fields. A second runtime would have had
to imitate Claude's event names or fork every fold.

**Why.** [[logs-are-facts]]: a log line records what happened, and meaning is derived when the log is read. So the
log keeps each runtime's own shape, and the reading is where runtimes differ.

**How.** [`normalizerOf`](ref:hub/src/bridge/normalize.ts#normalizerOf) picks a runtime's normalizer by
`runtimeOf(header)`. A normalizer is pure: one `LogEvent` in, zero or more
[`NormalEvent`](ref:hub/src/bridge/events.ts#NormalEvent)s out. The host's own `o i r x` events pass as they are; an
`h` line becomes `[t, 'e', happening]`, a [`Happening`](ref:hub/src/bridge/events.ts#Happening) tagged by `t`:

- **neutral** events every fold may read (`conversation.entered`, `turn.step`, `tool.call`, `compaction.started`, …),
  each carrying `agent` when a subagent's loop raised it;
- **the tower's own facts** (`tower.*`), decoded the same way for every runtime by
  [`towerFactOf`](ref:hub/src/bridge/events.ts#towerFactOf), since the host writes them in one envelope, which
  [`towerFact`](ref:hub/src/bridge/events.ts#towerFact) builds for every writer;
- **extras** only one runtime has: Claude's peer messages (`claude.sent`, `claude.received`).

The folds read one ordered stream, `log.flatMap(normalize)`: status and conversations read the neutral events, the
facts fold and the brief read the extras they need too, and the brief keeps log order for free. The set of tags is
internal to the bridge (it never reaches the board, the API or a log). It was drawn from Claude, then reshaped by
opencode's recorded fixtures: `ready` (the session can take a prompt; Claude's `SessionStart` other than after a
compaction), prompts and their delivery carrying an `id` (a prompt sent during a turn waits and is delivered inside
it), `said` (a step's text logged apart from the step), `permission.answered`, `compaction.failed`, `turn.retrying`,
`conversation.titled`, `runtime.models`, and `charged` (what one request cost, for a runtime that says it besides its
running total).

[`normalizeClaude`](ref:hub/src/bridge/runtimes/claude.ts#normalizeClaude) reads Claude's classic hooks and its mod's
events. How a tool call reads in words is presentation, not what happened, so the normalizer leaves it out: a
`tool.call` carries its tool and input, and the runtime's [`ToolFormat`](ref:hub/src/bridge/events.ts#ToolFormat)
([`claudeTools`](ref:hub/src/bridge/runtimes/claude.ts#claudeTools)) words it where it is drawn, the brief's line in
`stepsOf` and the card's label in the facts fold. A shape the line can't word costs only the brief.

[`normalizeOpencode`](ref:hub/src/bridge/runtimes/opencode.ts#normalizeOpencode) reads the lines the tower's opencode
plugin posts ([[opencode]]): opencode's bus events, each under its own `type`, and the plugin's own (`plugin.started`,
`tool.execute.before`, `mcp.status`). Status follows opencode's executions, not its prompts; a child session is a
subagent, its lines carrying the `parentID` the plugin adds; a call's start and end (`session.tool.called`,
`.success`) move no status, since calls run in parallel and one ending would pull a pending ask back to working. The
normalizer stays per line, so what needs two lines is joined in the plugin before it posts (a step's model on its
end, a child's spawn on its call, a session's cost with its subagents') or in a fold (spend from what each request
`charged`, [[log-reductions]]). [`opencodeTools`](ref:hub/src/bridge/runtimes/opencode.ts#opencodeTools) words its
calls, a path shown relative to the session's cwd under either of its spellings (opencode reports the realpath).
opencode raises no extras.

The tail's skim of a `PostToolUse` line, read
by its bytes without parsing its tool's input, is Claude's line format too, kept apart in
[`skimClaude`](ref:hub/src/bridge/runtimes/claude-lines.ts#skimClaude) because the bridge also runs in the browser.

Each fold normalizes where a raw event enters it, so logs, the tail and the fold checkpoints stay raw.
[`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter) normalizes inside its `try`, so a line the normalizer can't
read breaks its own session ([[broken-logs]]). [`turnsByConversation`](ref:hub/src/bridge/turns.ts#turnsByConversation),
[`toolCallOf`](ref:hub/src/bridge/turns.ts#toolCallOf) and `conversationsOf` read the log through
[`readableEvents`](ref:hub/src/bridge/normalize.ts#readableEvents), which stops at the first line the normalizer
can't read: a broken session's brief holds what came before that line, as its facts do. A
header naming a runtime with no normalizer breaks that session at its first event; a header naming none is Claude's.

**Alternatives considered.** Translating Claude's events into a common log format at write time: rejected, the log
would hold an interpretation, and changing it would need a migration. A separate fold for a runtime's extras beside
the neutral ones: rejected, the brief interleaves both and would have to merge them back into log order. A neutral
vocabulary for prompt origins and turn-end reasons: deferred until a second runtime's are recorded, so they stay
Claude's strings.

**Impact.** Adding a runtime is a normalizer, and a skim if its lines carry large payloads; no fold changes for what
it shares. Adding opencode reshaped the neutral tags and taught the folds what a second runtime does differently
(a stop with no turn running ends none, a question form asks the user), and left Claude's facts, status,
conversations and turns as they were on every Claude fixture.
