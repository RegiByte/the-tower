---
{
  "type": "decision",
  "name": "The KayKit playground: scenes as data over a measured catalog",
  "summary": "A sibling renderer of Tower 3D draws any scene document (the whole KayKit collection by default) through one path, and a CLI drives that page headless so agents find, check and render what humans fly through.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-05",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/renderers/kaykit/src/catalog.ts#NORMS",
    "hub/renderers/kaykit/src/catalog.ts#fit",
    "hub/renderers/kaykit/src/scene.ts#Scene",
    "hub/renderers/kaykit/src/scene.ts#flatten",
    "hub/renderers/kaykit/src/draw.ts#build",
    "hub/renderers/kaykit/src/gallery.ts#gallery",
    "hub/renderers/kaykit/src/check.ts#check",
    "hub/renderers/kaykit/src/measure.ts#build",
    "hub/renderers/kaykit/src/measure.ts#measureKit",
    "hub/renderers/kaykit/src/files.ts#flatFile",
    "hub/renderers/kaykit/src/main.ts",
    "hub/scripts/kaykit.ts",
    "hub/renderers/kaykit/scenes/floor_overview.json"
  ]
}
---
**Problem.** An exploration (KOROLEV-45) measured the KayKit Bits bundle and composed office scenes from it with
throwaway code. To bring props into the office, agents need to find models, see them at Tower scale, compose and
check placements, and render the result, and a human needs to look at the same thing.

**Why.** Tower 3D builds every object in code. Placements as data can be written, diffed and checked without a
GPU. They can also be reviewed before the office takes them.

**How.**
- The build measures every glTF into `out/catalog.json` and packs every mesh into one buffer. The source
  folder is read only; everything in `out/` is derived. The catalog holds facts as shipped. `NORMS`, a table of
  rules, turns them into Tower meters, and `fit` derives the placed bounds. A norm changes in one place.
- A scene is one JSON shape (`Scene`): items (a catalog model, or another scene: prefabs are the hierarchy),
  boxes, labels, lamps, cameras, a theme (alt atlas and hue swaps per pack) and a light. `flatten` places
  prefabs, keeping each item's origin and frame for messages.
- One drawing (`build`): each pack's models go in one `BatchedMesh` with one toon material over the pack's
  atlas. The whole collection is about 30 draw calls; a theme is a texture per pack. The gallery is just a scene
  derived from the catalog.
- `scripts/kaykit.ts` finds and checks in Node, and renders by driving the page's `window.kaykit` in headless
  Chrome. Headless and interactive share every line of drawing.
- Scenes live in `renderers/kaykit/scenes/`, versioned with the code.
- Measuring is split from writing: [`measureKit`](ref:hub/renderers/kaykit/src/measure.ts#measureKit) measures
  any set of ids, so Tower 3D's build measures only what the office uses, and
  [`flatFile`](ref:hub/renderers/kaykit/src/files.ts#flatFile) flattens a scene file for the CLI and that build alike.

**Alternatives considered.**
- `InstancedMesh` per model, as the exploration proposed: in the gallery every model appears once, so it saves
  nothing. `BatchedMesh` draws a pack in one call either way.
- Re-pivoting every model to its base: it would throw away intended vendor frames (kitchen cabinets pre-hung at
  2–4 m, base-less buildings that stack). The check catches the real mistake (a centred frame sunk below the floor).
- A separate headless renderer (node-three or similar): two drawings to keep in step.
- Scenes as a Tower collection: no history or review, and these are design artifacts.

**Impact.** Bringing props into the office is reading scene documents: Tower 3D draws flattened prefabs with the
same catalog, norms, themes and batching ([[office-kaykit]]), and the office's zones are prefabs here
(`scenes/prefabs/office_*.json`, `hero_*.json`, `control_*.json`, `lobby_*.json`, `roof_*.json`).
