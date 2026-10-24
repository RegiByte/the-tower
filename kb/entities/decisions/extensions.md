---
{
  "type": "decision",
  "name": "Extensions: a manifest that declares, code that implements, resolved before anything runs",
  "summary": "An extension is a folder holding extension.json and optionally a server module whose default export is start; it provides one capability, and the core is the capability tower at API_VERSION. The tower reads every manifest strictly, resolves them into an acyclic, fully met graph (refusing and skipping what can't load, each with a problem), starts the rest as braided resources x:<cap> beside the core's, reconciles them when the config changes, and shows every extension on the board, at GET /extensions, in tower extensions and in tower doctor.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-22",
  "reviewed": "2026-10-24",
  "refs": ["hub/src/shared/extensions.ts#Manifest", "hub/src/shared/extensions.ts#RESERVED", "hub/src/shared/extensions.ts#BUNDLED", "hub/src/shared/extensions.ts#LEGACY", "hub/src/shared/extensions.ts#StartCtx", "hub/src/shared/extensions.ts#CTX_SINCE", "hub/src/shared/extensions.ts#ExtensionView", "hub/src/bridge/extensions.ts#resolve", "hub/src/bridge/extensions.ts#registry", "hub/src/bridge/extensions.ts#offOn", "hub/src/extensions.ts#discover", "hub/src/tower/extensions.ts#runExtensions", "hub/src/tower/extensions.ts#startExtension", "hub/src/tower/extensions.ts#hashOf", "hub/src/tower/extensions.ts#extensions", "hub/src/config-check.ts#floorExtensions", "hub/src/shared/extension-words.ts", "hub/src/doctor.ts#extensionVerdicts", "hub/test/extensions.test.ts", "hub/test/fixtures/extensions/pulse/extension.json", "hub/docs/config.md"]
}
---
**Problem.** Users want features of their own that a renderer can't hold: work the tower does on its own, data it keeps
and folds, verbs other clients call. Without a mechanism, each such ask becomes a change to the core, and the core
grows by every user's want. A mechanism that runs arbitrary code at startup, on the other hand, lets one broken folder
stop the tower, and lets code widen its contract at runtime where no dependent can see it.

**Why.** The tower's principles ask for the Emacs shape: the system extended through its own libraries and points of
contact, with the core holding no capability a sibling couldn't reach. That needs a contract that can be read, checked
and versioned without running anything, and a runtime where an extension's failure costs only that extension.

**How.**

- **The manifest declares, the code implements.** A folder holds `extension.json`, parsed by
  [`Manifest`](ref:hub/src/shared/extensions.ts#Manifest), and optionally a `server` module whose default export is
  `start(ctx)`. What `start` returns must match what the manifest declares, no more and no fewer (`mismatch`); with no
  lanes yet, that is `halt` alone. The manifest is strict: an unknown key refuses the extension, `$schema` and `meta`
  are free, and `views` and `regions` are validated against their reserved shapes and not read (`not-yet`). Every key
  carries the minor it arrived in (`x-since`), so a key newer than the manifest's `requires.tower` is
  `under-declared`, and later keys arrive as API minors. `/schema` serves the manifest as `extension`.
- **One capability per extension.** `provides` defaults to `id`; everything an extension shows others is named by its
  capability, so a replacement providing the same capability takes over its names. Names are lowercase words joined by
  single dashes, never the core's ([`RESERVED`](ref:hub/src/shared/extensions.ts#RESERVED)), and a bundled
  capability's id is the bundled extension's ([`BUNDLED`](ref:hub/src/shared/extensions.ts#BUNDLED)): a user replaces
  one by providing it on purpose. [`LEGACY`](ref:hub/src/shared/extensions.ts#LEGACY), the built-ins' old names as
  they move into extensions, is empty until the first moves.
- **One version for renderers and extensions.** The core is the capability `tower` at `API_VERSION`, and
  `requires.tower` is mandatory. `requires.X: "M.m"` is met at major M, minor m or newer.
- **Resolve, then start.** [`discover`](ref:hub/src/extensions.ts#discover) reads the checkout's `extensions/<id>/`
  and the config's `extensions` by `path`. [`resolve`](ref:hub/src/bridge/extensions.ts#resolve), pure, refuses what
  can't load, each with a problem at its path: `invalid` (the manifest, the config's entry, settings by the manifest's
  schema through `z.fromJSONSchema`), `too-new` and `too-old` read before any other key, `conflict` (a bundled
  provider is kept and a user's refused; two users' are both refused), `unmet`, `cycle` over requires and wants, and
  `skipped` for whatever requires something refused, until nothing changes. Only an acyclic, fully met graph reaches
  braided, whose sort would otherwise throw for the whole system.
- **Resources beside the core.** Each accepted extension is a braided resource `x:<cap>` after `core:config`,
  `core:system`, `core:publisher` and `core:dispatch` and its requires' providers, its wants' optional
  ([[spine]]). Its start imports the server module afresh for its hash, builds ctx
  ([`StartCtx`](ref:hub/src/shared/extensions.ts#StartCtx): who it is, its settings and a floor's, whether it is on
  there, timers, a log, a signal and the board), and fails past 10 s; its halt calls the extension's, then clears the
  timers and aborts the signal ([`startExtension`](ref:hub/src/tower/extensions.ts#startExtension)). A failed start
  fails that extension alone and skips what requires it.
- **Reconciled on config change.** [`runExtensions`](ref:hub/src/tower/extensions.ts#runExtensions) resolves again
  when the config changes and hands braided's `reconcileSystem` the next resources, each memoized by a
  [hash](ref:hub/src/tower/extensions.ts#hashOf) of its id, manifest, settings, files and dependencies: what the edit
  leaves unchanged keeps running, a changed one restarts with its dependents. Code edits are picked up by the next
  restart of that extension.
- **Off by capability, per floor, derived.** `extensions.<id>.off` turns one off everywhere;
  `projects.<p>.capabilities.<cap>.off` turns a capability off on a floor, and with it every extension whose chain of
  requires holds it ([`offOn`](ref:hub/src/bridge/extensions.ts#offOn)). Per-floor off is a filter, never a restart,
  and `capabilities.tower` is refused. Settings are keyed by id, a floor's shallow-merged over the system's
  ([`floorExtensions`](ref:hub/src/config-check.ts#floorExtensions) checks both against the manifest).
- **Seen everywhere.** The [`registry`](ref:hub/src/bridge/extensions.ts#registry), derived from what was resolved
  and how each start went, is the one reference the mechanism adds, held by `core:extensions`
  ([`extensions`](ref:hub/src/tower/extensions.ts#extensions)) and recomputed after each reconcile. It is
  `board.extensions` ([`ExtensionView`](ref:hub/src/shared/extensions.ts#ExtensionView), bundled first, then by id),
  `GET /extensions` with braided's topology, `tower extensions`, and `tower doctor`'s lines, each with a fix
  ([`extensionVerdicts`](ref:hub/src/doctor.ts#extensionVerdicts)); the tower page draws it beside the probes.
- **Held by the contract test.** `test/served-exports.json` lists the manifest's key paths, each lane's ctx members
  ([`CTX_SINCE`](ref:hub/src/shared/extensions.ts#CTX_SINCE)) and the core's problem codes and names, so removing one
  without a major fails `npm test` ([[renderer-api-contract]]).

This is the mechanism's first lane: load, resolve, start, see. Verbs and reads, folds and contributions, stores,
middleware and hooks, triggers, launch contributors and the bundled extensions arrive as additions to the manifest and
ctx, each an API minor.

**Alternatives considered.**

- *Contributions declared only by code*: an extension's contract would be readable only by running it, and could grow
  at runtime. The manifest is JSON, so it can't hold zod; its schemas are JSON Schema, which the tower turns into zod.
- *Unknown keys ignored with a warning*: a manifest written for a newer tower would run half its features, and a key
  that is a constraint would fail open.
- *A version for extensions apart from the API's*: it would move at nearly every API major anyway.
- *Stores and names keyed by id*: a replacement would start empty and answer under another name.
- *Starting extensions straight in braided*: one bad manifest (a cycle, a missing dependency) would stop the tower.
- *Restarting on file change*: every save restarts a live extension and its dependents; a watch mode can come later.
- *A process per extension*: isolation at the cost of every lane crossing a process boundary; same-user code is
  trusted, and the guards catch mistakes, not malice.

**Impact.** API 1.81: `board.extensions`, `GET /extensions` listing them, the `extension` schema, and three config
keys (`extensions`, a floor's `extensions` and `capabilities`). No host change. No extension ships yet: the bundled
ones move in one at a time.
