---
{
  "type": "decision",
  "name": "Work that never landed is discarded deliberately, its tips noted first",
  "summary": "worktree/discard throws away an at-risk worktree as the board showed it (each repo's head and count of uncommitted files, refused once either moved): it notes each repo's branch and tip (uncommitted files committed on top, on no branch) and its unpushed commits on the checkout's review thread, removes the worktree with force, deletes its branches and files the thread. Offered only on at-risk worktrees, on floors keeping review threads.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-09",
  "reviewed": "2026-10-10",
  "refs": [
    "hub/src/worktrees.ts#discardable",
    "hub/src/worktrees.ts#discard",
    "hub/src/worktrees.ts#snapshot",
    "hub/src/bridge/worktrees.ts#discardNote",
    "hub/src/bridge/verbs.ts#worktreeOffers",
    "hub/src/tower/server.ts#discardWorktree",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/shared/cards.ts#discardAsk",
    "hub/src/shared/cards.ts#discardedLine",
    "hub/renderers/page/index.html"
  ]
}
---
**Problem.** The tower never threw work away ([[tower-cuts-worktrees]]): a worktree at risk offered nothing, and was
removed by hand in a shell, with `--force` and `git branch -D`, leaving no record of what went. On 2026-10-08 the user
removed ten that way, most of them landed edited ([[carried]]), some never landed.

**Why.** Discarding is a real decision the user makes about work, so it is a verb every renderer and worker can
reach ([[agents-have-every-capability]]), and it leaves a fact where the work's history already lives: its review
thread ([[review-threads]]).

**How.**
- The board offers `discard` on `at-risk` worktrees only, never `live`, `lost` or `carried`, and only on a floor
  keeping review threads (`tower init` seeds `reviews`), so the note always has a place
  ([`worktreeOffers`](ref:hub/src/bridge/verbs.ts#worktreeOffers)). Its call carries `held`, each repo's HEAD and count
  of uncommitted files as shown; the renderer adds `author`, as for a note.
- [`discardable`](ref:hub/src/worktrees.ts#discardable) fetches, finds the worktree `at-risk`, refuses (`refused`)
  when any repo's head or uncommitted count differs from `held`, and gives each repo's tip: its HEAD, or a
  [`snapshot`](ref:hub/src/worktrees.ts#snapshot) with its uncommitted files committed on top (on no branch), with
  every unpushed commit named.
- [`discardWorktree`](ref:hub/src/tower/server.ts#discardWorktree) appends
  [`discardNote`](ref:hub/src/bridge/worktrees.ts#discardNote) to the thread first (each repo's branch, full tip,
  unpushed commits, and `git branch <name> <tip>`), then [`discard`](ref:hub/src/worktrees.ts#discard) removes each
  worktree with `--force` and deletes its branch while it is still at the head the read judged, and only one the
  tower cut (one that moved since, or one checked out there by hand, is kept, named in the reply's `kept`; the note
  says which it keeps), then the thread is filed as Tidy files a landed one. The reply names
  each tip and the filed thread; the page's toast says `discarded tower/x at a4cf18c`.
- The page draws it as a destructive press: a `danger` button, a `confirm()` naming what goes
  ([`discardAsk`](ref:hub/src/shared/cards.ts#discardAsk)), then `pressing` ([[press-feedback]]).

**Alternatives considered.**
- *A digest of the status as the guard*: the count misses one file swapped for another, but the worktree has no
  worker or shell in it (`live` is never offered), so nothing but an outside editor writes there in those seconds;
  the count needs no new board field.
- *Uncommitted files lost outright*: the snapshot costs one commit object and makes the note's tip the whole state.
- *Discard without a thread*: the note is the only record of the tips; a floor keeping none is not offered it, and
  the verb refuses there.
- *A force flag on `worktree/remove`*: one verb would mean two things; discard has its own guard and its own record.

**Impact.** API 1.26: verb `worktree/discard {project, name, author, held}` replying `{tips, thread}`;
`WorktreeVerb` gains `discard`, `WorktreeCalls.discard`. Removal can now lose work, by this verb alone. Tower 3D
draws it too (2026-10-09), asked on a second press with `discardAsk` and signed with the user's name. No host change.
