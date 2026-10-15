---
{
  "type": "decision",
  "name": "The host knows no Claude flags",
  "summary": "Clients compose the Claude arguments of a spawn or resume and pass them as args; the host adds only its own wiring.",
  "in": "host",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-15",
  "refs": ["hub/src/shared/launch.ts#spawnRequest", "hub/src/shared/launch.ts#resumeRequest", "hub/src/shared/launch.ts#settingsArgs", "hub/src/host/session.ts#sessionArgv", "hub/src/shared/launch.ts#newSessionId", "hub/src/host/main.ts#spawnSession", "hub/src/mod/hooks/hooks.json"]
}
---
**Context.** New launch options (model, effort, first prompt, resume) kept arriving, and each would have
meant a host restart.

**Decision.** `spawn` carries the session's `id` and `args`. Clients build them with [`spawnRequest`](ref:hub/src/shared/launch.ts#spawnRequest)
and [`resumeRequest`](ref:hub/src/shared/launch.ts#resumeRequest); the host appends them after the config
`argv` and the mod. Clients mint the id
([`newSessionId`](ref:hub/src/shared/launch.ts#newSessionId)), so they compose Claude's `--name` (the worker's
[[callsign]]) too; the host refuses an id it already runs or has a log for.

**Alternatives considered.** Typed fields in the spawn message (`model`, `effort`, `resume`): rejected, every
new option would change the host protocol.

**Consequences.** New Claude options ship with a renderer change only. The client composes Claude's `--name`
because a resume that continues a worker needs the worker's name, which only the board's chains know
([[agent-directory]]). The classic hooks that post to the host are declared in the tower-mod plugin's `hooks.json`
([[hook-events]]), which each Claude reads as it starts, so the list changes with no host restart. Clients compose the
whole `--settings` object ([`settingsArgs`](ref:hub/src/shared/launch.ts#settingsArgs), from `sessionDirs`): Claude
reads one `--settings`, the last it is given, whole, so a client adding `tui` ([[fullscreen-tui]]) beside a host's own
`additionalDirectories` would drop them. The host's wiring is the plugin's path and the env that addresses its
sockets; it checks the `cwd` with `sessionDirs`. Directories a session reaches beyond its own are clients' args as
well: `--add-dir` for the floor's collections and for the sources of a worktree's links ([[tower-cuts-worktrees]]).
