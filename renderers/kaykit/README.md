# KayKit playground

The Tower's asset workshop: every model of the KayKit Bits Bundle 1 (628 models, six packs, CC0) laid out in
Tower meters, and tools for agents to find, inspect, compose, check and render scenes from them. It is a sibling
of Tower 3D: a disposable renderer on the shelf. The office draws through it: its desk
dressing and its zones (scene documents in `scenes/prefabs/`, placed by `renderers/tower3d/src/zones.ts`) use this
catalog, its norms, themes and per-pack batches (decision `office-kaykit`).

## The model

- **Catalog** (`out/catalog.json`): every model as measured from its glTF, as shipped: bounds, pivot, mount, parts,
  palette. Built by `npm run tool:kaykit -- build --source <dir>`, never hand-edited.
- **Norms** (`src/catalog.ts`, `NORMS`): what brings a model into Tower meters, as data: room packs × 0.75,
  Restaurant and Halloween food and kitchenware a further × 0.4, floor tiles with their walking surface at y = 0.
  `fit(model)` derives a model's placed bounds from the catalog and the norms; nothing stores them.
- **Scene** (`src/scene.ts`): a plain JSON document, the one shape the page, the CLI and the checks share. Units
  are meters, +Y up, everything faces +Z at turn 0.

```jsonc
{
  "title": "…", "note": "…",
  "light": "day" | "night", "sky": "#rrggbb", "ground": "grid" | "plain",
  "theme": { "atlas": { "furniture": "alt_C" }, "swaps": { "restaurant": [{ "from": "#1f9e7a", "to": "#2b6f87", "tol": 18 }] } },
  "items": [
    { "model": "furniture/desk", "at": [x, y, z], "turn": 90, "scale": 1, "parts": { "fridge_A_door_top": [0, -100, 0] } },
    { "scene": "prefabs/workstation.json", "at": [x, y, z], "turn": 180, "scale": 1 }
  ],
  "boxes":  [{ "size": [w, h, d], "at": [x, y, z], "color": "#…", "glow": true, "opacity": 0.3 }],
  "labels": [{ "text": "line\nline", "at": [x, y, z], "height": 0.12, "tilt": 30 }],
  "lamps":  [{ "at": [x, y, z], "color": "#…", "intensity": 5, "distance": 10 }],
  "cameras": { "name": { "pos": [x, y, z], "look": [x, y, z], "fov": 50 } | { "view": "iso", "frame": { "min": […], "max": […] } } }
}
```

`npm run tool:kaykit -- schema` prints it as JSON Schema.

How it differs from the `Placement` and `Theme` sketched in the exploration's findings, and why:

- `at` is `[x, y, z]`, not `[x, z]` plus an optional `y`: one point, the order three.js and the cameras use.
- `turn` is any angle, not a quarter turn: clutter is rarely on the grid (mugs, chairs round a table).
- `scale` is on top of the norms, so `1` is always Tower scale; diorama pieces take theirs here.
- `parts` poses by Euler angles, not one angle: oven doors hinge on X, fridge doors on Y.
- An item can place another **scene**. A scene is a prefab: the desk dressings are a workstation plus props, a
  floor places them. Paths are relative to the file that names them. That is the whole hierarchy mechanism.
- `boxes`, `labels`, `lamps` and `cameras` live beside the items, because a floor needs its shell, signs and
  viewpoints. They are what the procedural Tower would keep drawing.
- Night is `light: "night"`. What glows at night is a fact about the art (`GLOW` in `src/catalog.ts`: the City
  windows, the Halloween lantern glass), so scenes don't repeat it.

Scenes live in `scenes/`, prefabs in `scenes/prefabs/`: versioned, diffable, reviewed like code. A Tower
collection was the other candidate. It suits files a person keeps for later, but it has no history, and scenes
that will one day dress the office are design artifacts. Any JSON file anywhere works with the tools.

## Attach it

The playground needs the whole KayKit Bits Bundle 1 (1.1), which the repo doesn't carry: download it from Kay
Lousberg's itch.io page (https://kaylousberg.itch.io/, CC0) and unpack it anywhere. Tower 3D doesn't need it: the
models the office uses are vendored in `renderers/tower3d/kaykit/`.

Build the assets once (they're derived, git-ignored, about 17 MB), then add a shelf entry to the tower project in
`~/.tower/config.json`:

```sh
npm run tool:kaykit -- build --source <dir>   # <dir>: the unpacked KayKit_Bits_Bundle1_1.1 folder
npm run kaykit                        # the page's bundle and scene list
```

```json
{ "label": "KayKit", "html": "renderers/kaykit/index.html" }
```

It opens in the tower from the shelf, and at `/run/<project>/<n>?scene=scenes/floor_overview.json` on its own.
Without the tower: `npm run tool:kaykit -- serve` serves it at `http://127.0.0.1:4398/` and rebuilds on each load.

## For a human

Opens on the gallery: a hall per pack along +X, a block of rows per category, a plaque per model (name, size in
meters, mount, parts). Drag to pan, right-drag to turn, wheel to zoom, WASD to slide, Q/E down and up, shift to
go faster. The panel picks a scene, searches the catalog (click a hit to fly to it), switches each pack's atlas and
applies a colour swap live (across the whole collection on the gallery), toggles night, and copies the scene's
JSON. Click a model for its facts, palette, where it was placed, and a copyable placement. `#<id>` in the URL
frames a model on load.

## For an agent

Every command is `npm run tool:kaykit -- <command>`. The script's header lists the flags.

| Tool | Command | Answers |
|---|---|---|
| Find | `find [words…] [--pack] [--category] [--mount] [--parts] [--min w,h,d] [--max w,h,d] [--json]` | ids with size and bounds as placed, mount, parts, colours |
| Inspect | `shot <id> [--view iso\|front\|high\|back\|left\|right\|top] [--camera json] [--ref person,desk] [--parts json] [--theme json] [--night] [--size WxH]` | a PNG of one model on a 1 m grid |
| Compose | write a scene JSON (items, prefabs, theme) | the document is the composition |
| Check | `check <scene.json>` | unknown ids and parts, models sunk below the floor, two models in one spot, wall corners with no pillar, props at room scale; exits 1 on an error |
| Render | `render <scene.json\|gallery> [--camera name\|view\|json]… [--theme json] [--night] [--size WxH] [--out dir]` | a PNG per camera |
| Look | `serve`, then open `?scene=<path>` | the same scene, live |

Rendering drives the page itself in headless Chrome through `window.kaykit` (`show`, `dress`, `look`, `shot`,
`state`). An agent's picture and a human's view are one drawing.

### Worked example: a mug, to a rendered scene

```sh
$ npm run tool:kaykit -- find mug
furniture/mug_A    kitchenware floor   0.35×0.18×0.28    y 0..0.176
furniture/mug_B    kitchenware floor   0.37×0.23×0.28    y 0..0.232

$ npm run tool:kaykit -- shot furniture/mug_B --ref desk          # how big is it, really
$ npm run tool:kaykit -- find --category desk --pack furniture --max '*,0.8,*'
furniture/table_small    desk   floor   0.75×0.75×0.75    y 0..0.75   # its top is at 0.75
```

`coffee_break.json`: the mug's origin is its base, so it goes on the table top at y 0.75.

```json
{
 "title": "coffee break", "ground": "grid",
 "items": [
  { "model": "furniture/table_small", "at": [0, 0, 0] },
  { "model": "furniture/mug_B", "at": [0.1, 0.75, 0.05], "turn": 30 },
  { "model": "furniture/pictureframe_medium", "at": [0, 0, -0.6] },
  { "model": "furniture/chair_A", "at": [0, 0, 0.7], "turn": 180 }
 ],
 "cameras": { "hero": { "view": "iso" } }
}
```

```sh
$ npm run tool:kaykit -- check coffee_break.json
warn  coffee_break.json#items/2: furniture/pictureframe_medium sinks 0.337 m below the floor (its origin is at mid-height): raise at[1] by 0.337
# hang it: "at": [0, 1.4, -0.6]
$ npm run tool:kaykit -- check coffee_break.json
no issues
$ npm run tool:kaykit -- render coffee_break.json
/tmp/…/kaykit/coffee_break-hero.png
```

## Scenes here

- `desk_states.json`: the desk dressed by state (idle, working, needs, done), four prefabs over one workstation.
- `floor_overview.json`: a 30 × 21 m floor with the core, eight dressed desks, a meeting room, kitchen, lounge,
  collections wall and lockers, themed to the project colour. Every zone is a prefab.
- `lobby_city_model.json`: a building per project on a table, height from live workers.
- `prefabs/office_*`, `hero_*`, `control_*`, `lobby_*`, `roof_*`, `planter*`, `desk_rug`, `meeting_rug`,
  `city_table`, `running_bench`, `reception_top`: the office's zones. Tower 3D places them from its plan; check and
  render them here like any scene.

They recreate KOROLEV-45's exploration scenes, using only the tools.
The Tower's own beans are left out: the playground draws only KayKit and boxes.
