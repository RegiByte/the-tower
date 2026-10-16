---
{
  "type": "term",
  "name": "Absorbed",
  "summary": "The tower's meaning of merged: a branch whose changes are already in its base, because merging it would change nothing (merge-tree of base and branch equals the base's tree) or each of its commits landed there as an equal patch (`git patch-id`, a rebased or cherry-picked copy).",
  "in": "tower",
  "reviewed": "2026-10-16",
  "refs": ["hub/src/worktrees.ts#landing", "hub/src/worktrees.ts#marksOf", "hub/src/worktrees.ts#againstOf", "hub/src/worktrees.ts#exposureOf"]
}
---
Only an absorbed branch is ever deleted by the tower ([[tower-cuts-worktrees]]). The base the check runs against
([`againstOf`](ref:hub/src/worktrees.ts#againstOf)) is the recorded one while it exists; an integration branch
(`origin/tower/arch-v2`) deleted on origin after it merged has usually landed in origin's default, so the check runs
there instead, and the rows say so.

A fork ([[reviewer]]) starts from a snapshot of another checkout, which is that checkout's work, so
[`exposureOf`](ref:hub/src/worktrees.ts#exposureOf) counts only commits beyond the snapshot (`towerFork`) as its own:
with none, it is absorbed whatever its base says, and Tidy deletes its branch.

A copy landed with conflicts resolved, amended or renumbered is a different patch, so it is not absorbed: when every
such commit has a copy made alike in the base, the branch is [[carried]] instead, landed edited, and goes only by its
own press after a look at what landing changed ([`landing`](ref:hub/src/worktrees.ts#landing)). Absorbed alone is
what Tidy all deletes by.
