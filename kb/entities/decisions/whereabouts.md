---
{
  "type": "decision",
  "name": "Whereabouts: a crew of three gathers in a meeting room until its lead goes home",
  "summary": "Where a worker is in Tower 3D is a pure function of one board, in Tower 3D's code: a crew (a lead reporting to no one on its floor, and everyone under it) gathers in a meeting room once three of it, its lead among them, are on duty at once, and disperses only when its lead goes home. The first crew to gather takes Meeting · 8, the next Meeting · 4. Inside, the lead sits at the long table's head, members at its seats in the order they came, a reviewer next to its author or standing over its shoulder, the rest at the counter's laptops, then standing at the table's foot. Each keeps its desk; every walk between the two is on the floor's real paths.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-17",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/renderers/tower3d/src/meetings.ts#meetingsOf",
    "hub/renderers/tower3d/src/meetings.ts#meetingKit",
    "hub/renderers/tower3d/src/meetings.ts#stateFor",
    "hub/renderers/tower3d/src/meetings.ts#GATHER",
    "hub/renderers/tower3d/src/meetings.ts#placeNamed",
    "hub/renderers/tower3d/src/layout.ts#plan",
    "hub/renderers/tower3d/src/layout.ts#DeskSlot",
    "hub/renderers/tower3d/src/layout.ts#AwaySlot",
    "hub/renderers/tower3d/src/layout.ts#TableSlot",
    "hub/renderers/tower3d/src/layout.ts#workstations",
    "hub/renderers/tower3d/src/layout.ts#deskSpot",
    "hub/renderers/tower3d/src/layers.ts#DESKS",
    "hub/renderers/tower3d/src/layers.ts#STATIONS",
    "hub/renderers/tower3d/src/layers.ts#CHAIRS",
    "hub/renderers/tower3d/src/desk.ts#makeSeat",
    "hub/renderers/tower3d/src/life.ts#originOf",
    "hub/renderers/tower3d/src/life.ts#moveTo",
    "hub/renderers/tower3d/src/life.ts#walkIn",
    "hub/renderers/kaykit/scenes/prefabs/meeting_long.json",
    "hub/renderers/kaykit/scenes/prefabs/room_meeting_8.json",
    "hub/renderers/kaykit/scenes/prefabs/room_meeting_4.json",
    "hub/renderers/tower3d/src/fixtures.ts#crews"
  ],
  "links": [
    { "to": "crews", "verb": "uses", "carries": "card.reportsTo, card.onDuty and today's sent-home cards: who a crew is and when each of it came and went" },
    { "to": "prefab-editor", "verb": "uses", "carries": "the long table's states by crew size and the rooms' slots, placed by hand" },
    { "to": "floor-plan", "verb": "uses", "carries": "the meeting rooms along the front glass" }
  ]
}
---
**Problem.** A coordinator and its hires sat scattered at desks wherever the seat replay put them; nothing in the
office said they worked together. The user wanted a big enough crew to gather in a meeting room instead, emergent
from what the board says, not scripted.

**Why in Tower 3D, not the bridge.** The meeting room is Tower 3D's spatial metaphor, so its rule is Tower 3D's code.
It can be a pure function of one board: the board keeps the cards of workers sent home today with `hiredBy`,
`reportsTo` and `onDuty` ([[crews]]), so a crew's history needs no state kept in the renderer and survives a reload. No
board field was added.

**How.**
- *Crews and gathering* ([`meetingsOf`](ref:hub/renderers/tower3d/src/meetings.ts#meetingsOf)). A lead is a current
  card reporting to no card on its floor; its crew is it and everyone under it (`crewOf`), a reviewer of a member
  included. Each worker's time on duty runs from its first session's start to its `letGoAt` or `enteredAt` once off
  duty. A crew gathers at the first moment three of it, its lead among them, were on duty at once
  ([`GATHER`](ref:hub/renderers/tower3d/src/meetings.ts#GATHER)), and disperses when its lead goes home: members coming
  and going in between never march it back and forth. A crew of one left is still a meeting.
- *Rooms.* Gatherings and dispersals are replayed in time order: a gathering crew takes the first free room, Meeting · 8
  then Meeting · 4 (rooms by `seats`, the largest first); with both taken it waits at its desks and takes the first room
  freed. A crew never moves to another room while it stays gathered.
- *Places.* Inside, a replay of its members' comings and goings since it took the room: the lead takes `head`, each
  member the first free `seat_<n>`, then `counter_<n>` (a laptop on the counter along the front glass), then
  `stand_<n>` at the table's foot; a member finding none stays at its desk. A reviewer takes a free seat next to its
  author's (within a table's pitch), or stands behind its author's chair, looking over its shoulder
  ([`placeNamed`](ref:hub/renderers/tower3d/src/meetings.ts#placeNamed)). A member sent home frees its place; nobody
  else moves.
- *The table grows with the crew.* The long table ([`meeting_long.json`](ref:hub/renderers/kaykit/scenes/prefabs/meeting_long.json))
  has a state per size, `seats_4`, `seats_6`, `seats_8`, each with its `head` and `seat_<n>` slots; a meeting draws the
  smallest that seats the most it has held at once, up to its room's `seats`
  ([`stateFor`](ref:hub/renderers/tower3d/src/meetings.ts#stateFor)), and an empty room its largest. Each room places
  the table at its `table` slot and holds its counter and standing places as slots
  ([`room_meeting_8.json`](ref:hub/renderers/kaykit/scenes/prefabs/room_meeting_8.json)); all of it is moved in the
  [[prefab-editor]], and [`meetingKit`](ref:hub/renderers/tower3d/src/meetings.ts#meetingKit) reads it into places on
  the level. A table is drawn with the workstations' dressing on every board, so a state change rebuilds nothing.
- *Drawn as a desk at a place.* [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan) gives a member a `DeskSlot` at its
  place, with `meeting` and its own workstation's `n`; the desk layer
  ([`DESKS`](ref:hub/renderers/tower3d/src/layers.ts#DESKS)) draws it as a seat
  ([`makeSeat`](ref:hub/renderers/tower3d/src/desk.ts#makeSeat)): a chair and a laptop whose screen is its live
  terminal, or, standing, neither. Sitting there is sitting at its desk ([[tower3d-desk]]); going to it stands you over
  its shoulder, inside the room ([`deskSpot`](ref:hub/renderers/tower3d/src/layout.ts#deskSpot)). Every other place in the
  table's state and at the counter has an empty chair ([`CHAIRS`](ref:hub/renderers/tower3d/src/layers.ts#CHAIRS)).
- *Its desk stays* ([`AwaySlot`](ref:hub/renderers/tower3d/src/layout.ts#AwaySlot)): the workstation is drawn with its
  worker's dressing, a station nobody sits at.
- *Walks.* A desk becoming another kind on the same level (own, beside, seat, standing) or a seat moving is a move:
  [`originOf`](ref:hub/renderers/tower3d/src/life.ts#originOf) takes where the worker sits or walks now, and
  [`moveTo`](ref:hub/renderers/tower3d/src/life.ts#moveTo) gives the new desk's arrival: standing up from the old chair,
  round what stands on the floor by the grid the cats and guests walk (`route`), and in behind the new chair (from the
  side its way comes from) or to where it stands. From the elevator, a hire seen first in a meeting walks the same grid.
  All of it runs on the sim clock, so `?stepped` frames repeat.

**Alternatives considered.**
- *The rule in the bridge* (the draft's first idea): every renderer could say "in the meeting room", but the meeting
  room is one renderer's metaphor; a fact other renderers need goes in the bridge as a general fact when it comes.
- *Gather and disperse at size thresholds*: a crew of 3 losing a member would march back to its desks and return with
  the next hire. Dispersing only with the lead keeps it put.
- *The largest crew always in Meeting · 8*: crews would swap rooms as they grow. Every crew gathers at three, so the
  first to gather takes the larger room and keeps it.
- *A reviewer at the free seat nearest its author*: by the time a reviewer comes, the seats beside its author are
  taken, and the nearest free one is down the table, reading as unrelated. Standing over its shoulder reads as review.
- *Two objects per worker in a meeting* (its desk with its avatar hidden, and a seat): every reader of `s.desks`
  (waits, the cat's perch, going to a worker) would follow the empty desk. One desk per worker, at its place, and the
  workstation a station with a mark, as a free workstation is.
- *Teleporting between desk and room*: rejected by the user; every move walks.

**Impact.** Tower 3D only; no board or API change. The tidy fixture's crew of three now gathers; a `crews` fixture
board covers a gathered crew, an overflow onto the counter and a standing member, two crews in two rooms, and a
third crew waiting at its desks. Off-duty members staying around as roamers while their lead works is a later idea
(draft `wintry-pebble`).
