---
{
  "type": "decision",
  "name": "Tower 3D has a door for agents",
  "summary": "Tower 3D exposes a typed window.tower3d surface (state, teleport, aimAt, press, key, drive, step, shot) over an intent-driven input layer and a steppable, seeded clock, and renders fabricated boards in place of the live one, so agents test it deterministically.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-09",
  "refs": ["hub/renderers/tower3d/src/door.ts", "hub/renderers/tower3d/src/input.ts", "hub/renderers/tower3d/src/random.ts", "hub/renderers/tower3d/src/clock.ts", "hub/renderers/tower3d/src/walker.ts", "hub/renderers/tower3d/src/main.ts", "hub/renderers/tower3d/src/fixtures.ts#fixtureBoards", "hub/renderers/tower3d/src/contract.ts#CONTRACT", "hub/scripts/drive.ts", "hub/scripts/sandbox.ts", "hub/scripts/frames.ts", "hub/test/models.test.ts"]
}
---
**Problem.** Agents build Tower 3D entirely, and tested it by brute force: stubbing pointer lock, dispatching
synthetic mouse moves, priming dropped keys, seeding localStorage to place the walker, wrapping fetch, and
timing screenshots of animations.

**Why.** The project is built by agents; what they cannot check, they build slowly. Asset work (models,
materials, layouts) needs repeatable views more than anything, and the coming cut of `main.ts` into registries
needs a before/after it can be checked against.

**How.**
- Input is intents: a move held and a turn taken per frame (`input.ts`). Keyboard and mouse produce them, and the
  door injects the same. `capture()` stands in for pointer lock and follows every lock and unlock as the lock
  would. Building keys go through one `onKey`, which the door's `key()` calls.
- The frame is `update(dt)` then `render()` over a simulated clock that holds, flights, the fade between floors
  and every animation read. `step(n)` stops it and runs n frames; `?stepped` starts it stopped. One seeded
  `random` (`?seed=`) replaces `Math.random` wherever chance reaches a frame (music keeps its own). `?at=<ISO
  time>` pins the wall clock (`clock.ts`): the sky's hour, today's guests, fixture times and the panels' "ago"
  labels read it, so repeats hold on any day, not only within the same minute.
- `window.tower3d` is typed and always present: `ready`, `capture`/`release`, `teleport`, `acts` (every thing of a kind that is drawn on its level, as it is aimed at), `locate` (where a thing
  stands, to teleport within its reach), `aimAt` (turns to the
  thing and answers what the crosshair now picks), all three over the world as the next frame draws it (its levels
  shown or hidden, every object where it stands), so `locate`, `teleport`, `aimAt` holds with no frame between them (guests and cats are placed by a frame's ticks, so on a stepped clock both refuse one until a step follows the latest board), `press(verb, {hold})` (refuses verbs not offered, and a held
  verb without a hold), `key`, `drive`, `step`/`play`, `advance` (a fixture's next board), `pictured` (every picture being read is painted, a later board's too), `state` (frame times, what the last frame drew, counters for boards and rebuilds) and
  `shot`. The door plays no music and never stores the walker's spot.
- `?board=<name>` renders a fabricated board (`busy`, `empty`, `tall`, `party`, `review`, `attention`), a list of boards delivered one by one
  through `advance`, so what happens between boards can be recorded. Scenarios state facts; callsign,
  attention, liveness, verbs and on-duty come from the bridge's own functions, so a contract change breaks the
  build. A fixture's monitors open no streams: there is no host behind it, and replies landing between steps
  made frames differ.
- `npm run drive` is a headless Chrome driver (fresh profile, free port, page errors printed, steps in order);
  `npm run sandbox -- up | down` a throwaway system with a tower on port 4399. Model names the renderer reads
  are data (`contract.ts`), checked against every `.glb` by `npm test`; `lab.html` shows one model with its draw
  calls and names. `npm run tool:frames` (`record <label>`, `compare <a> <b>`) walks a fixed scenario through the
  door on every fixture board and compares each stage's state and PNG byte for byte; it refuses a scenario that
  does not repeat.

**Alternatives considered.**
- Keep driving real input over CDP: fragile and slow.
- A debug grab-bag on `window`, as agent-office has: unstructured, and it exposes internals rather than verbs.
- Boards recorded from the real system: real shapes, but client prompts and paths would land in git and a
  scrubber would have to follow every new text field.

**Impact.** `main.ts` takes intents and steps a clock, and its state can be read from outside. Two loads with one
seed, clock and steps give identical pixels, which is how the registries cut ([[tower3d-registries]]) was checked
frame for frame.
