---
{
  "type": "term",
  "name": "Carried",
  "summary": "A branch whose work landed in its base only as copies, some edited on the way (amended, renumbered, conflicts resolved, rebased with other context): not absorbed, but each commit missing from the base is an equal patch there or has a copy made alike (author ident, author date and subject, which git keeps through cherry-pick, rebase and amend) and committed no earlier. A clean worktree on such a branch reads `carried` (\"landed, edited\") and goes by its own remove, after a look at what landing changed; never by Tidy all.",
  "in": "tower",
  "reviewed": "2026-10-21",
  "refs": ["hub/src/bridge/worktrees.ts#copiesOf", "hub/src/bridge/worktrees.ts#carriedOf", "hub/src/bridge/worktrees.ts#isCarried", "hub/src/worktrees.ts#landing", "hub/src/worktrees.ts#marksOf", "hub/src/worktrees.ts#landingOf", "hub/src/shared/cards.ts#editedRows", "hub/src/shared/cards.ts#landingHtml", "hub/test/absorbed.test.ts"]
}
---
Landed copies often differ from their branch's patch, so a branch checked under [[absorbed]] alone reads at risk.
[`landing`](ref:hub/src/worktrees.ts#landing) runs after the exact checks fail:
`git log --left-right --cherry-mark <base>...<branch>` marks each side's commits ([`marksOf`](ref:hub/src/worktrees.ts#marksOf)),
and [`copiesOf`](ref:hub/src/bridge/worktrees.ts#copiesOf) pairs each branch commit that has no equal patch with one
base commit, one copy per commit.

- *Committed no earlier.* A commit amended on the branch after its older version landed keeps its author date; its
  committer date is later than the copy's, so it stays at risk. So does a branch rebased again after it landed.
- *The subject.* Every worker commits as the user, often within the same second, so author and date alone matched
  unrelated commits in testing; the subject makes a match by coincidence need all three.
- *Its own state.* A carried copy may hold less than the branch did, so it is never removed in bulk ([[tidy]]); the
  row, the worktree tray and the card's Changes panel offer `tower.landing` (`GET /landing?project&branch`, [`landingOf`](ref:hub/src/worktrees.ts#landingOf)): each edited
  commit, its copy and `git range-diff`, drawn by [`landingHtml`](ref:hub/src/shared/cards.ts#landingHtml).
- A card's `checkoutState` counts a carried checkout as landed (`edited`, `branch`), so it offers no note or
  review; Tidy files its thread only once the worktree is gone.
