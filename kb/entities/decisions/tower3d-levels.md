---
{
  "type": "decision",
  "name": "Tower 3D draws only the levels you can see",
  "summary": "Everything that stands on a level hangs under that level's group, its KayKit in batches of its own, and a pure rule says which levels are drawn: yours while you walk, sit or pet a cat; every level the car passes while you ride; all of them over the city and during camera flights. What stands outside the glass (each level's spandrel, the roof's slab, the ground) is the building's outside, drawn from every level.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/renderers/tower3d/src/levels.ts#levelsShown",
    "hub/renderers/tower3d/src/levels.ts#levelOf",
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
**Problem.** Every level was drawn on every frame, and only frustum culling trimmed it: standing on a floor and
looking down the desks drew the floors above and the roof too, behind slabs you cannot see through, at about twice
the draw calls of what is visible. Per-level KayKit batches ([[office-kaykit]]) pay only once levels you are not on
are hidden, which needs a rule for the whole building.

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
- Workers' bones are posed only on the levels drawn ([[kaykit-workers]]): every desk, arrival, leaver and guest
  still moves where it goes every frame, and its mixer runs only while its level is shown. A pose comes from the
  sim time, so a level shown again is posed where it should be, fading in from where it stopped.
- Picking already skipped what is hidden (`shown` in `main.ts`), so other levels cannot be aimed at, which they
  already could not be through a slab.
- A floor's loft ([[floor-plan]]) stands inside its level: the deck's top is 3.3 m over a 6.6 m storey, and
  nothing on it reaches the slab over it, so the box still closes.
- The door reports what the last frame drew ([`DoorState`](ref:hub/renderers/tower3d/src/door.ts#DoorState)
  `drawn`: calls and triangles, your hands aside), and the frames scenario leaves it out, as it does fps.

**Alternatives considered.**
- *Building-wide batches with per-instance visibility* (`setVisibleAt` per level on every level change): one draw
  call per pack in the overview. Rejected because it hides only the KayKit, and the building, desks and people
  were most of the cost.
- *Your level plus the ones above and below*, for sightlines: no sightline crosses a slab, so it would double the
  cost for nothing.
- *Hiding by height* (a root's y names its level): ambiguous at y = 0, where the building-wide groups stand.
- *Hiding the facade's bands with their level*: a window's top and bottom then show a gap where the next
  level's band stood.

**Impact.** Away from the overview, a frame draws only what can be seen; the overview costs a few more calls, the
price of per-level batches. Anything new that stands on a level hangs on its level root (`hangOn`); anything that
stands outside the glass goes in a level's `foot`.
