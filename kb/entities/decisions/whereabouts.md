---
{
  "type": "decision",
  "name": "Whereabouts: a crew of three gathers in a meeting room until its lead goes home",
  "summary": "Where a worker is in Tower 3D is a pure function of one board, in Tower 3D's code: a crew (a lead reporting to no one on its floor, and everyone under it) gathers in a meeting room once three of it, its lead among them, are on duty at once, and disperses only when its lead goes home. The first crew to gather takes Meeting · 8, the next Meeting · 4. Inside, the lead sits at the long table's head, members at its seats in the order they came, a reviewer next to its author or standing over its shoulder, the rest at the counter's laptops, then standing at the table's foot. Each keeps its desk, which says where it is; every walk between the two is on the floor's real paths.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-17",
  "reviewed": "2026-10-26",
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
    "hub/renderers/tower3d/src/layout.ts#emptyChairs",
    "hub/renderers/tower3d/src/chairs.ts#placeChairs",
    "hub/renderers/tower3d/src/layout.ts#colliders",
    "hub/renderers/tower3d/src/layout.ts#collidersOn",
    "hub/renderers/tower3d/src/desk.ts#makeSeat",
    "hub/renderers/tower3d/src/desk.ts#syncStation",
    "hub/renderers/tower3d/src/screens.ts#awayScreen",
    "hub/renderers/tower3d/src/life.ts#originOf",
    "hub/renderers/tower3d/src/life.ts#moveTo",
    "hub/renderers/tower3d/src/life.ts#walkIn",
    "hub/renderers/kaykit/scenes/prefabs/meeting_long.json",
    "hub/renderers/kaykit/scenes/prefabs/room_meeting_8.json",
    "hub/renderers/kaykit/scenes/prefabs/room_meeting_4.json",
    "hub/renderers/tower3d/src/fixtures.ts#crews",
    "hub/renderers/tower3d/src/fixtures.ts#growing"
  ],
  "links": [
    { "to": "crews", "verb": "uses", "carries": "card.reportsTo, card.onDuty and today's sent-home cards: who a crew is and when each of it came and went" },
    { "to": "prefab-editor", "verb": "uses", "carries": "the long table's states by crew size and the rooms' slots, placed by hand" },
    { "to": "floor-plan", "verb": "uses", "carries": "the meeting rooms along the front glass" }
  ]
}
---
**Problem.** A coordinator and its hires sat scattered at desks wherever the seat replay put them; nothing in the
office said they worked together. A big enough crew should gather in a meeting room instead, emergent from what the
board says, not scripted.

**Why in Tower 3D, not the bridge.** The meeting room is Tower 3D's spatial metaphor, so its rule is Tower 3D's code.
It can be a pure function of one board: the board keeps today's sent-home cards with `hiredBy`, `reportsTo` and
`onDuty` ([[crews]]), so a crew's history needs no renderer state and survives a reload.

**How.**
- *Crews and gathering* ([`meetingsOf`](ref:hub/renderers/tower3d/src/meetings.ts#meetingsOf)). A lead is a current
  card reporting to no card on its floor; its crew is it and everyone under it ([[crews]]). A worker's time on duty
  runs from its latest session's start until it stops, so a resume is a new arrival (the board says when each session
  started, not when the one before it stopped): a lead resumed after its crew dispersed needs three on duty again. A
  crew gathers at the first moment three of it, its lead among them, are on duty at once
  ([`GATHER`](ref:hub/renderers/tower3d/src/meetings.ts#GATHER)), and disperses only when its lead goes home, so
  members coming and going never march it back and forth.
- *Rooms.* Gatherings and dispersals are replayed in time order: a gathering crew takes the first free room, largest
  first; with none free it waits at its desks for one to free. A crew never changes room while gathered.
- *Places.* Replayed from the members' comings and goings since the crew took the room: the lead takes `head`, each
  member the first free `seat_<n>`, then `counter_<n>`, then `stand_<n>`, and one finding none stays at its desk. A
  reviewer takes a free seat next to its author's, else stands behind its author's chair
  ([`placeNamed`](ref:hub/renderers/tower3d/src/meetings.ts#placeNamed)). A member going home frees its place and nobody
  else moves. A member on a break keeps its place ([[break-room]]).
- *The table grows with the crew.* The long table has a state per size; a meeting draws the smallest that seats the
  most it has held at once, up to its room's `seats`, and an empty room its largest
  ([`stateFor`](ref:hub/renderers/tower3d/src/meetings.ts#stateFor)). The table, its states and the rooms' counter and
  standing places are slots placed by hand in the [[prefab-editor]], read by
  [`meetingKit`](ref:hub/renderers/tower3d/src/meetings.ts#meetingKit). A member keeps its place's name as the table
  grows, so seated members walk to the same-named seat in the new state and nobody swaps sides; the table never shrinks
  while the crew stays. At the day's turn a member sent home yesterday drops off the board, so the table can shrink a
  state and later members renumber: accepted, since the replay stays pure over one board and a once-a-day shuffle isn't
  worth stored state.
- *One desk per worker, at its place.* [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan) gives a member a
  `DeskSlot` at its place with `meeting` set, drawn as a seat
  ([`makeSeat`](ref:hub/renderers/tower3d/src/desk.ts#makeSeat)) whose laptop shows its live terminal; sitting there is
  sitting at its desk ([[tower3d-desk]]). Its own workstation stays, dressed as its worker's, as an
  [`AwaySlot`](ref:hub/renderers/tower3d/src/layout.ts#AwaySlot) that reads where it is
  ([`syncStation`](ref:hub/renderers/tower3d/src/desk.ts#syncStation)). Untaken sitting places draw empty chairs
  ([`emptyChairs`](ref:hub/renderers/tower3d/src/layout.ts#emptyChairs)), instanced per level
  ([`placeChairs`](ref:hub/renderers/tower3d/src/chairs.ts#placeChairs)), so a board moves instances.
- *Walked round and walked to.* The table's footprint is among the floor's
  [`colliders`](ref:hub/renderers/tower3d/src/layout.ts#colliders); the room's chairs stop only you
  ([`collidersOn`](ref:hub/renderers/tower3d/src/layout.ts#collidersOn)), since a worker pulls its chair out to sit.
  Every change of place on a level walks the floor's grid
  ([`originOf`](ref:hub/renderers/tower3d/src/life.ts#originOf), [`moveTo`](ref:hub/renderers/tower3d/src/life.ts#moveTo))
  on the sim clock.

**Alternatives considered.**
- *The rule in the bridge*: every renderer could say "in the meeting room", but the room is one renderer's metaphor;
  a fact other renderers need goes in the bridge as a general fact when it comes.
- *Gather and disperse at size thresholds*: a crew of three losing a member would march back to its desks and return
  with the next hire. Dispersing only with the lead keeps it put.
- *The largest crew always in the larger room*: crews would swap rooms as they grow. The first to gather keeps it.
- *A reviewer at the free seat nearest its author*: by then the seats beside its author are taken, and the nearest
  free one, down the table, reads as unrelated. Standing over its shoulder reads as review.
- *Two objects per worker in a meeting* (its desk with the avatar hidden, and a seat): every reader of `s.desks`
  (waits, the cat's perch, going to a worker) would follow the empty desk.
- *Teleporting between desk and room*: every move walks.
- *Empty chairs as a clone of the desk model's chair each*: a clone per chair costs all its meshes in every pass;
  instancing keeps a level's chairs to a draw call per material.

**Impact.** Tower 3D only; no board or API change. The
[`crews`](ref:hub/renderers/tower3d/src/fixtures.ts#crews) and
[`growing`](ref:hub/renderers/tower3d/src/fixtures.ts#growing) fixture boards cover gathering, overflow, two rooms, a
waiting crew and the table growing.
