---
{
  "type": "decision",
  "name": "The office dressed with the KayKit: zones as scene documents on the playground's path",
  "summary": "Tower 3D places every KayKit model through the playground's own measuring, norms, scene documents, themes and per-pack batches: desk dressing per board, and per level zones (lounge, coffee point, meeting table, planters, rugs, a hero, the control room's couch, the lobby, the roof) composed as checkable prefabs and placed from the plan.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/scripts/tower3d-kit.ts",
    "hub/renderers/tower3d/src/kitfile.ts#KitFile",
    "hub/renderers/kaykit/src/meshes.ts#meshesFrom",
    "hub/renderers/kaykit/src/measure.ts#measureKit",
    "hub/renderers/kaykit/src/files.ts#flatFile",
    "hub/renderers/tower3d/src/kit.ts#loadKit",
    "hub/renderers/tower3d/src/kit.ts#fillLayer",
    "hub/renderers/tower3d/src/kit.ts#zonesPlaced",
    "hub/renderers/tower3d/src/kit.ts#glowKit",
    "hub/renderers/tower3d/src/zones.ts#PREFABS",
    "hub/renderers/tower3d/src/zones.ts#furnish",
    "hub/renderers/tower3d/src/zones.ts#floorZones",
    "hub/renderers/tower3d/src/zones.ts#controlZones",
    "hub/renderers/tower3d/src/zones.ts#lobbyZones",
    "hub/renderers/tower3d/src/zones.ts#roofZones",
    "hub/renderers/tower3d/src/zones.ts#cityModel",
    "hub/renderers/tower3d/src/zones.ts#floorTheme",
    "hub/renderers/tower3d/src/layout.ts#colliders",
    "hub/renderers/kaykit/scenes/prefabs/office_lounge.json",
    "hub/renderers/kaykit/scenes/prefabs/hero_dropship.json",
    "hub/scripts/tour.ts"
  ]
}
---
**Problem.** A floor was a plate of carpet with desks on it: nowhere to sit, eat or meet, nothing readable from
the elevator door, and every floor alike but for its landing rug. The lobby was a dark plane and the roof a bare
deck past the party. [[desk-dressing]] had brought the first KayKit models in through a path of its own (glTFs
loaded one by one, a hand-kept scale, an InstancedMesh per model), beside the [[kaykit-playground]]'s measured
catalog, norms and scene documents.

**Why.** Zones written as code could not be checked, rendered headless or reviewed as a picture; written as the
playground's scene documents they can (`npm run tool:kaykit -- check`, `render`), and the office only decides
where each one stands. The taste rules from the design spec hold throughout: the status colours stay the loudest
thing on a floor, big planes muted, colour spent on small countable things, one hero per floor.

**How.**
- One path. [`tower3d-kit.ts`](ref:hub/scripts/tower3d-kit.ts) runs before the bundle: it measures only the
  models the office uses with the playground's [`measureKit`](ref:hub/renderers/kaykit/src/measure.ts#measureKit)
  (desk props, every model of the [`PREFABS`](ref:hub/renderers/tower3d/src/zones.ts#PREFABS) documents, the city
  model's) and flattens each prefab with the footprint a walker bumps into (models at least 0.25 m tall standing on
  the floor), all into one git-ignored file, `renderers/tower3d/out/kaykit/kit.kaykit` (catalog, prefabs, packed
  meshes, the packs' atlases: 2.7 MB, laid out as [`KitFile`](ref:hub/renderers/tower3d/src/kitfile.ts#KitFile)),
  which the bundle embeds ([[bundled-renderer]]): framed in the tower the page has an opaque origin and can fetch
  nothing beside it. Atlases become images through blob URLs of the page's own. [`kit.ts`](ref:hub/renderers/tower3d/src/kit.ts#fillLayer) places scene items with the playground's
  `itemMatrix` and `nodeMatrices` and draws each layer as one BatchedMesh per pack and theme (the playground's
  `atlasTexture`: alternate atlas, hue swaps), toon-shaded, instances reused across fills.
- Two layers per level ([[tower3d-levels]]). The desks' props and the lobby's city model are refilled on every
  board; the zones on every rebuild of the building (its structure key, which also holds the month).
- Zones from the plan. [`furnish`](ref:hub/renderers/tower3d/src/zones.ts#furnish) adds each level's zones to the
  plan, from its geometry, the projects' colours and the month; [`colliders`](ref:hub/renderers/tower3d/src/layout.ts#colliders)
  take their footprints, so you, the cats and the guests walk around them. A zone may be stretched along its own x
  (the city table, the lobby's runner).
- A floor ([`floorZones`](ref:hub/renderers/tower3d/src/zones.ts#floorZones)): a taupe rug under every
  workstation, a lounge facing the front glass left of the desks, a meeting table past the last aisle, a coffee
  point along the right glass, the floor's hero at the end of the aisle you look down from the elevator (a Space
  Base dropship, terrarium or rover on a landing pad, in turn up the building, its pad lights and amber windows in
  the project's colour; the pad stands square to the room and only what stands on it is turned, so its footprint,
  the hero's whole collider, leaves a walkway to the glass and to the desks), planters where the other aisles meet the glass and along the side glass, planters framing
  the elevator's doors, and a couch facing the Running board. [`floorTheme`](ref:hub/renderers/tower3d/src/zones.ts#floorTheme)
  paints them in the pastel furniture atlas with its pinks and lilacs and the fridge's mint swapped to a pastel of
  the project's colour; cream and grey pieces keep theirs.
- The control room ([`controlZones`](ref:hub/renderers/tower3d/src/zones.ts#controlZones)): a couch facing the
  video wall from the front glass (stepped back into the room while the floor's arcade stands at the glass,
  [[arcade]]), racks and a planter in the front corners where the bench and shelf leave room.
  Nothing stands before the video wall or its title.
- The lobby ([`lobbyZones`](ref:hub/renderers/tower3d/src/zones.ts#lobbyZones)): a runner from the door to the
  elevator, a waiting corner, the reception counter dressed, tall planters, and the city model
  ([`cityModel`](ref:hub/renderers/tower3d/src/zones.ts#cityModel)): per project, a small pad lit in its colour
  holding a City Builder building whose height grows with its workers on duty, a park when nobody is.
- The roof ([`roofZones`](ref:hub/renderers/tower3d/src/zones.ts#roofZones)): Space Base plant and a helipad in
  the strip behind the party, outside the dance floors' zones; in October lanterns along the parapets and
  jack-o'-lanterns by the decks and the bar. Lantern glass and City windows glow by the hour
  ([`glowKit`](ref:hub/renderers/tower3d/src/kit.ts#glowKit), the skyline windows' share from the sky keyframes).
- Judged by pictures: [`tool:tour`](ref:hub/scripts/tour.ts) shoots fixed spots on the busy fixture by day and
  night; `tool:frames` proved the state unchanged at every step.

**Alternatives considered.**
- *Keeping two KayKit paths* (the desk dressing's and the playground's): zones would be code, and two scale rules
  drift. Desk dressing moved onto the shared path with identical pictures and 19 draw calls down to 4.
- *Loading the playground's whole `out/`*: 16 MB of meshes for about 80 models.
- *Fetching the kit from beside the page*, as the first desk dressing did: blank when framed (opaque origin). CORS
  on loopback file routes would let any site read them; a relay through the renderer API is a fetch by another name.
- *Footprints in a committed generated file*: derived data that goes stale; the build derives them every time.
- *The project colour itself on furniture or rugs*: louder than the status lights; pastels carry it quietly.
- *The playground's kitchen as is*: 1.5 m deep counters and restaurant orange; counters slimmed, orange calmed.
- *Hashing a floor's hero from the project id*: two of three fixture floors drew the same; heroes go in turn.
- *A hero turned as a whole, at 1.6×*: the turned pad's bounds (5.1 m) walled off the front strip from the glass to
  the desks.
- *Stacking base-less City pieces for height*: repeated shop fronts in mid-air; a vertical scale reads as taller.
- *Labels over the city model's buildings*: new canvas text; the pad's colour and the order say whose.

**Impact.** Every level is dressed; frame draw calls stay within fifteen of before at every tour spot, about 27k
triangles added per floor. Building Tower 3D measures its models from the subset of the bundle vendored in `renderers/tower3d/kaykit` (copied by [`tower3d-kit.ts`](ref:hub/scripts/tower3d-kit.ts) `vendor`), so a fresh clone builds it. New
places are scene documents in `renderers/kaykit/scenes/prefabs` plus a line in `zones.ts`. The bundle grew from
4.8 to 8.3 MB. Batches were building-wide at first, culled per instance and not occluded, so a wide view counted
other floors' instances in its frustum; since [[tower3d-levels]] each level has its own, drawn only while it is.
