---
{
  "type": "doc",
  "name": "docs/usage.md",
  "summary": "What the tower makes possible day to day, told through what the user asks workers: setting up floors (hub, repos, worktrees), showing, hiring, checking on workers, review threads, collections, the shelf, waits, the brief, resume and carry on, Tidy, policies, shells, Stats and The Week, probes, Tower 3D and renderers of their own.",
  "in": "tower",
  "reviewed": "2026-10-21",
  "refs": ["hub/src/directory.ts#USAGES", "hub/src/renderers.ts#BUILT_INS", "hub/src/shared/tags.ts#tagOf", "hub/src/shared/model.ts#sessionDirs", "hub/src/shared/keymap.ts", "hub/src/bridge/prunable.ts#prunable", "hub/src/shared/launch.ts#settingsArgs"]
}
---
`docs/usage.md` names the workers' `tower` verbs ([`USAGES`](ref:hub/src/directory.ts#USAGES), [[tower-cli]]):
`show`, `hire`, `agents`, `agent`, `home`, `let-go`, `review`, `note`, `thread`, `send`, `keep`, `kept`, `read`,
`policies`, `runs`, `probes`, and the renderers that ship.
A verb added, renamed or dropped re-checks it.

It also restates what a floor is ([[hub]], [`sessionDirs`](ref:hub/src/shared/model.ts#sessionDirs) granting the repos as file access only, [[tower-cuts-worktrees]]),
the default keys it names ([[keymap]]) and what Tidy lists ([[tidy]]): a change there re-checks it. The
`tower:guide` skill teaches from it ([[tower-mod]]), so it is written for an agent to read aloud as much as for a
person.
