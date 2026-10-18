---
{
  "type": "decision",
  "name": "Who hired whom is a fact, and hiring through the tower command has limits",
  "summary": "A spawn with hire is its by's hire: the tower refuses it past the floor's hiring limits (how deep a hire stands, how many of a worker's hires run at once), takes a hirer's hires one at a time, and logs tower.hire in the hirer's own log; the board derives card.hiredBy across resumes. tower hire and tower review spawn that way; reviews are never refused. It guards against a chain of hires running away by accident, not against a worker that spawns without hire.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-18",
  "refs": ["hub/src/directory.ts", "hub/src/tower/server.ts#hired", "hub/src/tower/server.ts#inTurn", "hub/src/shared/api.ts#VERBS", "hub/src/shared/cards.ts#hireRefusal", "hub/src/shared/cards.ts#hireDepth", "hub/src/shared/cards.ts#liveHires", "hub/src/shared/model.ts#hiringConfig", "hub/src/bridge/board.ts#hirersOf", "hub/src/bridge/facts.ts", "hub/src/mod/skills/handbook/SKILL.md", "hub/src/shared/cards.ts#pairLine", "hub/src/shared/cards.ts#hirerName"]
}
---
**Problem.** `tower hire` made starting a worker one command for every worker ([[agent-directory]]), and a hired
worker can hire too. Each worker sees only its own task, so a chain where every step looks reasonable (a worker
hires a helper, the helper hires one, and so on) can run away: quota and the machine (a Claude and a PTY each) are
spent before anyone looks. Nothing recorded who hired whom either: a hired worker's card said its prompt came from
the user, and the worker did not know whom to report to.

**Why.** [[agents-have-every-capability]] rejects doors meant to stop a worker that wants through: any worker can
`POST /spawn`. A runaway chain is a different risk, an accident, and accidents happen on the easy path. A limit on
the easy path stops them, as long as it is named for what it is.

**How.**
- *The fact.* A `spawn` with `hire: true` and `by` is `by`'s hire. The tower has the host append `tower.hire {id}` to
  the hirer's own log through its `fact` request, right after the spawn ([[worker-prompts]] appends `tower.prompt`
  the same way); the facts fold it into `hired`. A hire that can't be logged is killed, so none runs uncounted.
  `tower hire` and `tower review` spawn this way.
- *The board.* [`hirersOf`](ref:hub/src/bridge/board.ts#hirersOf) maps each hired session to its hirer (session and
  callsign and floor); a card's `hiredBy` is the hirer of the first session of its worker's lineage, so it survives
  resumes.
  `floor.hiring` is the floor's limits.
- *The limits* (config `hiring: {depth, live}`, top level and per project, the project's winning per key, through
  [`hiringConfig`](ref:hub/src/shared/model.ts#hiringConfig); defaults in [[docs-config]]). A worker nobody hired stands at
  depth 0, a hire one deeper than its hirer ([`hireDepth`](ref:hub/src/shared/cards.ts#hireDepth)); a hire may stand
  at most `depth` deep. At most `live` of a worker's hires run at once, reviewers aside
  ([`liveHires`](ref:hub/src/shared/cards.ts#liveHires)). [`hireRefusal`](ref:hub/src/shared/cards.ts#hireRefusal)
  says why a worker may not hire, as a sentence; the tower answers a hire past the spawn's floor's limits with it,
  as error `limited`, and `tower hire` tells the worker to ask the user. A hire on another floor (`tower hire floor
  <id>`) meets that floor's limits, the floor it would crowd, with the hirer's depth and live hires counted on every
  floor: a chain can't escape its limits by crossing floors.
- *One at a time.* Claude runs a worker's Bash calls in parallel, so hires that each read the board first would all
  pass. The tower takes a hirer's hires in turn, by its callsign
  ([`inTurn`](ref:hub/src/tower/server.ts#inTurn)), each holding the turn until the system counts it (its log tracked,
  the hirer's log naming it, the host running it), so the next is weighed against it. Nothing is stored for it: the
  turn waits on what the logs already say.
- *Reviews are never refused.* A self-review must stay possible at any depth: the system enables workflows, it
  doesn't enforce them. A hire whose prompt starts a reviewer (`reviewedIn`, as `liveHires` leaves it out) is not
  weighed, and still logs `tower.hire`, so the pair is attributed.
- *Drawn.* `tower whoami` tells a hired worker who hired it, and every renderer says "hired by X" through
  [`pairLine`](ref:hub/src/shared/cards.ts#pairLine), "hired by X (floor)" when X works on another floor
  ([`hirerName`](ref:hub/src/shared/cards.ts#hirerName)).
- *Whose prompt.* A conversation's `promptBy` is the hirer while its latest prompt is still the one the worker was
  hired on (the first session's launch prompt, as `card.reviews` reads it); `tower agent` and both renderers' Brief
  name it in place of the user. A prompt typed later is the user's again.

**Alternatives considered.**
- *Trust the skill's rule of when to hire.* No worker sees the chain it is part of.
- *Refuse in the command, against a board it read earlier*: parallel hires all read the same board and all pass, and
  a fact posted after the spawn can fail and leave a hire uncounted.
- *Refuse every `spawn` with `by`.* `by` says whose prompt it is; a hire is a further claim. The user's own
  spawns pass neither and are never limited.
- *Count accepted hires in a set the tower keeps.* State the logs already hold a moment later; waiting for
  the system to count the hire keeps the turn on observed facts.
- *A depth counter passed down in each child's environment.* Stored state the logs can derive, invisible
  to renderers, and lost on resume.

**Impact.** Hiring is attributed and bounded in the core, for every caller that marks a spawn as a hire: API `spawn`
field `hire`, error code `limited`. A worker that calls `spawn` without `hire` is neither logged nor limited: the
tower checks only that a `by` names a session, not that the caller is that session. Renderers draw the lineage as crews ([[crews]]).
