---
{
  "type": "decision",
  "name": "Tower 3D starts under a loading screen, its shaders compiled before the first draw",
  "summary": "index.html draws the elevator's panel before the bundle runs, a button per stage of the start (settings, models and the kit, the board, building the floors, lighting the scene) lit as the page reaches it. A live page draws nothing until its first board is built and every program its first frame uses is compiled off the main thread (renderer.compileAsync); that frame is drawn under the screen, which then fades. A fixture page drops the screen as it boots and draws as before.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-11",
  "reviewed": "2026-10-23",
  "refs": [
    "hub/renderers/tower3d/index.html",
    "hub/renderers/tower3d/src/loading.ts",
    "hub/renderers/tower3d/src/boot.ts",
    "hub/renderers/tower3d/src/files.ts#prefetch",
    "hub/renderers/tower3d/src/main.ts#onLiveBoard",
    "hub/renderers/tower3d/src/main.ts#onLoaded",
    "hub/renderers/tower3d/src/main.ts#startOn",
    "hub/renderers/tower3d/src/main.ts#frameScene",
    "hub/renderers/tower3d/src/main.ts#failStart"
  ]
}
---
**Problem.** Drawn as soon as it could, a reload showed a half-loaded look (the city alone while the first board came),
then froze while one task built the building and the first full draw compiled every shader program on the main
thread, for seconds with the GPU's program cache cold.

**How.**
- *The screen is static html.* `#loading` in [index.html](ref:hub/renderers/tower3d/index.html) shows at once, in
  the design tokens of either scheme; its motion is transform and opacity, so it keeps moving while the main thread
  blocks, and stops for reduced motion. [`loading.ts`](ref:hub/renderers/tower3d/src/loading.ts) lights a stage,
  says why a start failed and leaves; [`boot.ts`](ref:hub/renderers/tower3d/src/boot.ts) drops it on a fixture
  page.
- *The files arrive while the settings are read.* [`boot.ts`](ref:hub/renderers/tower3d/src/boot.ts) starts
  fetching every model and the kit ([`prefetch`](ref:hub/renderers/tower3d/src/files.ts#prefetch)) before it reads
  the lighting setting; the models stage parses what has arrived ([[bundled-renderer]]). Every floor needs all of
  them, so none waits for a later stage.
- *The first board is a sequence.* [`onLiveBoard`](ref:hub/renderers/tower3d/src/main.ts#onLiveBoard) hands it to
  [`startOn`](ref:hub/renderers/tower3d/src/main.ts#startOn): a paint, `onBoard`, a paint, the scene set as a frame
  sets it ([`frameScene`](ref:hub/renderers/tower3d/src/main.ts#frameScene): the rig's lights and shadows are part
  of each program's key, so compiling without them misses half the programs), `compileAsync`, then the first frame
  drawn under the screen as it fades. Boards arriving meanwhile supersede one another; the latest follows.
- *The board is seen before it is drawn.* The page reads the viewer's record and subscribes to the board as it boots,
  beside the models, and hands every board to its attention machine as it arrives ([[attention-list]], [[machines]]). Drawing waits for
  the models ([`onLoaded`](ref:hub/renderers/tower3d/src/main.ts#onLoaded)) and the start waits on a shown tab
  (Chrome decodes an image and runs a frame only for one), so a page opened or reloaded behind another tab still
  rings when a worker starts waiting on you.
- *Nothing is drawn before.* Frames update but don't draw until `startOn` is done, so the city never shows alone.
- *A failed start says why.* [`failStart`](ref:hub/renderers/tower3d/src/main.ts#failStart) toasts the error,
  writes it on the loading screen and rejects the door's `ready()` with it ([[tower3d-door]]).

**Alternatives considered.**
- *Drawing the city while waiting*: it is the half-loaded look, and its own first draw compiles programs on the
  main thread.
- *Yielding between levels while building*: no less work, and the screen already shows "building the floors".
- *The floors in view first, the rest of the models after*: every floor draws desks, workers and the kit, so
  holding some back is the half-loaded look again.

**Impact.** The shader compile never blocks a drawn frame; cold, it is a wait the screen animates through. Fixture
pages skip the screen and draw from their first frame.
