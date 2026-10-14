---
{
  "type": "external",
  "name": "Claude Code",
  "summary": "The Claude Code TUI, run in a real PTY per session, with its classic hooks and mods API.",
  "in": "tower",
  "reviewed": "2026-10-14",
  "links": [
    { "to": "host-daemon", "verb": "sends", "carries": "settings-hook input JSON (SessionStart, UserPromptSubmit, PreToolUse, Stop, ...) via curl POST /hooks/<id> on hooks.sock" },
    { "to": "tower-mod", "verb": "triggers", "carries": "mod events: session.*, prompt.submit, turn.*, tool.*, agent.spawn" }
  ]
}
---
The project depends on Claude Code ≥2.1.287 for mods. Its event names and payloads drift between releases;
the recorded fixtures under `test/fixtures/` are the reference for what the bridge expects. The releases the
tower is tested on are one range, `CLAUDE_TESTED` in `src/shared/claude.ts`, beside the list of Claude's
surfaces the tower reads; a session on a release outside it is flagged on the board, and moving the range is
the runbook [[new-claude-release]].

Every session runs Claude's fullscreen TUI ([[fullscreen-tui]]): the conversation on the alternate screen
(`?1049h`) with mouse reporting (`?1000h ?1002h ?1003h ?1006h`), so a viewer's xterm keeps no scrollback and its wheel
scrolls Claude's own transcript, a wheel report per row of travel (`reportWheel`).

Inside a Team or Enterprise organization, or on a machine with managed settings, Claude seats its built-in mod
`sec-default`, which sends some mod events straight past the user tier: since 2.1.299 no user mod, the tower's
included, sees `session.compact`, nor `session.append` from compaction or `settings.read`. The classic hooks still
fire, so a compaction is read from `PreCompact` (`trigger: auto | manual`), raised before every compaction,
including one that gives up with no `SessionStart` (`test/fixtures/compact-auto.jsonl`, `compact-manual.jsonl`; the
`*-outside-org` fixtures are a Claude that raises `session.compact` as well). Claude 2.1.300 also ends a turn in
error when automatic compaction thrashes (the context refills within 3 turns, 3 times in a row), with no
`PreCompact` and no `Stop`.
