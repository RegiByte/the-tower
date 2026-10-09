---
{
  "type": "decision",
  "name": "A floor's archive goes by crew, the coordinator after its hires",
  "summary": "Both renderers list a floor's past workers by crew (pastCrews): each worker that reports to none of them heads one, its hires drawn above it and indented a step per depth, crews and siblings by their latest start, the newest first, a worker's earlier lives after its latest. A filter keeps the order and lifts a matching hire to the place of the nearest worker above it that does not match.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-09",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/cards.ts#pastCrews", "hub/src/shared/cards.ts#pastMatching", "hub/src/shared/cards.ts#pastSize", "hub/src/shared/cards.ts#pastOf", "hub/src/bridge/board.ts#withCrews", "hub/src/bridge/board.ts#carriedOn", "hub/renderers/page/index.html", "hub/renderers/tower3d/src/ui.ts#archiveListHtml", "hub/test/past.test.ts"]
}
---
**Problem.** Both archives listed past workers by start alone ([`pastOf`](ref:hub/src/shared/cards.ts#pastOf)). A
coordinator that hired ten workers ended up scattered among them and among unrelated workers, so the archive could
not be read as the work it was: who asked for what, and what came back.

**Why.** On duty a floor is already read by crew ([[crews]]); the past should read the same way. Archived cards carry
`reportsTo` like the board's: [`withCrews`](ref:hub/src/bridge/board.ts#withCrews) runs over every card before
`archiveOf` picks the past ones ([[board-archive]]), so the order is derived in shared code with no bridge change, and
every renderer draws the same one ([[renderer-is-disposable]]).

**How.**
- [`pastCrews`](ref:hub/src/shared/cards.ts#pastCrews) groups `pastOf`'s cards (the board's off-duty ones and the
  archive read, so a crew split between them stays whole) into a tree, `{ card, crew }`. A worker heads a crew when it
  reports to no past worker: a solo worker is a crew of one, and a hire whose hirer is still on duty heads its own.
- Hires come before the worker they report to, each leading its own sub-crew the same way: the coordinator closes its
  crew. Crews, and the hires of one worker, go by the latest start among them, the newest first, as the list did.
- A resume makes a new card; `withCrews` points every hire at the hirer's latest card
  ([`carriedOn`](ref:hub/src/bridge/board.ts#carriedOn)), and the earlier card holds no crew. Its earlier lives
  (`continuedBy` within the past cards) follow the latest one at the same depth, the newest first, so the whole worker
  and its crew stay together across resumes.
- [`pastMatching`](ref:hub/src/shared/cards.ts#pastMatching) filters by words: a worker that does not match leaves its
  place to its crew, so a matching hire is drawn under the nearest worker above it that matches too, or at the top. An
  indent then always means "reports to the row it closes on"; one left under a hidden coordinator would read as part
  of whatever row came before. [`pastSize`](ref:hub/src/shared/cards.ts#pastSize) counts for "n of m".
- Each renderer draws a crew as the page draws one on duty: a `.crew` block, indented with a rule on its left, above
  the worker it reports to.

**Alternatives considered.**
- Keep a non-matching coordinator as a dimmed context row while filtering: more rows than the words asked for, and a
  second row style in both renderers.
- Change `pastOf` to return the tree: `/cards.js` exports are API contract, so it stays as it was and the order is
  three new exports (an API minor).

**Impact.** API 1.27 (additions). Tower 3D's archive list no longer overflows its panel: its grid tracks are
`minmax(0, 1fr)` like the page's. The filing cabinet's drawers stay by day.
