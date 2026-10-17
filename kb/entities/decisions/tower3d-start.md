---
{
  "type": "decision",
  "name": "Tower 3D starts under a loading screen, its shaders compiled before the first draw",
  "summary": "index.html draws the elevator's panel before the bundle runs, a button per stage of the start (settings, models and the kit, the board, building the floors, lighting the scene) lit as the page reaches it. A live page draws nothing until its first board is built and every program its first frame uses is compiled off the main thread (renderer.compileAsync); that frame is drawn under the screen, which then fades. A fixture page drops the screen as it boots and draws as before.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-11",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/renderers/tower3d/index.html",
    "hub/renderers/tower3d/src/loading.ts",
    "hub/renderers/tower3d/src/boot.ts",
    "hub/renderers/tower3d/src/main.ts#onLiveBoard",
    "hub/renderers/tower3d/src/main.ts#startOn",
    "hub/renderers/tower3d/src/main.ts#frameScene"
  ]
}
---
**Problem.** Tower 3D froze for 1–3 s on reload. Measured (2026-10-11): the page waits 350–1000 ms for its first
board with only the city drawn (a half-loaded look), then one task builds the building (~0.3 s, most of it the
zones' batches) and the first full draw compiles every shader program on the main thread: ~0.15 s with the GPU's
program cache warm, ~1.7 s cold.

**How.**
- *The screen is static html.* `#loading` in [index.html](ref:hub/renderers/tower3d/index.html) shows at once, in
  the design tokens of either scheme; its motion is transform and opacity, so it keeps moving while the main thread
  blocks, and stops for reduced motion. [`loading.ts`](ref:hub/renderers/tower3d/src/loading.ts) lights a stage,
  says why a start failed (a `start:` error, a board error) and leaves; [`boot.ts`](ref:hub/renderers/tower3d/src/boot.ts)
  drops it on a fixture page.
- *The first board is a sequence.* [`onLiveBoard`](ref:hub/renderers/tower3d/src/main.ts#onLiveBoard) hands it to
  [`startOn`](ref:hub/renderers/tower3d/src/main.ts#startOn): a paint, `onBoard`, a paint, the scene set as a frame
  sets it ([`frameScene`](ref:hub/renderers/tower3d/src/main.ts#frameScene): the rig's lights and shadows are part
  of each program's key, so compiling without them misses half the programs), `compileAsync`, then the first frame
  drawn under the screen as it fades. Boards arriving meanwhile supersede one another; the latest follows.
- *Nothing is drawn before.* Frames update but don't draw until `startOn` is done, so the city never shows alone.

**Alternatives considered.**
- *Drawing the city while waiting*: it is the half-loaded look, and its own first draw compiles 12 programs on the
  main thread.
- *Yielding between levels while building*: no less work, and the screen already shows "building the floors".
- *Fetching the kit and models as files to cut the bundle's decode*: a framed page fetches nothing beside its
  bundle ([[bundled-renderer]]).

**Impact.** Warm, headless (Apple M1 Max, sandbox board, 6 runs each, lighting on and off alike): the first draw
blocks ~65 ms instead of ~145, the city's ~75 ms draw before the board is gone, and the first full frame lands
about when it did (+~50 ms for the screen's paints). Cold, the ~1.7 s compile becomes a wait the screen animates
through (not reproducible headless). The longest task left is `onBoard`'s ~250 ms, the zones' batches: batching
only what a level places is the follow-up. Fixture frames are byte for byte the same.
