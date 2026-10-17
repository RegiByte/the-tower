---
{
  "type": "decision",
  "name": "The board carries the floor's present; the archive is a read",
  "summary": "Accepted: the pushed board keeps only the cards a renderer needs to draw the present (on duty, waiting, leaving something running, or started today), with what renderers derive from history (seats, the gallery, callsigns of referenced sessions) computed in the bridge onto it; every other card is served by a read that changes rarely.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-17",
  "refs": ["hub/src/bridge/board.ts#board", "hub/src/bridge/board.ts#onBoard", "hub/src/bridge/board.ts#allCards", "hub/src/bridge/board.ts#archiveOf", "hub/src/bridge/board.ts#archiveAtOf", "hub/src/tower/server.ts#archive", "hub/src/shared/cards.ts#pastOf", "hub/src/shared/cards.ts#archiveKey", "hub/src/bridge/chains.ts#threads", "hub/src/bridge/chains.ts#SessionRef", "hub/src/bridge/seats.ts#withSeats", "hub/src/bridge/board.ts#galleryOf", "hub/src/shared/cards.ts#bubbleOf", "hub/src/shared/cards.ts#findCard", "hub/src/directory.ts", "hub/renderers/page/index.html"]
}
---
**Problem.** The board is pushed whole, to every client, on every change. Holding every session ever run, it grows
with history, while the cards that change are the few on duty.

**Why.** Everything the bridge derives from history already runs over sessions, not over cards: threads,
`resumes`/`resumedBy`, callsign lineage, a card's `shown` gathered across its lineage, `keptBy` and `waiting`
([`board`](ref:hub/src/bridge/board.ts#board), [`threads`](ref:hub/src/bridge/chains.ts#threads)). The server
can keep full history and send less, as long as nothing a renderer derives needs the cards it isn't sent: so whatever
is derived from history (seats, the gallery, the callsigns of referenced sessions) is derived in the bridge, over
every card.

**How.**
- History derived in the bridge, over every card: `card.seat`
  ([`withSeats`](ref:hub/src/bridge/seats.ts#withSeats): `{n}` a workstation, `{beside}` the author's id);
  `floor.gallery` ([`galleryOf`](ref:hub/src/bridge/board.ts#galleryOf)): the floor's last showings, newest
  first, each `{worker: {id, callsign}, shown}` ([[shared-wall]]); [`SessionRef`](ref:hub/src/bridge/chains.ts#SessionRef) `{id, callsign}` for
  a conversation's `resumes` and `resumedBy` (on the board and in the brief) and a card's `continuedBy`; `keptBy` and
  `hiredBy` carry `{session, callsign}`. [`bubbleOf`](ref:hub/src/shared/cards.ts#bubbleOf), a status's glyph, is in
  the shared cards.
- [`allCards`](ref:hub/src/bridge/board.ts#allCards) derives every card (seats, crews, the gallery and
  Tidy's plan run over all of them); [`board`](ref:hub/src/bridge/board.ts#board) keeps those
  [`onBoard`](ref:hub/src/bridge/board.ts#onBoard): on duty, waiting, holding leftovers, or started since the start
  of the host's local day. It carries `floor.archived` (a count) and `board.archiveAt`
  ([`archiveAtOf`](ref:hub/src/bridge/board.ts#archiveAtOf)): the latest of each archived card's end,
  the end of the day it started (when it left the board), and the start of any session that resumed one of its
  conversations. A card can also leave the board when its last leftover is reaped or its hirer stops running, at no
  logged time: the count moves then, so a renderer watches both
  ([`archiveKey`](ref:hub/src/shared/cards.ts#archiveKey)).
- [`GET /archive/<project>`](ref:hub/src/tower/server.ts#archive) serves
  [`archiveOf`](ref:hub/src/bridge/board.ts#archiveOf) over `allCards` (`Card[]`, newest first, the same card
  shape), typed in `Reads` and as `tower.archive`.
- A past list is the board's off-duty cards with the archive read
  ([`pastOf`](ref:hub/src/shared/cards.ts#pastOf)), listed by crew ([[crews]]); its tray counts `pastCount` before the read. The tower page keeps
  the archives it read, its `findCard` looks there on a miss, and an id in the URL hash that the board lacks reads
  every floor's archive. Tower 3D reads every floor's archive for its filing cabinets and its archive panel ([[logbook]]; a fixture board serves its own), and
  a gallery picture is looked up in `floor.gallery`, its card optional (`archived` on hover when the board lacks it).
- `tower agent`, `review`, `home` and `send` take a worker on duty by callsign from the board, else read every floor's
  archive; `tower hire` reads them for the hire depth, which walks `hiredBy` to sessions the board may leave out.
- A past worker that can't be resumed where it ran says why in both past lists (`unresumable`, [[resume]]), in place
  of its ↻.
- A crew lists its members gone home only while the board carries them.

**Alternatives considered.**
- Clip harder (conversations' prompts and answers to a line on exited cards): halves the frame but keeps it
  linear in history, and renderers still derive over every card.
- Diff frames (JSON patches against the last board): the work moves to every client, the board stays
  unbounded in memory and on first load, and a renderer in another language needs the patch logic.
- Pagination of the archive by time: wanted if the archive read itself grows.
- A time-only horizon (24 h): drops stranded workers, which stay on duty for days, and leftovers.

**Impact.** The board holds the cards of the day and those still on duty; past lists, lookups by id and callsign, and
the hire depth read the archive. The archive is derived from the same sessions, so nothing is stored.
