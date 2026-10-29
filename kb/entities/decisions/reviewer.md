---
{
  "type": "decision",
  "name": "A reviewer is a worker hired in a fork of the author's checkout",
  "summary": "Any worker's card offers Review, the reviews extension's `reviews/hire`: a spawn in a new worktree forked from a snapshot of the author's checkout (uncommitted work included), started on the mod's `review` skill; the reviewer reads the author's goal and diff, runs checks in its own copy, leaves one note per finding on the author's thread, and stops after one round. The pair is logged at its spawn: its `of` field, and the crew edge and hiring exemption reviews' launch contributor gives; a reviewer spawned before 1.95 is read from its first prompt through LEGACY.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-29",
  "refs": [
    "hub/src/worktrees.ts#fork",
    "hub/src/worktrees.ts#snapshot",
    "hub/src/tower/dispatch.ts#spawnCut",
    "hub/src/shared/api.ts",
    "hub/extensions/reviews/server.ts#launch",
    "hub/extensions/reviews/server.ts#unreviewable",
    "hub/extensions/reviews/server.ts#ofCard",
    "hub/extensions/reviews/extension.json",
    "hub/src/bridge/board.ts#withReports",
    "hub/src/bridge/legacy.ts#legacyReviewer",
    "hub/src/bridge/legacy.ts#legacyCrew",
    "hub/src/bridge/legacy.ts#LEGACY_ACTIONS",
    "hub/extensions/reviews/client/reviews.ts#reviewerOf",
    "hub/src/shared/launch.ts#launchPrompt",
    "hub/src/shared/worker-details.ts#pairLineOf",
    "hub/src/mod/skills/review/SKILL.md",
    "hub/src/directory.ts",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/renderers/tower3d/src/acts.ts#KEY",
    "hub/src/bridge/seats.ts#seats",
    "hub/renderers/tower3d/src/desk.ts#makeVisitor",
    "hub/renderers/tower3d/src/life.ts#carryIn",
    "hub/renderers/tower3d/src/life.ts#carryChair",
    "hub/scripts/sandbox.ts"
  ],
  "links": [
    { "to": "review-threads", "verb": "writes", "carries": "one note per finding and a closing verdict, on the author's checkout" },
    { "to": "tower-cuts-worktrees", "verb": "uses", "carries": "a fork: a cut from a snapshot of a checkout" },
    { "to": "extensions", "verb": "uses", "carries": "the reviews extension's `reviews/hire`, its `of` spawn field and launch contributor, and the card verb `review` kept by LEGACY" },
    { "to": "agents-have-every-capability", "verb": "follows", "carries": "any worker can hire a reviewer, its own included" }
  ]
}
---
**Problem.** Reviewing a worker's work meant the user reading the Changes pane alone, or prompting a second
worker by hand, with no shared context and nowhere for the findings to go. The flow people expect: a worker
writes, and a second one reviews it before anyone merges.

**Why.** The pieces existed: worktrees cut by the tower, the Changes read, `tower agent` for the author's goal,
review threads for findings ([[review-threads]]), and every verb in every worker's hands
([[agents-have-every-capability]]). What was missing was where the reviewer works, how it is started and paired,
and how its findings reach the author.

**How.**
- *A fork, not the author's checkout.* A reviewer that runs tests writes caches and builds; in the author's
  worktree that collides with the author still working there. `spawn {cut: {from: <checkout>}}`
  ([`fork`](ref:hub/src/worktrees.ts#fork)) cuts a new worktree in every repo of the project, each started from a
  [`snapshot`](ref:hub/src/worktrees.ts#snapshot) of the source checkout: its HEAD with every staged, unstaged and
  untracked file on top, committed from a copy of its index (`GIT_INDEX_FILE`), so the author's index, files and
  refs are never touched. Each branch records the base the source's work counts from (`againstFor`), so the fork's
  Changes start as the author's did at the snapshot, plus `towerFork` (the snapshot) and `towerFrom` (the checkout).
  Origin is fetched first, as for a cut (else `offline`); nothing is pushed. The fork is a general primitive: trying an alternative from another worker's state
  takes the same call.
- *Tidy knows a fork.* A fork's snapshot is the source's work, so only commits made on top of it count as unpushed;
  a fork with none is [[absorbed]], `removable` once its reviewer stops, and Tidy deletes its branch. A reviewer that
  committed a failing test leaves its fork `at-risk` until the user decides.
- *The verb.* The reviews extension's card fold offers Review on each card, the action
  `['reviews/hire', {project, of: callsign}]` in `board.adds`, once it has a conversation, when every dir of its floor is
  a git repo (`floor.git`) and its checkout's work goes on (`card.checkoutState` live: a fork needs the checkout, and
  work that landed has nothing left to review), unless it is itself a reviewer
  ([`unreviewable`](ref:hub/extensions/reviews/server.ts#unreviewable)). `reviews/hire {project, of, by?, tell?}` refuses
  with the same reason, else spawns `{cut: {from: <author's checkout>}, prompt: '/tower:review <CALLSIGN> [tell]',
  x: {reviews: {of: <CALLSIGN>}}}`, a hire when `by` is given. Workers run it as `tower review <CALLSIGN> [tell]`.
  Until 2.0 each card the action is on also carries the card verb `review` with its old call,
  `['spawn', {project, cut: {from: checkout}, prompt: '/tower:review <CALLSIGN>'}]`, copied by `LEGACY`
  ([`LEGACY_ACTIONS`](ref:hub/src/bridge/legacy.ts#LEGACY_ACTIONS)) for renderers of before 1.95; the shipped ones draw
  the action and leave the copy out.
- *The skill* (`src/mod/skills/review/SKILL.md`): read the goal (`tower agent`), the thread so far, and the diff
  (`git diff <towerBase>...HEAD` in the fork, the same change the author's Changes pane shows); run the project's
  checks if cheap; review against the goal; prove what it can with a test committed in the fork. It never edits the
  author's checkout, never pushes, and uses its own sandbox root and port for anything shared.
- *Findings are notes.* One `tower note on <author's checkout> repo:path:lines` per finding, its body led by a
  severity (**bug**, **risk**, **nit**) and a category, with a concrete failure scenario; then a closing note with the
  verdict (**ship**, **fix first**, **rethink**), what was run, and the snapshot reviewed. Anchors on a checkout your
  own worktree forked are quoted from your fork, the version read, so the Reviews tab marks them "changed since" once
  the author moves on.
- *Delivery.* By default the notes wait on the thread for the user, who reads them in the Reviews tab and sends them on.
  With `tell` (`/tower:review <CALLSIGN> tell`), the reviewer runs `tower send <CALLSIGN>`, which submits
  [`sendText`](ref:hub/extensions/reviews/client/reviews.ts#sendText): a pointer naming the reviewer's callsign and the notes new to
  the author, and, when the author was hired, its hirer to report to once they are answered. `submit` takes the reviewer as `by` and names it in the author's log first ([[worker-prompts]]). An author hiring its own reviewer
  passes `tell`. When the author was hired, the reviewer also tells the author's hirer the verdict in one line
  (`SendMessage`), so the hirer knows the review is in even if the author stalls; the author, once it has answered
  the notes, reports to its hirer what changed and whether the work is ready (the handbook's Reviews).
- *A hire.* `tower review` calls `reviews/hire` with `by`, a spawn with `hire` like `tower hire`, so the tower logs
  `tower.hire` in the hirer's log and the reviewer's card names who hired it; the floor's hiring limits never refuse a
  review ([[hiring-limits]]): reviews' launch contributor ([`launch`](ref:hub/extensions/reviews/server.ts#launch))
  returns `exempt: ['hiring']` and `reportsTo: <CALLSIGN>` on a spawn whose `of` is set (never on a resume or a fork),
  logged as `tower.exempt` and `tower.reports-to` before the worker starts ([[extensions]], [[crews]]).
- *One round.* The reviewer stops after delivering. A re-review is a new request: a new fork from a new snapshot.
- *The pair is logged.* The reviewer's `of` fact (`tower.x.reviews.of`), read while its crew edge is reviews' (a fork
  carries the fact and no edge), is the card's `x.reviews.of` ([`ofCard`](ref:hub/extensions/reviews/server.ts#ofCard),
  read by [`reviewerOf`](ref:hub/extensions/reviews/client/reviews.ts#reviewerOf), the reviews client's), copied back to `card.reviews` until 2.0; the
  crew edge gives `card.crew` and `card.reportsTo`, and the fork's git record gives `card.worktree.from`. Both
  renderers draw [`pairLineOf`](ref:hub/src/shared/worker-details.ts#pairLineOf) ("reviews MARCO-87"), given
  the callsign `reviewerOf` reads, beside the branch,
  Tower 3D on the desk's name tag. The words `tower whoami` and the card say include "exempt from hiring limits by
  reviews".
- *Reviewers of before 1.95.* Every reviewer spawned before the facts existed is known only by its first prompt. A
  session that logged neither `tower.exempt` nor `tower.reports-to`, whose launch prompt
  ([`launchPrompt`](ref:hub/src/shared/launch.ts#launchPrompt)) starts `/tower:review <CALLSIGN>`, reads through one
  `LEGACY` row ([`legacyReviewer`](ref:hub/src/bridge/legacy.ts#legacyReviewer)) as reviewing that callsign and exempt
  from hiring by reviews, and is put in its author's crew as the board names the author by callsign now
  ([`legacyCrew`](ref:hub/src/bridge/legacy.ts#legacyCrew), in [`withReports`](ref:hub/src/bridge/board.ts#withReports)),
  exactly as the prompt was read before; a hire whose prompt starts so is not weighed against the limits either.
  It is the only place in the core that reads the prompt, and goes at 2.0.
- *In Tower 3D the reviewer sits beside its author* at the author's desk, on a notebook whose lid shows its
  terminal ([`makeVisitor`](ref:hub/renderers/tower3d/src/desk.ts#makeVisitor)), all where the desk dressing's slots
  place them ([[desk-dressing]]): its chair at `reviewer`, turned as that slot is, its notebook at `reviewer_notebook`, its subagents standing
  on the floor at `visitor_<n>`; which desk it sits at is derived like every seat ([[workstations]]). It brings that
  chair: coming, it rolls it in ahead of it from the elevator and sets it down at its seat
  ([`carryIn`](ref:hub/renderers/tower3d/src/life.ts#carryIn)); going home, it stands up from it and rolls it ahead
  of it the whole way into the elevator, where it stands deeper in the car than the reviewer
  ([`carryChair`](ref:hub/renderers/tower3d/src/life.ts#carryChair)).

**Alternatives considered.**
- *The reviewer works in the author's worktree.* Sees exactly the author's files, but its tests and builds write
  there while the author works. Rejected after the user's comment on the draft.
- *A worktree on the author's branch.* Misses uncommitted work, which the Changes pane includes, and `cut` only
  takes bases on origin.
- *`git stash create` for the snapshot.* It refreshes the real index and can take `index.lock` while the author
  runs git; the copied index touches nothing.
- *The reviewer `SendMessage`s the author.* Lands mid-turn, outside the composer, invisible on the board. `submit`
  reaches the author as a prompt the user sees in its terminal.
- *Claude's `/code-review` alone.* No goal, nothing kept. The skill may use it for the bug hunt.
- *Agents iterate until the reviewer approves.* Cost and drift are unbounded with nobody watching; rounds stay one
  request each.
- *Tower 3D: the reviewer at its own desk, with a clipboard or a ribbon naming the author.* Reads as two workers
  who happen to share a word.

**Impact.** API: `spawn.cut.from`; `reviews/hire` and `floor.git` (1.95). Git: branch records `towerFork` and
`towerFrom`; a fork's exposure counts only commits beyond its snapshot. Board: `card.x.reviews.of`, `card.crew`,
`card.exempt`, `card.worktree.from`, the Review action; `card.reviews` and the card verb `review` kept by `LEGACY`
until 2.0. Mod: the `review` skill, `tower review` and `tower send`.

**Alternatives considered (1.95, the move).** *Resolve a pre-1.95 reviewer's author to the session its callsign named
when it spawned*: truer when a callsign is reused, but eight archived reviewers would change crews; the board keeps
reading them as it always did. *Gate Review on `floor.bases`*: a fork needs no base on origin, so floors of local
repos would lose it; `floor.git` says what the fork needs.
