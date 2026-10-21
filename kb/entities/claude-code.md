---
{
  "type": "external",
  "name": "Claude Code",
  "summary": "The Claude Code TUI, run in a real PTY per session, with its classic hooks and mods API.",
  "in": "tower",
  "reviewed": "2026-10-21",
  "refs": ["hub/src/shared/claude.ts#CLAUDE_TESTED", "hub/src/shared/claude.ts#CLAUDE_SURFACES", "hub/src/bridge/status.ts#isCompactionStart", "hub/test/fixtures/"],
  "links": [
    { "to": "host-daemon", "verb": "sends", "carries": "classic hook input JSON (SessionStart, UserPromptSubmit, PreToolUse, Stop, ...), declared by the tower mod, via curl POST /hooks/<id> on hooks.sock" },
    { "to": "tower-mod", "verb": "triggers", "carries": "mod events: session.*, prompt.submit, command.run, turn.*, tool.*, agent.spawn" }
  ]
}
---
Its event names and payloads drift between releases; the recorded fixtures under `test/fixtures/` are the reference
for what the bridge expects. The releases the tower is tested on are one range,
[`CLAUDE_TESTED`](ref:hub/src/shared/claude.ts#CLAUDE_TESTED), beside the list of Claude's surfaces the tower reads
([`CLAUDE_SURFACES`](ref:hub/src/shared/claude.ts#CLAUDE_SURFACES)); a session on a release outside it is flagged on
the board, and moving the range is the runbook [[new-claude-release]].

Every session runs Claude's fullscreen TUI ([[fullscreen-tui]]). A fullscreen start that dies before it finishes (a
session killed while it boots) makes Claude's next launch on the machine, any project's, fall back to the classic
renderer once, saying so in its first line of output; the launch after it tries fullscreen again. A worker started in
that window keeps the classic screen until it is resumed.

Inside a Team or Enterprise organization, or on a machine with managed settings, Claude seats its built-in mod
`sec-default`, which keeps some mod events from user mods, the tower's included: `session.compact`, and
`session.append` from compaction or `settings.read`. The classic hooks still fire, so a compaction is read from
`PreCompact` (`trigger: auto | manual`), raised before every compaction, including one that gives up with no
`SessionStart` ([`isCompactionStart`](ref:hub/src/bridge/status.ts#isCompactionStart); fixtures `compact-auto`,
`compact-manual`, and their `-outside-org` twins that raise `session.compact` too). One a plugin triggers may raise
none. A subagent's compaction raises the same `PreCompact` and `SessionStart` (`source: compact`) as the main loop's,
under the main session's `session_id`, with no `agent_id` (`compact-subagent`): nothing tells the two apart. A turn
that ends in error when automatic compaction thrashes raises no `PreCompact` and no `Stop`; the mod's `turn.complete`
still arrives, with `reason: error` (`compact-thrashing`).
