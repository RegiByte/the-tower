---
{
  "type": "decision",
  "name": "The board advertises verbs",
  "summary": "Each card, conversation and floor on the board lists the verbs available on it right now, decided in the bridge, each request among them with its call ready; renderers map a verb to a label and never decide availability.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/bridge/verbs.ts#resourceOffers", "hub/src/bridge/verbs.ts", "hub/src/bridge/verbs.ts#cardVerbs", "hub/src/bridge/verbs.ts#conversationVerbs", "hub/src/bridge/board.ts#unresumableAt", "hub/src/bridge/verbs.ts#floorVerbs", "hub/src/bridge/verbs.ts#cardOffers", "hub/src/bridge/verbs.ts#isLive", "hub/src/bridge/board.ts#board", "hub/test/board.test.ts", "hub/renderers/page/index.html", "hub/src/shared/cards.ts#can", "hub/src/bridge/verbs.ts#worktreeVerbs", "hub/src/bridge/verbs.ts#branchOffers", "hub/src/tower/server.ts#resume", "hub/src/tower/server.ts#reapProcess", "hub/src/bridge/verbs.ts#floorOffers"]
}
---
**Problem.** What can be done with a session (resume it, kill it, reap it) was decided inside each renderer:
the set of running statuses was copied into `board.ts`, the tower page (`LIVE`, `canResume`) and Tower 3D
(`RUNNING`, `canResume`), untested, and every new renderer would copy it again.

**Why.** [[renderer-is-disposable]]: a rule a next renderer needs belongs in the bridge. Tower 3D is moving to
objects that offer several verbs each (a desk: sit, brief, resume, kill), fed by one declaration, the way the
Sims' objects advertise their interactions.

**How.** [`verbs.ts`](ref:hub/src/bridge/verbs.ts) holds the rules as pure functions, and
[`board`](ref:hub/src/bridge/board.ts#board) puts their results on the data every renderer reads. Lists keep
a fixed order, the first being the thing's primary verb.
- A card is `live` ([`isLive`](ref:hub/src/bridge/verbs.ts#isLive)) while its PTY runs. Its verbs
  ([`cardVerbs`](ref:hub/src/bridge/verbs.ts#cardVerbs)): `drive` and `kill` while live; its latest
  conversation's `resume` or `goto`; `submit` while at Claude's composer (idle, working, done or failed:
  not booting or blocked, which may be a startup screen, nor needing input on a question) ([[collections]]); `brief` once Claude saved a [[conversation]]; `review` alongside it while every dir of its floor is a git repo and it isn't a reviewer itself (its call a fork of its checkout, [[reviewer]]); `reap` while it has
  [[leftover]]s, live or not; `send-home` on a worker in a crew while any of it runs, its call a list of kills, the
  deepest first ([[crews]]).
- Each of a card's `resources`, a process it left running
  ([`resourceOffers`](ref:hub/src/bridge/verbs.ts#resourceOffers)): `reap`, always, its call
  `['reap/process', { id, pid }]`, which the tower refuses for a pid that isn't one of that session's leftovers.
- Each conversation ([`conversationVerbs`](ref:hub/src/bridge/verbs.ts#conversationVerbs)): `goto` once
  another session resumed it, else `resume` once its session is no longer live, unless its card is `unresumable`
  ([`unresumableAt`](ref:hub/src/bridge/board.ts#unresumableAt): its `cwd` is no longer a dir of its floor, or a
  worktree whose folder is gone), the same for the card's own `resume` ([[resume]]).
- Each floor ([`floorVerbs`](ref:hub/src/bridge/verbs.ts#floorVerbs)): `spawn` while the host is up, `cut` while
  it is and every dir is a git repo with an origin (its call `['spawn', { project, cut: {} }]`), `shell` while the
  terms daemon is up, `editor` always, `tidy` while the floor's Tidy lists anything, its call carrying the list ([[tidy]]). Spawn, shell
  and editor apply to every dir of the floor and to its worktrees.
- Each of a floor's `worktrees` ([`worktreeVerbs`](ref:hub/src/bridge/verbs.ts#worktreeVerbs)): `recut` and `prune`
  when `lost`, `remove` when `removable`, nothing when `live` or `at-risk`. Each kept branch
  ([`branchOffers`](ref:hub/src/bridge/verbs.ts#branchOffers)): `recut` always, `delete` once [[absorbed]]. The states, and each
  repo's `atRisk`, are decided in the fold ([[tower-cuts-worktrees]]).
- Each verb that is a request of the renderer API comes with its call
  ([`cardOffers`](ref:hub/src/bridge/verbs.ts#cardOffers) and its siblings): `calls.resume` is
  `['resume', { id, conversation }]`, built from the same list, so a renderer adds only what the user supplies
  (`tower.run(floor.calls.spawn, { cwd })`) ([[renderer-api-contract]]). `drive`, `brief` and `goto` move within the
  renderer and have no call.
- Renderers ask only whether a verb is offered (`can(thing, verb)` in both) and draw it: an absent verb is
  not drawn at all, never drawn disabled. Monitors and screens read `live`, a fact, not a verb.
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
- Drawing unavailable verbs disabled: buttons that fail, or explain themselves, add noise; the host lamp and
  the status word already say why something is missing.

**Impact.** Two visible changes: the brief is offered only once a conversation is saved, and spawn and shell
buttons disappear while their daemon is down. A new verb is one rule here plus one presentation entry per
renderer; Tower 3D's prompts ([[verb-prompts]]) build on these lists.
