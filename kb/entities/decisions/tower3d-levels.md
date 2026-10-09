---
{
  "type": "decision",
  "name": "Tower 3D draws only the levels you can see",
  "summary": "Everything that stands on a level hangs under that level's group, its KayKit in batches of its own, and a pure rule says which levels are drawn: yours while you walk, sit or pet a cat; every level the car passes while you ride; all of them over the city and during camera flights. What stands outside the glass (each level's spandrel, the roof's slab, the ground) is the building's outside, drawn from every level.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-09",
  "refs": [
    "hub/renderers/tower3d/src/levels.ts#levelsShown",
    "hub/renderers/tower3d/src/levels.ts#showLevels",
    "hub/renderers/tower3d/src/levels.ts#onLevel",
    "hub/renderers/tower3d/src/levels.ts#hangOn",
    "hub/renderers/tower3d/src/layers.ts#reconcile",
    "hub/renderers/tower3d/src/world.ts#foot",
    "hub/renderers/tower3d/src/world.ts#buildWorld",
    "hub/renderers/tower3d/src/kit.ts#zonesPlaced",
    "hub/renderers/tower3d/src/main.ts#dressLevels",
    "hub/renderers/tower3d/src/door.ts#DoorState"
  ]
}
---
**Problem.** Every level was drawn on every frame, and only frustum culling trimmed it. Standing on floor 1 and
looking down the desks drew floors 2 and 3 and the roof too, behind slabs you cannot see through: 912 draw calls and
497k triangles on the busy board, against 409 and 230k for what is actually visible. The [[office-kaykit]] batches
were building-wide, so splitting them per level would only pay once levels you are not on were hidden. That needed
a rule for the whole building.

**Why it can be exact.** The building is a box whose slabs close off each level, and a ray that leaves a box never
comes back in. From inside a level, glass shows only the outside, so no other level's interior can be seen. The
roof's parapet stands higher than your eye's reach over the edge. The car is closed but for its front, where the
landing doors of every level it passes go by.

**How.**
- [`levelsShown`](ref:hub/renderers/tower3d/src/levels.ts#levelsShown) is pure, over the view, the ride, the flight
  and your level. While you walk, sit at a desk or pet a cat, only your level is drawn. While you ride, every level
  from where you left to where you are going is drawn. In the overview, and during any camera flight (those leave
  or reach the overview), every level is drawn. It runs before every render. Nothing about it is stored.
- One root per level ([`onLevel`](ref:hub/renderers/tower3d/src/levels.ts#onLevel)): a group in building
  coordinates holding two KayKit layers, the level's zones and its workstations' dressing (with the lobby's city
  model). [`reconcile`](ref:hub/renderers/tower3d/src/layers.ts#reconcile) hangs every keyed layer's item on its
  slot's level, again on every keep, since a floor added under it renumbers the levels. A leaving worker hangs on
  its level. A cat is re-hung every frame, because it can move to another level.
- The building's own part per level ([`buildWorld`](ref:hub/renderers/tower3d/src/world.ts#buildWorld)'s
  `levels`) is shown and hidden with it. A level's [`foot`](ref:hub/renderers/tower3d/src/world.ts#foot) stays
  building-wide: the spandrel and colour strip that stand 15 cm out of the glass, the roof's slab, and the lobby's
  ground plinth. Looking up or down out of a window shows them from the next level. The city around the building
  (its ring road, cars, airfield and plane, `outside.ts`) stands in the scene itself, drawn from every level.
- Picking already skipped what is hidden (`shown` in `main.ts`), so other levels cannot be aimed at, which they
  already could not be through a slab.
- The door reports what the last frame drew ([`DoorState`](ref:hub/renderers/tower3d/src/door.ts#DoorState)
  `drawn`: calls and triangles, your hands aside), and the frames scenario leaves it out, as it does fps.

**Alternatives considered.**
- *Building-wide batches with per-instance visibility* (`setVisibleAt` per level on every level change): one draw
  call per pack in the overview. Rejected because it hides only the KayKit, and the building, desks and people
  were most of the cost (the kit was under 30 of the 912 calls).
- *Your level plus the ones above and below*, for sightlines: no sightline crosses a slab, so it would double the
  cost for nothing.
- *Hiding by height* (a root's y names its level): ambiguous at y = 0, where the building-wide groups stand.
- *Hiding the facade's bands with their level*: the frames walk caught the gap. The lobby's window top lost floor
  1's lilac strip, and the floors lost the next spandrel's edge.

**Impact.** Busy board, 15:00, 1920×1080, M1 Max (headless Chrome on Metal), draw calls / triangles / ms per frame
including the GPU (a run of `step(1)` closed by a readback), before → after:

| spot | before | after |
|---|---|---|
| f1-desks | 912 / 497k / 3.4 | 409 / 230k / 1.7 |
| f1-door | 321 / 198k / 2.0 | 199 / 126k / 1.2 |
| lobby | 470 / 183k / 2.1 | 102 / 12k / 0.86 |
| roof | 865 / 434k / 3.0 | 163 / 85k / 0.94 |
| overview | 1068 / 618k / 3.2 | 1082 / 618k / 3.5 |

The overview costs 14 more calls, the price of per-level batches. Frames on all four fixture boards: state
identical. Pictures match but for one pixel by 3/255 and the tall overview's glass order (max 8/255). Window views
up and down, the roof's edge and a whole ride from the lobby to the roof are identical byte for byte. Anything new
that stands on a level hangs on its level root (`hangOn`). Anything that stands outside the glass goes in a level's
`foot`.
