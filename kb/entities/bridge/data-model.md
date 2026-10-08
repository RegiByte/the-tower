---
{
  "type": "library",
  "name": "Data model",
  "summary": "The shared types and pure builders: projects and config, the session header and log events, the host and terms protocols, and spawn/resume requests.",
  "in": "bridge",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/shared/model.ts", "hub/src/shared/model.ts#projectCollections", "hub/src/shared/protocol.ts#ToHost", "hub/src/shared/protocol.ts#HOST_PROTOCOL", "hub/src/shared/protocol.ts#promptPastes", "hub/src/shared/terms.ts#ToTerms", "hub/src/shared/launch.ts#spawnRequest", "hub/src/shared/env.ts#withoutParentSession", "hub/src/shared/model.ts#sessionDirs", "hub/src/shared/model.ts#inProject", "hub/src/shared/model.ts#worktreesConfig", "hub/src/shared/launch.ts#worktreeBrief", "hub/src/shared/model.ts#projectPlugins", "hub/src/shared/model.ts#editorArgv", "hub/src/shared/model.ts#configuredCallsigns", "hub/src/shared/model.ts#callsignsOf"]
}
---
`src/shared`. Every client builds host requests with [`spawnRequest`](ref:hub/src/shared/launch.ts#spawnRequest)
and [`resumeRequest`](ref:hub/src/shared/launch.ts#resumeRequest): the Claude flags a session starts with
(model, effort, the first prompt after `--`, `--resume`, `--name`) are composed here, never in the host, and
the session id is minted here ([`newSessionId`](ref:hub/src/shared/launch.ts#newSessionId))
([[host-knows-no-flags]]). New sessions spawn at 120×40; the first viewer resizes them.

[`promptPastes`](ref:hub/src/shared/protocol.ts#promptPastes) cuts a prompt into bracketed pastes small enough
for Claude to take as typed text (at most 400 characters and two newlines each; past 800 characters or 3 lines it
wraps a paste as `<pasted_content>`), and `\r` follows as its own write ([[collections]]).
[`projectCollections`](ref:hub/src/shared/model.ts#projectCollections) gives a project the collections declared
for every project, then its own, and [`projectPlugins`](ref:hub/src/shared/model.ts#projectPlugins) the plugin
directories its sessions load, the same way; spawn and resume requests pass each as `--plugin-dir` ([[plugins]]).

[`sessionDirs`](ref:hub/src/shared/model.ts#sessionDirs) says which directories a session in `cwd` works in, its
own first: a project dir gives the project's dirs; `<dir>/.worktrees/<name>` gives that [[worktree]] of every project
dir, never the main checkouts; anything else throws. The host, terms and the tower's `open` accept a `cwd` only
through it ([[tower-cuts-worktrees]]). [`inProject`](ref:hub/src/shared/model.ts#inProject) is the same test as a
predicate, which the board asks of every past worker's `cwd` before it offers a resume ([[resume]]). `WorktreesConfig` (`branchPrefix`, `links`, `cutByDefault`) sits at the top level and per
project; [`worktreesConfig`](ref:hub/src/shared/model.ts#worktreesConfig) merges them per key, the project's winning,
`tower/` as the default prefix, cutting by default. `HiringConfig` (`depth`, `live`) merges the same way through
[`hiringConfig`](ref:hub/src/shared/model.ts#hiringConfig), 2 and 3 by default ([[hiring-limits]]), and `BriefConfig`
(`pairs`) through [`briefConfig`](ref:hub/src/shared/model.ts#briefConfig), 2 by default ([[brief-turns]]). `user.name`
is read through [`configuredUser`](ref:hub/src/shared/model.ts#configuredUser), which throws a `ConfigError` for a name
no note heading can carry ([[the-user]], [[board-errors]]), and the top-level `callsigns` through
[`configuredCallsigns`](ref:hub/src/shared/model.ts#configuredCallsigns), which throws one for a list that can't name
workers; [`callsignsOf`](ref:hub/src/shared/model.ts#callsignsOf) names a session id from it, and `spawnRequest` takes
the name it gives ([[callsign]]). `editor` (top level only) holds the argv templates the
tower opens things in the user's editor with, filled through [`editorArgv`](ref:hub/src/shared/model.ts#editorArgv),
all three VS Code's `code` when `editor` is unset, each required when it is set ([[open-files]]). [`worktreeBrief`](ref:hub/src/shared/launch.ts#worktreeBrief) is what a worker in a
worktree is told in its system prompt (its name, branch, directories, the main checkouts they copy, and the sources of
its links); spawn and resume requests take it, `undefined` in a main checkout, and pass each link's source as
`--add-dir`, so a write through a link stays inside the session's directories ([[tower-cuts-worktrees]]).
