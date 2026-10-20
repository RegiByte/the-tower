---
{
  "type": "decision",
  "name": "The forge's props in Tower 3D: a pack of the kit, bound by material name",
  "summary": "The forge, a kit of real-size low-poly props made for the tower (CC0), is vendored whole from its dist/ into renderers/tower3d/forge and measured into the office's kit as one more pack, forge, at ×1: its GLBs are read beside KayKit's glTFs, each primitive bound by its material's name to a surface (the palette atlas, glass tinted by it, the decal sheet), and drawn one batch per pack, theme and surface. The 4096² decal sheet goes in the kit only when a prop the office places shows a decal.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-20",
  "reviewed": "2026-10-20",
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
office props of its own (mugs, plates, pen cups made for a restaurant or a room). The forge (a repository of its own,
Blender with its own add-on) makes props for the tower at real size, to replace KayKit's over time. Its `dist/` is
a contract of its own: GLBs that carry no images, three materials bound by name, and textures shared by every prop
(a 1024² palette atlas with an emissive map, a 4096² decal sheet).

**Why.** One measured path for every model the office places ([[office-kaykit]]): the forge's props come in as
scene items like KayKit's, so the prefab editor places them ([[prefab-editor]]), `tool:kaykit check` checks them, and
a swap is a change to a scene document. The decal sheet is the forge's real GPU cost (about 85 MB with mips), so
nothing pays for it until a placed prop shows a decal.

**How.**
- Vendored whole: [`vendorForge`](ref:hub/scripts/tower3d-kit.ts#vendorForge) (`tsx scripts/tower3d-kit.ts
  vendor-forge <dist>`) replaces `renderers/tower3d/forge/` with a copy of the forge's `dist/`, its CC0
  `License.txt` and a README. It fails first ([`checkBinding`](ref:hub/scripts/tower3d-kit.ts#checkBinding)) when
  the catalog's `materials` name others than the kit binds, or its glass opacity or decal cut differ from
  [`FORGE_BINDING`](ref:hub/renderers/kaykit/src/catalog.ts#FORGE_BINDING). Ask the forge before changing either:
  `dist/` is a cross-repo API.
- A pack: `forge` joins KayKit's packs in `PACKS`, with ids `forge/<forge id>` (`forge/kitchen/coffee_mug_01`), in
  the forge's metres (+Y up, facing +Z). One norm scales it, and it is temporary
  ([`NORMS`](ref:hub/renderers/kaykit/src/catalog.ts#NORMS), the user's call on 2026-10-20): ×1.25, because the workers
  and the room packs are drawn chunkier than real, and at ×1 a mug is a speck in a worker's hand. It goes back to ×1
  as more of the office comes from the forge (the desks, then the workers), the scale converging as scenes migrate;
  the forge's sources stay real size. A prop's category is read from its
  vendored sidecar's `category`, so a new forge prop needs no tower code: the forge files props by room and the
  catalog by what a thing is, so [`FORGE_CATEGORIES`](ref:hub/renderers/kaykit/src/rules.ts#FORGE_CATEGORIES) maps
  each room to the category most of its props are (kitchen to kitchenware, office to decor, living_room to seating,
  arcade to tech), and [`forgeCategory`](ref:hub/renderers/kaykit/src/rules.ts#forgeCategory) fails naming a room
  the table lacks. The table stands in until the forge declares each prop's kind on its sidecar, which it plans
  to; the tower reads that then and the table goes. The forge's `moves` are not read yet.
- Measured on the playground's path: [`readGltf`](ref:hub/renderers/kaykit/src/measure.ts#readGltf) reads a `.glb`'s
  chunks or a `.gltf`'s files, and every primitive is bound to a
  [`Surface`](ref:hub/renderers/kaykit/src/meshes.ts#Surface): a KayKit material is `atlas` when it has a texture and
  `glass` when not; a forge material by name ([`FORGE_SURFACES`](ref:hub/renderers/kaykit/src/measure.ts#FORGE_SURFACES):
  `forge_palette` the atlas, `forge_glass` glass, `forge_decals` decals). [`measureKit`](ref:hub/renderers/kaykit/src/measure.ts#measureKit)
  measures KayKit's folder and the forge's into one catalog and one packed buffer;
  [`measureForge`](ref:hub/renderers/kaykit/src/measure.ts#measureForge) reads only the props asked for (the office's,
  or all of them for the playground).
- Textures: a pack's [`PackInfo`](ref:hub/renderers/kaykit/src/catalog.ts#PackInfo) has `atlases`, which a theme picks
  among, and `maps`, sampled as they are. The forge's palette is its `base` atlas, so themes' hue swaps reach it; its
  `emissive` is a map, and [`glowTexture`](ref:hub/renderers/kaykit/src/atlas.ts#glowTexture) takes a pack's emissive
  map over the `GLOW` regions KayKit's packs need. [`forgeTextures`](ref:hub/renderers/kaykit/src/measure.ts#forgeTextures)
  adds `decals` only when a measured prop's `decals` is non-empty, and
  [`mapTexture`](ref:hub/renderers/kaykit/src/atlas.ts#mapTexture) makes a map's texture only when a batch draws it.
- Drawn in material batches: a batch is keyed by pack, theme and surface ([`keyOf`](ref:hub/renderers/tower3d/src/kit.ts#keyOf)),
  KayKit's untextured glass still one batch for every KayKit pack. [`lookMaterial`](ref:hub/renderers/tower3d/src/kit.ts#lookMaterial)
  makes each one through Tower 3D's own toon path (the lit rig's patch, bloom on `userData.glow`), so the forge looks
  native: the atlas toon-mapped with the emissive map lit by the clock ([`glowKit`](ref:hub/renderers/tower3d/src/kit.ts#glowKit)),
  glass the atlas at 0.3 opacity, two-sided, writing no depth, and decals the sheet alpha-cut at 0.5, marked
  [`shadowless`](ref:hub/renderers/tower3d/src/toon.ts#shadowless) so the lit rig casts no shadow from them though they
  are opaque (they are lifted 0.5 mm off their part). The playground's
  [`material`](ref:hub/renderers/kaykit/src/draw.ts#material) does the same with its own ramp.
- First used on the desks ([[desk-dressing]]): the dressing's mugs and cup, plate, bowl, pizza slice, pen cup and
  cactus became the forge's coffee mug, plate, bowl, pizza slice, pen cup and desk plant, at scale 1 where KayKit's
  items carried 0.45 to 0.875 (the norm sizes them), and the slice now sits centred in the plate's well, 1.25 cm up. The pizza boxes stay KayKit's (the forge's
  shows a decal).

**Alternatives considered.**
- *A parallel kit* (the forge in a file and draw path of its own): two measured paths, the drift [[office-kaykit]]
  exists to avoid, and the editor blind to forge props.
- *Path B* (`src/models.ts`, `drawn()`), which loads GLBs one by one: it discards textures, and the forge's props are
  nothing without the palette.
- *Binding as KayKit does* (textured or glass): every forge material has a texture, so glass and decals would be
  drawn as the opaque atlas.
- *Vendoring only the props the office places*, as KayKit's are: the snapshot is 1.4 MB, and whole it lets the editor
  place any forge prop. Measuring stays limited to what the office places.
- *KayKit's name rules for forge props* (the first version): every new forge prop needed a rule in the tower, and
  a forge name can match a KayKit rule by accident (a `desk_plant` is not a desk).
- *Gating the decal sheet on the vendored props*: the pizza box and the pinball always show decals, so the sheet would
  be in every kit.

**Impact.** On the busy fixture's desks, lit: +3 draw calls (a forge batch per level's desk layer), +9k triangles,
the same frame time; two more 1024² textures (+10.7 MB of GPU memory); `kit.kaykit` 3102 KB to 3159 KB, with no decal
sheet (measured at ×1; the norm changes no count). Nothing placed shows a decal yet: placing the forge's pizza box once packed the
sheet (+934 KB in the kit) and drew its lid's decal cut and lit.
