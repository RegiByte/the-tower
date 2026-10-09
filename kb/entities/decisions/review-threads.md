---
{
  "type": "decision",
  "name": "Review threads: one conversation per checkout, kept as a markdown file",
  "summary": "Notes about work that hasn't landed live in one append-only markdown thread per checkout (a tower worktree across every repo of its project, or the main checkouts as `main`), kept in a `reviews` collection; the user, the workers in that checkout and reviewers all write to it, a note may quote the lines it is about, and delivery is a submit into the worker the user picks.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-08",
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
    "hub/renderers/page/index.html",
    "hub/src/shared/cards.ts#sendTargets",
    "hub/src/shared/cards.ts#threadCheckoutOf",
    "hub/renderers/tower3d/src/reviews.ts",
    "hub/renderers/tower3d/src/pigeonhole.ts",
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

**Why.** Three uses share one shape: a person reviewing the Changes pane, a reviewer worker (draft
`wavy-lantern`) and the author answering. Two more have the same shape: an author walking through its own
diff, and a handoff to whoever works in the checkout next. Every one of them is a message about a checkout's
unlanded work, sometimes pointing at code. Building that primitive covers all of them with no new code per use
([[agents-have-every-capability]]: what the user can write, a worker can write).

**How.**
- *Subject: a checkout, across every repo of its project.* A tower cut makes one worktree name in every
  project dir, and a session there works in all of them, so one thread covers a ticket that touches five
  repos. The main checkouts are the checkout named `main`, as `git worktree list` shows it; `cut` refuses the
  name `main` so the two can't collide.
- *Storage: `collections/<project>/reviews/<checkout>.md`*, one plain markdown file per thread, readable with
  `cat` by a person or an agent. Each message is a heading `## <author> · <time> · n<k>[ · re n<j>]`, then
  optional anchors as `` `repo:path:lines` `` each followed by the quoted lines as they were, then the body.
  The quote keeps a note readable once the code moves on; a renderer looks for those lines in the current
  diff to say whether they changed.
- *Writing: append only, through the tower.* One append verb serializes the page, `tower note` and every
  worker. Authorship is declared in the heading: same-user processes are trusted. This narrows
  [[workers-edit-kept-items]] for this collection: anyone appends, nobody rewrites.
- *No states.* No resolve, status or kinds: "fixed in 3f2a" is a reply, and a reviewer's finding is a note.
  What a worker hasn't seen is every message after its own last one, so read state is worked out, not stored.
- *Delivery: `submit` into a worker the user picks* (default: the one most recently active in the checkout),
  pointing at the thread (`tower thread`). Sending a few notes and "go read the new ones" are the same call.
- *Lifecycle: the thread is live as long as the work is unlanded.* Tidy files a worktree's thread once every
  branch of that name is absorbed (a recut branch keeps its name, so the thread survives a recut), and `main`'s
  once its diff is empty: it takes the name [`landedThreadId`](ref:hub/src/shared/reviews.ts#landedThreadId) gives
  it (`odin-42@2026-10-07-1530.md`), is no floor's thread from then on, and the checkout's name is free for a
  thread about new work (`main`'s and a reused worktree name's would otherwise carry old notes, counted unseen by
  the next worker). Filed threads are the review history: [`reviewHistory`](ref:hub/src/bridge/reviews.ts#reviewHistory),
  served at `GET /reviews/<project>`, gives every thread, live and landed, each message with its verdict
  ([`verdictOf`](ref:hub/src/shared/reviews.ts#verdictOf): a reviewer's anchorless closing note, `**ship**`,
  `**fix first**` or `**rethink**`, or `**Verdict: …**`), and each author's notes, replies, verdicts and checkouts.
- *Changes on main count from the upstream* (unpushed commits and the working tree), and from `HEAD` only
  without one. Counting from `HEAD` would turn every note outdated at the first commit. This changes
  [[changes-view]] when built.
- *Renderers:* a Reviews tab beside Changes renders the thread with its quoted code and a tally of what the
  chosen worker hasn't seen; selecting lines in Changes starts a note. An item is shown by its checkout name
  as well as its tag ([[item-tags]]).

**Alternatives considered.**
- *One file per note, threads worked out from replies naming their parent:* each note's author comes from the
  log (`tower.keep`), but nobody can read the thread as one file.
- *A thread per branch or per repo:* one ticket spanning repos would split into several threads.
- *Findings as JSON with triage states (draft `sleepy-cedar`, first version):* not readable as a conversation;
  keep, drop and addressed are better said as replies. "Addressed" can't be worked out from the diff, since a
  changed line isn't a fix.
- *The reviewer `SendMessage`s the author:* invisible on the board, and it lands outside the composer.
- *Only worktrees, no `main`:* many users never cut worktrees, and git already treats main as one.

**Built (2026-10-06, DANIEL-73).**
- *Format* ([`reviews.ts`](ref:hub/src/shared/reviews.ts)): a pure parser and printer, total over hand edits, imported
  by the core and served to renderers as `/reviews.js`. A quote is fenced longer than any backtick run it holds; a
  quote of picked diff rows holding a removal is a `diff` block keeping git's marks, its lines numbered on the new
  side (the old side when only removals are picked). The parser ignores a heading-shaped line inside a code fence, and
  the verb refuses a body with one outside a fence. Pinned by a thread recorded through the verb
  (`test/fixtures/review-thread.md`): printing what was parsed gives the file back.
- *Verb: `review/append`*, not a generic `collection/append`. The note's number and the file's name come from the
  thread, so they must be worked out inside the one serialization point; a generic append would leave numbering to
  clients racing each other. [`appendReview`](ref:hub/src/tower/server.ts#appendReview) reads, numbers and writes in
  one synchronous step, so appends never interleave; the file arrives by rename (`putItem`). It refuses an unknown
  `re`, an empty note and an author a heading can't carry. The collection must be declared (`reviews`, every project
  in the real config), like any other.
- *On the board*: [`threadsIn`](ref:hub/src/system.ts#threadsIn) parses each thread when the collections settle (a file
  at the same version isn't read again); [`floorThreads`](ref:hub/src/bridge/reviews.ts#floorThreads) gives each floor
  `threads` (checkout, item id, tag, count, last message, `landed`), and each card its `checkout` and `unseen`,
  counted on the thread about its work ([`threadCheckoutOf`](ref:hub/src/shared/cards.ts#threadCheckoutOf): a
  reviewer's is its author's, which every renderer opens for it too).
- *Landed*: a worktree's thread once no worktree of the name is in use or holds work and every repo's branch under
  the name is absorbed; `main`'s once every main checkout is clean and level with its upstream (git read every 5 s,
  `RepoRead.main`) **and no worker runs there**, the same rule a worktree in use follows. Tidy files the threads its
  list named, those the board called landed at the press, after git's part
  ([`tidyProject`](ref:hub/src/tower/server.ts#tidyProject), [[tidy]]); `tidied` names them, and `tidy` is offered
  while any thread has landed.
- *Notes are offered only while the work goes on* (2026-10-08, BIT-80, API 1.20). A stopped worker whose work landed still
  drew a note form, and its notes reached nobody. Each card says where its checkout's work stands, and where the work
  its thread is about stands (`checkoutState`, `threadState`; they differ only for a reviewer), and each floor thread
  its `state`, all by one fold, [`checkoutState`](ref:hub/src/bridge/reviews.ts#checkoutState): `main` is always
  `live`; a worktree is `landed` by the same rule Tidy files on (its `on` the base, while git still holds the
  worktree or a branch cut under its name), `gone` once its folder is missing or it is removed with nothing saying its
  work landed, else `live`. A worktree removed by Tidy is `landed` through the thread it filed: the first filed after
  the card started ([`filedThreadOf`](ref:hub/src/bridge/reviews.ts#filedThreadOf), since the name may be cut again),
  carried as `filed` so renderers read that file. The card and the floor thread offer `note` ([[board-verbs]]) only
  while `live`; `review/append` still takes any checkout (`main`'s thread and odd cases need it), so only the offer
  goes. Rejected: a per-floor map of every checkout's state (one entry per archived worker on every board push), and
  deciding in the panels (each renderer would hold the rule).
- *Nothing to land, review and unseen follow the state* (2026-10-08, SIGURD-96). A worktree cut and stopped with no
  commits is trivially absorbed, so it read "Landed". Git now reads, per branch the tower cut, the commits it gained
  since its reflog's creation entry (`own`, [`ownCommits`](ref:hub/src/worktrees.ts#ownCommits); none once the reflog
  no longer holds the creation), and a landed state whose every branch says 0 carries `empty`: both panels say
  "Nothing to land". A worktree already removed says nothing, so it stays plainly landed. Tidy is unchanged. `review` is
  offered only while the card's own checkout is live ([[reviewer]]), and `card.unseen` is left out once its thread's
  checkout isn't, and the shared Reviews panel marks nothing new on a settled thread, so no renderer tallies notes new to
  a worker on landed work. Rejected: an ahead count against the
  base (0 for landed work and for none alike), and a recorded cut commit (absent on every branch cut before it).
- *Workers*: `tower thread [checkout]` prints the file and the notes new to you; `tower note [on <checkout>] [re n<k>]
  [repo:path:lines …]` appends under your callsign with the body on stdin, quoting each anchor from the checkout's
  copy of the repo as it is now, or from your own when your worktree is a fork of that checkout: the version a
  [[reviewer]] read. `on` lets a reviewer working elsewhere write on another checkout; `tower send <CALLSIGN>` is Send
  for workers.
- *Send points at the thread*, never carries notes inline: [`sendText`](ref:hub/src/shared/reviews.ts#sendText) names
  the sender and the notes new to the target (`n3, n4`), and how to read and answer them, with the checkout spelled
  out so a worker in another checkout reads the right thread. One line, so it lands as typed. Picking notes to send
  is the same call: what is new to the target is worked out.
- *Tower page*: Reviews tab beside Changes (`N new` for the selected worker, else the count), quotes marked
  `changed since` or `no longer in the diff` by [`anchorState`](ref:hub/src/shared/reviews.ts#anchorState) over the
  worker's Changes read, a click on an anchor opens its lines in Changes; line numbers in Changes pick lines (a drag
  or ⇧-click picks a range, within one hunk)
  and open a note box under them, and noted lines carry a mark; a composer with `reply` for notes on the whole work;
  Send to the worker most recently active in the checkout, or one picked; a sidebar tray of threads by checkout
  beside their tags, with Tidy. Bodies are drawn through `markdownHtml`, raw HTML escaped, so nothing a worker wrote
  runs in the page ([[chat-brief]]).
- *Shared by both renderers* ([`cards.ts`](ref:hub/src/shared/cards.ts#sendTargets)): who Send reaches (`sendTargets`: the
  workers at their composer in the checkout, the most recently active first, then the floor's others), the worker a
  thread opens on (`workerIn`), the thread a worker's work belongs to (`threadCheckoutOf`: its author's for a
  reviewer). Renderers sign the user's notes with `board.user.name` and Send names the sender `THE_USER` ([[the-user]]).
- *Tower 3D (2026-10-06, SADDIE-61)*: notes new to a worker lie as a stack of papers in front of its mouse with a
  "N NEW" flag ([`dressPapers`](ref:hub/renderers/tower3d/src/desk.ts#dressPapers)); aimed at, T reads them and H sends
  them (the same `sendText` submit). Each floor keeping threads has a pigeonhole on the control room's outer wall past
  its door ([`pigeonhole.ts`](ref:hub/renderers/tower3d/src/pigeonhole.ts)): a slot per checkout, a sheet per note,
  its label orange while the worker on duty there has notes it hasn't seen; T opens the thread at that worker's desk,
  or in a reader when nobody works there now, and H sends. The desk panel gains a Reviews tab
  ([`reviewsHtml`](ref:hub/src/shared/panels.ts#reviewsHtml)): the thread as the tower page draws it, quotes
  marked `changed since` against the Changes of whoever works in the checkout, Send with its picker, and a composer
  with reply. Once the work no longer goes on, both renderers draw the thread read only (no composer, reply or Send,
  no line picking in Changes) under a line saying it landed, and when its thread was filed, or that its worktree was
  removed; a gone checkout with no thread says it has none. An anchor opens the desk's Changes tab scrolled to its line ([[changes-view]]), and lines picked there
  start a note on the thread the Reviews tab shows (the author's, at a reviewer's desk).
- *One view in both renderers* ([[shared-panels]]): the tower page and Tower 3D draw Changes and Reviews through the
  same module and wire the same data attributes. The thread is read once per version of its file ([`reviews.ts`](ref:hub/renderers/tower3d/src/reviews.ts)),
  and Send waits for it, so the pointer names the notes.

**Impact.** A `reviews` collection, the `review/append` verb, `tower thread` / `tower note` in the mod with a
Reviews section in the tower skill, board fields `floor.threads`, `card.checkout`, `card.unseen`, a Reviews tab and
line selection in the tower page, `cut` refusing `main`, Changes counting from the upstream on a branch that has one
([[changes-view]]), and Tidy filing landed threads as the review history. Deleting them (as first built) left no
record of past reviews, and a reused checkout name would have inherited an old thread. Built from draft `sleepy-cedar` (the thread); draft
`wavy-lantern` (the reviewer) writes into it.
