---
{
  "type": "decision",
  "name": "Work that never landed is discarded deliberately, its tips noted first",
  "summary": "worktree/discard throws away an at-risk worktree as the board showed it (each repo's head and count of uncommitted files, refused once either moved): the floor's recovery record, the answers to tower/discard.record, names each repo's branch and tip (uncommitted files committed on top, on no branch) and its unpushed commits (the reviews extension, when on, as a note on the checkout's review thread); then it removes the worktree with force, deletes its branches and raises tower/discard.done (reviews files the thread). Refused where nothing answers the hook; offered only on at-risk worktrees, on floors where a running extension answers it.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-09",
  "reviewed": "2026-10-26",
  "refs": [
    "hub/src/worktrees.ts#discardable",
    "hub/src/worktrees.ts#discard",
    "hub/src/worktrees.ts#snapshot",
    "hub/extensions/reviews/filing.ts#discardNote",
    "hub/extensions/reviews/server.ts#start",
    "hub/src/bridge/verbs.ts#worktreeOffers",
    "hub/src/tower/dispatch.ts#discardWorktree",
    "hub/src/shared/api.ts#HOOKS",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/shared/worktree-words.ts#discardAsk",
    "hub/src/shared/worktree-words.ts#discardedLine"
  ]
}
---
**Problem.** Removal never throws work away ([[tower-cuts-worktrees]]), so a worktree whose work the user gives up on
would be removed by hand in a shell, with `--force` and `git branch -D`, leaving no record of what went.

**Why.** Discarding is a real decision the user makes about work, so it is a verb every renderer and worker can
reach ([[agents-have-every-capability]]), and it leaves a fact where the work's history already lives: its review
thread ([[review-threads]]).

**How.**
- The board offers `discard` on `at-risk` worktrees only, never `live`, `lost` or `carried`, and only on a floor
  where a running extension answers `tower/discard.record` (reviews, unless it is off there), so the record always
  has a place ([`worktreeOffers`](ref:hub/src/bridge/verbs.ts#worktreeOffers), the board reading each running
  extension's `answers` beside its stores, [`answeredOn`](ref:hub/src/bridge/stores.ts#answeredOn)). Its call carries `held`, each repo's HEAD and count
  of uncommitted files as shown; the renderer adds `author`, as for a note.
- [`discardable`](ref:hub/src/worktrees.ts#discardable) fetches, finds the worktree `at-risk`, refuses (`refused`)
  when any repo's head or uncommitted count differs from `held`, and gives each repo's tip: its HEAD, or a
  [`snapshot`](ref:hub/src/worktrees.ts#snapshot) with its uncommitted files committed on top (on no branch), with
  every unpushed commit named.
- [`discardWorktree`](ref:hub/src/tower/dispatch.ts#discardWorktree) raises the core's hook `tower/discard.record`
  ([`HOOKS`](ref:hub/src/shared/api.ts#HOOKS), `{project, name, author, tips}`, each tip with its `base`, `head`,
  `dirty` and `unpushed`) for the floor's recovery record: no answer at all, or one that fails, refuses the discard
  before anything is removed, and the answers come back in the reply's `x`, by capability, each naming the `item`
  its record is in when it is one ([[extensions]]). On a floor where reviews is on, the reviews extension's answer
  ([`start`](ref:hub/extensions/reviews/server.ts#start)) appends
  [`discardNote`](ref:hub/extensions/reviews/filing.ts#discardNote) to the thread through `reviews/append`, for the
  discard's caller (each repo's branch, full tip, unpushed commits, and `git branch <name> <tip>`). Then
  [`discard`](ref:hub/src/worktrees.ts#discard) removes each
  worktree with `--force` and deletes its branch while it is still at the head the read judged, and only one the
  tower cut (one that moved since, or one checked out there by hand, is kept, named in the reply's `kept`; the note
  says which it keeps). Once all is removed the core raises `tower/discard.done` (`{project, name, author, tips,
  kept}`, `reported` in the reply's `done`), and the reviews answer files the thread as Tidy files a landed one, so a
  discard refused anywhere before (by an answer, or by git) leaves the thread live. The reply names each tip and each record
  ([`discardedLine`](ref:hub/src/shared/worktree-words.ts#discardedLine)); its `thread`, the reviews record's item,
  is kept until 2.0.
- Answers are independent: one that answered before another refused keeps what it recorded (the reviews note, on a
  live thread, naming tips that are still on their branches), as a sequence keeps what is done. A guard that would
  stop a discard wraps `tower/worktree/discard` or the hook with `around`, outside every answer.
- Renderers draw it as a destructive press, asked first with
  [`discardAsk`](ref:hub/src/shared/worktree-words.ts#discardAsk), naming what goes ([[press-feedback]]).

**Alternatives considered.**
- *A digest of the status as the guard*: the count misses one file swapped for another, but the worktree has no
  worker or shell in it (`live` is never offered), so nothing but an outside editor writes there in those seconds;
  the count needs no new board field.
- *Uncommitted files lost outright*: the snapshot costs one commit object and makes the note's tip the whole state.
- *Discard without a record*: the record is the only one of the tips; a floor where nothing answers the hook is
  refused, as one keeping no threads was before the record became the reviews extension's answer.
- *The core writing the note*: the core would keep knowing what a thread is; as a hook answer, any extension can
  record a discard, and reviews is one of them.
- *A force flag on `worktree/remove`*: one verb would mean two things; discard has its own guard and its own record.

**Impact.** Verb `worktree/discard` ([`VERBS`](ref:hub/src/shared/api.ts#VERBS)). Removal can lose work by this verb
alone.
