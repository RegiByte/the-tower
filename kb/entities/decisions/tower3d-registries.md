---
{
  "type": "decision",
  "name": "Tower 3D's shell is a state record, keyed layers, act tables and ticks",
  "summary": "Tower 3D's mutable state lives with its owners, the view state not yet in the app's db in one record (state.ts); desks, walls and guests are keyed layers reconciled against the plan; what each act kind offers and does are tables keyed by kind; a frame is an ordered list of ticks; the door drives a typed Engine.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-11-17",
  "refs": ["hub/renderers/tower3d/src/state.ts", "hub/renderers/tower3d/src/layers.ts#reconcile", "hub/renderers/tower3d/src/acts.ts#byKind", "hub/renderers/tower3d/src/panels.ts", "hub/renderers/tower3d/src/stage.ts#startStage", "hub/renderers/tower3d/src/door.ts#installDoor"]
}
---
**Problem.** A renderer that grows a thing at a time (a layer of things drawn per board, a kind of thing to aim at, a
per-frame job) repeats itself: near-identical keep/make/remove loops, act kinds dispatched by `if` chains in two
places (offers, run), one long `update`, state scattered in module-level `let`s, and a door ([[tower3d-door]]) that
must be handed every closure.

**Why.** "Mods emerge, then freeze": extract the patterns that already exist, build on them, and only then name the
shape of a mod. These shapes extract; they are not a plugin API.

**How.**
- **One state record** ([`state.ts`](ref:hub/renderers/tower3d/src/state.ts)): what the page
  has chosen and not yet put in the app's db, such as the door's mode and the note in your hand; the building as built, its level roots, its counts,
  its keyed layers' maps and the workers on their way are the world's cells ([[tower3d-system]]); the simulated clock and the walker, written from several resources, are leaf resources
  every reader is handed (`sim`, `walker`, [[tower3d-system]]); a cell one resource alone writes stays in its start (the frames'
  meter and landing doors, the panels' open draft, the HUD's new-action dots); what the page has decided (the panel, the view, a ride,
  a flight, a cut, a pet, what is aimed at and held, whether walking has the mouse) is the app loop's db
  ([[tower3d-system]]). Modules
  read and write `s.field`, so every write is greppable. Render memos and derived caches stay beside the function
  that uses them.
- **Keyed layers** ([`reconcile`](ref:hub/renderers/tower3d/src/layers.ts#reconcile)): a layer says which slots
  the plan wants by key, which level each stands on (its item hangs on that level's root, [[tower3d-levels]]), how
  to make an item, whether a kept item still fits (desks re-dress, walls compare their content key), and what
  happens as one leaves (a desk's worker walks out). Every layer is an export of `layers.ts`.
- **Act tables** ([`byKind`](ref:hub/renderers/tower3d/src/acts.ts#byKind)): `ByKind<R, Args>` maps every
  `Act['kind']` to a function given its own kind. `OFFERS` (pure, in `acts.ts`) and `RUN` (the shell, in
  `panels.ts`) are both total, so a new kind fails the typecheck until it has both. The building's own verbs
  (`next`, `overview`, `stop`) run before the table.
- **Ticks**: a frame is `TICKS`, an ordered list of functions over one `Frame` (`dt`, `t`, the turn taken).
- **The door out** ([`installDoor`](ref:hub/renderers/tower3d/src/door.ts#installDoor)): it reads the record and
  drives an `Engine`, the functions the page's own input and frames call. The three.js setup is the stage resource
  ([`startStage`](ref:hub/renderers/tower3d/src/stage.ts#startStage), [[tower3d-system]]), which layers and the door
  read the scene and camera from.

A refactor of these shapes is checked with `npm run tool:frames` ([[tower3d-door]]), expecting identical frames.

**Alternatives considered.**
- State passed explicitly to every function: more functional on paper, but every call site and handler changes
  and the shell stays imperative (three.js objects, the DOM).
- A full split by concern (navigation, panels, aim in their own modules): a cleaner end state, but cycles between
  panels and navigation to untangle first. `RUN` stayed in one module for the same reason: its entries call
  navigation and panels. Superseded by [[tower3d-system]], which carried a split out by resource, wired as data, with
  no import cycles allowed: `RUN` is the panels resource's, and calls navigation, started before it.

**Impact.** Adding a layer, an act kind or a tick is one entry each; the page around them is split by resource
([[tower3d-system]]).
