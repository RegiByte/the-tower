---
{
  "type": "decision",
  "name": "The prefab editor: scenes placed by hand, with states and slots, saved as their documents",
  "summary": "A Tower 3D page beside the dresser (editor.html) draws any KayKit scene document as the playground draws it, with its slots as translucent Tower 3D workers in their pose, a guide naming one of Tower 3D's own models as that model (the workstation's desk.glb, where Tower 3D draws it) and any other guide as a ghost, and lets a person select a model, a placed prefab, a box or a slot, move, turn and scale it with a gizmo (a box resized along each axis on its own; snapping, dropping onto what is below), add from the catalog, delete, undo, go inside a prefab, and pick the states drawn, one of each of the document's groups, edits of shared things going to the state picked last or to all. tool:editor serve shows what saving changes, file by file, and writes it; tool:editor shot renders a document headless through the same page.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-16",
  "reviewed": "2026-10-19",
  "refs": [
    "hub/renderers/kaykit/scenes/prefabs/meeting_long.json",
    "hub/renderers/tower3d/editor.html",
    "hub/renderers/tower3d/src/editor.ts",
    "hub/renderers/tower3d/src/editor.ts#place",
    "hub/renderers/tower3d/src/editor.ts#ghost",
    "hub/renderers/tower3d/src/editor.ts#redraw",
    "hub/renderers/tower3d/src/editor.ts#hostModel",
    "hub/renderers/tower3d/src/editor.ts#pick",
    "hub/renderers/kaykit/src/scene.ts#Guide",
    "hub/renderers/tower3d/src/editor.ts#changes",
    "hub/renderers/kaykit/src/format.ts#formatScene",
    "hub/renderers/kaykit/src/listing.ts#listing",
    "hub/renderers/kaykit/src/scene.ts#resolve",
    "hub/renderers/kaykit/src/scene.ts#groupsOf",
    "hub/scripts/editor.ts",
    "hub/package.json"
  ],
  "links": [
    { "to": "office-kaykit", "verb": "uses", "carries": "scene documents, their states and slots, drawn by the playground's path and written by hand" },
    { "to": "desk-dressing", "verb": "uses", "carries": "desk_dress.json, the workstation's status props and the places round its worker" }
  ]
}
---
**Problem.** Placing props is a poor task for a model of text: the desk's cactus stood in its monitor, the zones'
pieces were tuned by editing numbers and rebuilding. The user wanted to fit props by hand, as the dresser fits worn
pieces ([[character-creator]]), with the result saved as data the renderers read.

**Why.** The agents generate and compose scene documents; a person makes the final placement by eye. One prefab can
hold what its states share and what each adds, removes or moves, so a desk by status is one document, not four;
and the places round a worker (its fork, subagents, logbook, a reviewer's notebook) are slots placed by hand that the
code fills from the board.

**How.**
- One page in Tower 3D's bundle: [`editor.ts`](ref:hub/renderers/tower3d/src/editor.ts) and
  [`editor.html`](ref:hub/renderers/tower3d/editor.html). It draws with the playground's `build` over its full catalog
  (served from `renderers/kaykit/out`), so any of the 628 models can be added, and draws person slots with Tower 3D's
  own `avatar` posed sitting or standing ([`ghost`](ref:hub/renderers/tower3d/src/editor.ts#ghost)), so a person is
  placed, not a point. Guides stand for what the host draws itself
  ([`Guide`](ref:hub/renderers/kaykit/src/scene.ts#Guide)): one naming a Tower 3D model (`"model": "desk"`) is drawn
  as that model at its place ([`hostModel`](ref:hub/renderers/tower3d/src/editor.ts#hostModel)), exactly as the office
  draws the workstation, its own pot, cactus and mug included; it is a surface to drop and add onto, never selected or
  saved, and a click on it selects nothing behind it ([`pick`](ref:hub/renderers/tower3d/src/editor.ts#pick)). Any
  other guide is a box drawn as a ghost; drops land on faces, never on a box's edge lines.
- A prop lands where Tower 3D draws it because both draw a scene item through the playground's `itemMatrix` (its
  place, then the catalog's norms) over the same measured catalog, in the same frame: the desk's group in Tower 3D,
  whose origin is desk.glb's, the world in the editor. Desk space faces +z, so +x is on a seated worker's left.
- A box (a room's wall or pane of glass) is selected like a model and resized along each of its axes on its own,
  the gizmo's scale written to its `size`; the panel takes its size by the numbers too.
- The selection is drawn alone under the gizmo and left out of the drawing; on release its place is written to the
  document ([`place`](ref:hub/renderers/tower3d/src/editor.ts#place)), which is redrawn
  ([`redraw`](ref:hub/renderers/tower3d/src/editor.ts#redraw)). The documents are kept raw as their files hold them
  (key order included); every edit is a copy, so undo steps through the copies. While a state is edited, a shared
  thing's move is written as that state's `set` (a name given if it has none) and a delete as its `remove`, or to
  what every state shares, as the scope says; what is added goes to the state.
- A document's states may fall in `groups` that exclude each other ([`groupsOf`](ref:hub/renderers/kaykit/src/scene.ts#groupsOf)):
  the desk's status, pile and season. The picker has a row per group, one state of each or none, and the state picked
  last is the one edited (`editor.info().edited`); a state outside every group is a group of its own, and a document
  without groups is drawn in one state at a time. [`resolve`](ref:hub/renderers/kaykit/src/scene.ts#resolve) refuses
  two states of one group. A sitting slot is drawn in desk.glb's chair, as Tower 3D seats a fork or a reviewer.
- Saving lists each changed file's lines against disk ([`changes`](ref:hub/renderers/tower3d/src/editor.ts#changes)),
  then writes through [`tool:editor serve`](ref:hub/scripts/editor.ts), which checks each document and writes it as
  [`formatScene`](ref:hub/renderers/kaykit/src/format.ts#formatScene) lays it out: a placed thing per line, so a
  move diffs as one line. `window.editor` and `tool:editor shot` give agents the same page.
- The serve rebuilds Tower 3D on each load of the page; a build that fails (a model the editor's full catalog offers
  that Tower 3D's vendored kit lacks) leaves the last build in `out/`, which keeps serving with the build's own error
  drawn over it, naming the model and the `vendor` command. The serve vendors nothing itself: the full bundle's path
  is not kept, and vendoring rewrites the committed `renderers/tower3d/kaykit`.
- Open lists every scene the serve reaches ([`listing`](ref:hub/renderers/kaykit/src/listing.ts#listing), `GET /docs`):
  its title, states, slots, the documents placing it and whether Tower 3D reads it (the zones' `PREFABS` and
  `DESK_DRESS`); a file that does not read as a scene is listed with its error, greyed. A scene opens at `?scene=`, so a reload opens it again; leaving unsaved changes asks first.
- A turn written from the gizmo is the yaw the proxy faces, as the element's own turn plus the shortest way round:
  an Euler's y alone folds a turn past 90° back. A drag ends with its button, also when the browser loses the pointer.

**Alternatives considered.**
- *Boxes for the desk's parts* (the first guides): they left out what desk.glb itself holds, so the editor showed a
  cleaner desk than the office; desk.glb's own cactus, inside its monitor, was taken for the dressing's.
- *A mode of the playground.* The ghost workers need Tower 3D's characters and rig; the playground stays a gallery and
  a viewer without a write path.
- *Prefab overrides on the placing item* (as Unity does): a second, quieter mechanism beside states. Editing inside a
  prefab writes its own file and changes every scene placing it.
- *A state per combination* (`idle_pile_15_october`): status, pile and season multiply; groups keep each placed once.
- *A state machine with transitions in the data*: the board derives the state; transitions wait for an animated
  in-between that asks for them.

**Impact.** Hand placement reaches Tower 3D through `desk_dress.json`; the zones and a floor plan can follow the same
path (draft `muddy-gecko`). The meeting rooms' long table (`meeting_long.json`, a state per crew size, each with its
`head` and `seat_<n>` slots) and the rooms' `table`, `counter_<n>` and `stand_<n>` slots are filled by the board the same
way ([[whereabouts]]).
