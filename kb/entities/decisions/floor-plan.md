---
{
  "type": "decision",
  "name": "A floor's plan: a wing loft with the control room, rooms under and before it",
  "summary": "Every floor is a double-height storey with a loft: a deck over the left wing's back holding the control room, glazed toward the desks with a two-sided video wall, reached by a stair along the wing's face; under and before it, rooms placed from anchors (archive, game room, lounge, meeting rooms along the front glass); desks face +x, away from the control room. The walker stands on a ground height and a collision layer chosen by height.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-17",
  "reviewed": "2026-10-23",
  "refs": [
    "hub/renderers/tower3d/src/meetings.ts#meetingKit",
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
    "hub/renderers/tower3d/src/room.ts#buildShelf",
    "hub/renderers/tower3d/src/room.ts#buildVideoWall",
    "hub/renderers/tower3d/src/layout.ts#videoWallSpot",
    "hub/renderers/tower3d/src/layout.ts#videoWallBand",
    "hub/renderers/tower3d/src/layout.ts#consoleSpot",
    "hub/renderers/tower3d/src/layout.ts#DESK_TURN",
    "hub/renderers/tower3d/src/layout.ts#walkway"
  ]
}
---
**Problem.** A floor was one storey with the control room in its back-left corner, and nothing else had a place: no
room to meet in, to play in, to keep the archive, or to sit. The floor's plate is set by its desks, so more rooms on
the ground would deepen it or crowd the desks. Raising the control room onto a mezzanine frees the ground under it.

**Chosen: A+** of the plans greyboxed (below): A's wing loft, B's ground floor of different rooms and C's glazed
control room. The deck over the wing from the back, the control room on it glazed toward the desks with a two-sided
video wall, a terrace before it; on the ground an archive, a game room, an open lounge, and two meeting rooms along
the front glass, the hero between them; desks turned so workers face +x, away from the control room, which reads
their screens over their shoulders.

**How.**
- *A double-height storey* ([`STOREY`](ref:hub/renderers/tower3d/src/layout.ts#STOREY)): headroom under the deck and
  over it ([`ROOM_HEIGHT`](ref:hub/renderers/tower3d/src/layout.ts#ROOM_HEIGHT)).
- *The loft is data over the plate* ([`loftOf`](ref:hub/renderers/tower3d/src/floorplan.ts#loftOf),
  [`DECK`](ref:hub/renderers/tower3d/src/floorplan.ts#DECK), [`STAIR`](ref:hub/renderers/tower3d/src/floorplan.ts#STAIR)),
  anchored to the back wall, so a deeper plate leaves it where it is: the deck, a landing beside it, the stair down
  along the control room's side wall, glass rails on every open edge. [`buildLoft`](ref:hub/renderers/tower3d/src/loft.ts#buildLoft)
  draws it on each floor. The deck stays inside its level, so the rule that a level is a box closed by its slabs holds
  ([[tower3d-levels]]).
- *The walker lands on a ground height* ([`fallTo`](ref:hub/renderers/tower3d/src/walker.ts#fallTo),
  [`stepWalker`](ref:hub/renderers/tower3d/src/main.ts#stepWalker)):
  [`groundAt`](ref:hub/renderers/tower3d/src/floorplan.ts#groundAt) is a ramp on the stair, the deck past its
  top, else the floor; within a step of it the walker stands on it, else it falls. Its layer,
  [`layerAt`](ref:hub/renderers/tower3d/src/floorplan.ts#layerAt), is chosen by height, and what it bumps into is
  keyed by layer ([`collidersOn`](ref:hub/renderers/tower3d/src/layout.ts#collidersOn)). Workers, guests and cats
  stay on the ground layer. A walker's `y` is its height over the floor, kept with your spot.
- *Sight is blocked by height* ([`solids`](ref:hub/renderers/tower3d/src/layout.ts#solids)), the deck and landing as
  slabs, so you aim down from the deck past the room below and not through the deck from under it.
- *The control room stands on the deck* ([`roomBox`](ref:hub/renderers/tower3d/src/layout.ts#roomBox),
  [`buildRoom`](ref:hub/renderers/tower3d/src/room.ts#buildRoom)), entered from the terrace. Its inner side is glass
  toward the desks, and the video wall is that glass's upper band
  ([`videoWallSpot`](ref:hub/renderers/tower3d/src/layout.ts#videoWallSpot),
  [`videoWallBand`](ref:hub/renderers/tower3d/src/layout.ts#videoWallBand)), two faces built from the same tiles
  ([`buildVideoWall`](ref:hub/renderers/tower3d/src/room.ts#buildVideoWall)), one into the room and one over the
  floor. Under the band is glass, so from the console ([`consoleSpot`](ref:hub/renderers/tower3d/src/layout.ts#consoleSpot))
  you see the desks. The shells' bench runs along the facade; past a few shells every kiosk shrinks until all fit
  (`packed` in [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan)), so no shell goes undrawn. Its walls and
  furniture are the deck layer's colliders ([`roomWalls`](ref:hub/renderers/tower3d/src/layout.ts#roomWalls)).
- *The plate is sized for at least three rows* (`PLATE_ROWS` in [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan)),
  so the meeting strip has its depth; the board still draws only the rows it needs.
- *Rooms are prefabs placed from anchors* ([`roomsOf`](ref:hub/renderers/tower3d/src/floorplan.ts#roomsOf),
  [`anchorsOf`](ref:hub/renderers/tower3d/src/floorplan.ts#anchorsOf)). Each room's shell is a scene document of
  boxes, `renderers/kaykit/scenes/prefabs/room_*.json`, its origin at its door, placed at its `<room>.door` anchor
  ([[office-kaykit]], reshaped in the [[prefab-editor]]). The code keeps each room's box for what it places inside, so
  a room reshaped in the editor moves its walls, not what stands in it. The wing's rooms and the loft are anchored to
  the back; the meeting strip, the hero and the lounge's front to the front glass; the desk rows stretch between.
  - *Under the deck*: the archive, holding the shelf along its walls
    ([`buildShelf`](ref:hub/renderers/tower3d/src/room.ts#buildShelf)), every entry shrinking together until all fit,
    with the filing cabinet and the Running board in the nook beside its outer wall ([[logbook]]); the game room
    before it, the arcade along its front wall ([[arcade]]) and the pigeonhole on its outer wall by the nook
    ([[review-threads]]).
  - *The lounge* is open, the wing from the deck's front to the front glass.
  - *Along the front glass*, two meeting rooms, open above and glazed toward the desks, each with a long table where
    a crew gathers ([[whereabouts]], [`meetingKit`](ref:hub/renderers/tower3d/src/meetings.ts#meetingKit)).
- *Desks face +x* ([`DESK_TURN`](ref:hub/renderers/tower3d/src/layout.ts#DESK_TURN)), their backs to the wing, so from
  the console the supervisor sees the workers' monitors. Workers walk from the elevator across the landing, down the
  aisle behind their desk's column and in behind the chair
  ([`walkway`](ref:hub/renderers/tower3d/src/layout.ts#walkway); [[workstations]], [[kaykit-workers]]).

**Alternatives considered** (plans greyboxed over the same plate):
- *A, wing loft* alone: the best mezzanine, but the ground floor's rooms alike.
- *B, back gallery*: the best room placement, but the worst access: no stair, and the elevator stopping twice a floor
  at a half level.
- *C, pod over the landing*: the best control room; the rest cramped, and the pod too close to the desks to read them.
- *Centre loft with desks in rings*: every screen read over a shoulder, but it loses the long view from the elevator,
  needs turn-aware walks everywhere, and has the deepest plate.
- *A mezzanine as a level of its own*: it would break the rule that a level is a box closed by slabs, and with it the
  levels drawn.
- *The layer from position alone* (inside the deck's box): it cannot tell standing on the deck from standing under it.
