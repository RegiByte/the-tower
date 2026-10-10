---
{
  "type": "decision",
  "name": "Workstations: fixed desks, and the open one is derived",
  "summary": "Every floor in Tower 3D has the same set of workstations whether anyone sits at them or not; the open one, where the floor's next worker sits by the seat replay, is lit and offers a hire with the defaults, in its own worktree unless the floor says otherwise (E), or the new-worker form (G). Which desk is open is computed, never stored.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-10",
  "refs": [
    "hub/renderers/tower3d/src/layout.ts#plan",
    "hub/renderers/tower3d/src/layout.ts#openStation",
    "hub/src/bridge/seats.ts#withSeats",
    "hub/renderers/tower3d/src/layers.ts#STATIONS",
    "hub/renderers/tower3d/src/desk.ts#makeStation",
    "hub/renderers/tower3d/src/acts.ts#OFFERS",
    "hub/renderers/tower3d/src/main.ts#hire"
  ]
}
---
**Problem.** A floor showed a desk only per worker on duty, so an empty floor was empty and a new session
could only start from the console. Starting work had no place in the room, and carrying a draft to a desk
(roadmap phase 2, session D) had nothing to carry it to.

**Why.** The office should read as an office: desks waiting for workers. The user wanted a quick start in the
world, with the defaults, and the new-session dialog as the optional path, reusing the dialog the console
already opens.

**How.**
- [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan) gives each floor its occupied `desks` and its `free`
  workstations. The count is the building's rows × 4: two rows at least, a row more only when some floor has
  no free desk left for its workers.
- Seats stay derived: a worker takes the lowest free desk when it comes on duty, replayed from the floor's
  cards in the bridge ([`withSeats`](ref:hub/src/bridge/seats.ts#withSeats)) and read by Tower 3D as `card.seat`
  (`{n}`, a workstation, or `{beside}`, the author's id) ([[board-archive]]). A [[reviewer]] whose author is seated sits beside it at the author's desk instead, taking no workstation;
  one reviewer per author, and one whose author leaves first takes the lowest free desk then. So the open desk, where the next worker sits, is the lowest free one
  ([`openStation`](ref:hub/renderers/tower3d/src/layout.ts#openStation)). Only it offers a hire, and only
  while its floor offers `spawn`.
- The open desk's monitor reads OPEN with its keys, its strip glows in the accent, and an OPEN DESK sign
  floats where a worker's tag would be. The other free desks are dark.
- E hires with the new-worker form's defaults ([`spawnDefaults`](ref:hub/src/shared/cards.ts#spawnDefaults)):
  in a worktree of its own when the floor cuts by default, else in the hub, with no model or effort, and you sit
  at the new worker's terminal as it walks in. H does the same on a carried draft. G opens the form for the
  floor, the way to pick an existing worktree or the main checkout ([[tower-cuts-worktrees]]).
- A free desk is a `station` in the [`STATIONS`](ref:hub/renderers/tower3d/src/layers.ts#STATIONS) layer,
  keyed by floor and number. An occupied one stays a worker's `Desk`, keyed by session, with its own copy of
  the same furniture ([`makeStation`](ref:hub/renderers/tower3d/src/desk.ts#makeStation) shares it). When a
  worker comes or goes, one gives way to the other at the same spot, so nothing visibly changes but the
  occupant.
- The `station` act carries `open`, the way the cat's carries `watching`. It's marked again when the open desk
  moves, so offers stay a pure read of the board.

**Alternatives considered.**
- *Every free desk offers a hire.* The worker would sit at the lowest free desk, not the one you stood at.
  Honoring the chosen desk means storing it (in the session header, which the host keeps free of renderer
  data, or in page storage, which a reload or another viewer would not share).
- *Furniture keyed by slot for every desk, occupants as separate objects.* The occupant would reach into the
  station for the monitor, and every pickable and `locate` center would move. The swap gives the same picture
  without touching occupied desks.
- *A desk count per floor, or a free desk always kept.* Each floor shares one plate, and growing a row
  whenever the last desk fills would make the building move under you. A plain count was the roadmap's
  call.

**Impact.** Empty floors show their desks. Starting a session is a walk to the lit desk. Session D's
carrying lands here: E at the open desk with a draft in hand spawns with it. The door gained `acts(kind)`
to find things without knowing their ids, and the frames walk ends aiming at an open desk.
