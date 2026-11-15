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
    "hub/src/bridge/runtimes/claude-lines.ts#skimClaude",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/tail.ts#factEvents",
    "hub/src/bridge/turns.ts#turnsByConversation",
    "hub/src/bridge/turns.ts#toolCallOf"
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
internal to the bridge (it never reaches the board, the API or a log) and was drawn from Claude alone; the second
runtime's recorded fixtures reshape it.

[`normalizeClaude`](ref:hub/src/bridge/runtimes/claude.ts#normalizeClaude) reads Claude's classic hooks and its mod's
events, and renders a tool call in one line (it knows Claude's tools). The tail's skim of a `PostToolUse` line, read
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
it shares. The board, the API and the log format did not change: every fixture folds to the same board.
