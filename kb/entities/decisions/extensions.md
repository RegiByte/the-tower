---
{
  "type": "decision",
  "name": "Extensions: a manifest that declares, code that implements, resolved before anything runs",
  "summary": "An extension is a folder holding extension.json and optionally a server module whose default export is start; it provides one capability, and the core is the capability tower at API_VERSION. The tower reads every manifest strictly, resolves them into an acyclic, fully met graph (refusing and skipping what can't load, each with a problem), starts the rest as braided resources x:<cap> beside the core's, reconciles them when the config changes, and shows every extension on the board, at GET /extensions, in tower extensions and in tower doctor. An extension's verbs and reads are dispatched by qualified name through the one dispatch, with a caller on every call, at POST and GET /<cap>/…, through ctx.call, ctx.read and ctx.deps, and with tower x.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-22",
  "reviewed": "2026-10-24",
  "refs": ["hub/src/shared/extensions.ts#Manifest", "hub/src/shared/extensions.ts#RESERVED", "hub/src/shared/extensions.ts#BUNDLED", "hub/src/shared/extensions.ts#LEGACY", "hub/src/shared/extensions.ts#StartCtx", "hub/src/shared/extensions.ts#CTX_SINCE", "hub/src/shared/extensions.ts#ExtensionView", "hub/src/shared/extensions.ts#Caller", "hub/src/shared/extensions.ts#qualifiedOf", "hub/src/shared/extensions.ts#tooDeep", "hub/src/bridge/extensions.ts#compileCalls", "hub/src/tower/calls.ts#extensionCalls", "hub/src/tower/dispatch.ts#call", "hub/src/tower/http.ts#callerOf", "hub/src/tower/http.ts#deprecate", "hub/src/tower/http.ts#read", "hub/src/directory.ts#extensionVerbLines", "hub/test/fixtures/extensions/chime/extension.json", "hub/src/bridge/extensions.ts#resolve", "hub/src/bridge/extensions.ts#registry", "hub/src/bridge/stores.ts#offOn", "hub/src/extensions.ts#discover", "hub/src/tower/extensions.ts#runExtensions", "hub/src/tower/extensions.ts#startExtension", "hub/src/tower/extensions.ts#hashOf", "hub/src/tower/extensions.ts#extensions", "hub/src/config-check.ts#floorExtensions", "hub/src/shared/extension-words.ts", "hub/src/doctor.ts#extensionVerdicts", "hub/test/extensions.test.ts", "hub/test/fixtures/extensions/pulse/extension.json", "hub/docs/config.md", "hub/src/bridge/stores.ts#floorCollections", "hub/src/bridge/stores.ts#ownedRefusal", "hub/src/bridge/stores.ts#sessionFacts", "hub/src/tower/stores.ts#storesOf", "hub/src/system.ts#foldOn"]
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
  `start(ctx)`. What `start` returns must match what the manifest declares, no more and no fewer (`mismatch`): a handler
  for each of its verbs and reads, a `parse` or `reduce` only for a collection or stream it declares, and `halt`. The manifest is strict: an unknown key refuses the extension, `$schema` and `meta`
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
  `core:system`, `core:publisher`, `core:dispatch`, `core:http` and `core:extensions` and its requires' providers, its
  wants' optional ([[spine]]). Its start imports the server module afresh for its hash, builds ctx
  ([`StartCtx`](ref:hub/src/shared/extensions.ts#StartCtx): who it is, its settings and a floor's, whether it is on
  there, timers, a log, a signal, the board, and its calls), and fails past 10 s; its halt calls the extension's, then clears the
  timers and aborts the signal ([`startExtension`](ref:hub/src/tower/extensions.ts#startExtension)). A failed start
  fails that extension alone and skips what requires it.
- **Verbs and reads, by qualified name.** A manifest's `verbs` (`input`, `reply`, `scope`, `words`, `deprecated`) and
  `reads` (by path, `beats/<project>`: `query`, `reply`, `scope`) have their schemas turned into zod at resolve, so an
  extension's input is parsed as the core's is; the loader refuses a schema it can't read, a project-scoped verb whose
  input doesn't require `project`, a project-scoped read naming no floor, a verb named `read`, and a name both a verb
  and a read ([`compileCalls`](ref:hub/src/bridge/extensions.ts#compileCalls)). Every name another extension addresses
  is qualified, the core's as `tower/<verb>` ([`qualifiedOf`](ref:hub/src/shared/extensions.ts#qualifiedOf)), and
  [`call`](ref:hub/src/tower/dispatch.ts#call) is the one dispatch for both: `POST /<cap>/<verb>` and `GET
  /<cap>/<read>` reach the provider looked up at call time ([`extensionCalls`](ref:hub/src/tower/calls.ts#extensionCalls)),
  `unavailable` while it starts, restarts or doesn't run, `refused` on a floor where it is off, its reply checked
  against its schema. A throw or a reply off its schema answers `internal` naming the extension, and lists a `threw`
  or `shape` problem on it; a handler answers an `ApiError` to refuse. `/schema` lists each running extension's verbs
  and reads beside the core's, and `ExtensionView.verbs` each verb in words.
- **ctx calls what it declares.** `ctx.call` and `ctx.read` take qualified names and reach the core, the extension
  itself, and the capabilities it requires or wants (`refused`, "declare requires.X", otherwise); a core read is served
  as over HTTP and taken back as its JSON ([`read`](ref:hub/src/tower/http.ts#read)). `ctx.deps.<cap>` holds one
  function per verb and per read of each declared provider's manifest, `undefined` while a wanted one is missing, which
  `GET /extensions` notes on the extension (an `info` problem, `unmet` at `wants.<cap>`).
- **A caller on every call.** [`Caller`](ref:hub/src/shared/extensions.ts#Caller) is `{t, id?, via, within}`. Over
  HTTP it is what the CLI's headers claim ([`callerOf`](ref:hub/src/tower/http.ts#callerOf): `tower-session` names a
  worker, none is the user), not authenticated; the API's `by` fields stay as they were. A call made inside any
  handler keeps that handler's caller and appends its verb to `within`; only an extension's own `start` and timers
  call as `{t: 'extension'}`, the policies' runner as `{t: 'tower', id: 'slot'}`. A call nested more than 8 deep is
  `refused`, its chain named ([`tooDeep`](ref:hub/src/shared/extensions.ts#tooDeep)). A composite that does what
  another verb does calls it through the dispatch: `policy/run` spawns through `tower/spawn` with `within:
  ['tower/policy/run']`, and a hire is a `tower/spawn` call already.
- **Deprecation counts against the user of a name.** A deprecated verb or read answers HTTP with RFC 9745's
  `Deprecation` (`@0`: a manifest names the version, not a date) and a `Link` to its `use`
  ([`deprecate`](ref:hub/src/tower/http.ts#deprecate)); an extension that calls one gets a `deprecated` warning.
- **`tower x`.** Every word after `tower` stays the core's; `tower x <cap> <verb> [input]` calls an extension's verb,
  and `tower x` alone lists every running one's verbs in their words
  ([`extensionVerbLines`](ref:hub/src/directory.ts#extensionVerbLines)).
- **Reconciled on config change.** [`runExtensions`](ref:hub/src/tower/extensions.ts#runExtensions) resolves again
  when the config changes and hands braided's `reconcileSystem` the next resources, each memoized by a
  [hash](ref:hub/src/tower/extensions.ts#hashOf) of its id, manifest, settings, files and dependencies: what the edit
  leaves unchanged keeps running, a changed one restarts with its dependents, and the board is published again. A
  restart imports the server module afresh, and only it: the modules it imports stay as Node first loaded them, so an
  edit to one of those needs the tower restarted.
- **Off by capability, per floor, derived.** `extensions.<id>.off` turns one off everywhere;
  `projects.<p>.capabilities.<cap>.off` turns a capability off on a floor, and with it every extension whose chain of
  requires holds it ([`offOn`](ref:hub/src/bridge/stores.ts#offOn)). Per-floor off is a filter, never a restart,
  and `capabilities.tower` is refused. Settings are keyed by id, a floor's shallow-merged over the system's
  ([`floorExtensions`](ref:hub/src/config-check.ts#floorExtensions) checks both against the manifest).
- **Seen everywhere.** The [`registry`](ref:hub/src/bridge/extensions.ts#registry), derived from what was resolved
  and how each start went, is the one reference the mechanism adds, held by `core:extensions`
  ([`extensions`](ref:hub/src/tower/extensions.ts#extensions)) and recomputed after each reconcile. It is
  `board.extensions` ([`ExtensionView`](ref:hub/src/shared/extensions.ts#ExtensionView), bundled first, then by id),
  `GET /extensions` with braided's topology, `tower extensions`, and `tower doctor`'s lines, each with a fix
  ([`extensionVerdicts`](ref:hub/src/doctor.ts#extensionVerdicts)); the tower page draws it beside the probes.
- **Stores (1.83).** A manifest declares `collections`, `streams` and session `facts`, each named by its capability:
  a collection `<cap>` or `<cap>.<name>`, a stream at `streams/{system|projects/<p>}/<cap>.<name>/`, a fact
  `tower.x.<cap>.<name>`. The loader refuses a collection named apart from its capability, an owned one without all
  five doors, a door that names no verb or read of its owner's manifest, a deprecated one, another capability's, or
  anything of the core's but a read (`tower/board`, `tower/collection/<project>/<collection>/<item>`), a stream
  fact code that is not one letter, and any schema the tower can't read. An accepted extension's collections join
  the floors it is on ([`floorCollections`](ref:hub/src/bridge/stores.ts#floorCollections), [[collections]]); an
  owned one refuses the generic writes, naming its create door
  ([`ownedRefusal`](ref:hub/src/bridge/stores.ts#ownedRefusal)). A stream is always its extension's: only its ctx
  appends, each fact checked by its code's schema. ctx gains `streams` (append, read over a window), `facts` (logged
  through the host's `fact`, [[let-go]]), `collections` (its own, on floors where it is on) and `own`
  ([`storesOf`](ref:hub/src/tower/stores.ts#storesOf)): each `reduce` folded by [[live-system]] as its stream grows,
  only new facts stepped ([`foldOn`](ref:hub/src/system.ts#foldOn)), each `parse` cached by the item's version, and a
  session's facts over its lineage as `SessionFact`s ([`sessionFacts`](ref:hub/src/bridge/stores.ts#sessionFacts)),
  all frozen. The spec gives folds `own` alone; handlers need the same state (a read answering from its stream), so
  ctx carries the accessors, and the folds' `FoldCtx.own` is built from them, never a second fold.
- **Held by the contract test.** `test/served-exports.json` lists the manifest's key paths, each lane's ctx members
  ([`CTX_SINCE`](ref:hub/src/shared/extensions.ts#CTX_SINCE)) and the core's problem codes and names, so removing one
  without a major fails `npm test` ([[renderer-api-contract]]).

Load, resolve, start and see arrived first (1.81), verbs and reads next (1.82), then stores (1.83). Folds and contributions,
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
- *`ctx.call` reaching any capability*: an undeclared dependency would escape ordering, version checks and the
  `skipped` closure.
- *A caller that becomes the extension inside its handler*: a worker could launder a call past a guard through any
  extension verb; the caller stays whoever started the chain.
- *Core reads rewritten to return values for `ctx.read`*: every read would change for one caller; serving one into a
  response that collects its body reuses them as they are.
- *A process per extension*: isolation at the cost of every lane crossing a process boundary; same-user code is
  trusted, and the guards catch mistakes, not malice.

**Impact.** API 1.81: `board.extensions`, `GET /extensions` listing them, the `extension` schema, and three config
keys (`extensions`, a floor's `extensions` and `capabilities`). API 1.82: the manifest's `verbs` and `reads`,
`ExtensionView.verbs`, `POST` and `GET /<cap>/…`, `ctx.call`, `ctx.read`, `ctx.deps` and the caller, and `tower x`. API 1.83: the manifest's `collections`, `streams` and `facts`, ctx's `streams`, `facts`,
`collections` and `own`, and a floor collection's `owner` and `doors` on the board.
No host change. No extension ships yet: the bundled
ones move in one at a time.
