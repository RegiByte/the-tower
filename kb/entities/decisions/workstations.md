---
{
  "type": "decision",
  "name": "Workstations: fixed desks, and the open one is derived",
  "summary": "Every floor in Tower 3D has the same set of workstations whether anyone sits at them or not; the open one, where the floor's next worker sits by the seat replay, is lit and offers a hire with the floor's defaults, or the new-worker form. Which desk is open is computed, never stored.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-11-08",
  "refs": [
    "hub/renderers/tower3d/src/layout.ts#AwaySlot",
    "hub/renderers/tower3d/src/layout.ts#plan",
    "hub/renderers/tower3d/src/layout.ts#openStation",
    "hub/renderers/tower3d/src/seating.ts#seatsOf",
    "hub/renderers/tower3d/src/archive.ts#historyOf",
    "hub/renderers/tower3d/src/main.ts#whenSettled",
    "hub/renderers/tower3d/src/layers.ts#STATIONS",
    "hub/renderers/tower3d/src/desk.ts#makeStation",
    "hub/renderers/tower3d/src/acts.ts#OFFERS",
    "hub/renderers/tower3d/src/main.ts#hire",
    "hub/renderers/tower3d/src/hiring.ts#hiringHandlers",
    "hub/renderers/tower3d/src/desk.ts#syncStation",
    "hub/renderers/tower3d/src/layout.ts#DESK_TURN",
    "hub/renderers/tower3d/src/layout.ts#fromDesk",
    "hub/renderers/tower3d/src/layout.ts#turned",
    "hub/renderers/tower3d/src/layout.ts#deskSpot"
  ]
}
---
**Problem.** A floor showed a desk only per worker on duty, so an empty floor was empty and a new session
could only start from the console. Starting work had no place in the room, and carrying a draft to a desk
had nothing to carry it to.

**Why.** The office should read as an office: desks waiting for workers. A quick start in the world, with the
defaults, and the new-worker form as the optional path.

**How.**
- [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan) gives each floor its occupied `desks` and its `free`
  workstations: the building's rows of four, two rows at least and as many as the highest seat on any floor needs.
  A full floor has no open desk.
- Seats stay derived: a worker takes the lowest free desk when it comes on duty, replayed by Tower 3D
  ([`seatsOf`](ref:hub/renderers/tower3d/src/seating.ts#seatsOf): `{n}`, a workstation, or `{beside}`, the lead's id)
  over the floor's history: the board's cards and its archive's as read at the board's `archiveKey`
  ([`historyOf`](ref:hub/renderers/tower3d/src/archive.ts#historyOf), [[board-archive]]). The archive is part of the
  input because a long-running worker keeps its desk at midnight: the workers who came before it leave the board for
  the archive then, and a replay of the board alone would move it to a desk one of them left. A board is drawn only
  once every floor's archive is read at its key, or failed to be
  ([`whenSettled`](ref:hub/renderers/tower3d/src/main.ts#whenSettled)), so no board draws with an archive older than
  itself and a reload seats everyone where they were; a floor whose archive can't be read draws its workers on duty
  without desks. The seats are a map by card id, so a layer of placements by hand can later sit over them. The
  bridge's `card.seat` is the same replay over every card, kept on the board until 2.0. A worker whose crew edge names a seated
  worker ([[crews]]: a [[reviewer]] and its author) sits beside it, taking no workstation; one whose lead leaves first
  takes the lowest free desk then. So the open
  desk, where the next worker sits, is the lowest free one
  ([`openStation`](ref:hub/renderers/tower3d/src/layout.ts#openStation)). Only it offers a hire, and only
  while its floor offers `spawn` ([`OFFERS`](ref:hub/renderers/tower3d/src/acts.ts#OFFERS)); the `station` act
  carries `open`, so offers stay a pure read of the board.
- A workstation carries its `turn`: every one faces +x ([`DESK_TURN`](ref:hub/renderers/tower3d/src/layout.ts#DESK_TURN),
  [[floor-plan]]). What is placed about a desk is given in its desk space and put on the level through that turn
  ([`fromDesk`](ref:hub/renderers/tower3d/src/layout.ts#fromDesk)): a reviewer's place beside its author
  ([[desk-dressing]]), where you stand when you go to its desk ([`deskSpot`](ref:hub/renderers/tower3d/src/layout.ts#deskSpot)),
  and its collider, the box round its turned footprint ([`turned`](ref:hub/renderers/tower3d/src/layout.ts#turned)).
  The scene turns the desk's and the station's groups, so everything on them follows.
- The hire uses the new-worker form's defaults ([`spawnDefaults`](ref:hub/src/shared/spawn-form.ts#spawnDefaults),
  [`hire`](ref:hub/renderers/tower3d/src/main.ts#hire)): a worktree of its own when the floor cuts by default, else
  the main checkout, and you sit at the new worker's terminal as it walks in. A carried draft hires a worker on it
  ([[corkboard]]); the form is the way to pick an existing worktree ([[tower-cuts-worktrees]]).
- A floor hires one worker at a time ([`hiringHandlers`](ref:hub/renderers/tower3d/src/hiring.ts#hiringHandlers)).
  A hire that cuts a worktree takes seconds, and the world shows nothing until the new desk does, so a press in that
  gap would start a second worker. From the press until the board shows the worker it started, the open workstation
  reads HIRING ([`syncStation`](ref:hub/renderers/tower3d/src/desk.ts#syncStation)), and E, the carried draft's hire
  and the new-worker form start nothing on that floor, saying so in a toast. The form's own Start waits in the shared
  spawn machine ([[renderer-shared-modules]]), and its worker holds the floor the same way until it sits down. A
  failed hire, a worker that ended before its desk showed, or a lost tower ends the hold, each said in a toast. The
  hold is a Tower 3D machine because only the world hires without the form; the shared machine runs one dialog,
  not one per floor, and ends its wait on the reply, before the desk shows.
- A free desk is a `station` in the [`STATIONS`](ref:hub/renderers/tower3d/src/layers.ts#STATIONS) layer,
  keyed by floor and number. An occupied one stays a worker's `Desk`, keyed by session, with its own copy of
  the same furniture ([`makeStation`](ref:hub/renderers/tower3d/src/desk.ts#makeStation) shares it). When a
  worker comes or goes, one gives way to the other at the same spot, so nothing visibly changes but the
  occupant. A worker away from its desk keeps its workstation: a station again, dressed as its worker's and saying
  where it is ([`AwaySlot`](ref:hub/renderers/tower3d/src/layout.ts#AwaySlot), [[whereabouts]]).

**Alternatives considered.**
- *Every free desk offers a hire.* The worker would sit at the lowest free desk, not the one you stood at.
  Honoring the chosen desk means storing it (in the session header, which the host keeps free of renderer
  data, or in page storage, which a reload or another viewer would not share).
- *Furniture keyed by slot for every desk, occupants as separate objects.* The occupant would reach into the
  station for the monitor, and every pickable and `locate` center would move. The swap gives the same picture
  without touching occupied desks.
- *The quick hire through the shared spawn machine's `starting` state.* That machine is the one dialog's: a quick
  hire waiting on one floor would hold the form on every floor and reopen it on a failure, with no form to show,
  and its wait ends on the reply, while the second press this guards against comes after it.
- *A desk count per floor, or a free desk always kept.* Each floor shares one plate, and growing a row
  whenever the last desk fills would make the building move under you.
