---
{
  "type": "decision",
  "name": "Crews: who reports to whom is derived, drawn as a tree on duty and in the archive, and sent home together",
  "summary": "Each worker's current card says whom it reports to (card.reportsTo): the worker a launch contributor named in tower.reports-to at its spawn (a reviewer's author, by reviews), else its hirer, followed through resumes; a reviewer spawned before 1.95 reads its author from its first prompt through LEGACY. Renderers and tower agents fold it into crews (crewTree), and every worker offers send-home: a kill per running worker under it and itself, the deepest first, the only way the renderers end a worker. Both archives list past workers by crew the same way (pastCrews).",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-29",
  "refs": [
    "hub/renderers/tower3d/src/meetings.ts#meetingsOf",
    "hub/src/bridge/board.ts#withReports",
    "hub/src/bridge/facts.ts#REPORTS_TO",
    "hub/src/bridge/legacy.ts#legacyCrew",
    "hub/src/bridge/seats.ts#seats",
    "hub/src/bridge/board.ts#withCrews",
    "hub/src/bridge/board.ts#carriedOn",
    "hub/src/bridge/verbs.ts#sendHomeActions",
    "hub/src/shared/crews.ts#hiresOf",
    "hub/src/shared/crews.ts#crewOf",
    "hub/src/shared/crews.ts#crewsOf",
    "hub/src/shared/crews.ts#crewTree",
    "hub/src/shared/crews.ts#awayHiresOf",
    "hub/src/shared/crews.ts#goneHome",
    "hub/src/shared/crews.ts#crewFold",
    "hub/src/shared/crews.ts#workerNamed",
    "hub/src/shared/crews.ts#dutyOrder",
    "hub/src/directory.ts#crewRows", "hub/src/directory.ts#floorLines",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/src/shared/crews.ts#sentHome",
    "hub/src/shared/duty.ts#sendHomeAsk",
    "hub/src/shared/past.ts#pastCrews",
    "hub/src/shared/past.ts#pastMatching",
    "hub/src/shared/past.ts#pastSize",
    "hub/src/shared/past.ts#pastOf",
    "hub/renderers/tower3d/src/ui.ts#archiveListHtml",
    "hub/test/past.test.ts"
  ],
  "links": [
    { "to": "hiring-limits", "verb": "uses", "carries": "card.hiredBy, the fact a hire leaves" },
    { "to": "reviewer", "verb": "uses", "carries": "a reviewer's crew edge, by reviews, to the author it works for" },
    { "to": "board-verbs", "verb": "extends", "carries": "the card verb `send-home`, its call a list of kills" }
  ]
}
---
**Problem.** With several workers on a floor, nothing showed which belonged together. A worker hires workers and
reviewers, and they hire in turn, but a flat list by start scatters a coordinator among its hires and among unrelated
workers, on duty and in the archive alike. And once a hire's work is done, it and whoever it hired stay on duty with
nothing left to do, ended one by one by hand.

**Why.** Who hired whom was already a fact ([[hiring-limits]]) and a reviewer's author is logged at its spawn
([[reviewer]]). The tree is computable, so it is computed. Nothing here is a "task": a worker may be a
coordinator handing out work, or a conversation that just says hi. The model is who works for whom.

**How.**
- *One edge, on the board.* [`withReports`](ref:hub/src/bridge/board.ts#withReports) gives each worker's current card (no
  `continuedBy`) `reportsTo`: the card of the worker its crew edge names (`card.crew`: a launch contributor's
  `reportsTo`, logged at its spawn as `tower.reports-to {callsign, session, by}`, the session that callsign named then,
  [[extensions]]; reviews gives a reviewer's), else of its hirer,
  each carried on through resumes ([`carriedOn`](ref:hub/src/bridge/board.ts#carriedOn): `hiredBy.session`
  is where the hire was made, and the hirer may have been resumed since). The edge is a core fact read while the core's
  board is built, never an extension's fold, so send-home, seats, `tower agents` and `tower home` follow it; a fork
  carries none. A reviewer the user started has no hirer and
  still nests under its author: it works for that worker. A reviewer spawned before 1.95 logged no edge: its first
  prompt names its author, and `withReports` gives it `card.crew` by reviews to that callsign's card as the board names
  it now (`workerNamed` on the floor, the one on duty first: [`legacyCrew`](ref:hub/src/bridge/legacy.ts#legacyCrew)),
  as it always read. A worker whose crew edge names a worker seated when it comes sits beside it
  ([`seats`](ref:hub/src/bridge/seats.ts#seats)), a reviewer beside its author. A fork is a new worker with neither, so it heads its own crew.
- *Folds every renderer shares* (`src/shared/crews.ts`): `hiresOf` (who reports to a worker, by start), `crewOf`
  (everyone under it, each before those under it) and `crewTree` (each worker on duty with nobody on duty above it heads
  a crew, everyone under it follows at its depth, on duty or not). `dutyOrder`, the order the move keys step through,
  walks the same tree. `goneHome` (off duty, nobody on duty under it) and `crewFold` (a worker's hires split into those
  drawn and those gone home, with how many the fold holds) say what a renderer may fold. A renderer or the bridge walking a whole floor's crews indexes the cards once, `hiresBy`,
  `crewsOf` and `crewFoldsOf` returning the lookup each of those makes per worker, linear in the cards where a `crewOf` per
  worker is quadratic; the board's `send-home` offers use `crewsOf`.
- *Sent home together.* Every worker offers `send-home` while it or anyone under it runs
  ([`sendHomeActions`](ref:hub/src/bridge/verbs.ts#sendHomeActions)). Its call is a list of `kill` calls, the deepest
  first, so the API gains no verb and every kill can be resumed. A worker with nobody running under it ends alone: its
  call is its own `kill`. `sentHome` (shared, `/cards.js`) names the cards those calls end, the worker first, then its
  crew; both renderers read it over every floor's cards. Sending home removes nothing: what the crew left is
  Tidy's, applied by itself where the [[autotidy]] extension's settings say so.
- *The one way to end a worker.* Hires left running have no hirer to report to, so the chain is the unit: the
  renderers show Send home and no Kill. Ending a lead and leaving its hires running is the API's `kill` (`tower kill`).
- *Drawn.* The tower page nests each crew in the sidebar under a rail; members gone home fold into one line under
  their hirer that unfolds them, the unfolded hirers kept per viewer in `tower.store`. A member gone home with someone
  on duty under it stays drawn, so the tree holds. Send home's confirm names everyone it ends, who is working and what
  a resume costs (`sendHomeAsk`). `tower agents` lists crews and whom each reports to, `tower agent` who is under a
  worker, and `tower home <CALLSIGN>` runs the card's call (the handbook says to read `tower agents` first and never
  name a worker above you); with the caller's own callsign it logs a leave the tower
  acts on once the turn ends ([[leave]]). A crew can span floors (a hire on another floor, [[hire]]): `reportsTo` and
  `send-home` are derived over every floor's cards and `crewTree` runs per floor, so the hire heads a crew on its own
  floor, its card saying "hired by X (floor)", while `tower agents` links it under its hirer in one line,
  `└ KBKEEPER-86 · working · on lab`. The board carries what the link needs (`reportsTo`, `hiredBy.project`), folded by
  [`awayHiresOf`](ref:hub/src/shared/crews.ts#awayHiresOf): the tower page draws each such hire still on duty as a
  link row in its hirer's crew, painted in its floor's colour, that opens the hire's card on its floor. Tower 3D draws
  no link. Tower 3D sends a worker home with its crew and draws no crew tree on duty; a crew of three on duty gathers in a meeting room
  until its lead goes home ([[whereabouts]]).
- *The archive by crew.* [`pastCrews`](ref:hub/src/shared/past.ts#pastCrews) groups `pastOf`'s cards (the board's
  off-duty ones and the archive read, [[board-archive]], so a crew split between them stays whole) into the same tree:
  archived cards carry `reportsTo` because `withCrews` runs over every card before the past ones are picked. A worker
  heads a crew when it reports to no past worker; its hires follow in the order they were hired (a resumed hire by its
  first life's start), each leading its own sub-crew; crews go by their latest start, the newest first. A worker's
  earlier lives follow its latest one and its crew at the same depth. [`pastMatching`](ref:hub/src/shared/past.ts#pastMatching)
  filters by words: a worker that does not match leaves its place to its crew, so an indent always means "reports to
  the worker it hangs from". Both renderers draw it; Tower 3D's filing cabinet's drawers stay by day.

**Alternatives considered.**
- *A derived `tasks` list on the board.* Rejected by the user: nothing in the hierarchy says what is a task, and a
  primitive (who reports to whom) covers coordinators, pairs and reviews alike.
- *Only `hiredBy` on the board, each renderer resolving resumes and reviewers itself.* The edge has two sources and a
  resume to follow: three renderers would each get it slightly wrong.
- *Kill beside Send home.* For a lone worker or a hire with nobody under it the two did the same; for a lead, Kill
  left hires running with nobody to report to. When two actions have the same effect, the user sees only one.
- *A server verb that kills a subtree.* The board already knows the crew; a list of ready kills keeps the API as it is.
- *The archive's coordinator after its hires, closing its crew*: an indent reads as belonging to the row above it, so
  every crew read upside down, the other way round from the floor on duty.
- *Keeping a non-matching coordinator as a dimmed context row while filtering*: more rows than the words asked for.

**Impact.** Board: `card.reportsTo` (and since 1.87 `card.crew`, the edge a launch contributor logged) and the card verb `send-home`, its call a list of kills, on every worker;
renderers draw no Kill on a worker. Shared: the crew folds and the archive's order are `/cards.js` exports every
renderer draws from. The board carries only today's past cards, so the sidebar's fold counts those; the archive's
tree reads the archive too.
