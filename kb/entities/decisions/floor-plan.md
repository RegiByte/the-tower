---
{
  "type": "decision",
  "name": "A floor's plan: a wing loft over the control room, in a 6.6 m storey",
  "summary": "Every floor is a 6.6 m storey with a mezzanine: a deck over the left wing's back (top 3.30, 0.35 thick, 2.95 m clear under it), reached by a straight stair along the wing's face that rises toward the back to a landing beside the deck. The walker stands on a ground height (a stair is a ramp, the deck a second collision layer chosen by height). The plan chosen is A+ (A's wing loft, B's ground floor of different rooms, C's glazed control room); it is built in slices: the deck and the stair, then the control room lifted onto the deck and the rooms placed from anchors.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-17",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/renderers/tower3d/src/floorplan.ts#loftOf",
    "hub/renderers/tower3d/src/layout.ts#roomBox",
    "hub/renderers/tower3d/src/layout.ts#roomWalls",
    "hub/renderers/tower3d/src/room.ts#buildRoom",
    "hub/renderers/tower3d/src/floorplan.ts#DECK",
    "hub/renderers/tower3d/src/floorplan.ts#STAIR",
    "hub/renderers/tower3d/src/floorplan.ts#groundAt",
    "hub/renderers/tower3d/src/floorplan.ts#layerAt",
    "hub/renderers/tower3d/src/floorplan.ts#loftWalls",
    "hub/renderers/tower3d/src/loft.ts#buildLoft",
    "hub/renderers/tower3d/src/layout.ts#STOREY",
    "hub/renderers/tower3d/src/layout.ts#ROOM_HEIGHT",
    "hub/renderers/tower3d/src/layout.ts#collidersOn",
    "hub/renderers/tower3d/src/layout.ts#solids",
    "hub/renderers/tower3d/src/walker.ts#fallTo",
    "hub/renderers/tower3d/src/main.ts#stepWalker",
    "hub/renderers/tower3d/src/layout.ts#plan",
    "hub/renderers/tower3d/src/floorplan.ts#roomsOf",
    "hub/renderers/tower3d/src/floorplan.ts#anchorsOf",
    "hub/renderers/tower3d/src/room.ts#buildShelf"
  ]
}
---
**Problem.** A floor was one 4.2 m storey with the control room in its back-left corner, and nothing else had a
place: no room to meet in, to play in, to keep the archive, or to sit. The floor's plate is set by its desks, so
more rooms on the ground would deepen it or crowd the desks. Raising the control room onto a mezzanine frees the
ground under it.

**Options greyboxed** (five plans as data over the same plate, drawn as SVG plans and in Tower 3D):
- *A, wing loft*: the whole left wing two storeys, three rooms under a deck, the control room and a terrace on it,
  a straight stair along the wing's face. The best mezzanine architecture and the most honest evolution of the
  office it replaces.
- *B, back gallery*: a gallery along the whole back wall, the core running up through it. The best room placement
  and variety (game room, meeting room and a couch between them), but the worst access: no stair, and the elevator
  stopping twice a floor at a half level.
- *C, pod over the landing*: a glass control pod hung over the elevator's landing, its video wall a two-sided
  scoreboard. The best control room concept; the rest is weak: cramped rooms beside the stair, a pod too close to the
  desks to read them, three identical boxes in a row.
- *A+C, centre loft with desks in rings*: every screen read over a shoulder, but it loses the long view from the
  elevator, needs turn-aware walks everywhere, and has the deepest plate (31 m at two rows).

**Chosen: A+**, A's structure with B's ground floor and C's control room: the deck over the wing from the back, the
control room on it glazed toward the desks with a two-sided video wall, a terrace before it; on the ground an
archive, a game room, an open lounge, and meeting rooms for eight and for four along the front glass, the hero
between them; desks turned so workers face +x, away from the control room, which reads their screens over their
shoulders.

**How (built so far).**
- *The storey is 6.6 m* ([`STOREY`](ref:hub/renderers/tower3d/src/layout.ts#STOREY)): 2.95 m clear under the deck,
  the deck's 0.35, 3.0 m clear over it and the 0.3 slab. Three floors stand 25.3 m to the roof (18.1 at 4.2). The
  lobby keeps 5.5, the shaft's head over the roof 4.2. The car rides at a speed, so a floor takes longer.
- *The loft is data over the plate* ([`loftOf`](ref:hub/renderers/tower3d/src/floorplan.ts#loftOf)), anchored to the
  back wall, so a deeper plate leaves it where it is: the deck over the wing (x from the left glass to 9 m in, z from
  the back to 14 m out), the landing beside it (back + 9.2 to 10.8, reaching over the control room's side wall), the
  stair down from the landing to its foot at back + 16.2 (1.6 wide, 18 risers of 183 mm on 300 mm treads, along that
  wall's outer face), glass rails along every open edge and the stair's
  open sides, and one post under the deck's free corner. [`buildLoft`](ref:hub/renderers/tower3d/src/loft.ts#buildLoft)
  draws it on each floor. The deck stays inside its level, so the rule that a level is a box closed by its slabs holds
  ([[tower3d-levels]]).
- *The walker lands on a ground height* ([`fallTo`](ref:hub/renderers/tower3d/src/walker.ts#fallTo)):
  [`groundAt`](ref:hub/renderers/tower3d/src/floorplan.ts#groundAt) is the stair's tread inside its box (a ramp from
  0 at its foot to the deck at its top), the deck once past halfway up, else the floor; within a step of it the walker
  stands on it, else it falls. Its layer, [`layerAt`](ref:hub/renderers/tower3d/src/floorplan.ts#layerAt), is chosen
  by height, and what it bumps into is keyed by layer
  ([`collidersOn`](ref:hub/renderers/tower3d/src/layout.ts#collidersOn)): on the floor, today's colliders with the
  post and the stair's sides and back (open at its foot); on the deck, the shell and every rail. Workers, guests and
  cats stay on the ground layer.
- *Sight is blocked by height* ([`solids`](ref:hub/renderers/tower3d/src/layout.ts#solids)): the shell and core floor
  to ceiling, the control room's walls and the shared wall as high as they stand, the deck and landing as slabs, so
  you aim down from the deck past the room below and not through the deck from under it.
- *The control room stands on the deck* as it stood on the ground
  ([`roomBox`](ref:hub/renderers/tower3d/src/layout.ts#roomBox), [`buildRoom`](ref:hub/renderers/tower3d/src/room.ts#buildRoom)):
  9 × 9 m from the back-left corner, 3.0 m clear to the ceiling
  ([`ROOM_HEIGHT`](ref:hub/renderers/tower3d/src/layout.ts#ROOM_HEIGHT)), its video wall on the back wall, the shells'
  bench along the facade, a solid inner wall (which closes the deck's edge behind the landing, so no rail stands
  there) and the console in the middle, entered through a door in its glass front onto the terrace, the rest of the
  deck. Its depth is fixed: the bench holds four shells at full size, and past that every kiosk and the pitch between them shrink together until all fit (`packed` in [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan)), so no shell goes undrawn. Its walls, console, bench and furniture
  are the deck layer's colliders ([`roomWalls`](ref:hub/renderers/tower3d/src/layout.ts#roomWalls)); a zone standing
  on the deck carries its `y`.
- *The plate is sized for three rows* (`PLATE_ROWS` in [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan)):
  core 4 + landing 4.2 + rows × 4.8 + back margin 2.4 + the meeting strip 6.4 and its aisle 1.6, at least three rows'
  worth: 33.0 m, 37.8 at four. The board still draws the rows it needs (two at least); the third's floor stands empty
  before the strip. The roof's dance floors grow with it.
- *Rooms are prefabs placed from anchors* ([`roomsOf`](ref:hub/renderers/tower3d/src/floorplan.ts#roomsOf),
  [`anchorsOf`](ref:hub/renderers/tower3d/src/floorplan.ts#anchorsOf)). Each room's shell (walls, glass, door
  frame) is a scene document of boxes, `renderers/kaykit/scenes/prefabs/room_*.json`, with its origin at its door
  and +z out of it, placed at its `<room>.door` anchor ([[office-kaykit]], reshaped in the [[prefab-editor]]). The
  code keeps each room's box for what it places inside (the shelf, the arcade); a room reshaped in the editor moves
  its walls, not what stands in it. Anchors: `elevator.doors`, `desks.first-row`, `desks.last-row`, `glass.front`,
  `glass.left`, `glass.right`, `control.door`, `stair.foot`, `stair.top`, `deck.rail`, `archive.door`, `game.door`,
  `meeting-8.door`, `meeting-4.door`, `lounge`, `hero`. The wing's rooms and the loft are anchored to the back; the
  meeting strip, the hero and the lounge's front to the front glass; the desk rows and the lounge stretch between.
  - *Under the deck* (2.95 m high): the archive, 6.5 × 5 in the back corner, holding the shelf along its back glass,
    its left glass and the wall it shares with the game room
    ([`buildShelf`](ref:hub/renderers/tower3d/src/room.ts#buildShelf)), every entry: when the walls are full (seven at full size, as many as a floor shelves today), every piece and the pitch shrink together by steps until all fit; its outer wall is
    solid, its door at that wall's front end, and in the nook beside it stand the filing cabinet and the Running
    board ([[logbook]]). The game room, 9 × 9 before it, glazed toward the desks, the arcade along its front wall
    ([[arcade]]), the pigeonhole on its outer wall by the nook ([[review-threads]]).
  - *The lounge* is open, the wing from the deck's front to the front glass.
  - *Along the front glass*, Meeting · 8 (9.2 × 6.4) and Meeting · 4 (6.4 × 6.4): 3.2 m walls, open above, glazed
    and doored toward the desks, empty until their long tables come; the hero stands between them. The round
    meeting table and its rug are gone.
  - Each room's name hangs over its door, in the floor's colour.

**Still to build**, each its own change: the control room glazed toward the desks with its two-sided video wall,
the console facing +x and its door's place on the terrace; turned desks with turn-aware walks; and the meeting
rooms' long tables with a seat per crew member.

**Alternatives considered.** The four other plans, above. A mezzanine as a level of its own would break the rule
that a level is a box closed by slabs, and with it the levels drawn. Picking the layer from position alone (inside the deck's box) cannot tell standing on the deck from
standing under it.

**Impact.** Every Tower 3D frame changed with the taller storey, and again with the deeper plate and its rooms.
The archive's door sits at its outer wall's front end, not the wall's middle as first drawn, so the nook's boards
have the rest of that wall, and the pigeonhole moved onto the game room's outer wall beside it. A walker's `y` is now its height over the floor on
a stair or the deck as well as mid-jump, kept with your spot and taken by the door's `teleport`.
