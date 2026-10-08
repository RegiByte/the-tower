---
{
  "type": "decision",
  "name": "The shared wall: drafts in, showings out, on one wall per floor",
  "summary": "Every floor in Tower 3D has a freestanding wall before the back glass: the corkboard (drafts, what goes in) on its left when the floor keeps drafts, and a gallery of the floor's last nine showings (what came out) on its right, any worker's, on duty or not.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/renderers/tower3d/src/layout.ts#wallFor",
    "hub/renderers/tower3d/src/layout.ts#HANG",
    "hub/src/bridge/board.ts#galleryOf",
    "hub/renderers/tower3d/src/layout.ts#corkFor",
    "hub/renderers/tower3d/src/gallery.ts",
    "hub/renderers/tower3d/src/layers.ts#GALLERY",
    "hub/renderers/tower3d/src/desk.ts#heldUpAt",
    "hub/renderers/tower3d/src/acts.ts#OFFERS",
    "hub/renderers/tower3d/src/main.ts#openPicture",
    "hub/renderers/tower3d/src/fixtures.ts#FIXTURES",
    "hub/scripts/frames.scenario.js"
  ]
}
---
**Problem.** A worker's showings lived only on its desk's second monitor ([[agent-show]]), which shows the
latest one and leaves with the worker. A floor had no place to see what its workers had made, and the corkboard
([[corkboard]]) stood against the glass facade, a mullion behind it.

**Why.** The user reads a floor as a workshop: prompts kept for later go in, work comes out. Putting both on one
wall makes that flow visible in one place, and keeps the history of what was shown after the worker that showed
it goes home.

**How.**
- **One wall per floor** ([`wallFor`](ref:hub/renderers/tower3d/src/layout.ts#wallFor)): a freestanding partition
  1.6 m before the back glass, right of the elevator core, facing the desks, with its own collider. It stands on
  every floor. The corkboard hangs on its left only when the floor declares `drafts`; a floor without leaves that
  stretch bare, and the gallery keeps its half.
- **The gallery**: the floor's last nine showings, from every card on the floor, on duty or not, newest first:
  the bridge gathers the floor's last twelve as `floor.gallery` ([`galleryOf`](ref:hub/src/bridge/board.ts#galleryOf),
  each `{worker: {id, callsign}, shown}`, [[board-archive]]) and the wall hangs as many as it has places.
  [`HANG`](ref:hub/renderers/tower3d/src/layout.ts#HANG) is a fixed salon arrangement: the newest centred at eye
  level, then the places around it, each a box its picture fits in. A picture takes all of its box for files,
  less for a web page, least for a link. All of it is in the plan, derived from the board. A card another
  continues (`continuedBy`) gives the gallery nothing: its showings hang once, under the worker as it is now.
- **Pictures** ([`gallery.ts`](ref:hub/renderers/tower3d/src/gallery.ts)): the poster or typeset page of
  `posterOf`, or an image or a video bare at its own proportions once read ([[blob-reads]]; a video plays muted while
  it is among the floor's two newest and you stand there), in a frame of the worker's own colour, over a plaque (callsign, age, title), with a NEW ribbon from
  the viewer's seen state. Built at unit width, so moving to another place is a move and a scale.
- **Arrival** ([`GALLERY`](ref:hub/renderers/tower3d/src/layers.ts#GALLERY)): keyed by `shownKey`. On a new
  board the kept pictures slide to their new places at once; a showing new since the last board waits while its
  worker holds it up at the desk, then flies from over its head to the centre
  ([`heldUpAt`](ref:hub/renderers/tower3d/src/desk.ts#heldUpAt)). One with no desk to come from appears in place.
- **Verbs** ([`OFFERS`](ref:hub/renderers/tower3d/src/acts.ts#OFFERS)): a `picture` act. E opens it in the reader
  where you stand ([`openPicture`](ref:hub/renderers/tower3d/src/main.ts#openPicture)), as its desk tab would, and
  counts it seen; F goes to the worker's desk on that tab, offered only while it is on duty. A picture is looked up
  in `floor.gallery` ([`pictureOf`](ref:hub/renderers/tower3d/src/cards.ts#pictureOf)), its worker's card only while
  the board carries it: a worker the board leaves out reads `archived` on hover ([[board-archive]]).
- **Checked by frames** ([`FIXTURES`](ref:hub/renderers/tower3d/src/fixtures.ts#FIXTURES)): a fixture is a list of
  boards, and the door's `advance()` delivers the next. `busy`'s second board adds a showing and pushes the
  oldest off, so the walk ([`frames.scenario.js`](ref:hub/scripts/frames.scenario.js)) records it held up and hung.

**Alternatives considered.**
- *The wall in the control room, or the core's wall extended.* The control room is the floor's machinery, and an
  extended core would block the landing's view. A freestanding wall is a place you walk up to.
- *Each worker's latest showing only.* Loses what an off-duty worker made, the history the user asked for.
- *Pictures that keep their places* (new ones fill the next free place). Hides the newest at the edge; the salon
  keeps it centred, and the slide shows where everything went.
- *Real page pixels.* A framed renderer can't paint a page into WebGL: posters, as on the monitor. Images came
  later, as blobs ([[blob-reads]]).
- *A lobby "now showing" wall.* Left for later.

**Impact.** The corkboard moved off the glass onto the wall. The door gained `advance()` and a `pictures` count,
and fixtures became sequences, so between-board behaviour can be recorded by frames. No API or board change.
