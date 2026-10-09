---
{
  "type": "decision",
  "name": "Tower 3D's shell is a state record, keyed layers, act tables and ticks",
  "summary": "Tower 3D's mutable state lives in one record (state.ts); desks, walls and guests are keyed layers reconciled against the plan; what each act kind offers and does are tables keyed by kind; a frame is an ordered list of ticks; the door drives a typed Engine.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-09",
  "refs": ["hub/renderers/tower3d/src/state.ts", "hub/renderers/tower3d/src/layers.ts#reconcile", "hub/renderers/tower3d/src/acts.ts#byKind", "hub/renderers/tower3d/src/main.ts", "hub/renderers/tower3d/src/stage.ts", "hub/renderers/tower3d/src/door.ts#installDoor"]
}
---
**Problem.** `main.ts` held about 45 module-level `let`s and did everything: three near-identical keep/make/remove
loops for desks, walls and guests; act kinds dispatched by `if` chains in two places (offers, run); one long
`update` doing every per-frame job inline. Roadmap phase 2 adds a drafts wall, workstations and carrying: more
layers, more act kinds, more ticks, each landing in the same file by hand, and the door's implementation could
not leave `main.ts` without being handed a dozen closures.

**Why.** "Mods emerge, then freeze": extract the patterns that already exist, build three systems on them, and only
then name the shape of a mod. This cut extracts; it does not design a plugin API.

**How.**
- **One state record** ([`state.ts`](ref:hub/renderers/tower3d/src/state.ts)): the board and plan, the layers'
  maps, the walker, view, ride, flight, cut, panel, aim and hold, the door's capture, the clock and the meter, and
  what the tower keeps for the page. Modules read and write `s.field`, so every write is greppable. Render memos
  (the HUD's and prompt's last HTML) and derived caches (screens and colliders on your level, memoized by plan
  and level) stay beside the function that uses them.
- **Keyed layers** ([`reconcile`](ref:hub/renderers/tower3d/src/layers.ts#reconcile)): a layer says which slots
  the plan wants by key, which level each stands on (its item hangs on that level's root, [[tower3d-levels]]), how to make an item, whether a kept item still fits (desks re-dress, walls compare
  their content key), and what happens as one leaves (a desk's worker walks out). `DESKS`, `STATIONS`, `NOTES`, `CABINETS`, `GALLERY`, `WALLS`, `RUNNING`, `PIGEONHOLES`,
  `FILINGS`, `GUESTS`, `DANCE`.
- **Act tables** ([`byKind`](ref:hub/renderers/tower3d/src/acts.ts#byKind)): `ByKind<R, Args>` maps every
  `Act['kind']` to a function given its own kind. `OFFERS` (pure, in `acts.ts`) and `RUN` (the shell, in
  `main.ts`) are both total, so a new kind fails the typecheck until it has both. The building's own verbs
  (`next`, `overview`, `stop`) run before the table.
- **Ticks**: a frame is `TICKS`, an ordered list over one `Frame` (`dt`, `t`, the turn taken): cut, ride,
  pet, walker (and the hands it moves), doors, camera, aim, hold, people, filings, gallery, films, party, lamps, ring,
  compass, traffic (the city's cars and plane, a pure function of sim time).
- **The door out** ([`installDoor`](ref:hub/renderers/tower3d/src/door.ts#installDoor)): it reads the record and
  drives an `Engine`, the functions the page's own input and frames call. The three.js setup moved to
  [`stage.ts`](ref:hub/renderers/tower3d/src/stage.ts) so layers and the door import the scene and camera.

**Checked.** Before the cut, a scripted walk through the door (walk, teleport, a level cut, next waiting, a tile
opened, a desk's brief, the overview, the roof, the directory) recorded `state()` and `shot()` at 17 stages on
`busy`, `empty` and `tall` with `?seed=1&stepped&at=…`; two runs matched. After the cut, all 51 states and PNGs
matched byte for byte. Dropping one tick as a negative control changed 9 of them. That walk is now
`npm run tool:frames`, for the next refactor. Fixtures are static, so a live
sandbox run checked a changing board: spawn makes a desk whose worker walks in, kill removes it, its worker
walks out and joins the roof's guests.

**Alternatives considered.**
- State passed explicitly to every function: more functional on paper, but every call site and handler changes
  and the shell stays imperative (three.js objects, the DOM).
- A full split by concern (navigation, panels, aim in their own modules): a cleaner end state, but cycles between
  panels and navigation to untangle before phase 2 shows which seams it needs. `RUN` stays in `main.ts` for the
  same reason: its entries call navigation and panels.

**Impact.** `main.ts` keeps boot, the board, navigation, panels and input; adding a layer, an act kind or a tick
is one entry each. Phase 2's systems are the second and third users of these shapes.
