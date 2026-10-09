---
{
  "type": "decision",
  "name": "Renderers are disposable: no capability lives in a renderer",
  "summary": "Every capability is a non-prescriptive primitive in the core (the bridge, the system, the renderer API), reachable by every renderer and every agent; a renderer may grow as sophisticated as it likes, and losing one loses presentation, never a capability.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-02",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/system.ts#watchSystem", "hub/src/bridge/board.ts#board", "hub/src/shared/api.ts", "hub/src/tower/tower.js", "hub/src/shared/cards.ts", "hub/src/shared/icons.ts", "hub/src/collections.ts", "hub/AGENTS.md"]
}
---
**Problem.** The long-term renderer (a spatial office) did not exist; the web
tower was a stepping stone, and logic written into it would have to be rewritten for every next one. Later,
living in the tower produced a new want every day, and Tower 3D grew past a thousand lines. A review on
2026-10-06 read "disposable" as "cheap to delete" and scored that growth as a breach. That reading was the
wrong one, and nothing written down said which one was meant.

**Why.** The project is a system, not an app (AGENTS.md, Principles): Unix-style composition over data, an
Emacs-style surface where what the user can do the system and its agents can do too, and open models over
specific features. A capability shaped by one renderer's use case serves one presentation and has to be
rebuilt, or lost, with the next.

**How.**
- *Disposable means no capability is lost.* A renderer is disposable when a sibling written from scratch
  against the board, the renderer API ([`api.ts`](ref:hub/src/shared/api.ts)) and
  [`tower.js`](ref:hub/src/tower/tower.js) could reach everything it offers. Deleting Tower 3D would hurt;
  it would not take the board, the verbs, the logs, or the workers' way of showing and keeping things.
- *Sophistication is allowed.* A renderer may be as large and as strange as it wants in what it draws and
  how it is played. Size is not the measure; a capability only one renderer can reach is.
- *Capabilities are non-prescriptive primitives.* A want that needs the core enters as the general model of
  its class, composed by renderers. [[collections]] is the model: the core lists, reads, writes and deletes
  files, and what a draft means is a renderer's. The rejected [[drafts]] decision was the prescriptive
  version of the same want.
- *Where a capability lands, in this order:* derived in the bridge ([[log-reductions]], the
  [`board`](ref:hub/src/bridge/board.ts#board)); a generic verb or read on the [[renderer-api]]; a host
  change only as a new general fact in the log, since a host change kills sessions ([[host-owns-ptys]]).
- *Every capability reaches agents too.* What a renderer can call, a worker can call
  ([[agents-have-every-capability]]).
- *View state is a renderer's, through a shared facility.* A renderer keeps what only a viewer cares about
  (marks, a remembered tab) through `tower.store`, so the next renderer reads the same marks
  ([[changes-view]]).
- Rules a next renderer would need in words live in [`src/shared/cards.ts`](ref:hub/src/shared/cards.ts),
  served as `/cards.js`: two copies of it had drifted (the next-waiting order, status words). The order a
  renderer steps through workers in (`dutyOrder`, `neighbours`) lives there too, and the keys that step are
  commands of the shared keymap (`/keymap.js`, [[keymap]]), so the tower page and Tower 3D move alike; the icons both draw are `/icons.js`
  ([`src/shared/icons.ts`](ref:hub/src/shared/icons.ts)), and the panels, the brief and the terminal keys are
  shared the same way ([[renderer-shared-modules]]).

History: the session fold and the live store moved out of the tower into [[live-system]] and
[[log-reductions]]; the view model moved into the bridge when shelf pages started reading it
([[shelf-page-contract]]); once pages could act, the tower server's routes became the [[renderer-api]]. On
2026-10-07 four meanings Tower 3D derived alone moved into the bridge and the shared cards (where a worker sits,
a floor's last showings, the callsign of a session a card points at, the glyph over a worker), so the board could
leave past cards out ([[board-archive]]).
The tower *page* is one renderer; the tower *server* is the API and is not disposable.

**Alternatives considered.**
- *Growing the tower as the product.* Rejected: it couples capabilities to one presentation.
- *Disposable as cheap to delete* (a size budget per renderer). Rejected: it measures presentation, and it
  would push renderers to stay plain instead of pushing capabilities out of them.
- *Features shaped by the renderer that asked for them* (a drafts store, a meeting engine in the core).
  Rejected: the core would grow one feature per want; a general model serves the want and its whole class.

**Impact.** Review rule for any change: could a sibling renderer, or an agent, reach this without the
renderer's code? If not, the capability belongs in the bridge, `system.ts`, `shared` or the API. Renderers
are free to get weird; the core stays the fold and the routes.
