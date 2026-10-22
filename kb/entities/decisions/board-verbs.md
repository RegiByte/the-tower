---
{
  "type": "decision",
  "name": "The board advertises verbs",
  "summary": "Each card, conversation and floor on the board lists the verbs available on it right now, decided in the bridge, each request among them with its call ready; renderers map a verb to a label and never decide availability.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-21",
  "refs": ["hub/src/bridge/verbs.ts#noteActions", "hub/src/bridge/verbs.ts#probeOffers", "hub/src/bridge/reviews.ts#checkoutState", "hub/src/bridge/verbs.ts#resourceOffers", "hub/src/bridge/verbs.ts", "hub/src/bridge/verbs.ts#cardVerbs", "hub/src/bridge/verbs.ts#conversationVerbs", "hub/src/bridge/board.ts#unresumableAt", "hub/src/bridge/board.ts#checkoutGone", "hub/src/bridge/verbs.ts#floorVerbs", "hub/src/bridge/verbs.ts#cardOffers", "hub/src/bridge/verbs.ts#isLive", "hub/src/bridge/board.ts#board", "hub/test/board.test.ts", "hub/renderers/page/index.html", "hub/renderers/page/page.js", "hub/src/shared/cards.ts#can", "hub/src/shared/cards.ts#whyNot", "hub/src/bridge/verbs.ts#worktreeVerbs", "hub/src/bridge/verbs.ts#branchOffers", "hub/src/tower/server.ts#resume", "hub/src/tower/server.ts#reapProcess", "hub/src/bridge/verbs.ts#floorOffers"]
}
---
**Problem.** What can be done with a session (resume it, kill it, reap it) was decided inside each renderer:
the set of running statuses was copied into `board.ts`, the tower page (`LIVE`, `canResume`) and Tower 3D
(`RUNNING`, `canResume`), untested, and every new renderer would copy it again.

**Why.** [[renderer-is-disposable]]: a rule a next renderer needs belongs in the bridge. Tower 3D's objects offer
several verbs each (a desk: sit, brief, resume, kill), fed by one declaration, the way the Sims' objects advertise
their interactions ([[verb-prompts]]).

**How.** [`verbs.ts`](ref:hub/src/bridge/verbs.ts) holds the rules as pure functions, and
[`board`](ref:hub/src/bridge/board.ts#board) puts their results on the data every renderer reads. Lists keep a fixed
order, the first being the thing's primary verb. Each verb's meaning and when it is offered are the doc comments of
its type there (`CardVerb`, `ConversationVerb`, `FloorVerb`, `WorktreeVerb`, `BranchVerb`, `ResourceVerb`,
`ProbeVerb`); the rules that read other decisions:
- A card ([`cardVerbs`](ref:hub/src/bridge/verbs.ts#cardVerbs)) is `live` ([`isLive`](ref:hub/src/bridge/verbs.ts#isLive))
  while its PTY runs: `drive` and `kill` then. `submit` while at Claude's composer, not on a startup screen nor a
  question ([[collections]]); `brief` once Claude saved a [[conversation]]; `carry-on` beside `resume` when the host
  cut it off mid-turn ([[carry-on]]); `review` while its checkout's work goes on and it isn't a reviewer ([[reviewer]]);
  `reap` while it has [[leftover]]s; `send-home` while any of its crew runs ([[crews]]); `let-go` while stranded on
  duty ([[let-go]]); `note` while its floor keeps review threads and its checkout's work goes on
  ([`noteActions`](ref:hub/src/bridge/verbs.ts#noteActions), [`checkoutState`](ref:hub/src/bridge/reviews.ts#checkoutState),
  [[review-threads]]). A floor's `threads` offer `note` the same way.
- A conversation ([`conversationVerbs`](ref:hub/src/bridge/verbs.ts#conversationVerbs)): `goto` once another session
  resumed it, else `resume` once its session is no longer live, unless its card is `unresumable`
  ([`unresumableAt`](ref:hub/src/bridge/board.ts#unresumableAt): its `cwd` is no longer a dir of its floor, or a worktree
  whose folder is gone, read by [`checkoutGone`](ref:hub/src/bridge/board.ts#checkoutGone)) ([[resume]]).
- A floor ([`floorVerbs`](ref:hub/src/bridge/verbs.ts#floorVerbs)): `spawn` and `cut` while the host is up (`cut` while
  every dir is a git repo with an origin), `shell` while the terms daemon is up, `editor` always, `tidy` while its Tidy
  lists anything ([[tidy]]). Spawn, shell and editor apply to every dir of the floor and to its worktrees.
- A floor's worktrees and kept branches ([`worktreeVerbs`](ref:hub/src/bridge/verbs.ts#worktreeVerbs),
  [`branchOffers`](ref:hub/src/bridge/verbs.ts#branchOffers)) by the states the fold decides ([[tower-cuts-worktrees]],
  [[discard]], [[absorbed]], [[carried]]); a card's leftover processes
  ([`resourceOffers`](ref:hub/src/bridge/verbs.ts#resourceOffers)) `reap` always; each probe
  ([`probeOffers`](ref:hub/src/bridge/verbs.ts#probeOffers)) `run` unless it is off ([[probes]]); a policy `run` while
  it may run by hand and `approve` until its hash is approved, an open offer `accept` (`PolicyVerb`, `OfferVerb`,
  [[policies]]).
- Each verb that is a request of the renderer API comes with its call, the pair one of the thing's `actions`
  ([`cardOffers`](ref:hub/src/bridge/verbs.ts#cardOffers) and its siblings, [`floorOffers`](ref:hub/src/bridge/verbs.ts#floorOffers)),
  so a renderer adds only what the user supplies ([[renderer-api-contract]]). `drive`, `brief` and `goto` move within
  the renderer and have no call. `verbs` and `calls` say the same apart, derived from `actions`
  ([`offered`](ref:hub/src/bridge/verbs.ts#offered)); a policy and an offer carry `calls` beside theirs, and no `verbs`
  ([`calledOffers`](ref:hub/src/bridge/verbs.ts#calledOffers)).
- Renderers and the core ask whether a verb is offered ([`can`](ref:hub/src/shared/cards.ts#can), over `actions`) and take its call from the same list
  ([`callOf`](ref:hub/src/shared/cards.ts#callOf), none once the board stopped offering it; a press takes it through
  [`offeredCall`](ref:hub/src/shared/cards.ts#offeredCall), which says so in a toast when the board moved on), and draw it: an absent verb is not drawn,
  except a verb whose daemon is down, drawn disabled with [`whyNot`](ref:hub/src/shared/cards.ts#whyNot)'s sentence
  (below). Monitors and screens read `live`, a fact, not a verb.
- [Board tests](ref:hub/test/board.test.ts) pin the rules over the recorded fixtures.
- An offer is advice, not a permission. The server refuses only what the facts rule out: a conversation Claude
  hasn't saved, or one the session doesn't hold ([`resume`](ref:hub/src/tower/server.ts#resume)); a pid that
  isn't one of the session's leftovers ([`reapProcess`](ref:hub/src/tower/server.ts#reapProcess)); a lost
  worktree. A call the board doesn't offer right now, such as resuming the conversation of a session still
  running, goes through, the way it would from a terminal ([[agents-have-every-capability]]). If one ever
  breaks a fact, the server refuses it through the same function that builds the offer, so the two never drift.

**Alternatives considered.**
- Verbs only on cards: the archive resumes any conversation of a worker, not only its latest.
- Verbs per dir: every dir of a floor is in config and offers the same verbs, so a per-dir list would repeat
  the floor's. `origin` (a dir's web URL) stays a link the renderer resolves, since finding it runs git.
- Screens reading `drive`: it would tie a picture to a menu; `live` says what they need.
- The server refusing every call the board doesn't offer: it would turn the bridge's advice into policy,
  an opinion on what a user or worker may do, where the facts don't forbid it.
- Drawing every unavailable verb disabled: buttons that fail, or explain themselves, add noise; the status word
  already says why most are missing. A daemon down is the exception: there the verb is drawn disabled with its
  reason.

**Impact.** The brief is offered only once a conversation is saved, and spawn and shell leave the board while their
daemon is down. Renderers draw a verb that needs a daemon that is down (spawn, cut, resume, carry on, review, let go,
shell) disabled, with [`whyNot`](ref:hub/src/shared/cards.ts#whyNot)'s sentence as its tip: a control never vanishes
without saying why. A new verb is one rule here plus one presentation entry per
renderer; Tower 3D's prompts ([[verb-prompts]]) build on these lists.
