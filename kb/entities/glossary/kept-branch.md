---
{
  "type": "term",
  "name": "Kept branch",
  "summary": "A branch the tower cut (it has a branch.<br>.towerBase config) that no worktree has checked out: left by a removal because it wasn't absorbed, such as an open pull request; checked out again by branch/recut, deleted by Tidy once absorbed, or by its own branch/delete once absorbed or carried.",
  "in": "tower",
  "reviewed": "2026-10-23",
  "refs": ["hub/src/worktrees.ts#readRepo", "hub/src/bridge/worktrees.ts#floorBranches", "hub/src/worktrees.ts#recutBranch", "hub/src/worktrees.ts#deleteBranch", "hub/src/worktrees.ts#nameIsFree"]
}
---
A [[worktree]]'s branch outlives its folder. A cut records the worktree's name on the branch (`branch.<br>.towerName`),
so [`recutBranch`](ref:hub/src/worktrees.ts#recutBranch) rebuilds the same `<dir>/.worktrees/<name>` and the workers
that worked there resume; one with no name on record is checked out by hand. A new cut never takes a name a kept
branch records ([`nameIsFree`](ref:hub/src/worktrees.ts#nameIsFree)). A repo whose copy was deleted (absorbed there)
gets the branch afresh from origin's default. A fork's branch with nothing of its own is [[absorbed]], so it goes with
its worktree and is never kept.
