---
{
  "type": "decision",
  "name": "Crews: who reports to whom is derived, drawn as a tree, and sent home together",
  "summary": "Each worker's current card says whom it reports to (card.reportsTo): the author whose work it reviews, else its hirer, followed through resumes. Renderers and tower agents fold it into crews (crewTree), and a worker in a crew offers send-home: a kill per running worker in it, the deepest first.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-09",
  "refs": [
    "hub/src/bridge/board.ts#withCrews",
    "hub/src/bridge/board.ts#carriedOn",
    "hub/src/bridge/verbs.ts#sendHomeOffer",
    "hub/src/shared/cards.ts#hiresOf",
    "hub/src/shared/cards.ts#crewOf",
    "hub/src/shared/cards.ts#crewTree",
    "hub/src/shared/cards.ts#goneHome",
    "hub/src/shared/cards.ts#crewFold",
    "hub/src/shared/cards.ts#workerNamed",
    "hub/src/shared/cards.ts#dutyOrder",
    "hub/src/directory.ts",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/renderers/page/index.html",
    "hub/renderers/tower3d/src/acts.ts#sentHome"
  ],
  "links": [
    { "to": "hiring-limits", "verb": "uses", "carries": "card.hiredBy, the fact a hire leaves" },
    { "to": "reviewer", "verb": "uses", "carries": "card.reviews, the author a reviewer works for" },
    { "to": "board-verbs", "verb": "extends", "carries": "the card verb `send-home`, its call a list of kills" }
  ]
}
---
**Problem.** With several workers on a floor, nothing showed which belonged together. A worker hires workers and
reviewers, and they hire in turn, but the sidebar listed everyone flat, by start. The user once asked the wrong worker
to clean up a worktree. And once a hire's work is done, it and whoever it hired stay on duty with nothing left to do,
ended one by one by hand.

**Why.** Who hired whom was already a fact ([[hiring-limits]]) and a reviewer's author is derived from its first
prompt ([[reviewer]]). The tree is computable, so it is computed. Nothing here is a "task": a worker may be a
coordinator handing out work, or a conversation that just says hi. The model is who works for whom.

**How.**
- *One edge, on the board.* [`withCrews`](ref:hub/src/bridge/board.ts#withCrews) gives each worker's current card (no
  `continuedBy`) `reportsTo`: the card of its author when it reviews (`workerNamed` on the floor, the one on duty first),
  else of its hirer, carried on through resumes ([`carriedOn`](ref:hub/src/bridge/board.ts#carriedOn): `hiredBy.session`
  is where the hire was made, and the hirer may have been resumed since). A reviewer the user started has no hirer and
  still nests under its author: it works for that worker. A fork is a new worker with neither, so it heads its own crew.
- *Folds every renderer shares* (`src/shared/cards.ts`): `hiresOf` (who reports to a worker, by start), `crewOf`
  (everyone under it, each before those under it) and `crewTree` (each worker on duty with nobody on duty above it heads
  a crew, everyone under it follows at its depth, on duty or not). `dutyOrder`, the order the move keys step through,
  walks the same tree. `goneHome` (off duty, nobody on duty under it) and `crewFold` (a worker's hires split into those
  drawn and those gone home, with how many the fold holds) say what a renderer may fold.
- *Sent home together.* A worker in a crew (someone reports to it, or it reports to someone) offers `send-home` while
  any of it runs ([`sendHomeOffer`](ref:hub/src/bridge/verbs.ts#sendHomeOffer)). Its call is a list of `kill` calls, the
  deepest first, so the API gains no verb and every kill can be resumed. A lone worker offers only `kill`.
- *Drawn.* Tower page: each crew nests in the sidebar under a rail. Members gone home fold into one line under their
  hirer ("12 gone home") that unfolds them, dimmed with their Resume; the unfolded hirers are kept per viewer in
  `tower.store` (`crews.unfolded`). A member gone home with someone on duty under it stays drawn, so the tree holds.
  The header offers Send home, and its confirm names everyone it ends and who is working. `tower agents` lists crews
  with `└` and whom each reports to; `tower agent` lists who is under a worker; `tower home <CALLSIGN>` runs the
  card's call. Tower 3D (kept small): X on a worker in a crew sends the crew home, its label naming them.

**Alternatives considered.**
- *A derived `tasks` list on the board.* Rejected by the user: nothing in the hierarchy says what is a task, and a
  primitive (who reports to whom) covers coordinators, pairs and reviews alike.
- *Only `hiredBy` on the board, each renderer resolving resumes and reviewers itself.* The edge has two sources and a
  resume to follow: three renderers would each get it slightly wrong.
- *A server verb that kills a subtree.* The board already knows the crew; a list of ready kills keeps the API as it is.
- *Asking a worker to confirm `tower home` (refuse once, then accept).* The user raised it against a worker that sends
  its own hirers home by accident; not built until that happens. The skill says to read `tower agents` first and never
  name a worker above you.
- *Tower 3D seating a crew together.* Changes the seat replay; deferred.

**Impact.** Board: `card.reportsTo`, card verb `send-home` with `calls['send-home']: Call<'kill'>[]`. Shared: `hiresOf`,
`crewOf`, `crewTree`, `workerNamed`; `dutyOrder` follows crews. Mod: `tower home`, crews in `tower agents`. Tower page:
nested sidebar and Send home. Tower 3D: X sends a crew home. Members gone home stayed drawn, dimmed, under an on-duty
head until it went off duty too; a coordinator that had hired and sent home sixteen workers in a day buried its live
crew under them, so they fold into one line (2026-10-07, settled by the user). The board carries only today's past
cards (board split), so the fold counts those; it never reads the archive. Tower 3D draws no crew tree on duty and has nothing
to fold. Both archives list past workers by crew too ([[archive-crews]]).
