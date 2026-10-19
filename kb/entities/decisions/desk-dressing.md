---
{
  "type": "decision",
  "name": "Desk dressing: a workstation's KayKit props derived from its worker's card",
  "summary": "Every workstation in Tower 3D is an L (the Blender desk plus a KayKit cabinet return), and what stands on it is a pure function of the worker's card over a scene document placed by hand: a state of each of its groups (status props on the desk, a mess growing with context on the return, candy in October), and in code a pizza box per finished turn on the floor and a frame in a slot for each thing it showed. Drawn on the office's KayKit path, one batch per pack and theme.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-19",
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
**Problem.** A desk said little about its worker beyond the tag, the strip and the bean's pose: a single
`papers` box grew with context. The KayKit Bits bundle ([[office-kaykit]]) was measured and explored but
nothing in the office used it.

**Why.** The first real use of the kit, chosen where state already exists: a desk can tell how long a session has
run, what it is doing and what it showed, at a glance and without text, while the status colours stay the
loudest thing on the floor.

**How.**
- The workstation's dressing is a scene document, [`desk_dress.json`](ref:hub/renderers/kaykit/scenes/prefabs/desk_dress.json),
  placed by hand. Shared: the return and the desk's own cactus and mug (once modelled into `desk.glb`). Its states
  fall in three `groups`, and a desk is drawn in one state of each (decided by the user on 2026-10-17):
  `status`, what it puts on the desk's right end (cactus idle; lamp and pencils working; lamp and a mug watching,
  [[watching-status]]; headphones lamp asking; a plated pizza done), picked by
  [`statusState`](ref:hub/renderers/tower3d/src/dress.ts#statusState); `pile`, what the session piled up on the
  return, `pile_<n>` from n % of its context on (2 to 33, so a typical session is already messy), each state the whole
  pile at that share, picked by [`pileState`](ref:hub/renderers/tower3d/src/dress.ts#pileState); and `season`,
  `october`'s candy. The kit holds the models and slots of every list of states it can be drawn in
  ([`picks`](ref:hub/renderers/kaykit/src/scene.ts#picks), under
  [`stateKey`](ref:hub/renderers/tower3d/src/zones.ts#stateKey)), and a desk is drawn in its card's
  ([`pickOf`](ref:hub/renderers/tower3d/src/dress.ts#pickOf)), so the office shows what the editor shows. Its slots are
  the places of what is drawn around the worker, in those states (a state may move one: the logbook and the papers
  idle), read by [`deskSlots`](ref:hub/renderers/tower3d/src/desk.ts#deskSlots), each missing one a clear error, and
  set again on every board ([`situate`](ref:hub/renderers/tower3d/src/desk.ts#situate)); a reviewer's are its
  author's desk's:
  its running fork in a second chair at its right (`twin`), in the worker's own look, its twin (a reviewer beside its
  author seats none); its running subagents standing along the near edge, one per `subagent_<n>` slot and no more
  (`card.subagentRuns`); its logbook right of the keyboard, drawn in code as thick as its lineage ([[logbook]]);
  the papers new to it; its second monitor (`side_monitor`); a frame per thing it showed (`trophy_<n>`, as many as
  there are); the cat's perch (`cat_perch`); and a reviewer beside it ([[reviewer]]): where its chair stands
  (`reviewer`, which places the reviewer's own desk space and turns it as the slot is turned, [`besideOf`](ref:hub/renderers/tower3d/src/desk.ts#besideOf)),
  its notebook and its subagents standing on the floor (`visitor_<n>`). `desk.glb`, which Tower 3D draws itself, is
  the document's guide by name (`"model": "desk"`), so the prefab editor draws it ([[prefab-editor]]).
- [`dress`](ref:hub/renderers/tower3d/src/dress.ts#dress)`(card, placed, frames, models)` answers the models in
  desk space: the document's in the card's states, then what is counted in code: a pizza box per finished turn
  (`card.turns`) on the floor past the desk's back edge, stacks of six, up to three, each nudged by the worker's id so
  no two stacks are clones; and up to one standing frame per `trophy_<n>` slot, facing the aisle, for what the worker
  showed. Nothing placed by hand is nudged (the user, 2026-10-17): variety will come as several layouts picked by the
  id.
- The slots and the props are in desk space, and the desk's group carries its turn ([[workstations]]), so a turned
  desk turns its dressing with it; the rug under it is placed through the same turn. `desk_dress.json` knows nothing of
  the turn.
- Every workstation is an L: a `cabinet_medium` return off the desk's right end
  ([`RETURN`](ref:hub/renderers/tower3d/src/layout.ts#RETURN)), in the Furniture pack's alt_C atlas (grey,
  beside `desk.glb`'s black legs); free stations draw it bare. The collider is widened to match.
- The dressing goes through the office's KayKit path ([[office-kaykit]]): what `dress` places in code becomes the
  playground's scene item in the desk's frame, its base resting at its height, its scale from
  [`PROPS`](ref:hub/renderers/tower3d/src/dress.ts#PROPS) on top of the catalog's norms, as the document's items carry theirs (room packs ×0.75,
  Restaurant and Halloween food and kitchenware ×0.4 more). [`fillLayer`](ref:hub/renderers/tower3d/src/kit.ts#fillLayer)
  refills one layer for every workstation on each board: a BatchedMesh per pack and theme, 4 draw calls for the
  building. The return is drawn in the Furniture pack's grey alt_C, the theme its item in `desk_dress.json` carries, so the
  prefab editor paints it as the office does.
- `npm run tower3d` first measures the models it uses, vendored from the KayKit bundle in `renderers/tower3d/kaykit/`,
  into one git-ignored file the renderer's bundle embeds ([`tower3d-kit.ts`](ref:hub/scripts/tower3d-kit.ts)).
  The first version fetched glTFs from beside the page, which drew nothing framed in the tower (an opaque origin).

**Alternatives considered.**
- *Room scale (×0.75) for everything.* Right for furniture; tabletop props come out two to three times real size
  beside `desk.glb`'s keyboard (a 0.89 m lamp). Each prop carries a further 0.25 to 0.7.
- *The glTF's standard material.* Nearly the same by day; at night it is darker and smoother than the beans and
  the desk. Toon keeps one language.
- *The return in alt_A (tan wood).* A near miss against the desk's wood; alt_C reads as a filing cabinet.
- *A path of its own* (glTFs copied and loaded one by one, a hand-kept ×0.75, an InstancedMesh per model, 19 draw
  calls): the first version. It converged with the playground's on 2026-10-06 ([[office-kaykit]]), with identical
  pictures.
- *Pizza boxes by context.* The stand-in until the board carried `turns`.
- *The pile in code, each placement nudged by the worker's id* (until 2026-10-17): it could not be placed by hand, and
  a nudge moves what a person placed.
- *One state at a time, or a pile state adding only its own items over the last.* Status, pile and season change
  apart, so a desk needs one of each; a state holding the whole pile at its share can be arranged on its own.

**Impact.** The first KayKit models in the office, and placement as data beside `layout.ts`. The models the office
uses are vendored in `renderers/tower3d/kaykit/`, so building Tower 3D needs no bundle on disk. The office has one
KayKit path, shared with the zones.
