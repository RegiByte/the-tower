---
{
  "type": "decision",
  "name": "The board carries the floor's present; the archive is a read",
  "summary": "Accepted: the pushed board keeps only the cards a renderer needs to draw the present (on duty, waiting, leaving something running, or started today), with what renderers derive from history (seats, the gallery, callsigns of referenced sessions) computed in the bridge onto it; every other card is served by a read that changes rarely.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-11-08",
  "refs": ["hub/src/bridge/board.ts#board", "hub/src/bridge/board.ts#onBoard", "hub/src/bridge/board.ts#allCards", "hub/src/bridge/board.ts#archiveOf", "hub/src/bridge/board.ts#archiveAtOf", "hub/src/tower/http.ts#archive", "hub/src/tower/publisher.ts#archivedCards", "hub/src/tower/publisher.ts#archiveCore", "hub/src/shared/past.ts#pastOf", "hub/src/shared/past.ts#archiveKey", "hub/src/bridge/chains.ts#threads", "hub/src/bridge/chains.ts#SessionRef", "hub/src/bridge/seats.ts#withSeats", "hub/src/bridge/board.ts#galleryOf", "hub/src/shared/status-words.ts#bubbleOf", "hub/src/shared/crews.ts#findCard", "hub/src/directory.ts#everyCard", "hub/src/directory.ts#readArchive", "hub/renderers/page/index.html", "hub/renderers/page/page.js"]
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
  a conversation's `resumes` and `resumedBy` (on the board and in the brief) and a card's `continuedBy`; `keptBy` carries
  `{session, callsign}` and `hiredBy` `{session, callsign, project}`. [`bubbleOf`](ref:hub/renderers/tower3d/src/cards.ts#bubbleOf), a status's glyph, is
  Tower 3D's own; `/cards.js` serves a copy until 2.0.
- Tower 3D derives its seats and gallery itself, over the board's cards and the archive read beside it, which are
  every card again ([[workstations]], [[shared-wall]]); the bridge's `card.seat` and `floor.gallery` stay on the
  board until 2.0.
- [`allCards`](ref:hub/src/bridge/board.ts#allCards) derives every card (seats, crews, the gallery and
  Tidy's plan run over all of them); [`board`](ref:hub/src/bridge/board.ts#board) keeps those
  [`onBoard`](ref:hub/src/bridge/board.ts#onBoard): on duty, waiting, holding leftovers, or started since the start
  of the host's local day. It carries `floor.archived` (a count) and `board.archiveAt`
  ([`archiveAtOf`](ref:hub/src/bridge/board.ts#archiveAtOf)): the latest of each archived card's end,
  the end of the day it started (when it left the board), and the start of any session that resumed one of its
  conversations. A card can also leave the board when its last leftover is reaped or its hirer stops running, at no
  logged time: the count moves then, so a renderer watches both
  ([`archiveKey`](ref:hub/src/shared/past.ts#archiveKey)).
- [`GET /archive/<project>`](ref:hub/src/tower/http.ts#archive) serves
  [`archiveOf`](ref:hub/src/bridge/board.ts#archiveOf) over `allCards` (`Card[]`, newest first, the same card
  shape), typed in `Reads` and as `tower.archive`. Its cards are folded as the board's are
  ([`archivedCards`](ref:hub/src/tower/publisher.ts#archivedCards): each running extension's card folds, then
  `LEGACY`'s copies), so an archived card carries `x` and the old fields too ([[extensions]]). Reads arriving
  together share one build of every card and the core's board, the last one a board or a read made, while its key
  holds (`changes` reported, the config's text, the viewers, the day) for at most `ARCHIVE_SHARE_MS` (1 s): each read
  folds its own floor on it, served as a read at the instant the build was made
  ([`archiveCore`](ref:hub/src/tower/publisher.ts#archiveCore)). A cache, dropped once that second is over.
- A past list is the board's off-duty cards with the archive read
  ([`pastOf`](ref:hub/src/shared/past.ts#pastOf)), listed by crew ([[crews]]); its tray counts `pastCount` before the read.
  A renderer holds the archives it reads as held reads ([[machines]]): a slot per floor read at its `archiveKey`
  ([`archiveWant`](ref:hub/src/shared/past.ts#archiveWant), [`archivesMoved`](ref:hub/src/shared/past.ts#archivesMoved),
  [`archivedCard`](ref:hub/src/shared/past.ts#archivedCard), named in `/lib/cards.js`), each renderer on a loop of
  its own, so the `tower/archive` view reads its floor's archive apart from the page that mounts it. The tower page keeps
  the archives it read, its `findCard` looks there on a miss, and an id in the URL hash that the board lacks, or a
  worker on screen leaving the board, reads every floor's archive not read at its `archiveKey` (again where that read
  failed) and waits for those reads to land or fail ([`archive`](ref:hub/renderers/page/archive.js#archive), the
  loop's `until`). Tower 3D reads every floor's archive for its filing cabinets and its archive panel ([[logbook]]; a fixture board serves its own), and
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
