---
{
  "type": "decision",
  "name": "Tower 3D draws only the levels you can see",
  "summary": "Everything that stands on a level hangs under that level's group, its KayKit in batches of its own, and a pure rule says which levels are drawn: yours while you walk, sit or pet a cat; every level the car passes while you ride; all of them over the city and during camera flights. What stands outside the glass (each level's spandrel, the roof's slab, the ground) is the building's outside, drawn from every level.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-25",
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
**Problem.** Drawing every level on every frame, trimmed only by frustum culling, draws the floors above and the
roof behind slabs you cannot see through. Per-level KayKit batches ([[office-kaykit]]) pay only once levels you are
not on are hidden, which needs a rule for the whole building.

**Why it can be exact.** The building is a box whose slabs close off each level, and a ray that leaves a box never
comes back in. From inside a level, glass shows only the outside, so no other level's interior can be seen. The
roof's parapet stands higher than your eye's reach over the edge. The car is closed but for its front, where the
landing doors of every level it passes go by.

**How.**
- [`levelsShown`](ref:hub/renderers/tower3d/src/levels.ts#levelsShown) is pure, over the view, the ride, the flight
  and your level: your level alone while you walk, sit or pet a cat; every level between where the car left and
  where it is going while you ride; all of them in the overview and during a camera flight. It runs before every
  render; nothing about it is stored.
- One root per level ([`onLevel`](ref:hub/renderers/tower3d/src/levels.ts#onLevel)): a group in building
  coordinates holding everything that stands on the level and two KayKit layers, its zones and its workstations'
  dressing. [`reconcile`](ref:hub/renderers/tower3d/src/layers.ts#reconcile) hangs every keyed layer's item on its
  slot's level again on every keep, since a floor added under it renumbers the levels. A cat is re-hung every frame,
  because it can move to another level.
- The building's own part per level ([`buildWorld`](ref:hub/renderers/tower3d/src/world.ts#buildWorld)'s
  `levels`) is shown and hidden with it. A level's [`foot`](ref:hub/renderers/tower3d/src/world.ts#foot) stays
  building-wide: the spandrel and colour strip that stand out of the glass, the roof's slab, the ground. Looking up
  or down out of a window shows them from the next level. The city stands in the scene itself, drawn from every
  level.
- Workers are posed only on the levels drawn ([[kaykit-workers]]); a pose comes from sim time, so a level shown
  again is posed where it should be.
- Picking skips what is hidden, so other levels cannot be aimed at.
- A floor's loft ([[floor-plan]]) stands inside its level and reaches no slab, so the box still closes.
- The door reports what the last frame drew ([`DoorState`](ref:hub/renderers/tower3d/src/door.ts#DoorState)
  `drawn`).

**Alternatives considered.**
- *Building-wide batches with per-instance visibility*: one draw call per pack in the overview, but it hides only
  the KayKit, and the building, desks and people are most of the cost.
- *Your level plus the ones above and below*, for sightlines: no sightline crosses a slab, so it doubles the cost
  for nothing.
- *Hiding by height* (a root's y names its level): ambiguous at y = 0, where the building-wide groups stand.
- *Hiding the facade's bands with their level*: a window's top and bottom then show a gap where the next level's
  band stood.

**Impact.** Away from the overview, a frame draws only what can be seen. Anything new that stands on a level hangs on its level root
([`hangOn`](ref:hub/renderers/tower3d/src/levels.ts#hangOn)); anything that stands outside the glass goes in a
level's `foot`.
