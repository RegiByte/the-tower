---
{
  "type": "decision",
  "name": "Review threads: one conversation per checkout, kept as a markdown file",
  "summary": "Notes about work that hasn't landed live in one append-only markdown thread per checkout (a tower worktree across every repo of its project, or the main checkouts as `main`), kept in a `reviews` collection; the user, the workers in that checkout and reviewers all write to it, a note may quote the lines it is about, and delivery is a submit into the worker the user picks.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-30",
  "refs": [
    "hub/extensions/reviews/extension.json",
    "hub/extensions/reviews/server.ts",
    "hub/src/bridge/checkouts.ts#checkoutState",
    "hub/src/bridge/checkouts.ts#landedByRecord",
    "hub/extensions/reviews/threads.ts#filedThreadOf",
    "hub/extensions/reviews/threads.ts#cardPart",
    "hub/src/bridge/legacy.ts#LEGACY_FIELDS",
    "hub/extensions/reviews/client/reviews.ts",
    "hub/extensions/reviews/client/reviews.ts#parseThread",
    "hub/extensions/reviews/client/reviews.ts#anchorState",
    "hub/extensions/reviews/client/reviews.ts#sendText",
    "hub/src/shared/model.ts#checkoutOf",
    "hub/extensions/reviews/threads.ts#floorThreads",
    "hub/extensions/reviews/server.ts",
    "hub/extensions/reviews/server.ts#append",
    "hub/extensions/reviews/filing.ts#tidyEntries",
    "hub/src/shared/reviews.ts#landedThreadId",
    "hub/extensions/reviews/client/reviews.ts#verdictOf",
    "hub/extensions/reviews/threads.ts#reviewHistory",
    "hub/extensions/reviews/client/reviews.ts#resolvesOf",
    "hub/extensions/reviews/client/reviews.ts#resolvedIn",
    "hub/extensions/reviews/client/reviews.ts#unseenBy",
    "hub/src/directory.ts",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/src/changes.ts#changesIn",
    "hub/src/worktrees.ts#cut",
    "hub/src/worktrees.ts#ownCommits",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/src/shared/checkouts.ts#sendTargets",
    "hub/src/shared/checkouts.ts#sendTarget",
    "hub/extensions/reviews/client/panel.ts#threadViewOf",
    "hub/extensions/reviews/client/panel.ts#cardThread",
    "hub/extensions/reviews/client/panel.ts#floorThread",
    "hub/extensions/reviews/client/reviews.ts#threadCheckoutOf",
    "hub/renderers/tower3d/src/reviews.ts",
    "hub/renderers/tower3d/src/pigeonhole.ts",
    "hub/renderers/tower3d/src/layout.ts#pigeonholeFor",
    "hub/renderers/tower3d/src/desk.ts#dressPapers",
    "hub/extensions/reviews/client/panel.ts#reviewsHtml",
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
- *Owner: the bundled reviews extension* ([`extensions/reviews`](ref:hub/extensions/reviews/extension.json), since
  1.93; before, the core). Its `reviews` collection is owned: the generic writes are refused naming
  `reviews/append`, its generic reads stay open, and its doors say how others reach it (`edit` and `delete` as
  `none`, the domain's append-only rule and filing by Tidy). A config's `collections.reviews` line overrides its
  label and description, and on a floor with `capabilities.reviews.off` the threads stay files nobody folds
  ([[extensions]]).
- *Storage: `collections/<project>/reviews/<checkout>.md`*, one plain markdown file per thread, readable with
  `cat`. Each message is a heading `## <author> · <time> · n<k>[ · re n<j>]`, then optional anchors as
  `` `repo:path:lines` `` each followed by the quoted lines as they were, then the body. The quote keeps a note
  readable once the code moves on; [`anchorState`](ref:hub/extensions/reviews/client/reviews.ts#anchorState) looks for those
  lines in the reader's current Changes to say whether they changed or left the diff. The format is a pure parser
  and printer ([`reviews.ts`](ref:hub/extensions/reviews/client/reviews.ts), the extension's client, served as
  `/x/reviews/reviews.js` and as `/reviews.js` through `LEGACY` until 2.0), total over hand edits. The names the
  core still uses (the collection's name, a thread's file and a filed thread's, the reviewer's prompt, a repo's name)
  stay in `src/shared/reviews.ts`, which the client re-exports.
- *Writing: append only, through one verb.* [`reviews/append`](ref:hub/extensions/reviews/server.ts#append) numbers the
  note from the thread and writes it whole (`ctx.collections.put`), each append after the one before it, so appends
  from the page, `tower note` and every worker never interleave (`review/append` answers through `LEGACY`, deprecated); a generic append would leave numbering to clients racing each other. It refuses an
  unknown `re`, a note with neither body nor anchor, and a body that would break the parse (a heading outside a
  fence, a fence left open). Authorship is declared in the heading: same-user processes are trusted. This narrows
  [[workers-edit-kept-items]] for this collection: anyone appends, nobody rewrites.
- *No states but resolved, and it is a note.* No status or kinds: "fixed in 3f2a" is a reply, and a reviewer's
  finding is a note. `reviews/resolve` (the reviews collection's edit door) appends a note like any other whose body
  opens `**Resolved:** n3, n4` ([`resolvesOf`](ref:hub/extensions/reviews/client/reviews.ts#resolvesOf)), so a thread holding one
  reads as before wherever resolving is unknown; it refuses a note that is missing, resolved already or a resolution
  itself. [`resolvedIn`](ref:hub/extensions/reviews/client/reviews.ts#resolvedIn) folds which notes are resolved, by what. What a
  worker hasn't seen is every message after its own last one, but resolved notes and resolutions that say nothing
  more ([`unseenBy`](ref:hub/extensions/reviews/client/reviews.ts#unseenBy)), worked out, not stored. The Reviews panel dims a
  resolved note under a mark naming its resolution and offers Resolve on the others while the work is live.
- *Delivery: `submit` into a worker the user picks* (by default the one most recently active in the checkout).
  [`sendText`](ref:hub/extensions/reviews/client/reviews.ts#sendText) never carries notes inline: one line naming the sender, the
  notes new to the target and the checkout, how to read and answer them, and, to a hired worker, that it reports
  to its hirer (`card.hiredBy`) once it has, whoever sends it. Sending a few notes and "go read the
  new ones" are the same call.
- *Where the work stands.* [`checkoutState`](ref:hub/src/bridge/checkouts.ts#checkoutState) folds each checkout to
  `live`, `landed` or `gone`: `main` is always live; a worktree is landed by the rule Tidy files on (absorbed or
  [[carried]] everywhere), with `empty` when every branch cut under it gained no commits of its own
  ([`ownCommits`](ref:hub/src/worktrees.ts#ownCommits)), and gone once its folder is missing with nothing saying its
  work landed. The state is the core's, a fact about a checkout ([`src/bridge/checkouts.ts`](ref:hub/src/bridge/checkouts.ts#checkoutState),
  read from a floor's worktrees, kept branches and `floor.main`); the extension adds what only threads know: a
  worktree Tidy removed is landed through the thread it filed after the card started
  ([`filedThreadOf`](ref:hub/extensions/reviews/threads.ts#filedThreadOf), applied by
  [`landedByRecord`](ref:hub/src/bridge/checkouts.ts#landedByRecord)). Each card carries the core's `checkoutState`
  and, in `x.reviews` ([`cardPart`](ref:hub/extensions/reviews/threads.ts#cardPart)), the checkout its thread is about
  (a reviewer's is its author's, [`threadCheckoutOf`](ref:hub/extensions/reviews/client/reviews.ts#threadCheckoutOf), by `x.reviews.of`), its
  `threadState`, the thread `filed` for its own work, `unseen` and the `note` call, the last two only while the
  work is live; the reviews extension's Review is offered only while its own work is ([[board-verbs]], [[reviewer]]). `reviews/append` still takes any
  checkout. Until 2.0, `LEGACY` copies them to `card.threadState`, `card.unseen`, `card.checkoutState.filed` and the
  card's `note` verb, calling `review/append`.
- *Lifecycle: the thread is live as long as the work is unlanded.* Tidy files a worktree's thread once its work
  has landed and `main`'s once every main checkout is level with its upstream and no worker runs there: the reviews
  extension's floor fold lists one tidy entry per landed thread, naming its checkout so the autotidy extension files it
  once that checkout's workers went home, where its settings say so
  ([`tidyEntries`](ref:hub/extensions/reviews/filing.ts#tidyEntries)) and its answer to `tower/tidy.apply` files each
  ([`start`](ref:hub/extensions/reviews/server.ts#start), [[tidy]]); a [[discard]]ed worktree's gets the note naming its
  tips in its answer to `tower/discard.record`, and is filed in its answer to `tower/discard.done`, once the worktree
  is gone. The core's Tidy and discard know no thread. A filed thread takes the name [`landedThreadId`](ref:hub/src/shared/reviews.ts#landedThreadId)
  gives it (`<checkout>@<time>.md`) and frees the checkout's name, so a reused name never inherits old notes.
  Filed threads are the review history: [`reviewHistory`](ref:hub/extensions/reviews/threads.ts#reviewHistory), at
  `GET /reviews/history/<project>` (`GET /reviews/<project>` through `LEGACY`), gives every thread, each message with its verdict
  ([`verdictOf`](ref:hub/extensions/reviews/client/reviews.ts#verdictOf): `**ship**`, `**fix first**` or `**rethink**` in a note without anchors),
  and each author's tally.
- *Changes on main count from the upstream* (unpushed commits and the working tree), from `HEAD` only without one,
  so a commit doesn't turn every note outdated ([[changes-view]]).
- *On the board:* the extension's [`parse`](ref:hub/extensions/reviews/server.ts) reads each thread once per
  version of its file; [`floorThreads`](ref:hub/extensions/reviews/threads.ts#floorThreads) gives each floor
  `x.reviews.threads` (checkout, item, count, last message, `landed`, `resolved`, `state`, the note call), each a subject
  `reviews.thread:<project>/<checkout>` others may contribute to; `floor.threads` is their copy until 2.0.
- *Workers:* the CLI reads its words from the extension (`reviews/said/<project>`): `tower thread [checkout]` prints the thread, the notes new to the caller and the repos an anchor can
  name; `tower note [on <checkout>] [re n<k>] [repo:path:<line>[-<line>] …]` appends under the caller's callsign, quoting each
  anchor from the checkout's copy (or the caller's own when it works in a fork of it, the version a reviewer read);
  `tower send <CALLSIGN>` is Send for workers.

**The thread view model** (this is its one home). Every renderer draws a thread through the Reviews panel, the
extension's client at `/x/reviews/panel.js` ([[shared-panels]]), and what it shows is built there. New is relative to whose view is open: author and
reviewer iterate on one thread, so in the reviewer's view the author's notes since the reviewer's last are new,
and the reverse. [`cardThread`](ref:hub/extensions/reviews/client/panel.ts#cardThread) gives a card's thread with that worker as
its reader; [`floorThread`](ref:hub/extensions/reviews/client/panel.ts#floorThread) a thread opened where no worker's view is (a
floor's list of threads), read as the worker on duty in its checkout, else nobody.
[`threadViewOf`](ref:hub/extensions/reviews/client/panel.ts#threadViewOf) builds the panel's view from that place, the board and
what the viewer holds (the thread as read, the reader's Changes, its Send pick, the note it answers): anchors are
looked for in the reader's Changes, Send's targets come from [`sendTargets`](ref:hub/src/shared/checkouts.ts#sendTargets)
(the workers at their composer in the checkout, most recently active first, then the floor's others) and
[`sendTarget`](ref:hub/src/shared/checkouts.ts#sendTarget), and a settled thread draws read only, under a line saying it
landed or was removed. Renderers sign the user's notes with `board.user.name` ([[the-user]]); bodies are drawn
through `markdownHtml`, raw HTML escaped ([[markdown-safe]]). The tower page draws it as a Reviews tab beside
Changes, where picking lines starts a note; Tower 3D as papers on a worker's desk, a pigeonhole per floor (beside the nook under the loft's
deck, on the game room's outer wall, [`pigeonholeFor`](ref:hub/renderers/tower3d/src/layout.ts#pigeonholeFor)) and
the desk panel's Reviews tab ([[tower3d]]).

**Alternatives considered.**
- *One file per note, threads worked out from replies naming their parent:* nobody can read the thread as one file.
- *A thread per branch or per repo:* one ticket spanning repos would split into several threads.
- *Resolving by rewriting a note* (`reviews/edit`): ends append-only, and a thread's file would no longer be its
  history.
- *Findings as JSON with triage states:* not readable as a conversation; keep, drop and addressed are better said
  as replies, and "addressed" can't be worked out from the diff, since a changed line isn't a fix.
- *The reviewer `SendMessage`s the author:* invisible on the board, and it lands outside the composer.
- *Only worktrees, no `main`:* many users never cut worktrees, and git already treats main as one.
- *Deciding note offers in the panels:* each renderer would hold the rule; the board carries the state instead.
