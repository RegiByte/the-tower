---
{
  "type": "library",
  "name": "Worktrees",
  "summary": "Git for the tower: cutting and forking a worktree per name in every repo of a project, reading each repo's worktrees and branches, tidying what has landed, and reading what a worker changed.",
  "in": "web-tower",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/worktrees.ts#cut", "hub/src/worktrees.ts#fork", "hub/src/worktrees.ts#snapshot", "hub/src/worktrees.ts#readRepo", "hub/src/worktrees.ts#tidy", "hub/src/worktrees.ts#linksIn", "hub/src/worktrees.ts#linkedSources", "hub/src/worktrees.ts#againstFor", "hub/src/worktrees.ts#rollback", "hub/src/worktrees.ts#recutBranch", "hub/src/worktrees.ts#landingOf", "hub/src/worktrees.ts#discardable", "hub/src/changes.ts#changesIn", "hub/src/changes.ts#repoChanges"]
}
---
`src/worktrees.ts` is the only code that runs git for the tower; the tower server calls it
([[tower-cuts-worktrees]]) and the bridge only reads what it returns.

- **Cut and fork.** [`cut`](ref:hub/src/worktrees.ts#cut) makes one [[worktree]] per repo of a project at
  `.worktrees/<name>`, on one new branch started from a base; [`fork`](ref:hub/src/worktrees.ts#fork) starts it
  from a [`snapshot`](ref:hub/src/worktrees.ts#snapshot) of another [[checkout]] (uncommitted work included,
  the checkout untouched). Both mark the branch with `branch.<b>.towerBase` (and for a fork its snapshot and
  source) in git config: that record is how the tower knows a branch is its own and what it is counted from.
  [`rollback`](ref:hub/src/worktrees.ts#rollback) undoes a cut whose session failed to start.
- **The ignored-link check.** A project can link files from the main checkout into every worktree (env files,
  dependencies) and the repo's `.worktreeinclude` names ignored files to copy
  ([`linksIn`](ref:hub/src/worktrees.ts#linksIn)). A link must be ignored and untracked by git, else the cut
  is refused: it would show as an untracked file in every diff, or replace tracked ones. A session in the worktree
  gets the links' sources as directories of its own ([`linkedSources`](ref:hub/src/worktrees.ts#linkedSources)),
  so writing through a link asks no permission.
- **Read.** [`readRepo`](ref:hub/src/worktrees.ts#readRepo) reads a repo's worktrees and branches (every 5 s
  through the live system, never mirrored): each one's state and whether it is [[absorbed]], [[carried]] or a
  [[kept-branch]]. [`landingOf`](ref:hub/src/worktrees.ts#landingOf) reads what landing changed on a carried branch
  (`GET /landing`).
- **Tidy.** [`tidy`](ref:hub/src/worktrees.ts#tidy) removes the worktrees and kept branches the floor's Tidy listed,
  refusing before it touches any once one is no longer `removable` or absorbed, after one fetch (none for a repo without an `origin`, which has nothing to fetch: [[tidy]]), so unmerged or uncommitted work is never lost; it runs only when
  the user asks. Work that never landed goes only by [`discardable`](ref:hub/src/worktrees.ts#discardable) and
  `discard`, its tips noted on its thread first ([[discard]]). Threads of landed
  checkouts are filed by the server after it, as review history ([[review-threads]]).
- **Changes.** `src/changes.ts`: [`changesIn`](ref:hub/src/changes.ts#changesIn) is what `/changes/<id>`
  serves: for each repo of a session, the diff since the ref its work is counted from
  ([`againstFor`](ref:hub/src/worktrees.ts#againstFor): the tower's base in a worktree, else the upstream,
  else `HEAD`), staged, unstaged and untracked files together, parsed by the bridge's diff parser, with the commits
  since that ref; `?scope=uncommitted` narrows it to the diff since `HEAD`, `?scope=<commit>` to one of those commits. Git is read
  on every request, never kept; the viewed marks are the viewer's ([[changes-view]]).
