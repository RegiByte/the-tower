---
{
  "type": "library",
  "name": "Worktrees",
  "summary": "Git for the tower: cutting and forking a worktree per name in every repo of a project, reading each repo's worktrees and branches, tidying what has landed, and reading what a worker changed.",
  "in": "tower-core",
  "reviewed": "2026-10-21",
  "refs": ["hub/src/worktrees.ts#cut", "hub/src/worktrees.ts#fork", "hub/src/worktrees.ts#snapshot", "hub/src/worktrees.ts#readRepo", "hub/src/worktrees.ts#fetchOrigin", "hub/src/worktrees.ts#tidy", "hub/src/worktrees.ts#linksIn", "hub/src/worktrees.ts#linkedSources", "hub/src/worktrees.ts#againstFor", "hub/src/worktrees.ts#rollback", "hub/src/worktrees.ts#recutBranch", "hub/src/worktrees.ts#recutWorktree", "hub/src/worktrees.ts#pruneWorktree", "hub/src/worktrees.ts#removeWorktree", "hub/src/worktrees.ts#deleteBranch", "hub/src/repo-reader.ts", "hub/src/worktrees.ts#landingOf", "hub/src/worktrees.ts#discardable", "hub/src/worktrees.ts#discard", "hub/src/changes.ts#changesIn", "hub/src/changes.ts#repoChanges"]
}
---
`src/worktrees.ts` is the only code that changes the tower's worktrees and branches. The tower server calls it; what
git's output means is decided in the bridge (`src/bridge/worktrees.ts`). The rules it keeps (when a branch may be
deleted, why removal never forces, how links are checked) are [[tower-cuts-worktrees]]'s.

Every verb, cut and fork included, fetches first ([`fetchOrigin`](ref:hub/src/worktrees.ts#fetchOrigin), shared by
verbs at once in a repo) and re-checks what it was offered on, since the board is a few seconds old and its remote refs
as old as the last fetch.

- **Cut and fork.** [`cut`](ref:hub/src/worktrees.ts#cut) makes one [[worktree]] per repo at `.worktrees/<name>`, on
  one new branch from a base on origin; [`fork`](ref:hub/src/worktrees.ts#fork) starts it from a
  [`snapshot`](ref:hub/src/worktrees.ts#snapshot) of another [[checkout]] ([[reviewer]]). Both record the branch in git
  config (`branch.<b>.tower*`), which is how the tower knows a branch is its own and what it is counted from.
  [`linksIn`](ref:hub/src/worktrees.ts#linksIn) refuses a link git doesn't ignore or tracks;
  [`linkedSources`](ref:hub/src/worktrees.ts#linkedSources) gives a worktree session the links' source directories.
  [`rollback`](ref:hub/src/worktrees.ts#rollback) undoes a cut whose session failed to start.
- **Read.** [`readRepo`](ref:hub/src/worktrees.ts#readRepo) reads a repo's worktrees and kept branches without
  fetching, on a thread of its own (`src/repo-reader.ts`, started by [[live-system]]), remembering what never changes
  for a commit: whether it is [[absorbed]] or [[carried]], and what is unpushed.
  [`landingOf`](ref:hub/src/worktrees.ts#landingOf) reads what landing changed on a carried branch.
- **One worktree or branch.** The `/worktree/*` and `/branch/*` verbs: recut a lost worktree or a [[kept-branch]],
  prune a lost one, remove one that is removable or carried, delete a kept branch once absorbed or carried.
- **Tidy and discard.** [`tidy`](ref:hub/src/worktrees.ts#tidy) applies the floor's Tidy list ([[tidy]]). Work that
  never landed goes only through [`discardable`](ref:hub/src/worktrees.ts#discardable), then
  [`discard`](ref:hub/src/worktrees.ts#discard), the one call that forces ([[discard]]).
- **Changes.** [`changesIn`](ref:hub/src/changes.ts#changesIn) serves `/changes/<id>`: per repo of a session, the diff
  since the ref its work is counted from ([`againstFor`](ref:hub/src/worktrees.ts#againstFor)), untracked files
  included, with the commits since, narrowed by a scope. Git is read on every request, never kept ([[changes-view]]).
