---
{
  "type": "decision",
  "name": "The prefab editor: scenes placed by hand, with states and slots, saved as their documents",
  "summary": "A Tower 3D page beside the dresser (editor.html) where a person places a KayKit scene document's models, prefabs, boxes and slots by hand, in the states of its groups, drawn as the playground and Tower 3D draw them, and saves them as the document's file through tool:editor serve, which agents drive and shoot headless through the same page.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-16",
  "reviewed": "2026-10-29",
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
    "hub/renderers/kaykit/src/draw.ts#itemMatrix",
    "hub/renderers/tower3d/src/zones.ts#PREFABS",
    "hub/renderers/tower3d/src/dress.ts#DESK_DRESS",
    "hub/package.json"
  ],
  "links": [
    { "to": "office-kaykit", "verb": "uses", "carries": "scene documents, their states and slots, drawn by the playground's path and written by hand" },
    { "to": "desk-dressing", "verb": "uses", "carries": "desk_dress.json, the workstation's status props and the places round its worker" }
  ]
}
---
**Problem.** Placing props is a poor task for a model of text: tuning a scene's pieces meant editing numbers and
rebuilding, and props ended up inside other props. The user wanted to fit props by hand, as the dresser fits worn
pieces ([[character-creator]]), saved as data the renderers read.

**Why.** Agents generate and compose scene documents; a person makes the final placement by eye. One prefab holds what
its states share and what each adds, removes or moves, so a desk by status is one document; and the places round a
worker (its fork, subagents, logbook, a reviewer's notebook) are slots placed by hand that the code fills from the
board.

**How.**
- One page in Tower 3D's bundle ([`editor.ts`](ref:hub/renderers/tower3d/src/editor.ts),
  [`editor.html`](ref:hub/renderers/tower3d/editor.html)). It draws with the playground's `build` over its full
  catalog (`renderers/kaykit/out`), so any model can be added, and draws a person slot as a translucent Tower 3D
  worker in its pose ([`ghost`](ref:hub/renderers/tower3d/src/editor.ts#ghost)), seated in desk.glb's chair as Tower 3D
  seats a fork or a reviewer, so a person is placed, not a point.
- Guides stand for what the host draws itself ([`Guide`](ref:hub/renderers/kaykit/src/scene.ts#Guide)). One naming a
  Tower 3D model (`"model": "desk"`) is drawn as that model ([`hostModel`](ref:hub/renderers/tower3d/src/editor.ts#hostModel)),
  so the editor shows everything desk.glb holds: a surface to drop onto, never selected or saved, and a click on it
  selects nothing behind it ([`pick`](ref:hub/renderers/tower3d/src/editor.ts#pick)). Any other guide is a ghost box.
- A prop lands where Tower 3D draws it because both place a scene item through the playground's
  [`itemMatrix`](ref:hub/renderers/kaykit/src/draw.ts#itemMatrix) over the same measured catalog, in the same frame
  (the desk's group in Tower 3D, whose origin is desk.glb's). Desk space faces +z, so +x is on a seated worker's left.
- Editing. The selection is drawn alone under the gizmo; on release its place is written to the document
  ([`place`](ref:hub/renderers/tower3d/src/editor.ts#place)), which is redrawn
  ([`redraw`](ref:hub/renderers/tower3d/src/editor.ts#redraw)). A box is resized along each axis on its own into its
  `size`. Documents are kept raw as their files hold them, and every edit is a copy, so undo steps through copies.
  A turn from the gizmo is the yaw the proxy faces, written as the shortest way round from the element's own turn,
  since an Euler's y alone folds a turn past 90° back.
- States. A document's states may fall in `groups` that exclude each other
  ([`groupsOf`](ref:hub/renderers/kaykit/src/scene.ts#groupsOf)), such as the desk's status, pile and season; the
  picker shows one state of each, and the state picked last is the one edited. While it is, a shared thing's move is
  written as that state's `set` and a delete as its `remove`, or to what every state shares, as the scope says; what
  is added goes to the state. [`resolve`](ref:hub/renderers/kaykit/src/scene.ts#resolve) refuses two states of one
  group.
- Saving lists each changed file's lines against disk ([`changes`](ref:hub/renderers/tower3d/src/editor.ts#changes)),
  then writes through [`tool:editor serve`](ref:hub/scripts/editor.ts), which checks each document and lays it out
  by [`formatScene`](ref:hub/renderers/kaykit/src/format.ts#formatScene), a placed thing per line, so a move diffs
  as one line. Open lists every scene the serve reaches ([`listing`](ref:hub/renderers/kaykit/src/listing.ts#listing)),
  with whether Tower 3D reads it ([`PREFABS`](ref:hub/renderers/tower3d/src/zones.ts#PREFABS),
  [`DESK_DRESS`](ref:hub/renderers/tower3d/src/dress.ts#DESK_DRESS)). `window.editor` and `tool:editor shot` give
  agents the same page.
- The serve rebuilds Tower 3D on each load of the page; a failed build (a model the full catalog offers that Tower
  3D's vendored kit lacks) leaves the last one serving with the error drawn over it. The serve vendors nothing itself:
  the full bundle's path is not kept, and vendoring rewrites the committed `renderers/tower3d/kaykit`.

**Alternatives considered.**
- *Boxes for the desk's parts*: they leave out what desk.glb itself holds, so the editor shows a cleaner desk than the
  office.
- *A mode of the playground*: the ghost workers need Tower 3D's characters and rig; the playground stays a gallery and
  a viewer without a write path.
- *Prefab overrides on the placing item* (as Unity does): a second, quieter mechanism beside states. Editing inside a
  prefab writes its own file and changes every scene placing it.
- *A state per combination* (`idle_pile_15_october`): status, pile and season multiply; groups keep each placed once.
- *Transitions in the data*: the board derives the state; transitions wait for an animated in-between that asks for
  them.

**Impact.** Hand placement reaches Tower 3D through `desk_dress.json` ([[desk-dressing]]) and the zones' prefabs;
the meeting rooms' slots (`meeting_long.json`'s state per crew size with its `head` and `seat_<n>`, the rooms'
`counter_<n>` and `stand_<n>`) are filled by the board the same way ([[whereabouts]]).
