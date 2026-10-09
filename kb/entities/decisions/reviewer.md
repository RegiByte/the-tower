---
{
  "type": "decision",
  "name": "A reviewer is a worker hired in a fork of the author's checkout",
  "summary": "Any worker's card offers `review`: a spawn in a new worktree forked from a snapshot of the author's checkout (uncommitted work included), started on the mod's `review` skill; the reviewer reads the author's goal and diff, runs checks in its own copy, leaves one note per finding on the author's thread, and stops after one round. The pair is derived from its first prompt.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-09",
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
    "hub/renderers/page/index.html",
    "hub/renderers/tower3d/src/acts.ts#KEY",
    "hub/src/bridge/seats.ts#seats",
    "hub/renderers/tower3d/src/desk.ts#makeVisitor",
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
worker by hand, with no shared context and nowhere for the findings to go. A Conductor user's demo (2026-10-05)
showed the flow people expect: a worker writes, and a second one reviews it before anyone merges.

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
  `['spawn', {project, cut: {from: checkout}, prompt: '/tower:review <CALLSIGN>'}]`. The tower page shows a
  Review button in the worker's header; Tower 3D binds it to Y on a worker. Workers run it as
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
  the author. `submit` doesn't log who sent it yet, so the text carries the name. An author hiring its own reviewer
  passes `tell`.
- *A hire.* `tower review` logs `tower.hire` in the hirer's log like `tower hire`, so the reviewer's card names who hired
  it; the floor's hiring limits never refuse a review ([[hiring-limits]]).
- *One round.* The reviewer stops after delivering. A re-review is a new request: a new fork from a new snapshot.
- *The pair is derived.* A worker whose first prompt is `reviewPrompt` reviews that callsign:
  [`reviewedIn`](ref:hub/src/shared/reviews.ts#reviewedIn) over the prompt read back from the first session's argv
  ([`launchPrompt`](ref:hub/src/shared/launch.ts#launchPrompt)) gives `card.reviews`, and the fork's git record gives
  `card.worktree.from`. Both renderers draw [`pairLine`](ref:hub/src/shared/cards.ts#pairLine) ("reviews MARCO-87")
  beside the branch, Tower 3D on the desk's name tag. Nothing is stored.
- *In Tower 3D the reviewer sits beside its author.* The seat replay ([`seats`](ref:hub/src/bridge/seats.ts#seats), on the board as `card.seat`)
  gives a reviewer whose author is at a desk when it comes on duty no workstation of its own: it walks from the
  elevator to the free left end of the author's desk and works there on a notebook
  ([`makeVisitor`](ref:hub/renderers/tower3d/src/desk.ts#makeVisitor)) whose lid shows its live terminal, its tag hung
  under the author's. One reviewer sits beside an author; a second takes a free desk, and a reviewer whose author
  leaves first takes the lowest free desk then. Aimed at, the reviewer is a worker like any other (E sits at its
  terminal), and T opens the author's thread, the one it writes on. Derived from `card.reviews` and the floor's
  comings and goings alone, like every seat.
- *Sandboxes per worker.* `npm run sandbox -- up` refuses a port another tower holds and warns when its root was
  already up, naming `TOWER_SANDBOX` and `--port` to run one's own.

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
- *Read-only by `--permission-mode plan`.* Unneeded once the reviewer has its own fork, and it would stop the
  failing test that proves a finding.
- *The pair as stored state.* The first prompt and the fork's git record already say it.
- *Tower 3D: the reviewer at its own desk, with a clipboard naming the author, or a ribbon between the two desks.*
  Reads as two workers who happen to share a word. *The reviewer's figure walking over while its desk stays its own:*
  leaves a live monitor with nobody at it. The user's call: the reviewer sits beside the author on a notebook, its
  terminal with it.

**Impact.** API: `spawn.cut.from` (additive). Git: branch records `towerFork` and `towerFrom`; a fork's exposure
counts only commits beyond its snapshot. Board: `card.reviews`, `card.worktree.from`, card verb `review` with its
call. Mod: the `review` skill, and `tower review` / `tower send`. Tower page: Review button and pair line. Tower 3D:
Y on a worker, the pair on the desk tag, the reviewer at its author's desk with a notebook. Sandbox: refuses a foreign tower on its port. Built from draft
`wavy-lantern`.
