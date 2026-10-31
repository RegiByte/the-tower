---
{
  "type": "decision",
  "name": "The forge's props in Tower 3D: a pack of the kit, bound by material name",
  "summary": "The forge, a kit of real-size low-poly props made for the tower (CC0), is vendored whole from its dist/ into renderers/tower3d/forge and measured into the office's kit as one more pack, forge, under one norm: its GLBs are read beside KayKit's glTFs, each primitive bound by its material's name to a surface (the palette atlas, glass tinted by it, the decal sheet), and drawn one batch per pack, theme and surface. The 4096² decal sheet goes in the kit only when a prop the office places shows a decal.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-20",
  "reviewed": "2026-10-31",
  "refs": [
    "hub/scripts/tower3d-kit.ts#vendorForge",
    "hub/scripts/tower3d-kit.ts#checkBinding",
    "hub/renderers/kaykit/src/measure.ts#readGltf",
    "hub/renderers/kaykit/src/measure.ts#FORGE_SURFACES",
    "hub/renderers/kaykit/src/measure.ts#forgeTextures",
    "hub/renderers/kaykit/src/measure.ts#measureForge",
    "hub/renderers/kaykit/src/measure.ts#measureKit",
    "hub/renderers/kaykit/src/meshes.ts#Surface",
    "hub/renderers/kaykit/src/catalog.ts#FORGE_BINDING",
    "hub/renderers/kaykit/src/catalog.ts#NORMS",
    "hub/renderers/kaykit/src/catalog.ts#PackInfo",
    "hub/renderers/kaykit/src/atlas.ts#mapTexture",
    "hub/renderers/kaykit/src/atlas.ts#glowTexture",
    "hub/renderers/tower3d/src/kit.ts#lookMaterial",
    "hub/renderers/tower3d/src/kit.ts#keyOf",
    "hub/renderers/tower3d/src/toon.ts#shadowless",
    "hub/renderers/kaykit/src/draw.ts#material",
    "hub/renderers/kaykit/src/rules.ts#FORGE_CATEGORIES",
    "hub/renderers/kaykit/src/rules.ts#forgeCategory",
    "hub/renderers/kaykit/scenes/prefabs/desk_dress.json",
    "hub/renderers/tower3d/forge/README.md"
  ]
}
---
**Problem.** KayKit's props are drawn two to three times real size and normed down per pack, and the bundle has no
office props of its own (mugs, plates, pen cups made for a restaurant or a room). The forge (a repository of its own)
makes props for the tower at real size. Its `dist/` is a contract of its own: GLBs that carry no images, three
materials bound by name, and textures shared by every prop (a palette atlas with an emissive map, a decal sheet).

**Why.** One measured path for every model the office places ([[office-kaykit]]): the forge's props come in as
scene items like KayKit's, so the prefab editor places them ([[prefab-editor]]), `tool:kaykit check` checks them, and
a swap is a change to a scene document. The decal sheet is the forge's real GPU cost, so nothing pays for it until a
placed prop shows a decal.

**How.**
- Vendored whole: [`vendorForge`](ref:hub/scripts/tower3d-kit.ts#vendorForge) (`tsx scripts/tower3d-kit.ts
  vendor-forge <dist>`) replaces `renderers/tower3d/forge/` with a copy of the forge's `dist/`, its CC0
  `License.txt` and a README. It fails first ([`checkBinding`](ref:hub/scripts/tower3d-kit.ts#checkBinding)) when
  the catalog's `materials` name others than the kit binds, or its glass opacity or decal cut differ from
  [`FORGE_BINDING`](ref:hub/renderers/kaykit/src/catalog.ts#FORGE_BINDING). Ask the forge before changing either:
  `dist/` is a cross-repo API.
- A pack: `forge` joins KayKit's packs in `PACKS`, with ids `forge/<forge id>` (`forge/kitchen/coffee_mug_01`), in
  the forge's metres (+Y up, facing +Z). One norm scales it ([`NORMS`](ref:hub/renderers/kaykit/src/catalog.ts#NORMS)):
  ×1.25, temporary, because the workers and the room packs are drawn chunkier than real and at ×1 a mug is a speck in
  a worker's hand. It goes back to ×1 as more of the office (the desks, then the workers) comes from the forge; the
  forge's sources stay real size. A prop's category is read from its vendored sidecar's `category`, so a new forge
  prop needs no tower code: the forge files props by room and the catalog by what a thing is, so
  [`FORGE_CATEGORIES`](ref:hub/renderers/kaykit/src/rules.ts#FORGE_CATEGORIES) maps each room to the category most of
  its props are, and [`forgeCategory`](ref:hub/renderers/kaykit/src/rules.ts#forgeCategory) fails naming a room the
  table lacks. The table stands in until the forge declares each prop's kind on its sidecar. The forge's `moves` are
  not read.
- Measured on the playground's path: [`readGltf`](ref:hub/renderers/kaykit/src/measure.ts#readGltf) reads a `.glb`'s
  chunks or a `.gltf`'s files, and every primitive is bound to a
  [`Surface`](ref:hub/renderers/kaykit/src/meshes.ts#Surface): a KayKit material is `atlas` when it has a texture and
  `glass` when not; a forge material by name ([`FORGE_SURFACES`](ref:hub/renderers/kaykit/src/measure.ts#FORGE_SURFACES)).
  [`measureKit`](ref:hub/renderers/kaykit/src/measure.ts#measureKit) measures KayKit's folder and the forge's into one
  catalog and one packed buffer; [`measureForge`](ref:hub/renderers/kaykit/src/measure.ts#measureForge) reads only the
  props asked for (the office's, or all of them for the playground).
- Textures: a pack's [`PackInfo`](ref:hub/renderers/kaykit/src/catalog.ts#PackInfo) has `atlases`, which a theme picks
  among, and `maps`, sampled as they are. The forge's palette is its `base` atlas, so themes' hue swaps reach it; its
  `emissive` is a map, and [`glowTexture`](ref:hub/renderers/kaykit/src/atlas.ts#glowTexture) takes a pack's emissive
  map over the `GLOW` regions KayKit's packs need. [`forgeTextures`](ref:hub/renderers/kaykit/src/measure.ts#forgeTextures)
  adds `decals` only when a measured prop's `decals` is non-empty, and
  [`mapTexture`](ref:hub/renderers/kaykit/src/atlas.ts#mapTexture) makes a map's texture only when a batch draws it.
- Drawn in material batches keyed by pack, theme and surface ([`keyOf`](ref:hub/renderers/tower3d/src/kit.ts#keyOf)),
  KayKit's untextured glass one batch for every KayKit pack. [`lookMaterial`](ref:hub/renderers/tower3d/src/kit.ts#lookMaterial)
  makes each through Tower 3D's own toon path, so the forge looks native: decals are alpha-cut and marked
  [`shadowless`](ref:hub/renderers/tower3d/src/toon.ts#shadowless), so the lit rig casts no shadow from a decal lifted
  just off its part. The playground's [`material`](ref:hub/renderers/kaykit/src/draw.ts#material) does the same with
  its own ramp.
- The desks' dressing ([[desk-dressing]]) places the forge's mug, plate, bowl, pizza slice, pen cup and desk plant
  ([desk_dress](ref:hub/renderers/kaykit/scenes/prefabs/desk_dress.json)).

**Alternatives considered.**
- *A parallel kit* (the forge in a file and draw path of its own): two measured paths, the drift [[office-kaykit]]
  exists to avoid, and the editor blind to forge props.
- *Path B* (`src/models.ts`, `drawn()`), which loads GLBs one by one: it discards textures, and the forge's props are
  nothing without the palette.
- *Binding as KayKit does* (textured or glass): every forge material has a texture, so glass and decals would be
  drawn as the opaque atlas.
- *Vendoring only the props the office places*, as KayKit's are: whole, the editor can place any forge prop.
  Measuring stays limited to what the office places.
- *KayKit's name rules for forge props*: every new forge prop would need a rule in the tower, and a forge name can
  match a KayKit rule by accident (a `desk_plant` is not a desk).
- *Gating the decal sheet on the vendored props*: some vendored props always show decals, so the sheet would be in
  every kit.

**Impact.** Forge props cost a batch per pack, theme and surface, and the decal sheet only when a placed prop shows a
decal.
