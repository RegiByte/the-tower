---
{
  "type": "decision",
  "name": "Review threads: one conversation per checkout, kept as a markdown file",
  "summary": "Notes about work that hasn't landed live in one append-only markdown thread per checkout (a tower worktree across every repo of its project, or the main checkouts as `main`), kept in a `reviews` collection; the user, the workers in that checkout and reviewers all write to it, a note may quote the lines it is about, and delivery is a submit into the worker the user picks.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-19",
  "refs": [
    "hub/src/bridge/reviews.ts#checkoutState",
    "hub/src/bridge/reviews.ts#filedThreadOf",
    "hub/src/shared/reviews.ts",
    "hub/src/shared/reviews.ts#parseThread",
    "hub/src/shared/reviews.ts#anchorState",
    "hub/src/shared/reviews.ts#sendText",
    "hub/src/shared/model.ts#checkoutOf",
    "hub/src/bridge/reviews.ts#floorThreads",
    "hub/src/system.ts#threadsIn",
    "hub/src/tower/server.ts#appendReview",
    "hub/src/tower/server.ts#tidyProject",
    "hub/src/shared/reviews.ts#landedThreadId",
    "hub/src/shared/reviews.ts#verdictOf",
    "hub/src/bridge/reviews.ts#reviewHistory",
    "hub/src/directory.ts",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/src/changes.ts#changesIn",
    "hub/src/worktrees.ts#cut",
    "hub/src/worktrees.ts#ownCommits",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/src/shared/cards.ts#sendTargets",
    "hub/src/shared/cards.ts#sendTarget",
    "hub/src/shared/panels.ts#threadViewOf",
    "hub/src/shared/panels.ts#cardThread",
    "hub/src/shared/panels.ts#floorThread",
    "hub/src/shared/cards.ts#threadCheckoutOf",
    "hub/renderers/tower3d/src/reviews.ts",
    "hub/renderers/tower3d/src/pigeonhole.ts",
    "hub/renderers/tower3d/src/layout.ts#pigeonholeFor",
    "hub/renderers/tower3d/src/desk.ts#dressPapers",
    "hub/src/shared/panels.ts#reviewsHtml",
    "hub/test/reviews.test.ts"
  ],
  "links": [
    { "to": "changes-view", "verb": "uses", "carries": "the diff notes are written over, and the lines they quote" },
    { "to": "collections", "verb": "uses", "carries": "one thread file per checkout in the `reviews` collection" }
  ]
}
---
**Problem.** Reviewing a worker's work, whether the user reads it or a reviewer worker does, leaves feedback
with no way back to the author. Copying findings into a terminal by hand is friction, and the author, its
resumes and a reviewer have no shared place to talk about the same lines. `SendMessage` reaches a peer, but
nobody sees it on the board. GitHub threads exist only once a PR is open, and many changes never get one.

**Why.** A person reviewing the Changes pane, a [[reviewer]] worker, the author answering, an author walking
through its own diff and a handoff to whoever works in the checkout next share one shape: a message about a
checkout's unlanded work, sometimes pointing at code. One primitive covers all of them with no new code per use
([[agents-have-every-capability]]: what the user can write, a worker can write).

**How.**
- *Subject: a checkout, across every repo of its project.* A tower cut makes one worktree name in every
  project dir, and a session there works in all of them, so one thread covers a ticket that touches several
  repos. The main checkouts are the checkout named `main`, as `git worktree list` shows it; `cut` refuses the
  name `main` so the two can't collide.
- *Storage: `collections/<project>/reviews/<checkout>.md`*, one plain markdown file per thread, readable with
  `cat`. Each message is a heading `## <author> · <time> · n<k>[ · re n<j>]`, then optional anchors as
  `` `repo:path:lines` `` each followed by the quoted lines as they were, then the body. The quote keeps a note
  readable once the code moves on; [`anchorState`](ref:hub/src/shared/reviews.ts#anchorState) looks for those
  lines in the reader's current Changes to say whether they changed or left the diff. The format is a pure parser
  and printer ([`reviews.ts`](ref:hub/src/shared/reviews.ts), served as `/reviews.js`), total over hand edits.
- *Writing: append only, through one verb.* [`review/append`](ref:hub/src/tower/server.ts#appendReview) numbers the
  note from the thread and writes it in one synchronous step, so appends from the page, `tower note` and every
  worker never interleave; a generic append would leave numbering to clients racing each other. It refuses an
  unknown `re`, a note with neither body nor anchor, and a body that would break the parse (a heading outside a
  fence, a fence left open). Authorship is declared in the heading: same-user processes are trusted. This narrows
  [[workers-edit-kept-items]] for this collection: anyone appends, nobody rewrites.
- *No states.* No resolve, status or kinds: "fixed in 3f2a" is a reply, and a reviewer's finding is a note.
  What a worker hasn't seen is every message after its own last one (`unseenBy`), worked out, not stored.
- *Delivery: `submit` into a worker the user picks* (by default the one most recently active in the checkout).
  [`sendText`](ref:hub/src/shared/reviews.ts#sendText) never carries notes inline: one line naming the sender, the
  notes new to the target and the checkout, how to read and answer them, and, to a hired worker, that it reports
  to its hirer (`card.hiredBy`) once it has, whoever sends it. Sending a few notes and "go read the
  new ones" are the same call.
- *Where the work stands.* [`checkoutState`](ref:hub/src/bridge/reviews.ts#checkoutState) folds each checkout to
  `live`, `landed` or `gone`: `main` is always live; a worktree is landed by the rule Tidy files on (absorbed or
  [[carried]] everywhere), with `empty` when every branch cut under it gained no commits of its own
  ([`ownCommits`](ref:hub/src/worktrees.ts#ownCommits)), and gone once its folder is missing with nothing saying its
  work landed. A worktree Tidy removed is landed through the thread it filed after the card started
  ([`filedThreadOf`](ref:hub/src/bridge/reviews.ts#filedThreadOf)). Each card carries `checkoutState` and
  `threadState` (they differ only for a reviewer, whose thread is its author's,
  [`threadCheckoutOf`](ref:hub/src/shared/cards.ts#threadCheckoutOf)); `note` and `review` are offered
  ([[board-verbs]]), and `card.unseen` counted, only while the work is live. `review/append` still takes any checkout.
- *Lifecycle: the thread is live as long as the work is unlanded.* Tidy files a worktree's thread once its work
  has landed and `main`'s once every main checkout is level with its upstream and no worker runs there
  ([`tidyProject`](ref:hub/src/tower/server.ts#tidyProject), [[tidy]]; a [[discard]]ed worktree's at once, after
  the note naming its tips). A filed thread takes the name [`landedThreadId`](ref:hub/src/shared/reviews.ts#landedThreadId)
  gives it (`<checkout>@<time>.md`) and frees the checkout's name, so a reused name never inherits old notes.
  Filed threads are the review history: [`reviewHistory`](ref:hub/src/bridge/reviews.ts#reviewHistory), at
  `GET /reviews/<project>`, gives every thread, each message with its verdict
  ([`verdictOf`](ref:hub/src/shared/reviews.ts#verdictOf): `**ship**`, `**fix first**` or `**rethink**` in a note without anchors),
  and each author's tally.
- *Changes on main count from the upstream* (unpushed commits and the working tree), from `HEAD` only without one,
  so a commit doesn't turn every note outdated ([[changes-view]]).
- *On the board:* [`threadsIn`](ref:hub/src/system.ts#threadsIn) parses each thread when the collections settle;
  [`floorThreads`](ref:hub/src/bridge/reviews.ts#floorThreads) gives each floor its `threads` (checkout, item, count,
  last message, `landed`, `state`).
- *Workers:* `tower thread [checkout]` prints the thread, the notes new to the caller and the repos an anchor can
  name; `tower note [on <checkout>] [re n<k>] [repo:path:lines …]` appends under the caller's callsign, quoting each
  anchor from the checkout's copy (or the caller's own when it works in a fork of it, the version a reviewer read);
  `tower send <CALLSIGN>` is Send for workers.

**The thread view model** (this is its one home). Every renderer draws a thread through the shared Reviews panel
([[shared-panels]]), and what it shows is built in shared code. New is relative to whose view is open: author and
reviewer iterate on one thread, so in the reviewer's view the author's notes since the reviewer's last are new,
and the reverse. [`cardThread`](ref:hub/src/shared/panels.ts#cardThread) gives a card's thread with that worker as
its reader; [`floorThread`](ref:hub/src/shared/panels.ts#floorThread) a thread opened where no worker's view is (a
floor's list of threads), read as the worker on duty in its checkout, else nobody.
[`threadViewOf`](ref:hub/src/shared/panels.ts#threadViewOf) builds the panel's view from that place, the board and
what the viewer holds (the thread as read, the reader's Changes, its Send pick, the note it answers): anchors are
looked for in the reader's Changes, Send's targets come from [`sendTargets`](ref:hub/src/shared/cards.ts#sendTargets)
(the workers at their composer in the checkout, most recently active first, then the floor's others) and
[`sendTarget`](ref:hub/src/shared/cards.ts#sendTarget), and a settled thread draws read only, under a line saying it
landed or was removed. Renderers sign the user's notes with `board.user.name` ([[the-user]]); bodies are drawn
through `markdownHtml`, raw HTML escaped ([[markdown-safe]]). The tower page draws it as a Reviews tab beside
Changes, where picking lines starts a note; Tower 3D as papers on a worker's desk, a pigeonhole per floor (beside the nook under the loft's
deck, on the game room's outer wall, [`pigeonholeFor`](ref:hub/renderers/tower3d/src/layout.ts#pigeonholeFor)) and
the desk panel's Reviews tab ([[tower3d]]).

**Alternatives considered.**
- *One file per note, threads worked out from replies naming their parent:* nobody can read the thread as one file.
- *A thread per branch or per repo:* one ticket spanning repos would split into several threads.
- *Findings as JSON with triage states:* not readable as a conversation; keep, drop and addressed are better said
  as replies, and "addressed" can't be worked out from the diff, since a changed line isn't a fix.
- *The reviewer `SendMessage`s the author:* invisible on the board, and it lands outside the composer.
- *Only worktrees, no `main`:* many users never cut worktrees, and git already treats main as one.
- *Deciding note offers in the panels:* each renderer would hold the rule; the board carries the state instead.
