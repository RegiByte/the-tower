---
{
  "type": "external",
  "name": "Claude Code",
  "summary": "The Claude Code TUI, run in a real PTY per session, with its classic hooks and mods API.",
  "in": "tower",
  "reviewed": "2026-10-08",
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
