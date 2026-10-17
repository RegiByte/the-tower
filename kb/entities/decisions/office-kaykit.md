---
{
  "type": "decision",
  "name": "KayKit in Tower 3D: one measured path, scenes as data",
  "summary": "The KayKit playground measures the bundle into a catalog, turns it into Tower meters by norms and draws scene documents (models, prefabs, theme) through one path that a CLI drives headless; Tower 3D places every KayKit model through that same path: desk dressing per board, and each level's zones composed as checkable prefabs and placed from the plan.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/scripts/tower3d-kit.ts",
    "hub/renderers/kaykit/src/scene.ts#layTheme",
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
    "hub/renderers/tower3d/src/zones.ts#PrefabBox",
    "hub/renderers/tower3d/src/floorplan.ts#anchorsOf",
    "hub/renderers/tower3d/src/floorplan.ts#roomsOf",
    "hub/renderers/kaykit/scenes/prefabs/room_game.json",
    "hub/renderers/tower3d/src/layout.ts#solids",
    "hub/renderers/tower3d/src/zones.ts#floorZones",
    "hub/renderers/tower3d/src/zones.ts#controlZones",
    "hub/renderers/tower3d/src/zones.ts#lobbyZones",
    "hub/renderers/tower3d/src/zones.ts#roofZones",
    "hub/renderers/tower3d/src/zones.ts#cityModel",
    "hub/renderers/tower3d/src/zones.ts#floorTheme",
    "hub/renderers/tower3d/src/layout.ts#colliders",
    "hub/renderers/kaykit/scenes/prefabs/office_lounge.json",
    "hub/renderers/kaykit/scenes/prefabs/hero_dropship.json",
    "hub/scripts/tour.ts",
    "hub/renderers/kaykit/src/catalog.ts#NORMS",
    "hub/renderers/kaykit/src/catalog.ts#fit",
    "hub/renderers/kaykit/src/scene.ts#Scene",
    "hub/renderers/kaykit/src/scene.ts#flatten",
    "hub/renderers/kaykit/src/scene.ts#resolve",
    "hub/renderers/kaykit/src/draw.ts#build",
    "hub/renderers/kaykit/src/gallery.ts#gallery",
    "hub/renderers/kaykit/src/check.ts#check",
    "hub/renderers/kaykit/src/measure.ts#build",
    "hub/renderers/kaykit/src/main.ts",
    "hub/scripts/kaykit.ts",
    "hub/renderers/kaykit/scenes/floor_overview.json"
  ]
}
---
**Problem.** Tower 3D builds every object in code, and code placements cannot be checked, rendered headless or
reviewed as a picture. To dress the office with the KayKit bundle, agents need to find models, see them at Tower
scale, compose and check placements and render them, and a human needs to look at the same thing. Two paths for
the same models (a hand-kept scale beside a measured catalog) would drift.

**Why.** Placements as data can be written, diffed and checked without a GPU, and reviewed before the office takes
them. The office then decides only where each scene stands. The taste rules hold throughout: the status colours
stay the loudest thing on a floor, big planes muted, colour spent on small countable things, one hero per floor.

**How.**
- The playground (`renderers/kaykit`, a sibling renderer). Its build measures every glTF into `out/catalog.json`
  and packs the meshes into one buffer; the source folder is read only and `out/` is derived. The catalog holds
  facts as shipped; [`NORMS`](ref:hub/renderers/kaykit/src/catalog.ts#NORMS) turns them into Tower meters and
  [`fit`](ref:hub/renderers/kaykit/src/catalog.ts#fit) derives the placed bounds, so a norm changes in one place.
- A scene is one JSON shape ([`Scene`](ref:hub/renderers/kaykit/src/scene.ts#Scene)): items (a catalog model, or
  another scene: prefabs are the hierarchy), boxes, labels, lamps, cameras, a theme (alt atlas and hue swaps per
  pack, and a model item's own laid over it by [`layTheme`](ref:hub/renderers/kaykit/src/scene.ts#layTheme)) and a light; slots (named places code fills from the board), guides (what the host draws itself: a ghost box, or one of the host's own models by name, which the editor draws)
  and named states, in `groups` that exclude each other (at most one of each in a list). A prefab is a pure function of the states its placement asks for:
  [`resolve`](ref:hub/renderers/kaykit/src/scene.ts#resolve) applies each state's removals, changes and additions
  in the document's order, and [`flatten`](ref:hub/renderers/kaykit/src/scene.ts#flatten) places prefabs in their
  states, keeping each item's origin, the placements it came through and its frame, and each slot in world meters
  under its placing item's id. Scenes live in `renderers/kaykit/scenes/`, versioned with the code; the
  gallery is a scene derived from the catalog.
- One drawing ([`build`](ref:hub/renderers/kaykit/src/draw.ts#build)): each pack's models in one `BatchedMesh`
  per theme they are drawn in, with one toon material over the pack's atlas; a theme is a texture per pack.
  [`scripts/kaykit.ts`](ref:hub/scripts/kaykit.ts) (`npm run tool:kaykit`) finds and checks in Node and renders by
  driving the page's `window.kaykit` in headless Chrome, so headless and interactive share every line of drawing.
- The office on that path. [`tower3d-kit.ts`](ref:hub/scripts/tower3d-kit.ts) runs before the bundle: it measures
  only the models the office uses with [`measureKit`](ref:hub/renderers/kaykit/src/measure.ts#measureKit) (desk
  props, the [`PREFABS`](ref:hub/renderers/tower3d/src/zones.ts#PREFABS) documents, the city model's), flattens
  each prefab with [`flatFile`](ref:hub/renderers/kaykit/src/files.ts#flatFile) and the footprint a walker bumps
  into (models at least 0.25 m tall standing on the floor), and writes one git-ignored file,
  `out/kaykit/kit.kaykit` ([`KitFile`](ref:hub/renderers/tower3d/src/kitfile.ts#KitFile)), which the build copies into
  `out/assets/` and the page fetches as it starts ([[bundled-renderer]]).
  [`kit.ts`](ref:hub/renderers/tower3d/src/kit.ts#fillLayer) places scene items with the playground's matrices and
  draws each layer as one BatchedMesh per pack and theme. It measures from the subset of the bundle vendored in
  `renderers/tower3d/kaykit` (`tower3d-kit.ts vendor`, which leaves the workers' `Characters/` alone,
  [[kaykit-workers]]), so a fresh clone builds it.
- Two layers per level ([[tower3d-levels]]): the desks' props and the lobby's city model are refilled on every
  board; the zones on every rebuild of the building (its structure key, which also holds the month).
- Zones from the plan. A floor's are placed from its named anchors
  ([`anchorsOf`](ref:hub/renderers/tower3d/src/floorplan.ts#anchorsOf): the elevator's doors, the desks' first and
  last rows, the glass, the rooms' doors, the stair, the deck's rail, the lounge, the hero), so a deeper plate moves
  each with what it is anchored to: each room's prefab stands at its door, turned to face out of it
  ([`roomsOf`](ref:hub/renderers/tower3d/src/floorplan.ts#roomsOf)), and furniture that would stand inside a room is
  left out. [`furnish`](ref:hub/renderers/tower3d/src/zones.ts#furnish) adds each level's zones
  ([`floorZones`](ref:hub/renderers/tower3d/src/zones.ts#floorZones),
  [`controlZones`](ref:hub/renderers/tower3d/src/zones.ts#controlZones),
  [`lobbyZones`](ref:hub/renderers/tower3d/src/zones.ts#lobbyZones),
  [`roofZones`](ref:hub/renderers/tower3d/src/zones.ts#roofZones)) from its geometry, the projects' colours and the
  month; [`colliders`](ref:hub/renderers/tower3d/src/layout.ts#colliders) take their footprints, so walkers go
  around them. A floor's furniture is themed in pastels with the project's colour swapped in quietly; its hero goes
  in turn up the building. The lobby's [`cityModel`](ref:hub/renderers/tower3d/src/zones.ts#cityModel) stands a
  building per project, taller with its workers on duty. Lantern glass and City windows glow by the hour
  ([`glowKit`](ref:hub/renderers/tower3d/src/kit.ts#glowKit)). A prefab may hold boxes besides models: a room's
  walls, glass (a box with an `opacity`) and trim, sized in metres along their own axes, no two sharing a face
  (coincident faces z-fight): a wall stops where a frame or the deck's post begins, a pane sinks into its frame, and a
  wall meeting the building's glass runs 2 cm past it. The kit carries them
  ([`PrefabBox`](ref:hub/renderers/tower3d/src/zones.ts#PrefabBox)), [`furnish`](ref:hub/renderers/tower3d/src/zones.ts#furnish)
  places them on the level as the zone's `shapes`, the building draws them one mesh per look, and a box standing on
  the floor counts in the footprint (walls and glass are walked round, a door's gap walked through); an opaque one at
  least eye high stops sight ([`solids`](ref:hub/renderers/tower3d/src/layout.ts#solids)). A new place is a scene document in
  `renderers/kaykit/scenes/prefabs` plus a line in `zones.ts`.
- Judged by pictures: [`tool:tour`](ref:hub/scripts/tour.ts) shoots fixed spots on the busy fixture by day and
  night.

**Alternatives considered.**
- *Two KayKit paths* (desk dressing's own and the playground's): zones would be code, and two scale rules drift.
- *Embedding the playground's whole `out/`*: megabytes of meshes for the few models the office uses.
- *Fetching the kit from beside the page*: blank when framed (opaque origin); CORS on loopback file routes would
  let any site read them.
- *Re-pivoting every model to its base*: it throws away intended vendor frames (pre-hung cabinets, base-less
  buildings that stack); the check catches the real mistake, a centred frame sunk below the floor.
- *A separate headless renderer*: two drawings to keep in step. *Scenes as a tower collection*: no history or
  review, and these are design artifacts.

**Consequences.** Every level is dressed through scene documents agents can check and render. Each level has
batches of its own, drawn only while the level is ([[tower3d-levels]]).
