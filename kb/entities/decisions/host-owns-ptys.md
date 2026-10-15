---
{
  "type": "decision",
  "name": "A small detached host owns every PTY and knows no Claude flags",
  "summary": "Session PTYs live in a separate long-running process, so renderers and the bridge can restart without ending sessions; because changing it ends every session, the host stays small: clients compose the Claude arguments of a spawn or resume and pass them as args, and the host adds only its own wiring.",
  "in": "host",
  "status": "accepted",
  "date": "2026-09-30",
  "reviewed": "2026-10-15",
  "refs": [
    "hub/src/host/main.ts#spawnSession",
    "hub/src/host/main.ts#stop",
    "hub/src/shared/launch.ts#spawnRequest",
    "hub/src/shared/launch.ts#resumeRequest",
    "hub/src/shared/launch.ts#settingsArgs",
    "hub/src/shared/launch.ts#newSessionId",
    "hub/src/host/session.ts#sessionArgv",
    "hub/src/mod/hooks/hooks.json"
  ]
}
---
**Context.** The renderer is where the churn is. If it held the PTYs, every renderer change would kill running
Claude sessions. And new launch options (model, effort, first prompt, resume, directories) keep arriving: if the
host knew them, each would mean a host restart, which ends every session.

**Decision.** One host process owns every PTY master and is the single writer of the session logs (the tower
writes the system's other logs, `streams/`). Clients talk to it over `control.sock`; Claude talks to it over
`hooks.sock`. A `spawn` carries the session's `id` and `args`: clients build them with
[`spawnRequest`](ref:hub/src/shared/launch.ts#spawnRequest) and [`resumeRequest`](ref:hub/src/shared/launch.ts#resumeRequest),
and the host appends them after the config's `argv` and the mod's `--plugin-dir`
([`sessionArgv`](ref:hub/src/host/session.ts#sessionArgv)). Clients mint the id
([`newSessionId`](ref:hub/src/shared/launch.ts#newSessionId)), so they compose Claude's `--name` (the worker's
[[callsign]]) too; the host refuses an id it already runs or has a log for. The host's own wiring is the mod's
path and the env that addresses its sockets; it checks the `cwd` with `sessionDirs`.

**Alternatives considered.**
- PTYs inside the renderer: rejected for the reason above.
- tmux as the PTY owner: the host must see every byte to log it.
- Typed fields in the spawn message (`model`, `effort`, `resume`): every new option would change the host protocol.

**Consequences.** Changing the host ends every session (each is resumable), so host changes are batched for a
deliberate restart, and anything that can live in a client does. New Claude options ship with a renderer change
only. The client composes `--name` because a resume that continues a worker needs the worker's name, which only
the board's chains know ([[agent-directory]]). The classic hooks that post to the host are declared in the
tower-mod plugin's `hooks.json` ([[hook-events]]), which each Claude reads as it starts, so the list changes with no
host restart. Clients compose the whole `--settings` object
([`settingsArgs`](ref:hub/src/shared/launch.ts#settingsArgs): the session's other directories as
`additionalDirectories`, and `tui`, [[fullscreen-tui]]): Claude reads one `--settings`, the last it is given, whole,
so a host adding its own beside a client's would drop one. Directories a session reaches beyond its own are clients'
args as well: `--add-dir` for the floor's collections and for the sources of a worktree's links
([[tower-cuts-worktrees]]).
