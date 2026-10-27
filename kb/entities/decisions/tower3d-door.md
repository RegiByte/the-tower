---
{
  "type": "decision",
  "name": "Tower 3D has a door for agents",
  "summary": "Tower 3D exposes a typed window.tower3d surface (state, teleport, aimAt, press, key, drive, step, shot) over an intent-driven input layer and a steppable, seeded clock, and renders fabricated boards in place of the live one, so agents test it deterministically.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-27",
  "refs": ["hub/renderers/tower3d/src/door.ts", "hub/renderers/tower3d/src/input.ts", "hub/renderers/tower3d/src/random.ts", "hub/renderers/tower3d/src/clock.ts", "hub/renderers/tower3d/src/walker.ts", "hub/renderers/tower3d/src/main.ts#failStart", "hub/renderers/tower3d/src/fixtures.ts#fixtureBoards", "hub/src/bridge/life.ts#lifeOf", "hub/src/bridge/board.ts#withReports", "hub/renderers/tower3d/src/contract.ts#CONTRACT", "hub/scripts/drive.ts", "hub/scripts/sandbox.ts", "hub/scripts/frames.ts", "hub/scripts/tower3d-boot.ts", "hub/test/models.test.ts"]
}
---
**Problem.** Agents build Tower 3D, and tested it by brute force: stubbing pointer lock, dispatching synthetic
mouse moves, priming dropped keys, seeding localStorage to place the walker, wrapping fetch, and timing screenshots
of animations.

**Why.** The project is built by agents; what they cannot check, they build slowly. Asset work (models, materials,
layouts) needs repeatable views, and a refactor such as [[tower3d-registries]] needs a before and after to compare.

**How.**
- Input is intents: a move held and a turn taken per frame (`input.ts`). Keyboard and mouse produce them, and the
  door injects the same. `capture()` stands in for pointer lock. Building keys go through one `onKey`, which the
  door's `key()` calls.
- A frame is `update(dt)` then `render()` over a simulated clock that every hold, flight, fade and animation reads.
  `step(n)` stops it and runs n frames; `?stepped` starts it stopped. One seeded `random` (`?seed=`) replaces
  `Math.random` wherever chance reaches a frame. `?at=<ISO time>` pins the wall clock (`clock.ts`), so repeats hold
  on any day.
- `window.tower3d` is typed and always present; its verbs and their contracts are the comment and `Door` type in
  [`door.ts`](ref:hub/renderers/tower3d/src/door.ts). `locate`, `teleport` and `aimAt` work over the world as the
  next frame draws it, so they hold with no frame between them. A verb used wrongly throws with what to do instead
  (a verb not offered, a held verb pressed, a thing placed only by a frame not yet run). `ready()` resolves once the
  first board is built and rejects with why a start failed ([`failStart`](ref:hub/renderers/tower3d/src/main.ts#failStart),
  [[tower3d-start]]), so a check fails at once on a file that would not load. The door plays no music, rings nothing
  and never stores the walker's spot.
- `?board=<name>` renders a fabricated board, one of [`FIXTURES`](ref:hub/renderers/tower3d/src/fixtures.ts#FIXTURES),
  a list of boards delivered one by one through `advance`, so what happens between boards can be recorded. Scenarios
  state facts; callsign, the worker's lifecycle ([`lifeOf`](ref:hub/src/bridge/life.ts#lifeOf)), its crew
  ([`withReports`](ref:hub/src/bridge/board.ts#withReports)) and verbs come from the bridge's own functions, so a
  contract change breaks the build and a fixture draws what the board would. A fixture's screens open no streams: there is no host behind it, and replies landing
  between steps would make frames differ.
- The tools around it ([[tower3d]]): `npm run drive` (headless Chrome, page errors collected), `npm run sandbox`,
  `npm run tool:frames` (a fixed walk on every fixture board, each stage's state and PNG compared byte for byte; it
  refuses a walk that does not repeat), model names as data checked against every `.glb` by `npm test`, and in CI
  `npm run test:tower3d-boot`, the built bundle booted on a fixture board through `ready()` with no page error.

**Alternatives considered.**
- Keep driving real input over CDP: fragile and slow.
- A debug grab-bag on `window`: unstructured, and it exposes internals rather than verbs.
- Boards recorded from the real system: real shapes, but client prompts and paths would land in git and a
  scrubber would have to follow every new text field.

**Impact.** Two loads with one seed, clock and steps give identical pixels.
