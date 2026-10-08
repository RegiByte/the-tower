---
{
  "type": "decision",
  "name": "The host knows no Claude flags",
  "summary": "Clients compose the Claude arguments of a spawn or resume and pass them as args; the host adds only its own wiring.",
  "in": "host",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-08",
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

**Consequences.** New Claude options ship with a renderer change only. Until 2026-10-05 the host added
`--name callsign(id)` itself, since only it knew the id; a resume that continues a worker needs the worker's name,
which only the board's chains know, so the id moved to the client with the flag ([[agent-directory]]). The host still checks that `cwd` is
one of the project's dirs. On 2026-10-06 the hook list left the host too: the classic hooks that post to it are
declared in the tower-mod plugin's `hooks.json` ([[hook-events]]), which each Claude reads as it starts, so the
list changes with no host restart. On 2026-10-08 the settings left the host as well: Claude reads one `--settings`, the last it is
given, whole (checked on 2.1.295: `{tui:default}` then `{permissions:{}}` runs fullscreen, the other order does not),
so a client adding `tui` ([[fullscreen-tui]]) would have dropped the host's `additionalDirectories`. Clients compose
the whole object ([`settingsArgs`](ref:hub/src/shared/launch.ts#settingsArgs), from `sessionDirs`), and a host started
before it still puts its own first, where the client's replaces it. The host's wiring is now the plugin's path and the
env that addresses its sockets; it still checks the `cwd` with `sessionDirs`. Directories a session reaches beyond its own are clients' args as well:
`--add-dir` for the floor's collections and for the sources of a worktree's links ([[tower-cuts-worktrees]]).
