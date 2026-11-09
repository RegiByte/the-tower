---
{
  "type": "decision",
  "name": "A small detached host owns every PTY and knows no Claude flags",
  "summary": "Session PTYs live in a separate long-running process, so renderers and the bridge can restart without ending sessions; because changing it ends every session, the host stays small: clients compose a spawn's or resume's whole argv and env, and the host adds only its own wiring.",
  "in": "host",
  "status": "accepted",
  "date": "2026-09-30",
  "reviewed": "2026-11-09",
  "refs": [
    "hub/src/host/main.ts#spawnSession",
    "hub/src/shared/launch.ts#hostSpawn",
    "hub/src/host/main.ts#stop",
    "hub/src/shared/launch.ts#spawnRequest",
    "hub/src/shared/launch.ts#resumeRequest",
    "hub/src/shared/launch.ts#settingsArgs",
    "hub/src/shared/launch.ts#newSessionId",
    "hub/src/host/session.ts#sessionEnv",
    "hub/src/mod/hooks/hooks.json"
  ]
}
---
**Context.** The renderer is where the churn is. If it held the PTYs, every renderer change would kill running
Claude sessions. And new launch options (model, effort, first prompt, resume, directories) keep arriving: if the
host knew them, each would mean a host restart, which ends every session.

**Decision.** One host process owns every PTY master and is the single writer of the session logs (the tower
writes the system's other logs, `streams/`). Clients talk to it over `control.sock`; Claude talks to it over
`hooks.sock` ([[host-daemon]]). A `spawn` carries the session's `id`, its whole `argv` and its own `env`: clients
compose Claude's args with [`spawnRequest`](ref:hub/src/shared/launch.ts#spawnRequest) and
[`resumeRequest`](ref:hub/src/shared/launch.ts#resumeRequest), and put them after the config's `argv` command and
the tower mod's `--plugin-dir`, with the command's `env` ([`hostSpawn`](ref:hub/src/shared/launch.ts#hostSpawn),
protocol 5). `runtime` and `command` are labels the host copies to the header, so it knows no Claude flag and no key
of the config's `argv`. The host's own wiring is only the env that addresses its sockets, laid over a scrubbed env
([`sessionEnv`](ref:hub/src/host/session.ts#sessionEnv)); it checks the `cwd` and refuses an id it already knows.
A host before protocol 5 added the config's `argv` and the mod itself, and the tower still speaks to one that way
until 2.0 ([[host-daemon]]).

**Alternatives considered.**
- PTYs inside the renderer: rejected for the reason above.
- tmux as the PTY owner: the host must see every byte to log it.
- Typed fields in the spawn message (`model`, `effort`, `resume`): every new option would change the host protocol.
- A protocol-5 host taking both the old `args` spawn and the whole `argv` one: a mode on one message, kept in the host
  for good or dropped by a second restart. The tower speaks the old shape to an old host instead, until 2.0.

**Consequences.** Changing the host ends every session (each is resumable), so host changes are batched for a
deliberate restart, and anything that can live in a client does. New Claude options ship with a client change only.
- Clients mint the id ([`newSessionId`](ref:hub/src/shared/launch.ts#newSessionId)) and compose `--name` (the
  worker's [[callsign]]): a resume that continues a worker needs the worker's name, which only the board's chains
  know ([[agent-directory]]).
- The classic hooks that post to the host are declared in the tower mod's `hooks.json` ([[hook-events]]), which each
  Claude reads as it starts, so the list changes with no host restart.
- Clients compose the whole `--settings` object
  ([`settingsArgs`](ref:hub/src/shared/launch.ts#settingsArgs): the session's other directories as
  `additionalDirectories`, `tui` ([[fullscreen-tui]]) and the `env` launch contributors set, [[extensions]]): Claude reads one `--settings`, the last it is given, whole,
  so a host adding its own beside a client's would drop one.
- Directories beyond the session's own (`--add-dir` for the floor's collections and a worktree's link sources,
  [[tower-cuts-worktrees]]) and the project's plugins (`--plugin-dir`, [[plugins]]) are clients' args as well.
