---
{
  "type": "decision",
  "name": "Tower 3D starts as a braided system of its long-lived resources",
  "summary": "Tower 3D's long-lived pieces (its lighting setting, the extension clients, the stage, input, music, the terminal and the asset loads) are braided resources: plain start and stop functions in their own modules, wired in one record (system.ts) that boot.ts starts, each once its dependencies have. The page itself (main.ts) is the last resource, shell, and reads the others through one binding set as it starts. A resource that fails, and each one skipped for it, is said on the loading screen by name. No module imports itself through others, and test:tower3d-boot fails on a cycle. Inside the page, one app loop holds what it has decided (app.ts): panels move by a `go` event whose pure handler returns leave, enter and draw effects at once, re-frame style, and a draw only writes the DOM.",
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
    "hub/package.json",
    "hub/renderers/tower3d/src/app.ts",
    "hub/renderers/tower3d/src/app.ts#Db",
    "hub/renderers/tower3d/src/app.ts#appHandlers",
    "hub/renderers/tower3d/src/app.ts#went",
    "hub/renderers/tower3d/src/app.ts#subjectLeft",
    "hub/renderers/tower3d/src/main.ts#LEAVE",
    "hub/renderers/tower3d/src/main.ts#ENTER",
    "hub/renderers/tower3d/src/main.ts#TAB_ENTER",
    "hub/renderers/tower3d/src/main.ts#drawPending",
    "hub/renderers/tower3d/src/main.ts#deskEntered",
    "hub/renderers/tower3d/src/main.ts#docClosed",
    "hub/renderers/tower3d/src/main.ts#onBoard",
    "hub/renderers/tower3d/src/door.ts#Engine"
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
  starts loading the models, the kit, the faces, the viewer's kept spot and the renderer's settings, and returns
  `loaded`, which settles once all are in. Its start does not wait for them: the page reads its viewer and subscribes
  to the board while they load, so a page behind another tab still rings ([[tower3d-start]]). The page handles a
  failed load only once it is imported, after every other resource, so `loaded` is marked handled: a resource that
  fails first skips the page, and the loading screen already says why. The loading screen's models stage is lit by
  `shell` as it starts, so "your settings" shows while the settings are read. Its module is `loads.ts` because `src/assets.d.ts` types the asset imports, and a module named
  `assets.ts` would shadow it.
- *Moving an import can move pixels.* three.js orders opaque draws by `material.id`, and ids are handed out as
  materials are made, many of them as their module is evaluated. A change to what is imported first renumbers them,
  which flips the draw order of any two surfaces within the depth buffer's precision of each other, so a refactor can
  change frames without changing what anything draws. A surface that must win such a tie says so itself, the way the
  big screens' [material](ref:hub/renderers/tower3d/src/tv.ts#screenMaterial) and the contact shadows' floor take a
  polygon offset.
- *Music alone.* The chimes keep their own audio context: muting suspends the band's.

**The app loop.** The page's decisions live in one machine, `app` (the shared loop, [[machines]]), as the tower page's
do in its `page` loop ([[web-tower]]). Its pure part is [`app.ts`](ref:hub/renderers/tower3d/src/app.ts); its
executors are in `main.ts`, where the DOM and the building are. The panel families move into it a leg at a time;
the desk, the shell and the shell picker are in, the rest still open and close themselves through a bridge.
- *The db* ([`Db`](ref:hub/renderers/tower3d/src/app.ts#Db)): the panel open, attention, the view, the desk's tab,
  what is pending for the next board (a desk or shell to go to, the tab or showing a desk opens on) and a replay.
  Readers call `app.state()` (`panelNow`, `viewNow`, `deskTabNow`, `replayNow` in `main.ts`; the door through
  [`Engine.app`](ref:hub/renderers/tower3d/src/door.ts#Engine)). Three.js objects, DOM handles, the walker and
  per-frame motion stay out of it.
- *`go` moves a panel* ([`went`](ref:hub/renderers/tower3d/src/app.ts#went)), the page's `go` over Tower 3D's
  `Panel` union: the open panel is left unless the next stays in its room (desks, shells and the big screen share
  one, the view focused on them), the next is entered, and a `draw` follows. Entering a desk or shell focuses the
  view; leaving that room for anything else walks again, with a `fly-home`. A desk opens on its screen, then on the
  tab and the showing pending for it, all in the same transition. A desk's tabs move the same way inside it (`tab`,
  with `tab/leave` and `tab/enter`); a tab entered again is entered again, so the logbook is read again.
- *Leave and enter are tables by kind* ([`LEAVE`](ref:hub/renderers/tower3d/src/main.ts#LEAVE),
  [`ENTER`](ref:hub/renderers/tower3d/src/main.ts#ENTER), [`TAB_ENTER`](ref:hub/renderers/tower3d/src/main.ts#TAB_ENTER)),
  total over `Panel['kind']`. A kind not yet moved has an empty entry, `closesItself` or `opensItself`, and its
  opener still does its DOM, then calls `go` to set the panel. Until those kinds move, entering a desk, a shell or
  the picker closes the side, the reader and the draft editor itself, as the old openers did
  ([`deskEntered`](ref:hub/renderers/tower3d/src/main.ts#deskEntered)); a game stays open under a desk gone to,
  as before.
- *Handlers return every effect at once, the db first.* The loop applies `state` when it meets it, so an executor
  reads the new db, and none dispatches while a transition runs: an event dispatched from an executor waits until
  the transition's effects have all run, after the state they assumed. That is why the old closes are split into
  what they hide (`sideClosed`, [`docClosed`](ref:hub/renderers/tower3d/src/main.ts#docClosed), `draftClosed`) and
  the `go(undefined)` they send: an enter runs only the first. A close that asked which panel was open asks the
  `from` its enter is handed.
- *Draw is state to DOM, once a frame.* `draw` asks for the panels to be drawn at the next animation frame, however
  many transitions asked; [`drawPending`](ref:hub/renderers/tower3d/src/main.ts#drawPending) draws them now, which a
  stepped door frame does as a real frame would, and which a `focus` effect does first, since it needs what the draw
  writes. Each visible change has its `draw` in `tower3d.events()`, so a missing one shows ([[tower3d-door]]).
- *A panel whose subject left closes in the board handler, not the draw.* `board-applied`, dispatched where
  [`onBoard`](ref:hub/renderers/tower3d/src/main.ts#onBoard) used to draw the panel, closes a desk whose worker left or
  a shell that ended ([`subjectLeft`](ref:hub/renderers/tower3d/src/app.ts#subjectLeft)). `onBoard` still draws at
  once after it, for the kinds whose draw still closes them; it dispatches `replay-left` where a replay's desk left the
  building, and goes to a pending desk or shell, until the board itself is an event.
- *What sets the view outside a panel* (the overview, petting, a game, the big screen) sends a `view` event until it
  moves.
- *A leg that moves a family* gives its kinds `LEAVE` and `ENTER` entries, folds its opener and closer into them and
  `go`, takes its subject-gone close from the draw into `board-applied`, drops it from the bridge closes the moved
  kinds' enters run, and records `tool:frames` before and after: state, panel markup and pictures identical, the
  events changed as the transitions say.

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
passes move them. The desk and shell panels change state only through the app loop, and their draw writes nothing
back; the other panel families follow the same steps. The capture (`still`, the door's hold) stays outside the db:
`lock` and `unlock` write it from everywhere, executors among them, so it moves with them as effects.
[[tower3d-registries]] rejected a full split by concern for its cycles; this is where that changes.
