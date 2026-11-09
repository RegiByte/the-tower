---
{
  "type": "decision",
  "name": "Extensions: a manifest that declares, code that implements, resolved before anything runs",
  "summary": "An extension is a folder holding extension.json, a strict manifest declaring one capability, and optionally a server module that implements it; the tower resolves every manifest into an acyclic, fully met graph before anything runs, so the core grows by extensions rather than by every want and one broken extension costs only itself.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-22",
  "reviewed": "2026-11-09",
  "refs": ["hub/src/shared/extensions.ts#Manifest", "hub/src/shared/extensions.ts#RESERVED", "hub/src/shared/extensions.ts#BUNDLED", "hub/src/shared/extensions.ts#LEGACY", "hub/src/bridge/legacy.ts#legacyReviewer", "hub/src/bridge/legacy.ts#LEGACY_ACTIONS", "hub/src/shared/extensions.ts#streamFolder", "hub/src/bridge/legacy.ts#projectLegacy", "hub/src/bridge/legacy.ts#respelled", "hub/src/shared/rate-limits.ts#RateLimitsReading", "hub/src/bridge/rate-limits.ts#readingStreams", "hub/src/shared/extensions.ts#StartCtx", "hub/src/shared/extensions.ts#CTX_SINCE", "hub/src/shared/extensions.ts#ExtensionView", "hub/src/shared/extensions.ts#Caller", "hub/src/shared/extensions.ts#qualifiedOf", "hub/src/shared/extensions.ts#tooDeep", "hub/src/bridge/extensions.ts#compileCalls", "hub/src/tower/calls.ts#extensionCalls", "hub/src/tower/dispatch.ts#call", "hub/src/tower/http.ts#callerOf", "hub/src/tower/http.ts#deprecate", "hub/src/tower/http.ts#read", "hub/src/tower/http.ts#route", "hub/src/bridge/extensions.ts#FILE_SERVED", "hub/src/shared/extensions.ts#matchRead", "hub/test/fixtures/extensions/chime/extension.json", "hub/src/bridge/extensions.ts#resolve", "hub/src/bridge/extensions.ts#registry", "hub/src/bridge/stores.ts#offOn", "hub/src/extensions.ts#discover", "hub/src/tower/extensions.ts#runExtensions", "hub/src/tower/extensions.ts#startExtension", "hub/src/tower/extensions.ts#hashOf", "hub/src/tower/extensions.ts#extensions", "hub/src/config-check.ts#floorExtensions", "hub/src/shared/extension-words.ts", "hub/src/doctor.ts#extensionVerdicts", "hub/test/extensions.test.ts", "hub/test/fixtures/extensions/pulse/extension.json", "hub/docs/config.md", "hub/src/bridge/stores.ts#floorCollections", "hub/src/bridge/stores.ts#ownedRefusal", "hub/src/bridge/stores.ts#sessionFacts", "hub/src/tower/stores.ts#storesOf", "hub/src/system.ts#foldOn", "hub/src/bridge/folds.ts#foldBoard", "hub/src/bridge/folds.ts#checkPart", "hub/src/bridge/extensions.ts#compileFolds", "hub/src/tower/publisher.ts#boardOf", "hub/src/shared/subjects.ts", "hub/src/shared/media.ts#mediaTypeOf", "hub/src/shared/adds.ts#actionsOf", "hub/src/shared/run-command.ts#runCommand", "hub/src/tower/http.ts#clientFile", "hub/src/tower/http.ts#legacyModule", "hub/src/extensions.ts#clientSource", "hub/src/extensions.ts#foundIn", "hub/extensions/drafts/extension.json", "hub/extensions/reviews/extension.json", "hub/src/bridge/checkouts.ts#checkoutState", "hub/test/extension-folders.test.ts", "hub/renderers/page/added.js", "hub/test/folds.test.ts", "hub/src/bridge/extensions.ts#chainOrder", "hub/src/bridge/extensions.ts#targetProblems", "hub/src/tower/chains.ts#chainCalls", "hub/src/tower/chains.ts#hookDeadline", "hub/test/chains.test.ts", "hub/src/shared/api.ts#HOOKS", "hub/src/shared/flows.ts#FLOWS", "hub/src/directory.ts#flowLines", "hub/src/shared/api.ts#COMPOSITES", "hub/test/fixtures/extensions/tally/extension.json", "hub/src/shared/slots.ts", "hub/src/slots.ts#extensionSlots", "hub/src/slots.ts#runSlots", "hub/src/bridge/triggers.ts#triggerBoards", "hub/src/tower/triggers.ts#runBoardTrigger", "hub/src/tower/publisher.ts#publisher", "hub/src/doctor.ts#checkVerdicts", "hub/src/run.ts#runProcess", "hub/src/fresh-imports.ts#importFresh", "hub/src/lent-modules.ts", "hub/examples/extensions/files/package.json", "hub/src/bridge/extensions.ts#mismatchOf", "hub/src/bridge/extensions.ts#contractOf", "hub/src/bridge/extensions.ts#replacementProblem", "hub/src/extension-check.ts#checkFolder", "hub/src/extension-check.ts#freezeFolder", "hub/src/extension-start.ts", "hub/src/shared/launch.ts#CORE_FLAGS", "hub/src/shared/launch.ts#spawnRequest", "hub/src/bridge/launch.ts#mergeParts", "hub/src/bridge/launch.ts#placeable", "hub/src/bridge/launch.ts#forkFacts", "hub/src/bridge/extensions.ts#compileFields", "hub/src/tower/dispatch.ts#contribute", "hub/src/tower/dispatch.ts#spawnFields", "hub/src/tower/dispatch.ts#gate", "hub/src/bridge/board.ts#absentAdds", "hub/src/shared/spawn-form.ts#formFields", "hub/test/launch.test.ts", "hub/test/fixtures/extensions/roles/extension.json", "hub/src/directory.ts#extensionCallLines", "hub/src/bridge/extensions.ts#projectedFold", "hub/examples/extensions/tabline/extension.json", "hub/src/bridge/extensions.ts#guidanceOf", "hub/src/directory.ts#guidanceLines", "hub/src/config-check.ts#guidanceProblems", "hub/src/bridge/extensions.ts#rendererLayoutProblems", "hub/src/bridge/extensions.ts#withRendererLayouts", "hub/examples/extensions/", "hub/src/extensions.ts#newestIn", "hub/src/shared/extensions.ts#ADDS", "hub/src/shared/extensions.ts#LaunchParts", "hub/src/shared/extensions.ts#LegacyEntry", "hub/src/tower/dispatch.ts#tidyProject", "hub/src/tower/dispatch.ts#discardWorktree", "hub/src/bridge/launch.ts#spawnOnly"]
}
---
**Problem.** Users want features of their own that a renderer can't hold: work the tower does on its own, data it keeps
and folds, verbs other clients call. Without a mechanism, each such ask becomes a change to the core, and the core
grows by every user's want. A mechanism that runs arbitrary code at startup, on the other hand, lets one broken folder
stop the tower, and lets code widen its contract at runtime where no dependent can see it.

**Why.** The tower's principles ask for the Emacs shape: the system extended through its own libraries and points of
contact, with the core holding no capability a sibling couldn't reach. That needs a contract that can be read, checked
and versioned without running anything, and a runtime where an extension's failure costs only that extension.
It also sets the order a capability enters by: a capability that can be an extension is one (bundled, or the user's
own), and the core holds what extensions and renderers stand on, so it does not grow with every want. Only what an
extension can't be enters the core, in the order [[renderer-is-disposable]] gives ([[principles]]).

**How.**

- **The manifest declares, the code implements.** A folder holds `extension.json`, parsed by
  [`Manifest`](ref:hub/src/shared/extensions.ts#Manifest), and optionally a `server` module whose default export is
  `start(ctx)`. What `start` returns must match what the manifest declares, no more and no fewer (`mismatch`,
  [`mismatchOf`](ref:hub/src/bridge/extensions.ts#mismatchOf)): a handler for each of its verbs, reads and slots, a
  board trigger exactly when it declares one, a `parse` or `reduce` only for a collection or stream it declares, a
  link per `around` entry, an answer per `answers` entry, and `halt`. The manifest is strict: an unknown key refuses
  the extension; `$schema` and `meta` are free. `views` and `regions` take the shapes [[ui-model]] gives them, and a
  region's `layout` and which regions an extension may lay out are [[region-overflow]]'s
  ([`rendererLayoutProblems`](ref:hub/src/bridge/extensions.ts#rendererLayoutProblems),
  [`withRendererLayouts`](ref:hub/src/bridge/extensions.ts#withRendererLayouts)). Verbs, commands and views share one
  id space, since pins, hides and a viewer's seen name each by `<cap>/<name>`, so a manifest naming two alike is
  refused. Every key carries the minor it arrived in (`x-since`), so a key newer than the manifest's `requires.tower`
  is `under-declared`, and later keys arrive as API minors. `/schema` serves the manifest as `extension`.
- **One capability per extension.** `provides` defaults to `id`; everything an extension shows others is named by its
  capability, so a replacement providing the same capability takes over its names. Names are lowercase words joined by
  single dashes, never the core's ([`RESERVED`](ref:hub/src/shared/extensions.ts#RESERVED); a name the core takes
  later arrives at a minor, a user's extension of it refused until renamed). A bundled capability's id is the bundled
  extension's ([`BUNDLED`](ref:hub/src/shared/extensions.ts#BUNDLED)): a user replaces one by providing it on purpose.
  A new bundled extension that does nothing until its settings or its verbs are used is an addition and arrives at an
  API minor, a user's extension of its id then refused until renamed or set to provide it; one that acts once it ships
  arrives at a major.
- **One version for renderers and extensions.** The core is the capability `tower` at `API_VERSION`, and
  `requires.tower` is mandatory. `requires.X: "M.m"` is met at major M, minor m or newer.
- **Resolve, then start.** [`discover`](ref:hub/src/extensions.ts#discover) reads the checkout's `extensions/<id>/`
  and the config's `extensions` by `path`. [`resolve`](ref:hub/src/bridge/extensions.ts#resolve), pure, refuses what
  can't load, each with a problem at its path: `invalid` (the manifest, the config's entry, settings by the manifest's
  schema through `z.fromJSONSchema`), `too-new` and `too-old` read before any other key, `conflict` (a bundled
  provider is kept and a user's refused; two users' are both refused; two declarations of one region that differ),
  `unmet`, `cycle` over requires and wants, and `skipped` for whatever requires something refused, until nothing
  changes. Only an acyclic, fully met graph reaches braided, whose sort would otherwise throw for the whole system.
  Each floor's own settings are merged over the system's and parsed there too: a floor its schema refuses gets an
  `invalid` problem and reads the system's, so one bad value costs that floor's override and never the board. The
  board carries the result in `settings` and `floorSettings` on each extension, so a client reads its settings with
  no server code.
- **Resources beside the core.** Each accepted extension is a braided resource `x:<cap>` after `core:config`,
  `core:system`, `core:publisher`, `core:dispatch`, `core:http` and `core:extensions` and its requires' providers, its
  wants' optional ([[spine]]). Its start imports the server module afresh for its hash, builds ctx
  ([`StartCtx`](ref:hub/src/shared/extensions.ts#StartCtx): who it is, its settings and a floor's, whether it is on
  there, timers, a log, a signal, the board, and its calls), and fails past 10 s; its halt calls the extension's, then
  clears the timers and aborts the signal ([`startExtension`](ref:hub/src/tower/extensions.ts#startExtension)). A
  failed start fails that extension alone and skips what requires it.
- **Verbs and reads, by qualified name.** A manifest's `verbs` (`input`, `reply`, `scope`, `words`, `deprecated`,
  `cli`) and `reads` (by path, `beats/<project>`: `query`, `reply`, `scope`, `cli`) have their schemas turned into zod
  at resolve, so an extension's input is parsed as the core's is; the loader refuses a schema it can't read, a
  project-scoped verb whose input doesn't require `project`, a project-scoped read naming no floor, a verb named
  `read`, and a name both a verb and a read ([`compileCalls`](ref:hub/src/bridge/extensions.ts#compileCalls)). How
  they are typed as commands is [[cli-words]]'s. Every name another extension addresses is qualified, the core's as
  `tower/<verb>` ([`qualifiedOf`](ref:hub/src/shared/extensions.ts#qualifiedOf)), and
  [`call`](ref:hub/src/tower/dispatch.ts#call) is the one dispatch for both: `POST /<cap>/<verb>` and `GET
  /<cap>/<read>` reach the provider looked up at call time ([`extensionCalls`](ref:hub/src/tower/calls.ts#extensionCalls)),
  `unavailable` while it starts, restarts or doesn't run, `refused` on a floor where it is off, its reply checked
  against its schema. A throw or a reply off its schema answers `internal` naming the extension, and lists a `threw`
  or `shape` problem on it; a handler answers an `ApiError` to refuse. `/schema` lists each running extension's verbs
  and reads beside the core's, and `ExtensionView.verbs` each verb in words.
- **A read may serve a file.** A read declaring `serves: "file"` has no `reply`: its handler answers `{file}`, an
  absolute path ([`FILE_SERVED`](ref:hub/src/bridge/extensions.ts#FILE_SERVED)), and the tower serves that file as it
  serves a shown one ([`route`](ref:hub/src/tower/http.ts#route)): by its media type, sandboxed. Which paths it serves
  is the handler's to confine, since only the extension knows its scope; the core holds no read of a checkout's files.
  A read path's last segment may be a rest param, `raw/<id>/<file...>`, taking every segment left joined by `/`
  ([`matchRead`](ref:hub/src/shared/extensions.ts#matchRead)), so a page served this way loads what lies beside it by
  relative URL. Without this an extension could answer JSON alone, and no view by type could draw a file it found.
- **ctx calls what it declares.** `ctx.call` and `ctx.read` take qualified names and reach the core, the extension
  itself, and the capabilities it requires or wants (`refused`, "declare requires.X", otherwise); a core read answers
  through the same code as over HTTP, for the extension's caller, its reply a copy of its body, or a text file's text
  as written, and any other file refused as `invalid`, its bytes left to HTTP
  ([`read`](ref:hub/src/tower/http.ts#read)). `ctx.deps.<cap>` holds one function per verb and per read of each
  declared provider's manifest, `undefined` while a wanted one is missing, which `GET /extensions` notes on the
  extension (an `info` problem, `unmet` at `wants.<cap>`).
- **A caller on every call.** [`Caller`](ref:hub/src/shared/extensions.ts#Caller) is `{t, id?, via, within}`. Over
  HTTP it is what the CLI's headers claim ([`callerOf`](ref:hub/src/tower/http.ts#callerOf): `tower-session` names a
  worker, none is the user), not authenticated. A call made inside any handler keeps that handler's caller and
  appends its verb to `within`; only an extension's own `start` and timers call as `{t: 'extension'}`, a slot's
  handler as `{t: 'tower', id: 'slot'}` and a board trigger's calls as `{t: 'tower', id: 'board'}`. A call nested
  more than 8 deep is `refused`, its chain named ([`tooDeep`](ref:hub/src/shared/extensions.ts#tooDeep)). A core
  composite calls the verbs it does through the dispatch, for its caller, itself appended to `within`
  ([`COMPOSITES`](ref:hub/src/shared/api.ts#COMPOSITES), listed per verb at `GET /extensions`): Tidy removes,
  deletes, reaps and kills through `tower/worktree/remove`, `tower/branch/delete`, `tower/reap/process` and
  `tower/kill`, an entry refused skipped and named in its reply ([`tidyProject`](ref:hub/src/tower/dispatch.ts#tidyProject));
  archiving has no verb of its own, so Tidy does it itself, and an extension's entries go through `tower/tidy.apply`.
  An extension verb that does what a core verb does calls it the same way: the policies extension's `policies/run`
  spawns through `tower/spawn`.
- **Deprecation counts against the user of a name.** A deprecated verb or read answers HTTP with RFC 9745's
  `Deprecation` (`@0`: a manifest names the version, not a date) and a `Link` to its `use`
  ([`deprecate`](ref:hub/src/tower/http.ts#deprecate)); an extension that calls one gets a `deprecated` warning.
- **`tower x`.** Every word after `tower` stays the core's; `tower x <cap> <word>` calls what the capability offers by
  that name, typed as [[cli-words]] says. `tower x` alone lists the running ones with their briefs, and `tower x <cap>`
  alone prints its guidance, its words, then its doors, verbs and reads
  ([`extensionCallLines`](ref:hub/src/directory.ts#extensionCallLines)), from `ExtensionView.verbs`, `reads` and `facts`.
- **Guidance for the workers.** A manifest's `guidance` is `brief`, one line, and optionally `full`, markdown: when to
  use the extension, when not, and how. The config's `extensions.<id>.guidance` replaces either and adds `also` after
  the full text; [`guidanceOf`](ref:hub/src/bridge/extensions.ts#guidanceOf) resolves them, refusing an extension
  whose guidance has no brief ([`guidanceProblems`](ref:hub/src/config-check.ts#guidanceProblems) says so in `tower
  config check`), into `ExtensionView.guidance`. Workers learn it where they already look:
  [`guidanceLines`](ref:hub/src/directory.ts#guidanceLines) puts one line per running extension on the worker's floor
  in `tower whoami`, which every worker runs at start, and the full text costs context only when `tower x <cap>` asks
  for it. The config's guidance is not in an extension's hash, so editing
  it restarts nothing; the manifest's is, as the manifest's text.
- **Reconciled on config change.** [`runExtensions`](ref:hub/src/tower/extensions.ts#runExtensions) resolves again
  when the config changes and hands braided's `reconcileSystem` the next resources, each memoized by a
  [hash](ref:hub/src/tower/extensions.ts#hashOf) of its id, manifest text, settings, the newest modification time of
  its folder's files ([`newestIn`](ref:hub/src/extensions.ts#newestIn)), its dependencies and its restarts on request:
  what the edit leaves unchanged keeps running, a changed one restarts with its dependents, and the board is published
  again. Nothing watches the folder, so a code edit takes effect at the next reconcile: `extension/restart` (`tower
  extensions restart <id>`) counts one more restart into the extension's hash, so its resource is new and braided
  restarts it with its dependents, its state `restarting` and its calls `unavailable` meanwhile. Node never evicts a
  module, so each start imports its server module under `?v=<hash>`, and a resolve hook carries that version to every
  module it imports inside its folder, `node_modules` aside ([`importFresh`](ref:hub/src/fresh-imports.ts#importFresh)):
  the folder's whole graph loads again, what lies outside it stays one instance, and each old graph stays in memory
  until the tower restarts.
- **What server code imports.** `/lib/<module>.js` is the same line in server code and a client: a resolve hook maps
  the prefix to `src/lib/`, and an unknown module fails at import, listing the library's ([[library]]). The served
  modules are lent too, until 2.0: `tower:<name>.js` maps to the source behind `/<name>.js`
  ([`lent-modules.ts`](ref:hub/src/lent-modules.ts), [[renderer-shared-modules]]). Either way a folder copied anywhere
  loads, with the core's instance shared, and a name not lent fails at import. Types come from the library, by
  `tsconfig.json`'s `/lib/*.js` path inside the checkout and by `tower types` in a copy elsewhere. An extension with
  npm dependencies declares them in its own `package.json` and installs them in its folder: its server code and its
  client's TypeScript, bundled at serve time, resolve packages from the folder up (the `files` example's Shiki).
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
  ([`extensionVerdicts`](ref:hub/src/doctor.ts#extensionVerdicts)).
- **Stores.** A manifest declares `collections`, `streams` and session `facts`, each named by its capability: a
  collection `<cap>` or `<cap>.<name>`, a stream at `streams/{system|projects/<p>}/<cap>.<name>/`, a fact
  `tower.x.<cap>.<name>`. An owned collection declares five doors, each a read (of its owner's or the core's) to read
  or a verb of its owner's to act. An accepted extension's collections join the floors it is on
  ([`floorCollections`](ref:hub/src/bridge/stores.ts#floorCollections), [[collections]]); an owned one refuses the
  generic writes, naming its create door ([`ownedRefusal`](ref:hub/src/bridge/stores.ts#ownedRefusal)). A stream is
  always its extension's: only its ctx appends, each fact checked by its code's schema, and its closed months are
  archived as the core's are ([[log-retention]]). ctx carries `streams`, `facts` (logged through the host's `fact`,
  [[let-go]]), `collections` and `own` ([`storesOf`](ref:hub/src/tower/stores.ts#storesOf)): each `reduce` folded by
  [[live-system]] as its stream grows ([`foldOn`](ref:hub/src/system.ts#foldOn)), each `parse` cached by the item's
  version, and a session's facts over its lineage
  ([`sessionFacts`](ref:hub/src/bridge/stores.ts#sessionFacts)), all frozen. Handlers and folds read the same state,
  so `FoldCtx.own` is built from those accessors, never a second fold.
- **Stored facts fold from the manifest, never from running code.** What an extension stored is folded by what its
  manifest declares, whether the extension is on, off or failed at start; only a manifest refused as `invalid`, whose
  declarations can't be trusted, is not read.
- **Folds and contributions.** A subject is anything the board shows that extensions add to, keyed `card:<id>`,
  `floor:<project>`, `board`, `conversation:<id>`, `item.<collection>:<project>/<id>`, `shown:<card>/<at>` (what a
  worker showed), `collection:<project>/<collection>` and `shelf:<project>/<n>`, or `<cap>.<kind>:<instance>/<key>`
  for an extension's own kinds, declared in `subjects` (where their keyed entries sit in its part) and keyed by the
  subject they were found in, their contributions copied to the old `<cap>.<kind>:<key>` until 2.0.
  [`subjects.ts`](ref:hub/src/shared/subjects.ts) spells every key, names each subject's parent (`parentOf`) and
  resolves any key on the board (`subjectAt`, own kinds through `ExtensionView.subjects`). A subject whose content is
  text or a file says where it is, `value.text` a read path or `value.body` the text, and `value.type` its media type
  ([`mediaTypeOf`](ref:hub/src/shared/media.ts#mediaTypeOf)); `textOf` reads either. A manifest's `folds` declare, per
  subject kind, the `x` schema of its part and the `adds` it contributes
  ([`ADDS`](ref:hub/src/shared/extensions.ts#ADDS): `actions`, `badges`, `tidy` on a floor, `lines` and `marks` on a
  card, `asks`, `slots` on a floor or the board); the loader refuses an own kind not declared, another's of a
  capability it doesn't declare, a subject list that isn't a keyed array of its fold's `x`, an `x` on what holds none
  (an item's is its collection's extension's), and a command's `accepts` with no `on` to narrow
  ([`compileFolds`](ref:hub/src/bridge/extensions.ts#compileFolds)), and `start` must return a fold per kind. The
  core's board is built, then [`foldBoard`](ref:hub/src/bridge/folds.ts#foldBoard) runs, pure, over a frozen copy:
  each running extension in resolved order folds its kinds in a fixed order, on floors where it is on, each fold seeing
  the subject with only its own parts and its requires' and wants' (an undeclared read can't hide in the order). A
  part is checked against the manifest ([`checkPart`](ref:hub/src/bridge/folds.ts#checkPart): only what it declares,
  its `x` by its schema, a verb action naming a verb of a capability it declares, a command of its own); its `x` lands
  at `subject.x[cap]`, its contributions at `board.adds[key]`, tagged with `cap`, its asks in `board.asks` keyed
  `<cap>:<key>`, gone past `until`, each about a core subject and naming the view it opens (`opens`) when it is
  answered in one. A throw or a bad shape drops its part on that subject, and its required dependents' there, as a
  `threw` or `shape` problem (lane `fold`, with the subject); over 50 ms of one board is a `slow` warning. Those
  problems are the latest board's, derived on each build
  ([`extensions`](ref:hub/src/tower/extensions.ts#extensions)'s `folded`), never stored, so a failing fold can't make
  the board change on its own. `ctx.board()` inside a fold throws
  ([`boardOf`](ref:hub/src/tower/publisher.ts#boardOf)); `FoldCtx.callsignOf(session)` names the worker any session
  the tower has known ran as, archived ones too ([`callsignLookup`](ref:hub/src/bridge/board.ts#callsignLookup)).
- **Commands and drawing.** A manifest's `client` folder is served at `/x/<cap>/` with CORS
  ([`clientFile`](ref:hub/src/tower/http.ts#clientFile)), a `.ts` module bundled at its name with `.js`
  ([`clientSource`](ref:hub/src/extensions.ts#clientSource)), so a client stays typechecked and importable from
  source; while no provider runs, the bundled extension's folder is served, so a renderer built on a bundled client
  keeps loading with it off. A `command` is one of its modules' exports, offered on every subject of the kinds its
  `on` names (`item.*` every collection's items) with no fold, narrowed by `accepts` to the subjects whose
  `value.type` it lists (`image/*` a top-level type's every subtype), derived by the helpers rather than carried per
  subject; one with no `on` is the palette's alone. Every renderer draws through `/cards.js`:
  [`actionsOf`](ref:hub/src/shared/adds.ts#actionsOf) (the core's, then `adds`, then the commands offered),
  `badgesOf`, `actionWords`, [`glyphOf`](ref:hub/src/shared/adds.ts#glyphOf) (a command's `words.icon`: a core icon,
  or an SVG of its client folder, a missing one refusing the extension as it loads,
  [`iconProblems`](ref:hub/src/bridge/extensions.ts#iconProblems)), and
  [`runCommand`](ref:hub/src/shared/run-command.ts#runCommand), which imports the module and calls its export with
  `{tower, board, subject, target, args}` and the kit the renderer lends (`subject` the subject's value until 2.0,
  `target` the subject itself). Asks join the attention order beside the waits ([[attention-list]]); `tower whoami`
  prints a card's lines. Where the tower page draws each contribution is its own
  ([`added.js`](ref:hub/renderers/page/added.js), [[command-palette]]); Tower 3D and the CLI leave commands out.
- **Middleware.** A manifest's `around` wraps verbs and hooks by qualified name, each the core's, its own, or of a
  capability it requires or wants, and existing there: the core's and its own checked as it is read
  ([`targetProblems`](ref:hub/src/bridge/extensions.ts#targetProblems)), another's against its provider as they
  resolve (`unmet`). The registry orders each target's links among the started extensions
  ([`chainOrder`](ref:hub/src/bridge/extensions.ts#chainOrder), pure): declared `before` and `after` first, then a
  capability inside every capability that depends on it, directly or not, so the owner is innermost, then by
  capability name, outside first; the links in a cycle of `before` and `after` are left out, each a `cycle` problem at
  `around.<target>`, and the target runs without them. `GET /extensions` shows `chains`. The dispatch runs every call
  through its target's chain ([`chainCalls`](ref:hub/src/tower/chains.ts#chainCalls)): with links, the input is parsed
  first, `next` parses what a link passes on again (`invalid`, naming the link), each link's answer is checked against
  the reply schema, a throw is `internal`; each a problem on the link's extension, lane `around`. A link may answer
  without `next`. A link off on the input's `project` is passed over, running or not; a link that takes part and is
  restarting or down fails the call (`unavailable`): a link may be a guard, so it never fails open.
- **Hooks.** A provider declares `hooks` (`payload`, `answer`, `failure`), sharing one namespace with its verbs and
  reads, and raises its own with `ctx.raise(name, payload)`. The core's are
  [`HOOKS`](ref:hub/src/shared/api.ts#HOOKS): `tower/discard.record`, raised by `worktree/discard` once the tips are
  read and before anything is removed, where a failed answer or none refuses the discard (the answers are the floor's
  recovery record, the reviews extension's note among them; [[discard]]); `tower/discard.done`, raised once its
  worktrees are removed, reported in the reply's `done` (reviews files the thread there); `tower/tidy.apply`, raised
  by `tidy` after its own parts to each capability in `plan.x` alone with its keys, reported in the reply's `x.<cap>`
  ([[tidy]]); and `tower/spawn.gate`, below. Answerers list a hook in `answers`; each answers in fold order (the
  resolve order), on its own, inside the hook's chain, as `{cap, ok, answer}` or `{cap, ok: false, code, message}`.
  One that throws, answers off the schema or doesn't settle within the hook's deadline
  ([`hookDeadline`](ref:hub/src/tower/chains.ts#hookDeadline): a core hook's `deadline`, else 30 s; an answer after it
  is ignored) is `internal` and a `hook` problem on it; an `ApiError` it answers is a refusal, no problem. An answerer
  off on the payload's `project` is not asked. `/schema` lists every hook; `GET /extensions` lists each hook's
  `answers`. The provider applies its hook's `failure` to the answers it gets back. A core hook says how its answers
  combine (`combine`: `gate`, `merge`, `place` or `report`), whether a failed answer or none refuses (`required`),
  what it means where nobody answers (`absent`, as words), its reply field (`field`) and what the core answers itself,
  first (`core`). On a floor where nothing that takes part answers a hook with `absent` words and no `core`, the board
  carries those words as the core's badge on the floor ([`absentAdds`](ref:hub/src/bridge/board.ts#absentAdds)).
- **The gate.** `tower/spawn.gate` is raised on every spawn, resume and fork once the launch contributors merged and
  before the crew edge, the cut and the host ([`gate`](ref:hub/src/tower/dispatch.ts#gate)), so a gate of any kind
  can't be gone around by forking. The core answers first with the floor's hiring limits on a hire
  ([[hiring-limits]]), then each answerer in fold order; the first refusal (`{code: 'limited' | 'refused', message}`)
  refuses the verb, its message followed by `(<cap>'s gate)`. A failed answer, here an `ApiError` or no answer within
  the gate's 10 s too, and a link around the hook that refuses or fails, is a `hook` problem and the worker starts; a
  link's failure stands for every answer, so no answerer is asked. A handler's ctx has `cards()`, every card the system
  holds, for an answerer that counts workers.
- **Flows.** Every core verb is listed as a named sequence of stages, [`FLOWS`](ref:hub/src/shared/flows.ts#FLOWS),
  served as `/schema`'s `flows` and printed by `tower flows [verb] [--floor p]` with who takes part
  ([`flowLines`](ref:hub/src/directory.ts#flowLines)), from `GET /extensions`' `chains`, `answers` and `launchers`:
  each stage `open` (a core hook, or the launch contributors), `wrapped` (the links at both edges of every verb) or
  `sealed` (the core's alone, with why). It describes the dispatch and changes nothing in it; an open stage a later
  minor will raise (spawn's `where`, `cut` and `unplace`) is listed `planned`, and no extension can answer it. The
  worker facts the CLI logs (`show`, `open`, `keep`'s announcement, `home` of oneself: [[agent-show]], [[leave]]) go
  through the verb `tower/fact`, so they are wrapped and listed like every act. Flows are a field of `/schema`, not a
  route, so the core takes no name outside `RESERVED`.
- **Triggers and checks.** A manifest's `slots` name a rule each, `When` in [`slots.ts`](ref:hub/src/shared/slots.ts):
  crons the tower says in words, or `every`, a period aligned to the UTC clock so restarts never shift it. The tower's
  slot loop ([`runSlots`](ref:hub/src/slots.ts#runSlots)) ticks every 30 s; a slot fires once, the latest at or before
  now within 5 minutes, per floor when scoped `project`, called as `{t: 'tower', id: 'slot'}`
  ([`extensionSlots`](ref:hub/src/slots.ts#extensionSlots)). A floor's or the board's fold that adds `slots` gives
  `{key, when}` entries, carried at `board.adds[<subject>].slots` like any contribution and fired through `slots['*']`
  with their key and floor: that is how the policies extension turns its files into slots ([[policies]]). Fired is in
  memory only: no slot facts, so an extension that needs exactly once keeps its own. `triggers.board` makes `start`
  return `board(prev, next)`, pure, handed each board the publisher builds that differs from the last
  ([`publisher`](ref:hub/src/tower/publisher.ts#publisher)), from the second on, with off floors dropped from both
  and a floor that appears taken as already there
  ([`triggerBoards`](ref:hub/src/bridge/triggers.ts#triggerBoards)); its calls are made as the tower, and it is
  paused 5 minutes past 30 calls a minute
  ([`runBoardTrigger`](ref:hub/src/tower/triggers.ts#runBoardTrigger)). A throw or a failed call is a problem in the
  `trigger` lane. `checks` are declared only: `tower doctor` runs each `run` from the folder and each `read` against
  the tower ([`checkVerdicts`](ref:hub/src/doctor.ts#checkVerdicts)). `ctx.run` and every command the tower waits on run through
  [`runProcess`](ref:hub/src/run.ts#runProcess): env scrubbed ([[env-scrub]]), a process group killed by pid at the
  timeout or at halt. `ctx.runtime(runtime)` gives the config's default command and `env`, `ctx.commands(runtime)` all
  of them ([`runtimeCommands`](ref:hub/src/shared/model.ts#runtimeCommands)), and `ctx.run` takes `env`, so an
  extension runs Claude as the sessions do. What must outlive a restart of the tower or the extension runs as a job
  instead: `ctx.jobs.start` and `cancel` call `tower/job/start` and `job/cancel` as the capability, whoever a handler
  answers, so the job's owner is the capability ([[jobs-own-daemon]]).
- **The author's loop and the contract file.** `tower extensions check <dir>`
  ([`checkFolder`](ref:hub/src/extension-check.ts#checkFolder)) reads a folder as the tower would, resolves it
  against the running tower's registry, and starts it in a throwaway process with a ctx that reaches nothing to report
  `mismatch`; a manifest that loads gets a `lands` line per command and fold contribution, where each renderer the
  config declares and the CLI draw it ([`landing`](ref:hub/src/shared/regions.ts#landing), [[renderers-in-config]]).
  `tower extensions freeze <dir>` ([`freezeFolder`](ref:hub/src/extension-check.ts#freezeFolder)) writes
  `contract.json`, the names dependents build on at its major
  ([`contractOf`](ref:hub/src/bridge/extensions.ts#contractOf): verbs, reads, facts, stream codes, collections, its
  words, and each client module's exports as `client.<module>#<export>`, read without running them as the folder is
  found, [`foundIn`](ref:hub/src/extensions.ts#foundIn)). At load, a name gone from it at the same major is
  `contract`, an error for a bundled extension and a warning for a user's; a user's extension replacing a bundled
  capability that lacks a name of the bundled `contract.json` at its major is refused
  ([`replacementProblem`](ref:hub/src/bridge/extensions.ts#replacementProblem)). Every bundled extension and every
  example under `examples/extensions/` is loaded by `npm test` as `check` reads it
  ([`extension-folders.test.ts`](ref:hub/test/extension-folders.test.ts)).
- **Launch.** A manifest's `spawn.fields` each take a value's `schema`, `words`, `form` (drawn on every spawn form
  unless `false`) and `options.from`, a path into its own floor part where its floor fold's `x` declares an array
  ([`compileFields`](ref:hub/src/bridge/extensions.ts#compileFields)); `plugins` is keyed by a runtime the tower knows.
  A spawn's `x.<cap>.<field>` is parsed by the field's schema
  ([`spawnFields`](ref:hub/src/tower/dispatch.ts#spawnFields): a capability nobody provides, off on the floor, or a
  field it doesn't declare is `invalid`, one that doesn't run `unavailable`) and logged as `tower.x.<cap>.<field>` in
  the host's spawn, before the PTY starts. `spawn.launch` means `start` returns `launch`, called for every spawn,
  resume and fork on floors where it is on, in resolved order, with `LaunchCtx` (the floor's settings, reads, its
  collections' list and read) ([`contribute`](ref:hub/src/tower/dispatch.ts#contribute)). Its parts
  ([`LaunchParts`](ref:hub/src/shared/extensions.ts#LaunchParts)) are intents the runtime places: `systemPrompt` after
  the tower's brief, `prompt` after the first, `env` in Claude's `--settings` through the parent-session scrub (and so
  logged with the session's argv in its header for good, no place for secrets), `defaults` only where the spawn left a
  model or effort out, `args.<runtime>` one flag each, placed before the core's, `exempt` and `reportsTo`; `prompt`,
  `defaults`, `exempt` and `reportsTo` are a spawn's only, since a resume or fork keeps its transcript's prompt and
  model and its worker's crew and limits ([`placeable`](ref:hub/src/bridge/launch.ts#placeable),
  [`mergeParts`](ref:hub/src/bridge/launch.ts#mergeParts)). A flag the core composes
  ([`CORE_FLAGS`](ref:hub/src/shared/launch.ts#CORE_FLAGS)) or the config's `argv` passes, an env key the config's
  `env` sets (Claude's settings would override it in silence), and a flag, env key, `defaults` member or `reportsTo`
  two contributors give, refuse the launch naming both, a `conflict` problem on each. A contributor that throws,
  doesn't settle within 10 s, or returns what the runtime can't place refuses a spawn carrying its fields
  (`internal`), and is otherwise dropped with a `launch` problem. Each `exempt` is logged as `tower.exempt {from, by}`
  and a `reportsTo` as `tower.reports-to {callsign, session, by}`: core facts the core's crews and hiring limits read
  ([[crews]], [[hiring-limits]]), drawn on the card as a badge and listed per extension at `GET /extensions`
  (`exempted`). A resume logs nothing again; a fork carries copies of its lineage's `tower.x.*` facts and neither core
  fact ([`forkFacts`](ref:hub/src/bridge/launch.ts#forkFacts)). Each running extension's `plugins.claude` joins the
  config's plugins on its floors ([[plugins]]); a folder that isn't a Claude plugin is a warning
  ([`claudePluginProblems`](ref:hub/src/bridge/extensions.ts#claudePluginProblems)). The spawn form draws the fields
  ([`formFields`](ref:hub/src/shared/spawn-form.ts#formFields)). The reviews extension
  is the bundled user: its spawn field `of` (`form: false`, set by `reviews/hire`) and a launch contributor returning
  `reportsTo: of` and `exempt: ['hiring']` make a reviewer's crew and exemption these core facts ([[reviewer]]).
- **Fact kinds.** A stream's fact code may declare a `kind` the core folds, its facts checked against the kind's
  schema too; an unknown kind, or `tower/rate-limits` in a project stream, is `invalid`. The one kind is
  `tower/rate-limits` ([`RateLimitsReading`](ref:hub/src/shared/rate-limits.ts#RateLimitsReading): `limits`,
  `extraUsage?`, `runtime?`, Claude's when it names none, `command?`, the default command's when it names none), which
  the core folds from each extension's system stream beside the sessions' turns' ([[probes]]), from every manifest
  resolved, started, off or failed, but one refused as `invalid`
  ([`readingStreams`](ref:hub/src/bridge/rate-limits.ts#readingStreams)).
- **Writable facts: a value with no server code.** A fact declaring `writable` (`user`, `self`) has a door,
  `POST /<cap>/facts/<name> {session?, value}`, dispatched beside the verbs by
  [`call`](ref:hub/src/tower/dispatch.ts#call) and answered by the core
  ([`extensionCalls`](ref:hub/src/tower/calls.ts#extensionCalls)'s `door`): the value checked by the fact's schema or
  `null`, logged through the host's `fact` as `ctx.facts.append` logs it, and nothing else stored. `user` is a caller
  with no session, naming the session; `self` a worker writing its own; both claims under the same-user trust, any
  other caller refused, and the capability off on the session's floor refuses it. A verb's name holds no `/`, so
  `facts/<name>` takes no verb's. No `around` link wraps a door: `around` names verbs and hooks, and a door is
  neither, a stated limit. `folds.card.project.lines: {from: 'fact:<name>', pick: 'last'}` is the fold the manifest
  writes ([`projectedFold`](ref:hub/src/bridge/extensions.ts#projectedFold)): the newest value of that fact over the
  card's lineage, none when blank or `null`, as one line. It is one rule and nothing more; anything that computes is a
  server fold. `examples/extensions/tabline` is the proof: a manifest, and a client command that asks for the line.
- **The built-ins move into bundled extensions, their old names kept until 2.0.** A bundled extension's code imports
  the core's library, never the reverse. [`LEGACY`](ref:hub/src/shared/extensions.ts#LEGACY) is a fixed list of
  tagged entries ([`LegacyEntry`](ref:hub/src/shared/extensions.ts#LegacyEntry): `module`, `verb`, `read`, `stream`,
  `board`, `action` or `view`, each `old`, `now` and `since`), read by kind with `legacyOf`, and what a move does
  beyond a name is in `legacy.ts`, keyed by the old name. An old module URL serves what it is now
  ([`legacyModule`](ref:hub/src/tower/http.ts#legacyModule)); an old verb calls the new one through the dispatch and
  an old read is served by the new one, all with `Deprecation` and a `Link`; the published board copies each moved
  part back to its old field ([`projectLegacy`](ref:hub/src/bridge/legacy.ts#projectLegacy)); an old card verb is
  copied from the action an extension's fold now offers there
  ([`LEGACY_ACTIONS`](ref:hub/src/bridge/legacy.ts#LEGACY_ACTIONS)); a moved stream keeps its old folder for good
  ([`streamFolder`](ref:hub/src/shared/extensions.ts#streamFolder)). The config's old spelling is read where it is
  now by one pure function ([`respelled`](ref:hub/src/bridge/legacy.ts#respelled)). A reviewer spawned before the reviews extension logged
  its facts at spawn is read from its launch prompt, `/tower:review <CALLSIGN>`, as that callsign's reviewer, exempt by
  reviews and in its author's crew ([`legacyReviewer`](ref:hub/src/bridge/legacy.ts#legacyReviewer)). What only git
  knows of a checkout stays core ([`checkoutState`](ref:hub/src/bridge/checkouts.ts#checkoutState), `floor.main`), so
  an extension folds over the core's board ([[review-threads]]). 2.0 removes every entry but the streams', whose
  folders hold what was written.
- **Held by the contract test.** `test/served-exports.json` lists the manifest's key paths, each lane's ctx members
  ([`CTX_SINCE`](ref:hub/src/shared/extensions.ts#CTX_SINCE)) and the core's problem codes, reserved and bundled
  names, adds, badge tones, hooks and fact kinds, so removing one without a major fails `npm test`
  ([[renderer-api-contract]]).

**Alternatives considered.**

- *Contributions declared only by code*: an extension's contract would be readable only by running it, and could grow
  at runtime. The manifest is JSON, so it can't hold zod; its schemas are JSON Schema, which the tower turns into zod.
- *Unknown keys ignored with a warning*: a manifest written for a newer tower would run half its features, and a key
  that is a constraint would fail open.
- *A version for extensions apart from the API's*: it would move at nearly every API major anyway.
- *Stores and names keyed by id*: a replacement would start empty and answer under another name.
- *Starting extensions straight in braided*: one bad manifest (a cycle, a missing dependency) would stop the tower.
- *Restarting on file change*: every save restarts a live extension and its dependents.
- *`ctx.call` reaching any capability*: an undeclared dependency would escape ordering, version checks and the
  `skipped` closure.
- *A caller that becomes the extension inside its handler*: a worker could launder a call past a guard through any
  extension verb; the caller stays whoever started the chain.
- *A core read for `ctx.read` served into a response that collects its body*: it reuses the reads as they are, but
  has no request, so every read that looks at one throws, and the caller's `within` is lost.
- *Fold problems kept as call problems*: each build would re-find them and change the board, which builds again.
- *Commands written per subject in `board.adds`*: every item of a kind would carry the same entry; the helpers derive
  them from `ExtensionView.commands`.
- *A link off its target's schema passed over, or a chain run with a restarting link left out*: a link may be the
  guard, and a guard that fails open is no guard.
- *Answers that see each other's*: an answerer that needs to see or change the others' wraps the hook with `around`;
  answers stay independent, so one failing costs only itself.
- *Contributed flags placed after the core's*: the core reads the model, effort and prompt back from argv's end
  (`launchOf`); placed first, and each a single `--flag` or `--flag=value`, none can be read as one.
- *The last contributor's flag winning*: no order of contributors would silently decide what Claude sees.
- *Contributed env through the host's spawn*: kept out of the log, but a host change, which stops every running
  worker; through `--settings` it is logged with the argv, which the docs say plainly.
- *A crew edge as a fold's contribution*: the core's board, built before any fold, couldn't read it; it is a core fact.
- *The hire's limit checked before its contributors*: an exemption is theirs to give, so the gate runs after them.
  Contributors read stores and the API, never a worktree's files, so on a cut they run with the worktree's path before
  it is cut (`LaunchRequest.cwd` may not exist yet) and a refused hire cuts nothing.
- *A process per extension*: isolation at the cost of every lane crossing a process boundary; same-user code is
  trusted, and the guards catch mistakes, not malice. The resolve hook reloads a folder's code in the tower's process.
- *Slot facts kept by the core*: stored state for every extension's every slot, when only some need exactly once.
- *A board trigger as an event stream*: builds are debounced, so it could never see every transition anyway; comparing
  states says what it can honestly say.
- *Guidance in the system prompt or a SessionStart addition*: the first reaches a worker only after a tower restart,
  the second puts every extension's text in every session.

**Impact.** The core holds the mechanism and what extensions stand on; drafts, policies, quota, reviews, autotidy and
floors are bundled extensions, and `examples/extensions/` holds folders to copy. Every addition to the manifest or ctx
is an API minor, recorded by `x-since` and `CTX_SINCE`. No host change.
