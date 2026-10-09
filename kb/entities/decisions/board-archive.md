---
{
  "type": "decision",
  "name": "The board carries the floor's present; the archive is a read",
  "summary": "Accepted: the pushed board keeps only the cards a renderer needs to draw the present (on duty, waiting, leaving something running, or started today), with what renderers derive from history (seats, the gallery, callsigns of referenced sessions) computed in the bridge onto it; every other card is served by a read that changes rarely.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/bridge/board.ts#board", "hub/src/bridge/board.ts#onBoard", "hub/src/bridge/board.ts#allCards", "hub/src/bridge/board.ts#archiveOf", "hub/src/bridge/board.ts#archiveAtOf", "hub/src/tower/server.ts#archive", "hub/src/shared/cards.ts#pastOf", "hub/src/shared/cards.ts#archiveKey", "hub/src/bridge/chains.ts#threads", "hub/src/bridge/chains.ts#SessionRef", "hub/src/bridge/seats.ts#withSeats", "hub/src/bridge/board.ts#galleryOf", "hub/src/shared/cards.ts#bubbleOf", "hub/src/shared/cards.ts#findCard", "hub/src/directory.ts", "hub/renderers/page/index.html"]
}
---
**Problem.** On 2026-10-06 the real board was 253 KB (351 KB before the tool label was clipped): 176 cards, 172
of them exited. It is pushed whole, to every client, on every change, and it grows with every session ever run:
exited cards' `conversations` alone are 105 KB. The cards that change are the few on duty.

Accepted by the user on 2026-10-07. Step 1 landed the same day, steps 2 and 3 together after it (below).

**Why.** Everything the bridge derives from history already runs over sessions, not over cards: threads,
`resumes`/`resumedBy`, callsign lineage, a card's `shown` gathered across its lineage, `keptBy` and `waiting`
([`board`](ref:hub/src/bridge/board.ts#board), [`threads`](ref:hub/src/bridge/chains.ts#threads)). The server
can keep full history and send less. What breaks is the renderers, which derive over the cards they are sent:

- Tower 3D's seat replay (`seats` in its `layout.ts`, before step 1) walks every card's
  `startedAt`/`enteredAt` and a stranded card's `resumedBy`; a dropped card moves workers to other desks, and a
  missing resumer throws.
- The tower page's `callsign(id)` is `findCard(id).callsign`
  ([`findCard`](ref:hub/src/shared/cards.ts#findCard)) and throws on an id not on the board, reached through a
  live card's `resumes` and the brief's `resumes`/`resumedBy`.
- Tower 3D's gallery takes the newest showings of every card with no `continuedBy`; it loses older ones.
- Party guests are off-duty cards started today; `tower agent CALLSIGN` falls back to a past card
  ([`directory`](ref:hub/src/directory.ts)); `#keptBy.session` links and the page's archive list and skyline read
  past cards.

**How (proposed, in this order, each its own change).**
1. Move the history derivations into the bridge, on the board as it is today (the Principles: a capability
   lands derived in the bridge first): `card.seat` (the replayed workstation), `floor.gallery` (the floor's last
   showings, keyed as now), and a callsign wherever an id is referenced (`resumes`, `resumedBy`, `continuedBy`,
   `keptBy`) as `{id, callsign}`. Renderers switch to them; nothing is dropped yet.
2. Split. The board keeps a card when it is `onDuty`, `waiting`, has `resources`, or started since the start of
   the host's local day; it gains `floor.archived` (a count) and `board.archiveAt` (the latest change to any
   archived card). Every other card is served by `GET /archive/<project>` (`Card[]`, newest first, the same
   card shape), fetched when a renderer opens its past list, and again when `archiveAt` moves.
3. `findCard` and `tower agent` read the archive on a miss; `/conversations/<id>` already serves any session.

**Step 1, as built (API version 14).**
- `card.seat` ([`withSeats`](ref:hub/src/bridge/seats.ts#withSeats)): Tower 3D's replay moved verbatim; `{n}` a
  workstation, `{beside}` the author's id. Tower 3D reads it for desks and the building's rows.
- `floor.gallery` ([`galleryOf`](ref:hub/src/bridge/board.ts#galleryOf)): the floor's last twelve showings, newest
  first, each `{worker: {id, callsign}, shown}`; Tower 3D hangs as many as it has places (nine). Twelve so the
  bridge does not carry one renderer's wall.
- [`SessionRef`](ref:hub/src/bridge/chains.ts#SessionRef) `{id, callsign}` for a conversation's `resumes` and
  `resumedBy` (on the board and in the brief) and a card's `continuedBy`. `keptBy` and `hiredBy` already carried
  `{session, callsign}` and keep their shape.
- [`bubbleOf`](ref:hub/src/shared/cards.ts#bubbleOf) in the shared cards: a status's glyph, a word about a card.
- Both renderers' fixture boards derive the same fields through the same bridge functions. `tool:frames`:
  identical before and after on every fixture board.
- Still read off past cards, for steps 2 and 3: Tower 3D's picture reader and hover look the showing's card up by
  id (its status, whether it is on duty); `noticeShown` diffs every card's showings between boards (only cards
  on the board can show something new, so dropping past ones is safe); the tower page's archive list and
  `tower agent CALLSIGN` read past cards; party guests are today's off-duty cards.

**Steps 2 and 3, as built (API version 15).**
- [`allCards`](ref:hub/src/bridge/board.ts#allCards) derives every card as before (seats, crews, the gallery and
  Tidy's plan still run over all of them); [`board`](ref:hub/src/bridge/board.ts#board) keeps those
  [`onBoard`](ref:hub/src/bridge/board.ts#onBoard) at the start of the host's local day, with `floor.archived` and
  `board.archiveAt` ([`archiveAtOf`](ref:hub/src/bridge/board.ts#archiveAtOf)): the latest of each archived card's end,
  the end of the day it started (when it left the board), and the start of any session that resumed one of its
  conversations. A card can also leave the board when its last leftover is reaped or its hirer stops running, at no
  logged time: the count moves then, so a renderer watches both
  ([`archiveKey`](ref:hub/src/shared/cards.ts#archiveKey)).
- [`GET /archive/<project>`](ref:hub/src/tower/server.ts#archive) serves
  [`archiveOf`](ref:hub/src/bridge/board.ts#archiveOf) over `allCards`, typed in `Reads` and as `tower.archive`.
- A past list is the board's off-duty cards with the archive read
  ([`pastOf`](ref:hub/src/shared/cards.ts#pastOf)); its tray counts `pastCount` before the read. The tower page keeps
  the archives it read, its `findCard` looks there on a miss, and an id in the URL hash that the board lacks reads
  every floor's archive. Tower 3D reads every floor's archive for its filing cabinets and its archive panel ([[logbook]]; a fixture board serves its own), and
  a gallery picture is looked up in `floor.gallery`, its card optional (`archived` on hover when the board lacks it).
- `tower agent`, `review`, `home` and `send` take a worker on duty by callsign from the board, else read every floor's
  archive; `tower hire` reads them for the hire depth, which walks `hiredBy` to sessions the board may leave out.
- Measured on the real data on 2026-10-07: 418 KB and 219 cards before, 98 KB and 29 cards after (79 KB of it cards),
  191 archived. `tool:frames`: identical on every fixture board (no fixture card started before the fixture's day).
- A past worker that can't be resumed where it ran says why in both past lists (`unresumable`, [[resume]]), in place
  of its ↻.
- What the present no longer shows: the tower page's skyline lights the board's cards only, and a crew lists its
  members gone home only while the board carries them.

**Alternatives considered.**
- Clip harder (conversations' prompts and answers to a line on exited cards): halves the frame but keeps it
  linear in history, and renderers still derive over every card.
- Diff frames (JSON patches against the last board): the work moves to every client, the board stays
  unbounded in memory and on first load, and a renderer in another language needs the patch logic.
- Pagination of the archive by time: wanted later if the archive read itself grows; one project's history is
  small next to the board pushed per change.
- A time-only horizon (24 h): drops stranded workers, which stay on duty for days, and leftovers.

**Impact.** A breaking board change (API version up): both renderers and `directory.ts` moved in step 1, so step 2
removed from the board only cards that past lists, lookups by id and callsign, and the hire depth now read from the
archive. The fold and the logs are untouched;
the archive is derived from the same sessions, so nothing is stored.
