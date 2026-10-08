---
{
  "type": "decision",
  "name": "Who hired whom is a fact, and hiring through the tower command has limits",
  "summary": "tower hire and tower review log tower.hire in the hirer's own log; the board derives card.hiredBy across resumes, and tower hire refuses a hire past the floor's hiring limits (how deep a hire stands, how many of a worker's hires run at once). Reviews are never refused. It guards against a chain of hires running away by accident, not against a worker that calls spawn itself.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/directory.ts", "hub/src/shared/cards.ts#hireRefusal", "hub/src/shared/cards.ts#hireDepth", "hub/src/shared/cards.ts#liveHires", "hub/src/shared/model.ts#hiringConfig", "hub/src/bridge/board.ts#hirersOf", "hub/src/bridge/facts.ts", "hub/src/mod/skills/handbook/SKILL.md", "hub/src/shared/cards.ts#pairLine"]
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
- *The fact.* `tower hire` and `tower review` post `tower.hire {id}` to the hirer's own log, as `tower keep` posts
  `tower.keep`; the facts fold it into `hired`. The host is unchanged: it logs any `tower.*` event.
- *The board.* [`hirersOf`](ref:hub/src/bridge/board.ts#hirersOf) maps each hired session to its hirer (session and
  callsign); a card's `hiredBy` is the hirer of the first session of its worker's lineage, so it survives resumes.
  `floor.hiring` is the floor's limits.
- *The limits* (config `hiring: {depth, live}`, top level and per project, the project's winning per key, through
  [`hiringConfig`](ref:hub/src/shared/model.ts#hiringConfig); defaults 2 and 3). A worker nobody hired stands at
  depth 0, a hire one deeper than its hirer ([`hireDepth`](ref:hub/src/shared/cards.ts#hireDepth)); a hire may stand
  at most `depth` deep. At most `live` of a worker's hires run at once, reviewers aside
  ([`liveHires`](ref:hub/src/shared/cards.ts#liveHires)). [`hireRefusal`](ref:hub/src/shared/cards.ts#hireRefusal)
  says why a worker may not hire, as a sentence, and `tower hire` refuses with it and tells the worker to ask the user.
- *Reviews are never refused.* A self-review must stay possible at any depth: the system enables workflows, it
  doesn't enforce them. Reviews still log `tower.hire`, so the pair is attributed.
- *Drawn.* `tower whoami` tells a hired worker who hired it; `tower agent`, the tower page (sidebar and worker header)
  and Tower 3D (desk tag and aim card) say "hired by X" through [`pairLine`](ref:hub/src/shared/cards.ts#pairLine),
  left out when the hirer is the author a reviewer reviews.
- *Whose prompt.* A conversation's `promptBy` is the hirer while its latest prompt is still the one the worker was
  hired on (the first session's launch prompt, as `card.reviews` reads it); `tower agent` and both renderers' Brief
  name it in place of the user. A prompt typed later is the user's again.

**Alternatives considered.**
- *Trust the skill's rule of when to hire.* Rejected: no worker sees the chain it is part of.
- *Refuse in the server's `spawn`.* Rejected: the server can't tell who calls it without a per-session identity,
  deferred in [[agents-have-every-capability]], and the user's own hires must never be limited.
- *A depth counter passed down in each child's environment.* Rejected: stored state the logs can derive, invisible
  to renderers, and lost on resume.
- *Offering `hire` as a card verb within limits.* Not now: a renderer has no hire of its own to offer; the shared
  function is there when one wants to show it.

**Impact.** Hiring is attributed and bounded on the path workers use. A worker that calls `spawn` itself is neither
logged nor limited, until per-session identity lands (roadmap 7). Renderers draw the lineage as crews ([[crews]]).
