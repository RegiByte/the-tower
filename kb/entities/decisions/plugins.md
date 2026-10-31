---
{
  "type": "decision",
  "name": "The config names the plugins every session loads",
  "summary": "Config plugins, at the top level and per project, are absolute plugin directories each passed to Claude as --plugin-dir on every spawn and resume the tower composes (hire and review included), beside the tower mod, and after them each running extension's plugins.claude on the floors where it is on. The public tower ships no workflow: plugins is a primitive any user fills.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-31",
  "refs": ["hub/src/shared/model.ts#projectPlugins", "hub/src/shared/launch.ts#pluginArgs", "hub/src/shared/launch.ts#spawnRequest", "hub/src/shared/launch.ts#resumeRequest", "hub/src/host/session.ts#sessionArgv", "hub/src/tower/extensions.ts#extensions"]
}
---
**Problem.** A user's own commands and skills, copied into every repo's `.claude/`, drift apart: one change has to be
made in every copy, some tracked, some ignored, some untracked. A repo the tower is shared from should carry none of
one user's workflow.

**Why.** The tower already loads one plugin into every session it starts, the tower mod, as `--plugin-dir`. A list
of plugins in the config is the same seam generalized, and it reaches every session the tower starts without
touching any repo.

**How.**
- *The config.* `plugins: [<dir>…]` at the top level, every session's, and per project, its own beside them.
  [`projectPlugins`](ref:hub/src/shared/model.ts#projectPlugins) gives a project's list, the top level's first. Each
  is an absolute directory: Claude reads the path as written, with no `~` expanded, and a relative one against each
  session's cwd, which differs between the hub and every worktree.
- *The flags.* [`spawnRequest`](ref:hub/src/shared/launch.ts#spawnRequest) and
  [`resumeRequest`](ref:hub/src/shared/launch.ts#resumeRequest) take the list and pass each directory as
  `--plugin-dir` ([`pluginArgs`](ref:hub/src/shared/launch.ts#pluginArgs)), so spawn, resume, a cut, a fork, `tower
  hire` and `tower review` all load them. The host composes none of it ([[host-owns-ptys]]): it adds the mod's
  `--plugin-dir` before the client's args, and Claude takes the flag repeated. Each Claude reads its plugins as it
  starts: a changed plugin reaches the next session started, a changed list the next spawn or resume.
- *An extension's.* A manifest's `plugins.claude` names a folder inside the extension; each running extension's joins
  the list after the config's, on floors where it is on, for every spawn, resume and fork ([[extensions]]).
- *What goes in a plugin.* Commands and skills that describe a workflow only. What a project adds (its knowledge base,
  its repos, its rules) stays in its CLAUDE.md, AGENTS.md or its own skills, which the workflow names by convention
  ("when the project keeps a knowledge base, its instructions say how to query it"). A plugin's commands are
  namespaced: `/<plugin>:<command>`.

**Alternatives considered.**
- *A marketplace on disk, installed the ordinary way.* Rejected: it reaches sessions the tower doesn't start,
  which nobody asked for, and is state outside the config.
- *The host reads the list from the config.* Rejected: a host change kills running sessions, and the host composes
  no Claude flags but its own wiring.
- *A per-project override of a plugin of the same name.* Not built: a project that wants a different workflow names
  its own plugin.

**Impact.** A user's workflow lives in one plugin outside the repos, loaded into every tower session as
`/<plugin>:<command>`, with no copy in any repo. Sessions started outside the
tower (a plain `claude`) don't load configured plugins.
