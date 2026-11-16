---
{
  "type": "decision",
  "name": "Tower 3D starts as a braided system of its long-lived resources",
  "summary": "Tower 3D's long-lived pieces (its lighting setting, the extension clients, the stage, input, music, the terminal and the asset loads) are braided resources: plain start and stop functions in their own modules, wired in one record (system.ts) that boot.ts starts, each once its dependencies have. The page itself (main.ts) is the last resource, shell, and reads the others through one binding set as it starts. A resource that fails, and each one skipped for it, is said on the loading screen by name. No module imports itself through others, and test:tower3d-boot fails on a cycle.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-11-16",
  "reviewed": "2026-11-16",
  "refs": [
    "hub/renderers/tower3d/src/system.ts",
    "hub/renderers/tower3d/src/boot.ts",
    "hub/renderers/tower3d/src/shell.ts",
    "hub/renderers/tower3d/src/shell.ts#shell",
    "hub/renderers/tower3d/src/clients.ts#startClients",
    "hub/renderers/tower3d/src/light/setting.ts#startLighting",
    "hub/renderers/tower3d/src/toon.ts#lightRamp",
    "hub/renderers/tower3d/src/stage.ts#startStage",
    "hub/renderers/tower3d/src/input.ts#startInput",
    "hub/renderers/tower3d/src/music.ts#startMusic",
    "hub/renderers/tower3d/src/term.ts#startTerminal",
    "hub/renderers/tower3d/src/loads.ts#startAssets",
    "hub/renderers/tower3d/src/tv.ts#screenMaterial",
    "hub/renderers/tower3d/src/prefab.ts",
    "hub/scripts/tower3d-boot.ts#importCycles",
    "hub/src/tower/spine.ts",
    "hub/package.json"
  ]
}
---
**Problem.** Tower 3D started as a side effect of loading its modules: the stage built a renderer, added its
listeners and set a clock running as it was imported, the terminal subscribed to the viewer's prefs, the lighting set
an exported `let` the rest read as they loaded, and the extension clients loaded in a top-level await. The start order
was the order esbuild ran the imports in, and nothing stopped. Splitting `main.ts` by concern (a WIP split, parked)
then hung the page silently: esbuild wraps a lazily imported module and everything it imports in init functions; a
top-level await on that path makes every wrapper async, and two async wrappers in an import cycle wait on each other
forever.

**Why.** The topology is data. Declaring each resource and what it needs, and letting a library derive the order, is
what the tower process already does ([[spine]]). It removes the hang's cause (no top-level await, no cycles) instead
of tolerating it, and gives later passes a place to put what `main.ts` holds today.

**How.**
- *Resources are plain functions.* Each module exports a start (`startStage`, `startInput`, `startMusic`,
  `startTerminal`, `startClients`, `startLighting`, `startAssets`) that does what its import used to and returns what
  its users call, with a stop where stopping is cheap. Nothing calls the stops yet.
- *One record wires them.* [`system.ts`](ref:hub/renderers/tower3d/src/system.ts) is the only module that knows
  where each is implemented: `defineResource` calls with their dependencies (the stage needs the lighting, the input
  needs the stage's canvas), the record `tower3d`. [braided](ref:hub/package.json) is bundled into `tower3d.js` like
  three.js, not served at `/lib/`, so the renderer API is untouched.
- *Boot starts it.* [`boot.ts`](ref:hub/renderers/tower3d/src/boot.ts) sets the placeholder door, then imports
  `system.ts` lazily and starts it. The placeholder must exist before three.js and the city evaluate: Chrome can fire
  the load event before a module that takes long to evaluate has run, and an agent awaits `tower3d.ready()` from the
  load event on ([[tower3d-door]]). braided collects each failed start and skips its dependents; boot writes every one
  on the loading screen with the resource's name and rejects `ready()` with them ([[tower3d-start]]).
- *The lighting bands the ramp.* Lit, the lighting's start bands every toon material by the rig's ramp
  ([`lightRamp`](ref:hub/renderers/tower3d/src/toon.ts#lightRamp)) before anything draws; the stage gets `lit` as an
  argument. The pages that never start it (the lab, the dresser, the editor) stay unlit.
- *The page is the last resource, through a temporary seam.* `shell` binds what it depends on
  ([`shell()`](ref:hub/renderers/tower3d/src/shell.ts#shell)) and then imports `main.ts`; `main.ts` and the modules it
  imports read their resources from that binding as they load, and a read before it is bound throws, naming why. This
  binding is transitional: later passes move what `main.ts` holds into resources of their own and dissolve it.
- *No cycles.* [`importCycles`](ref:hub/scripts/tower3d-boot.ts#importCycles) in `test:tower3d-boot` walks the import
  graph esbuild reads for the four pages and fails, naming the modules, on any cycle. The one there was (`layout`,
  `meetings`, `zones`, `breaks`) is broken by [`prefab.ts`](ref:hub/renderers/tower3d/src/prefab.ts).
- *The loads are a resource that hands out a promise.* [`startAssets`](ref:hub/renderers/tower3d/src/loads.ts#startAssets)
  lights the models stage and starts loading the models, the kit, the faces, the viewer's kept spot and the
  renderer's settings, and returns `loaded`, which settles once all are in. Its start does not wait for them: the page
  reads its viewer and subscribes to the board while they load, so a page behind another tab still rings
  ([[tower3d-start]]). Its module is `loads.ts` because `src/assets.d.ts` types the asset imports, and a module named
  `assets.ts` would shadow it.
- *Moving an import can move pixels.* three.js orders opaque draws by `material.id`, and ids are handed out as
  materials are made, many of them as their module is evaluated. A change to what is imported first renumbers them,
  which flips the draw order of any two surfaces within the depth buffer's precision of each other, so a refactor can
  change frames without changing what anything draws. A surface that must win such a tie says so itself, the way the
  big screens' [material](ref:hub/renderers/tower3d/src/tv.ts#screenMaterial) and the contact shadows' floor take a
  polygon offset.
- *Music alone.* The chimes keep their own audio context: muting suspends the band's.

**Alternatives considered.**
- *esbuild's `--splitting`*: main becomes a real ES module chunk and native ESM tolerates cycles. It treats the
  symptom: cycles still hand out half-made bindings, the start order stays implicit, and the build gains hashed chunks
  the boot check would have to follow. It remains a separate size and caching choice.
- *Late binding by hand* (callbacks set at wire-up, a registry): the page already does it four times
  (`onArchives`, `onTitles`, `onKeptTitles`, `onGameTitles`). Each is a cycle hidden at run time, and the topology
  stays code spread across modules.
- *The parked split by concern* (eleven modules cut by responsibility, branch `tower/percival-32`): one strongly
  connected component of all eleven. Removing the top-level await lets it boot, but it keeps the cycle and its
  load-order hazards.

**Impact.** The start order is the graph, and a failure names its resource. The import-time effects left the leaf
modules; `main.ts` keeps its own (its listeners, timers, the board's subscription) until later
passes move them.
[[tower3d-registries]] rejected a full split by concern for its cycles; this is where that changes.
