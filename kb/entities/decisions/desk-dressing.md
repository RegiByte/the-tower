---
{
  "type": "decision",
  "name": "Desk dressing: a workstation's KayKit props derived from its worker's card",
  "summary": "Every workstation in Tower 3D is an L (the Blender desk plus a KayKit cabinet return), and what stands on it is a pure function of the worker's card over a scene document placed by hand: a state of each of its groups (status props on the desk, a mess growing with context on the return, candy in October), and in code a pizza box per finished turn on the floor and a frame in a slot for each thing it showed. Drawn on the office's KayKit path, one batch per pack and theme.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-27",
  "refs": [
    "hub/renderers/tower3d/src/dress.ts#dress",
    "hub/renderers/tower3d/src/dress.ts#pileState",
    "hub/renderers/tower3d/src/dress.ts#pickOf",
    "hub/renderers/tower3d/src/desk.ts#situate",
    "hub/renderers/tower3d/src/desk.ts#besideOf",
    "hub/renderers/tower3d/src/zones.ts#stateKey",
    "hub/renderers/kaykit/src/scene.ts#picks",
    "hub/renderers/tower3d/src/dress.ts#PROPS",
    "hub/renderers/tower3d/src/dress.ts#statusState",
    "hub/renderers/tower3d/src/desk.ts#deskSlots",
    "hub/renderers/kaykit/scenes/prefabs/desk_dress.json",
    "hub/renderers/tower3d/src/kit.ts#fillLayer",
    "hub/renderers/tower3d/src/layout.ts#RETURN",
    "hub/scripts/tower3d-kit.ts",
    "hub/renderers/tower3d/src/main.ts"
  ]
}
---
**Problem.** A desk said little about its worker beyond the tag, the strip and the worker's pose.

**Why.** A desk can tell how long a session has run, what it is doing and what it showed, at a glance and without
text, while the status colours stay the loudest thing on the floor. The state already exists on the card.

**How.**
- The workstation's dressing is a scene document placed by hand,
  [`desk_dress.json`](ref:hub/renderers/kaykit/scenes/prefabs/desk_dress.json), of KayKit models and the forge's
  real-size props ([[forge-kit]]). Its states fall in three `groups`, and a desk is drawn in one state of each:
  `status`, what stands on the desk's right end, picked by
  [`statusState`](ref:hub/renderers/tower3d/src/dress.ts#statusState) ([[watching-status]] has its own); `pile`, what
  the session piled up on the return, the `pile_<n>` with the greatest n its context % has reached, each state the
  whole pile at that share ([`pileState`](ref:hub/renderers/tower3d/src/dress.ts#pileState)); and `season`,
  `october`'s candy. The kit holds every list of states a document can be drawn in
  ([`picks`](ref:hub/renderers/kaykit/src/scene.ts#picks), under
  [`stateKey`](ref:hub/renderers/tower3d/src/zones.ts#stateKey)), and a desk is drawn in its card's
  ([`pickOf`](ref:hub/renderers/tower3d/src/dress.ts#pickOf)), so the office shows what the editor shows.
- The document's slots place what is drawn around the worker (its fork's chair, its subagents, its logbook, papers,
  second monitor, a frame per thing it showed, the cat's perch, a reviewer's chair, notebook and visitors), read by
  [`deskSlots`](ref:hub/renderers/tower3d/src/desk.ts#deskSlots), each missing one a clear error, and set again on
  every board ([`situate`](ref:hub/renderers/tower3d/src/desk.ts#situate)). A state may move a slot. A reviewer's
  slots are its author's desk's, and the `reviewer` slot places and turns the reviewer's own desk space
  ([`besideOf`](ref:hub/renderers/tower3d/src/desk.ts#besideOf), [[reviewer]]). `desk.glb`, which Tower 3D draws
  itself, is the document's guide by name, so the prefab editor draws it ([[prefab-editor]]).
- [`dress`](ref:hub/renderers/tower3d/src/dress.ts#dress) answers the models in desk space: the document's in the
  card's states, then what is counted in code: a pizza box per finished turn (`card.turns`) on the floor behind the
  desk, nudged by the worker's id so no two stacks are clones, and a standing frame per `trophy_<n>` slot for what the
  worker showed. Nothing placed by hand is nudged: a nudge moves what a person placed.
- Slots and props are in desk space and the desk's group carries its turn ([[workstations]]), so a turned desk turns
  its dressing with it; `desk_dress.json` knows nothing of the turn.
- Every workstation is an L: a KayKit cabinet return off the desk's right end
  ([`RETURN`](ref:hub/renderers/tower3d/src/layout.ts#RETURN)), in a grey atlas that reads as a filing cabinet beside
  the desk's wood; free stations draw it bare.
- The dressing goes through the office's one KayKit path ([[office-kaykit]]), shared with the zones: what `dress`
  places in code becomes a scene item in the desk's frame, its scale from
  [`PROPS`](ref:hub/renderers/tower3d/src/dress.ts#PROPS) on top of the catalog's norms, and
  [`fillLayer`](ref:hub/renderers/tower3d/src/kit.ts#fillLayer) refills one layer for every workstation on each
  board, a batch per pack, theme and surface. `npm run tower3d` first measures the models it uses, vendored in
  `renderers/tower3d/kaykit/` and `renderers/tower3d/forge/`, into one git-ignored kit file built beside the bundle
  ([`tower3d-kit.ts`](ref:hub/scripts/tower3d-kit.ts), [[bundled-renderer]]), so building needs no bundle on disk.

**Alternatives considered.**
- *Room scale for everything.* Right for furniture; tabletop props come out two to three times real size beside
  `desk.glb`'s keyboard, so each prop carries a further scale.
- *The glTF's standard material.* At night it is darker and smoother than the workers and the desk. Toon keeps one
  language.
- *A path of its own* (glTFs loaded one by one, an InstancedMesh per model): more draw calls, and a second path to
  keep beside the playground's.
- *The pile in code, each placement nudged by the worker's id*: it could not be placed by hand.
- *One state at a time, or a pile state adding only its own items over the last.* Status, pile and season change
  apart, so a desk needs one of each; a state holding the whole pile at its share can be arranged on its own.
