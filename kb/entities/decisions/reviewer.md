---
{
  "type": "decision",
  "name": "A reviewer is a worker hired in a fork of the author's checkout",
  "summary": "Any worker's card offers `review`: a spawn in a new worktree forked from a snapshot of the author's checkout (uncommitted work included), started on the mod's `review` skill; the reviewer reads the author's goal and diff, runs checks in its own copy, leaves one note per finding on the author's thread, and stops after one round. The pair is derived from its first prompt.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/src/worktrees.ts#fork",
    "hub/src/worktrees.ts#snapshot",
    "hub/src/tower/server.ts#spawnCut",
    "hub/src/shared/api.ts",
    "hub/src/bridge/verbs.ts#cardOffers",
    "hub/src/bridge/board.ts#board",
    "hub/src/shared/reviews.ts#reviewPrompt",
    "hub/src/shared/reviews.ts#reviewedIn",
    "hub/src/shared/launch.ts#launchPrompt",
    "hub/src/shared/cards.ts#pairLine",
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
    { "to": "board-verbs", "verb": "extends", "carries": "the card verb `review`" },
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
  Nothing is fetched or pushed. The fork is a general primitive: trying an alternative from another worker's state
  takes the same call.
- *Tidy knows a fork.* A fork's snapshot is the source's work, so only commits made on top of it count as unpushed;
  a fork with none is [[absorbed]], `removable` once its reviewer stops, and Tidy deletes its branch. A reviewer that
  committed a failing test leaves its fork `at-risk` until the user decides.
- *The verb.* Each card offers `review` ([`cardOffers`](ref:hub/src/bridge/verbs.ts#cardOffers)) once it has a
  conversation, when every dir of its floor is a git repo and its checkout's work goes on (`card.checkoutState` live: a fork needs the
  checkout, and work that landed has nothing left to review), unless it is itself a reviewer; `tower review` refuses
  another with the card's reason. Its call is
  `['spawn', {project, cut: {from: checkout}, prompt: '/tower:review <CALLSIGN>'}]`. Workers run it as
  `tower review <CALLSIGN> [tell]`.
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
  [`sendText`](ref:hub/src/shared/reviews.ts#sendText): a pointer naming the reviewer's callsign and the notes new to
  the author, and, when the author was hired, its hirer to report to once they are answered. `submit` takes the reviewer as `by` and names it in the author's log first ([[worker-prompts]]). An author hiring its own reviewer
  passes `tell`. When the author was hired, the reviewer also tells the author's hirer the verdict in one line
  (`SendMessage`), so the hirer knows the review is in even if the author stalls; the author, once it has answered
  the notes, reports to its hirer what changed and whether the work is ready (the handbook's Reviews).
- *A hire.* `tower review` spawns with `hire` like `tower hire`, so the tower logs `tower.hire` in the hirer's log and the
  reviewer's card names who hired it; the floor's hiring limits never refuse a review ([[hiring-limits]]).
- *One round.* The reviewer stops after delivering. A re-review is a new request: a new fork from a new snapshot.
- *The pair is derived.* A worker whose first prompt is `reviewPrompt` reviews that callsign:
  [`reviewedIn`](ref:hub/src/shared/reviews.ts#reviewedIn) over the prompt read back from the first session's argv
  ([`launchPrompt`](ref:hub/src/shared/launch.ts#launchPrompt)) gives `card.reviews`, and the fork's git record gives
  `card.worktree.from`. Both renderers draw [`pairLine`](ref:hub/src/shared/cards.ts#pairLine) ("reviews MARCO-87")
  beside the branch, Tower 3D on the desk's name tag. Nothing is stored.
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

**Impact.** API: `spawn.cut.from`. Git: branch records `towerFork` and `towerFrom`; a fork's exposure counts only
commits beyond its snapshot. Board: `card.reviews`, `card.worktree.from`, the card verb `review`. Mod: the `review`
skill, `tower review` and `tower send`.
