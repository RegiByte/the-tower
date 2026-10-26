---
{
  "type": "term",
  "name": "Absorbed",
  "summary": "The tower's meaning of merged: a branch whose changes are already in its base, because merging it would change nothing (merge-tree of base and branch equals the base's tree) or each of its commits landed there as an equal patch (`git patch-id`, a rebased or cherry-picked copy).",
  "in": "tower",
  "reviewed": "2026-10-26",
  "refs": ["hub/src/worktrees.ts#landing", "hub/src/worktrees.ts#marksOf", "hub/src/worktrees.ts#againstOf", "hub/src/worktrees.ts#exposureOf", "hub/src/worktrees.ts#deleteAbsorbed", "hub/src/worktrees.ts#deleteLanded"]
}
---
An absorbed branch is one the tower may delete ([[tower-cuts-worktrees]]); so is a [[carried]] one, by its own press,
and work at risk only by [[discard]]. Tidy deletes by absorbed alone. The base the check runs against
([`againstOf`](ref:hub/src/worktrees.ts#againstOf)) is the recorded one while it exists, else origin's default, where
an integration branch deleted on origin after it merged has usually landed.

A fork ([[reviewer]]) starts from a snapshot of another checkout, which is that checkout's work, so
[`exposureOf`](ref:hub/src/worktrees.ts#exposureOf) counts as its own only commits beyond the snapshot (`towerFork`)
that are on no remote: with none, it is absorbed whatever its base says.

A copy landed with conflicts resolved, amended or renumbered is a different patch, so it is not absorbed; it may be
[[carried]].
