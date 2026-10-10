---
{
  "type": "term",
  "name": "Kept branch",
  "summary": "A branch the tower cut (it has a branch.<br>.towerBase config) that no worktree has checked out: left by a removal because it wasn't absorbed, such as an open pull request; checked out again by branch/recut, deleted only by branch/delete or Tidy once absorbed, or by its own branch/delete once carried (landed edited).",
  "in": "tower",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/bridge/worktrees.ts#floorBranches", "hub/src/worktrees.ts#recutBranch"]
}
---
A [[worktree]]'s branch outlives its folder; see [[absorbed]]. A cut records the worktree's name on the branch
(`branch.<br>.towerName`), so [`recutBranch`](ref:hub/src/worktrees.ts#recutBranch) rebuilds the same
`<dir>/.worktrees/<name>` and the workers that worked there resume; one with no name on record is checked out by
hand. A new cut never takes a name a kept branch records. A fork's branch with nothing beyond its snapshot is [[absorbed]], so it is deleted
with its worktree and never kept. A repo whose copy was deleted (absorbed there) gets the branch afresh from origin's
default.
