---
{
  "type": "decision",
  "name": "Desk dressing: a workstation's KayKit props derived from its worker's card",
  "summary": "Every workstation in Tower 3D is an L (the Blender desk plus a KayKit cabinet return), and what stands on it is a pure function of the worker's card: status props on the desk, a mess growing with context on the return, a pizza box per finished turn on the floor, frames for what it showed, candy in October. Drawn on the office's KayKit path, one batch per pack and theme.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/renderers/tower3d/src/dress.ts#dress",
    "hub/renderers/tower3d/src/dress.ts#PROPS",
    "hub/renderers/tower3d/src/dress.ts#THEMES",
    "hub/renderers/tower3d/src/dress.ts#itemOf",
    "hub/renderers/tower3d/src/kit.ts#fillLayer",
    "hub/renderers/tower3d/src/layout.ts#RETURN",
    "hub/scripts/tower3d-kit.ts",
    "hub/renderers/tower3d/src/main.ts"
  ]
}
---
**Problem.** A desk said little about its worker beyond the tag, the strip and the bean's pose: a single
`papers` box grew with context. The KayKit Bits bundle ([[kaykit-playground]]) was measured and explored but
nothing in the office used it.

**Why.** The first real use of the kit, chosen where state already exists: a desk can tell how long a session has
run, what it is doing and what it showed, at a glance and without text, while the status colours stay the
loudest thing on the floor.

**How.**
- [`dress`](ref:hub/renderers/tower3d/src/dress.ts#dress)`(card, month)` answers placements in desk space
  (model id, `[x, z]`, turn, optional base height). The desk's right end holds the status (cactus idle; lamp and
  pencils working; lamp and a mug watching, [[watching-status]]; headphones lamp asking; a plated pizza done). The return holds what the session piled up,
  each item from a context share (2% to 33%, so a typical session is already messy). The floor past the desk's
  back edge holds a pizza box per finished turn (`card.turns`), stacks of six, up to three. Up to two standing
  frames face the aisle for what the worker showed. Candy in October. Each placement is nudged by the worker's
  id so no two desks are clones. Right of the keyboard lies the worker's logbook, drawn in code as thick as its
  lineage ([[logbook]]), and the subagents stand along the near edge past it.
- Every workstation is an L: a `cabinet_medium` return off the desk's right end
  ([`RETURN`](ref:hub/renderers/tower3d/src/layout.ts#RETURN)), in the Furniture pack's alt_C atlas (grey,
  beside `desk.glb`'s black legs); free stations draw it bare. The collider is widened to match.
- The placements go through the office's KayKit path ([[office-kaykit]]): [`itemOf`](ref:hub/renderers/tower3d/src/dress.ts#itemOf)
  turns each into the playground's scene item in the desk's frame, its base resting at its height, its scale from
  [`PROPS`](ref:hub/renderers/tower3d/src/dress.ts#PROPS) on top of the catalog's norms (room packs ×0.75,
  Restaurant and Halloween food and kitchenware ×0.4 more). [`fillLayer`](ref:hub/renderers/tower3d/src/kit.ts#fillLayer)
  refills one layer for every workstation on each board: a BatchedMesh per pack and theme, 4 draw calls for the
  building. The return is drawn in the Furniture pack's grey alt_C ([`THEMES`](ref:hub/renderers/tower3d/src/dress.ts#THEMES)).
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

**Impact.** The first KayKit models in the office, and placement as data beside `layout.ts`. The papers block is
gone. Building Tower 3D needs the KayKit bundle on disk. The office has one KayKit path, shared with the zones.
