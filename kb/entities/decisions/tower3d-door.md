---
{
  "type": "decision",
  "name": "Tower 3D has a door for agents",
  "summary": "Tower 3D exposes a typed window.tower3d surface (state, teleport, aimAt, press, key, drive, step, shot, events) over an intent-driven input layer and a steppable, seeded clock, and renders fabricated boards in place of the live one, so agents test it deterministically.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-11-16",
  "refs": ["hub/renderers/tower3d/src/door.ts", "hub/renderers/tower3d/src/record.ts", "hub/renderers/tower3d/src/input.ts", "hub/renderers/tower3d/src/random.ts", "hub/renderers/tower3d/src/clock.ts", "hub/renderers/tower3d/src/walker.ts", "hub/renderers/tower3d/src/main.ts#failStart", "hub/renderers/tower3d/src/fixtures.ts#fixtureBoards", "hub/scripts/tower3d-fixtures.ts#FIXTURES", "hub/renderers/tower3d/src/fixture-file.ts#FixtureFile", "hub/test/tower3d-fixtures.test.ts", "hub/src/bridge/life.ts#lifeOf", "hub/src/bridge/board.ts#withReports", "hub/renderers/tower3d/src/contract.ts#CONTRACT", "hub/scripts/drive.ts", "hub/scripts/sandbox.ts", "hub/scripts/frames.ts", "hub/scripts/frames.scenario.js", "hub/scripts/frames.panels.js", "hub/scripts/tower3d-boot.ts", "hub/test/models.test.ts"]
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
- `window.tower3d` is typed and present from the page's first script, holding only `ready` until the page's
  modules have loaded ([`boot.ts`](ref:hub/renderers/tower3d/src/boot.ts) opens it, `installDoor` fills it); its verbs and their contracts are the comment and `Door` type in
  [`door.ts`](ref:hub/renderers/tower3d/src/door.ts). `locate`, `teleport` and `aimAt` work over the world as the
  next frame draws it, so they hold with no frame between them. A verb used wrongly throws with what to do instead
  (a verb not offered, a held verb pressed, a thing placed only by a frame not yet run). `ready()` resolves once the
  first board is built and rejects with why a start failed ([`failStart`](ref:hub/renderers/tower3d/src/main.ts#failStart),
  [[tower3d-start]]), so a check fails at once on a file that would not load. The door plays no music, rings nothing
  and never stores the walker's spot.
- `events()` is what Tower 3D's machines did: the last 200 events its loops handled (`seeing`, `hiring`, `spawning`,
  `statsPolling` in `main.ts`, `archives` in `archive.ts`), each with the effects its handler returned and `at`, the
  simulated clock, kept by [`eventRecord`](ref:hub/renderers/tower3d/src/record.ts#eventRecord) through each loop's
  `subscribe` ([[machines]]), so an effect a handler forgot (a draw) shows as missing. The record keeps references and
  makes them plain only when read ([`plain`](ref:hub/renderers/tower3d/src/record.ts#plain)): a Set, Map, Date or
  three.js object comes through `drive --eval`'s JSON as a tagged object (`{ $set: [...] }`, `{ $three: type, name }`)
  rather than `{}`. Each record is numbered, and `events(n)` answers only those after `n`: a `seeing` state carries the
  whole board, so a reader stepping through a walk asks for what is new. `main.ts` builds the record and hands its read
  to the door through the `Engine`, so no module imports another for it.
- `?board=<name>` renders a fabricated board, one of [`FIXTURES`](ref:hub/scripts/tower3d-fixtures.ts#FIXTURES),
  a list of boards delivered one by one through `advance`, so what happens between boards can be recorded. Scenarios
  state facts; callsign, the worker's lifecycle ([`lifeOf`](ref:hub/src/bridge/life.ts#lifeOf)), its crew
  ([`withReports`](ref:hub/src/bridge/board.ts#withReports)) and verbs come from the bridge's own functions, run by
  `npm run tower3d:fixtures`, which writes each fixture as data
  ([`FixtureFile`](ref:hub/renderers/tower3d/src/fixture-file.ts#FixtureFile), `renderers/tower3d/fixtures/<name>.json`)
  with the instant it was built at. A [test](ref:hub/test/tower3d-fixtures.test.ts) fails when the committed files
  differ from what the script writes, so a change to what the bridge derives regenerates them, and a fixture draws
  what the board would while the page reaches nothing in `src/`. The page fetches the file only on a fixture page
  ([`fixtureBoards`](ref:hub/renderers/tower3d/src/fixtures.ts#fixtureBoards)), and its wall clock is the fixture's
  instant ([`clock.ts`](ref:hub/renderers/tower3d/src/clock.ts)): an `?at` naming another is refused. Fixtures are
  built in UTC, and frames, the tour and the boot check open Chrome in UTC, so every machine draws the same hour. A
  fixture's screens open no streams: there is no host behind it, and replies landing
  between steps would make frames differ.
- The tools around it ([[tower3d]]): `npm run drive` (headless Chrome, page errors collected), `npm run sandbox`,
  `npm run tool:frames` (two fixed scenarios compared byte for byte; it refuses one that does not repeat, and keeps
  both walks to diff), model names as data checked against every `.glb` by `npm test`, and in CI
  `npm run test:tower3d-boot`, the built bundle booted on a fixture board through `ready()` with no page error.
- Frames' two scenarios. The walk ([`frames.scenario.js`](ref:hub/scripts/frames.scenario.js)) crosses the building on
  every fixture board, each stage's state and scene PNG. The panel routes
  ([`frames.panels.js`](ref:hub/scripts/frames.panels.js)) run on the boards that reach them (busy, logbook, review):
  each kind of panel opened the way a user does, worked and closed, each route starting from walking with nothing
  open. A stage keeps the door's state, a hash of each panel shown (its markup normalized to tags, kept attributes,
  text and input values, written beside the recording to diff) and the events Tower 3D's loops handled since the stage
  before, as `<loop>:<event>→<effects>`, so a panel that draws differently or a machine that does something else shows
  as such. What the real clock decides is left out: toasts, which leave on a timer, and a read's `data-since`.
  Handing a note to a desk reaches the sandbox's API, which knows no fixture session and refuses it, so that route
  records the note still carried and puts it back.

**Alternatives considered.**
- Keep driving real input over CDP: fragile and slow.
- A debug grab-bag on `window`: unstructured, and it exposes internals rather than verbs.
- Boards recorded from the real system: real shapes, but client prompts and paths would land in git and a
  scrubber would have to follow every new text field.

**Impact.** Two loads with one seed, clock and steps give identical pixels, in a Chrome that draws its 2D canvases
in software: rasterized on the GPU, a canvas's text now and then lands a glyph's edge a few pixels apart from one load
to the next, so frames opens Chrome with `--disable-accelerated-2d-canvas`.
