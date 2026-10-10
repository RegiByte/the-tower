---
{
  "type": "term",
  "name": "Carried",
  "summary": "A branch whose work landed in its base only as copies, some edited on the way (amended, renumbered, conflicts resolved, rebased with other context): not absorbed, but each commit missing from the base is an equal patch there or has a copy made alike (author ident, author date and subject, which git keeps through cherry-pick, rebase and amend) and committed no earlier. A clean worktree on such a branch reads `carried` (\"landed, edited\") and goes by its own remove, after a look at what landing changed; never by Tidy all.",
  "in": "tower",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/bridge/worktrees.ts#copiesOf", "hub/src/bridge/worktrees.ts#carriedOf", "hub/src/bridge/worktrees.ts#isCarried", "hub/src/worktrees.ts#landing", "hub/src/worktrees.ts#marksOf", "hub/src/worktrees.ts#landingOf", "hub/src/shared/cards.ts#editedRows", "hub/src/shared/cards.ts#landingHtml", "hub/test/absorbed.test.ts"]
}
---
Measured on 2026-10-08: of 17 commits landed that night, author email and date matched their copy on main 17/17,
subject 17/17, `git patch-id` only 7/17, so every one of 10 worktrees read at risk under [[absorbed]] alone and was
removed by hand. [`landing`](ref:hub/src/worktrees.ts#landing) runs after the exact checks fail:
`git log --left-right --cherry-mark <base>...<branch>` marks each side's commits ([`marksOf`](ref:hub/src/worktrees.ts#marksOf)),
and [`copiesOf`](ref:hub/src/bridge/worktrees.ts#copiesOf) pairs each branch commit that has no equal patch with one
base commit, one copy per commit.

- *Committed no earlier.* A commit amended on the branch after its older version landed keeps its author date; its
  committer date is later than the copy's, so it stays at risk. So does a branch rebased again after it landed.
- *The subject.* Every worker commits as the user, often within the same second, so author and date alone matched
  unrelated commits in testing; the subject makes a match by coincidence need all three.
- *Never in bulk.* A carried copy may hold less than the branch did (the lander dropped a hunk): the state is its own
  (`carried`, [[tidy]]), Tidy all leaves it out, and the row, the worktree tray and the card's Changes panel offer
  `tower.landing` (`GET /landing?project&branch`, [`landingOf`](ref:hub/src/worktrees.ts#landingOf)): each edited
  commit, its copy and `git range-diff`, drawn by [`landingHtml`](ref:hub/src/shared/cards.ts#landingHtml).
- A card's `checkoutState` counts a carried checkout as landed (`edited`, `branch`), so it offers no note or
  review; Tidy files its thread only once the worktree is gone. A finished hire whose worktree is carried is killed by
  Tidy (it resumes), and its worktree then waits for its own press.
