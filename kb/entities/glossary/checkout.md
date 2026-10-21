---
{
  "type": "term",
  "name": "Checkout",
  "summary": "Where a worker's files are, across every dir of its project: a worktree's name, or main for the main checkouts. Review threads, forks and a card's checkout are all named by it.",
  "in": "tower",
  "reviewed": "2026-10-21",
  "refs": ["hub/src/shared/model.ts#MAIN_CHECKOUT", "hub/src/shared/model.ts#checkoutOf", "hub/src/shared/model.ts#checkoutDirs", "hub/src/shared/reviews.ts#threadId"]
}
---
A session's checkout is derived from its cwd ([`checkoutOf`](ref:hub/src/shared/model.ts#checkoutOf)): the
[[worktree]] it is in, else `main`, a name a cut or fork refuses ([`refuseMain`](ref:hub/src/worktrees.ts#refuseMain)).
[`checkoutDirs`](ref:hub/src/shared/model.ts#checkoutDirs) gives its directories, one per repo of the project. Each
checkout has one live review thread, `<checkout>.md` in the `reviews` collection ([[review-threads]]); once its work
lands or is discarded, the thread is filed as `<checkout>@<YYYY-MM-DD-HHMM>.md`
([`landedThreadId`](ref:hub/src/shared/reviews.ts#landedThreadId)) and the name is free for new work ([[tidy]],
[[discard]]). A fork is a new worktree started from a snapshot of a checkout ([[reviewer]]).
