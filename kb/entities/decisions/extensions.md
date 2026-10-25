---
{
  "type": "decision",
  "name": "Extensions: a manifest that declares, code that implements, resolved before anything runs",
  "summary": "An extension is a folder holding extension.json and optionally a server module whose default export is start; it provides one capability, and the core is the capability tower at API_VERSION. The tower reads every manifest strictly, resolves them into an acyclic, fully met graph (refusing and skipping what can't load, each with a problem), starts the rest as braided resources x:<cap> beside the core's, reconciles them when the config changes, and shows every extension on the board, at GET /extensions, in tower extensions and in tower doctor. An extension's verbs and reads are dispatched by qualified name through the one dispatch, with a caller on every call, at POST and GET /<cap>/…, through ctx.call, ctx.read and ctx.deps, and with tower x. Its folds put its part and contributions on the board after the core's is built, each failure costing only its part on that subject; renderers draw them through /cards.js. Since 1.85 every call runs through the chain of links extensions wrap around its verb, and a provider raises its hooks for others to answer, the core's discard.record among them. Since 1.87 extensions shape the workers the tower starts: spawn fields logged as facts before the PTY, launch contributors whose parts the runtime places, a plugin per runtime, and the core facts tower.exempt and tower.reports-to.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-22",
  "reviewed": "2026-10-24",
  "refs": ["hub/src/shared/extensions.ts#Manifest", "hub/src/shared/extensions.ts#RESERVED", "hub/src/shared/extensions.ts#BUNDLED", "hub/src/shared/extensions.ts#LEGACY", "hub/src/shared/extensions.ts#StartCtx", "hub/src/shared/extensions.ts#CTX_SINCE", "hub/src/shared/extensions.ts#ExtensionView", "hub/src/shared/extensions.ts#Caller", "hub/src/shared/extensions.ts#qualifiedOf", "hub/src/shared/extensions.ts#tooDeep", "hub/src/bridge/extensions.ts#compileCalls", "hub/src/tower/calls.ts#extensionCalls", "hub/src/tower/dispatch.ts#call", "hub/src/tower/http.ts#callerOf", "hub/src/tower/http.ts#deprecate", "hub/src/tower/http.ts#read", "hub/src/directory.ts#extensionVerbLines", "hub/test/fixtures/extensions/chime/extension.json", "hub/src/bridge/extensions.ts#resolve", "hub/src/bridge/extensions.ts#registry", "hub/src/bridge/stores.ts#offOn", "hub/src/extensions.ts#discover", "hub/src/tower/extensions.ts#runExtensions", "hub/src/tower/extensions.ts#startExtension", "hub/src/tower/extensions.ts#hashOf", "hub/src/tower/extensions.ts#extensions", "hub/src/config-check.ts#floorExtensions", "hub/src/shared/extension-words.ts", "hub/src/doctor.ts#extensionVerdicts", "hub/test/extensions.test.ts", "hub/test/fixtures/extensions/pulse/extension.json", "hub/docs/config.md", "hub/src/bridge/stores.ts#floorCollections", "hub/src/bridge/stores.ts#ownedRefusal", "hub/src/bridge/stores.ts#sessionFacts", "hub/src/tower/stores.ts#storesOf", "hub/src/system.ts#foldOn", "hub/src/bridge/folds.ts#foldBoard", "hub/src/bridge/folds.ts#checkPart", "hub/src/bridge/extensions.ts#compileFolds", "hub/src/tower/extensions.ts#extensions", "hub/src/tower/publisher.ts#boardOf", "hub/src/tower/stores.ts#storesOf", "hub/src/shared/subjects.ts", "hub/src/shared/adds.ts#actionsOf", "hub/src/shared/adds.ts#runCommand", "hub/src/tower/http.ts#clientFile", "hub/src/tower/http.ts#legacyModule", "hub/src/extensions.ts#clientSource", "hub/src/extensions.ts#foundIn", "hub/extensions/drafts/extension.json", "hub/examples/extensions/narrate/extension.json", "hub/test/extension-folders.test.ts", "hub/renderers/page/added.js", "hub/test/folds.test.ts", "hub/src/bridge/extensions.ts#chainOrder", "hub/src/bridge/extensions.ts#targetProblems", "hub/src/tower/chains.ts#chainCalls", "hub/src/shared/api.ts#HOOKS", "hub/src/shared/api.ts#COMPOSITES", "hub/test/fixtures/extensions/tally/extension.json", "hub/src/shared/slots.ts", "hub/src/slots.ts#extensionSlots", "hub/src/slots.ts#runSlots", "hub/src/bridge/triggers.ts#triggerBoards", "hub/src/tower/triggers.ts#runBoardTrigger", "hub/src/tower/publisher.ts#publisher", "hub/src/doctor.ts#checkVerdicts", "hub/src/run.ts#runProcess", "hub/src/fresh-imports.ts#importFresh", "hub/src/bridge/extensions.ts#mismatchOf", "hub/src/bridge/extensions.ts#contractOf", "hub/src/bridge/extensions.ts#replacementProblem", "hub/src/extension-check.ts#checkFolder", "hub/src/extension-check.ts#freezeFolder", "hub/src/extension-start.ts", "hub/src/shared/launch.ts#CORE_FLAGS", "hub/src/shared/launch.ts#spawnRequest", "hub/src/bridge/launch.ts#mergeParts", "hub/src/bridge/launch.ts#placeable", "hub/src/bridge/launch.ts#forkFacts", "hub/src/bridge/extensions.ts#compileFields", "hub/src/tower/dispatch.ts#contribute", "hub/src/tower/dispatch.ts#spawnFields", "hub/src/shared/spawn-form.ts#formFields", "hub/test/launch.test.ts", "hub/test/fixtures/extensions/roles/extension.json"]
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
  `start(ctx)`. What `start` returns must match what the manifest declares, no more and no fewer (`mismatch`,
  [`mismatchOf`](ref:hub/src/bridge/extensions.ts#mismatchOf)): a handler for each of its verbs, reads and slots, a
  board trigger exactly when it declares one, a `parse` or `reduce` only for a collection or stream it declares, a
  link per `around` entry, an answer per `answers` entry, and `halt`. The manifest is strict: an unknown key refuses the extension, `$schema` and `meta`
  are free, and `views` and `regions` are validated against their reserved shapes and not read (`not-yet`). Every key
  carries the minor it arrived in (`x-since`), so a key newer than the manifest's `requires.tower` is
  `under-declared`, and later keys arrive as API minors. `/schema` serves the manifest as `extension`.
- **One capability per extension.** `provides` defaults to `id`; everything an extension shows others is named by its
  capability, so a replacement providing the same capability takes over its names. Names are lowercase words joined by
  single dashes, never the core's ([`RESERVED`](ref:hub/src/shared/extensions.ts#RESERVED)), and a bundled
  capability's id is the bundled extension's ([`BUNDLED`](ref:hub/src/shared/extensions.ts#BUNDLED)): a user replaces
  one by providing it on purpose. [`LEGACY`](ref:hub/src/shared/extensions.ts#LEGACY), the built-ins' old names as
  they move into extensions, is a fixed list of tagged entries (`module`, `verb`, `read`, `stream`, `board`, each
  `old`, `now` and `since`), read by kind with `legacyOf`. A `module` entry's old URL serves what it is now, with
  `Deprecation` and a `Link` to it ([`legacyModule`](ref:hub/src/tower/http.ts#legacyModule)): `/drafts.js` is
  `/x/drafts/drafts.js`. All but the stream folders go at 2.0.
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
  another verb does calls it through the dispatch, for its caller, itself appended to `within`
  ([`COMPOSITES`](ref:hub/src/shared/api.ts#COMPOSITES), listed per verb at `GET /extensions`): `policy/run` spawns
  through `tower/spawn`, Tidy removes, deletes, reaps and kills through `tower/worktree/remove`,
  `tower/branch/delete`, `tower/reap/process` and `tower/kill` (an entry refused is skipped and named in its reply),
  and `worktree/discard` notes through `tower/review/append` (refused, it stops before anything is removed); a hire is
  a `tower/spawn` call already. Filing threads and archiving logs have no verb of their own, so Tidy does them itself.
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
  code edit waits for a restart on request: `extension/restart` (`tower extensions restart <id>`) counts one more
  restart into the extension's hash, so its resource is new and braided restarts it with its dependents, its state
  `restarting` and its calls `unavailable` meanwhile. Node never evicts a module, so each start imports its server
  module under `?v=<hash>`, and a resolve hook carries that version to every module it imports inside its folder,
  `node_modules` aside ([`importFresh`](ref:hub/src/fresh-imports.ts#importFresh)): the folder's whole graph loads
  again, what lies outside it stays one instance, and each old graph stays in memory until the tower restarts.
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
  five doors, a door that reads (`list`, `read`) naming anything but a read of its owner's or of the core's
  (`tower/board`, `tower/collection/<project>/<collection>/<item>`), a door that acts (`create`, `edit`, `delete`, a
  stream's `append`) naming anything but a verb of its owner's, a deprecated one, a stream
  fact code that is not one letter, and any schema the tower can't read. An accepted extension's collections join
  the floors it is on ([`floorCollections`](ref:hub/src/bridge/stores.ts#floorCollections), [[collections]]); an
  owned one refuses the generic writes, naming its create door
  ([`ownedRefusal`](ref:hub/src/bridge/stores.ts#ownedRefusal)). A stream is always its extension's: only its ctx
  appends, each fact checked by its code's schema. Its closed months are offered by Tidy and archived as the core's
  are ([[log-retention]]). ctx gains `streams` (append, read over a window), `facts` (logged
  through the host's `fact`, [[let-go]]), `collections` (its own, on floors where it is on) and `own`
  ([`storesOf`](ref:hub/src/tower/stores.ts#storesOf)): each `reduce` folded by [[live-system]] as its stream grows,
  only new facts stepped from a frozen state, a step that throws stopping the fold before its fact
  ([`foldOn`](ref:hub/src/system.ts#foldOn)), each `parse` cached by the item's version, one that throws costing that
  item only, and a
  session's facts over its lineage as `SessionFact`s ([`sessionFacts`](ref:hub/src/bridge/stores.ts#sessionFacts)),
  all frozen. The spec gives folds `own` alone; handlers need the same state (a read answering from its stream), so
  ctx carries the accessors, and the folds' `FoldCtx.own` is built from them, never a second fold.
- **Folds and contributions (1.84).** A subject is anything the board shows that extensions add to, keyed
  `card:<id>`, `floor:<project>`, `board`, `conversation:<id>`, `item.<collection>:<project>/<id>`, or
  `<cap>.<kind>:<key>` for an extension's own kinds, declared in `subjects` (where their keyed entries sit in its part);
  [`subjects.ts`](ref:hub/src/shared/subjects.ts) spells every key. A manifest's `folds` declare, per subject kind, the
  `x` schema of its part and the `adds` it contributes (`actions`, `badges`, `tidy` on a floor, `lines` on a card,
  `asks`); the loader refuses an own kind not declared, another's of a capability it doesn't declare, a subject list
  that isn't a keyed array of its fold's `x`, an `x` on what holds none (an item's is its collection's extension's)
  ([`compileFolds`](ref:hub/src/bridge/extensions.ts#compileFolds)), and `start` must return a fold per kind. The core's
  board is built, then [`foldBoard`](ref:hub/src/bridge/folds.ts#foldBoard) runs, pure, over a frozen copy: each
  running extension in resolved order folds card, conversations, items, floor, its own kinds, board, on floors where it
  is on, each fold seeing the subject with only its own parts and its requires' and wants' (an undeclared read can't
  hide in the order). A part is checked against the manifest ([`checkPart`](ref:hub/src/bridge/folds.ts#checkPart):
  only what it declares, its `x` by its schema, a verb action naming a verb of a capability it declares, a command of
  its own); its `x` lands at `subject.x[cap]`, its contributions at `board.adds[key]`, tagged with `cap`, its asks in
  `board.asks` keyed `<cap>:<key>`, gone past `until`, each about a core subject (an own kind's entry sits in its
  owner's part, where renderers don't find it). A throw or a bad shape drops its part on that subject, and its
  required dependents' there, as a `threw` or `shape` problem (lane `fold`, with the subject); over 50 ms of one board
  is a `slow` warning; a reduce step that throws is a `threw` problem at `streams.<name>`. Those problems are the
  latest board's, derived on each build ([`extensions`](ref:hub/src/tower/extensions.ts#extensions)'s `folded`, each
  dated by the first build that found it), never stored, so a failing fold can't make the board change on its own.
  `FoldCtx.own` is read from what `StartCtx.own` reads ([`storesOf`](ref:hub/src/tower/stores.ts#storesOf)'s
  `foldOwn`, lazily), never a second fold; `ctx.board()` inside a fold throws
  ([`boardOf`](ref:hub/src/tower/publisher.ts#boardOf)).
- **Commands and drawing.** A manifest's `client` folder is served at `/x/<cap>/` with CORS
  ([`clientFile`](ref:hub/src/tower/http.ts#clientFile)), a `.ts` module bundled at its name with `.js`
  ([`clientSource`](ref:hub/src/extensions.ts#clientSource)), so a client stays typechecked and importable from
  source; while no provider runs, the bundled extension's folder is served, so a renderer built on a bundled client
  keeps loading with it off; a `command` is one of its modules' exports, offered on every
  subject of the kinds its `on` names with no fold, derived by the helpers rather than carried per subject, and one
  with no `on` is the palette's alone. `ExtensionView.commands` says each. Every renderer draws through `/cards.js`:
  [`actionsOf`](ref:hub/src/shared/adds.ts#actionsOf) (the core's, then `adds`, then the commands offered),
  `badgesOf`, `actionWords` (a verb's words from its provider's `ExtensionView.verbs`), and
  [`runCommand`](ref:hub/src/shared/adds.ts#runCommand), which imports the module and calls its export with
  `{tower, board, subject, args}`. Asks join the attention order beside the waits ([[attention-list]]); `tower whoami`
  prints a card's lines. The tower page draws a card's, a floor's and an item's badges and actions where it draws
  their own ([`added.js`](ref:hub/renderers/page/added.js)), asks with the offers, and the palette lists them
  ([[command-palette]]); Tower 3D draws a desk's badges and verbs, and leaves commands out, as the CLI does.
- **Middleware (1.85).** A manifest's `around` wraps verbs and hooks by qualified name, each the core's, its own, or
  of a capability it requires or wants, and existing there: the core's and its own checked as it is read
  ([`targetProblems`](ref:hub/src/bridge/extensions.ts#targetProblems)), another's against its provider as they
  resolve (`unmet`). The registry orders each target's links among the started extensions
  ([`chainOrder`](ref:hub/src/bridge/extensions.ts#chainOrder), pure): declared `before` and `after` first, then a
  capability inside every capability that depends on it, directly or not, so the owner is innermost, then by
  capability name, outside first; the links in a cycle of `before` and `after` are left out, each a `cycle` problem at
  `around.<target>`, and the target runs without them. `GET /extensions` shows `chains`. The dispatch runs every call
  through its target's chain ([`chainCalls`](ref:hub/src/tower/chains.ts#chainCalls)): with links, the input is parsed
  first, `next` parses what a link passes on again (`invalid`, naming the link), each link's answer is checked against
  the reply schema, a throw is `internal`; each a problem on the link's extension, lane `around`. A link may answer
  without `next`. A link that is restarting fails the call (`unavailable`): a link may be a guard, so it never fails
  open. A link off on the input's `project` is passed over.
- **Hooks (1.85).** A provider declares `hooks` (`payload`, `answer`, `failure`), sharing one namespace with its verbs
  and reads, and raises its own with `ctx.raise(name, payload)`; the core's are
  [`HOOKS`](ref:hub/src/shared/api.ts#HOOKS), `tower/discard.record` raised by `worktree/discard` once the tips are
  read and before anything is noted or removed, `refuses`, and `tower/tidy.apply` raised by `tidy` after its own parts,
  to each capability in `plan.x` alone with its keys, `reported` in the reply's `x.<cap>`. A floor's tidy entries are
  drawn by every renderer beside the core's rows, and the floor's `tidy` call carries them all ([[tidy]]). Answerers list a hook in `answers`; each answers in fold
  order (the resolve order), on its own, inside the hook's chain, as `{cap, ok, answer}` or `{cap, ok: false, code,
  message}`. One that throws or answers off the schema is `internal` and a `hook` problem on it; an `ApiError` it
  answers is a refusal, no problem. An answerer off on the payload's `project` is not asked. `/schema` lists every
  hook under `hooks`, the core's with its `x-since`; `GET /extensions` lists each hook's `answers`. The provider applies
  its hook's `failure` to the answers it gets back; the core's `refuses` stops the discard and names the answerer.
- **Triggers and checks (1.86).** A manifest's `slots` name a rule each, `When` in
  [`slots.ts`](ref:hub/src/shared/slots.ts), the core's time trigger moved out of policies: crons the tower says in
  words, or `every`, a period aligned to the UTC clock so restarts never shift it. The policies' 30 s loop became the
  tower's slot loop ([`runSlots`](ref:hub/src/slots.ts#runSlots)) with the policies and the extensions' manifests as its
  sources; a slot fires once, the latest at or before now within 5 minutes, per floor when scoped `project`, called as
  `{t: 'tower', id: 'slot'}` ([`extensionSlots`](ref:hub/src/slots.ts#extensionSlots)). A floor's or the board's fold
  that adds `slots` gives `{key, when}` entries, carried at `board.adds[<subject>].slots` like any contribution and
  fired through `slots['*']` with their key and floor: that is how policies will turn their files into slots. Fired is in memory only: no
  slot facts, so an extension that needs exactly once keeps its own. `triggers.board` makes `start` return
  `board(prev, next)`, pure: the publisher hands each board that differs from the last to its listeners, frozen
  ([`publisher`](ref:hub/src/tower/publisher.ts#publisher)); the trigger is first called on the second, off floors
  dropped from both boards with their waits, offers, adds and asks, and a floor that appears taken as already there
  ([`triggerBoards`](ref:hub/src/bridge/triggers.ts#triggerBoards)), its calls made as `{t: 'tower', id: 'board'}` to
  what its ctx reaches, and paused 5 minutes past 30 calls a minute
  ([`runBoardTrigger`](ref:hub/src/tower/triggers.ts#runBoardTrigger)). A throw or a failed call is a problem in the
  `trigger` lane. `checks` are declared only: `tower doctor` runs each `run` from the folder and each `read` (its own,
  taking no params) against the tower, saying "tower down" while it is
  ([`checkVerdicts`](ref:hub/src/doctor.ts#checkVerdicts)). `ctx.run` and every command the tower waits on run through
  [`runProcess`](ref:hub/src/run.ts#runProcess): env scrubbed ([[env-scrub]]), a process group killed by pid at the
  timeout or at halt.
- **The author's loop and the contract file.** `tower extensions check <dir>`
  ([`checkFolder`](ref:hub/src/extension-check.ts#checkFolder)) reads a folder as the tower would, resolves it
  against the running tower's registry, and starts it in a throwaway process with a ctx that reaches nothing to report
  `mismatch`. `tower extensions freeze <dir>` ([`freezeFolder`](ref:hub/src/extension-check.ts#freezeFolder)) writes
  `contract.json`, the names dependents build on at its major
  ([`contractOf`](ref:hub/src/bridge/extensions.ts#contractOf): verbs, reads, facts, stream codes, collections, and
  each client module's exports as `client.<module>#<export>`, read without running them as the folder is found,
  [`foundIn`](ref:hub/src/extensions.ts#foundIn)). At
  load, a name gone from it at the same major is `contract`, an error for a bundled extension and a warning for a
  user's; a user's extension replacing a bundled capability that lacks a name of the bundled `contract.json` at its
  major is refused ([`replacementProblem`](ref:hub/src/bridge/extensions.ts#replacementProblem)).
- **Launch (1.87).** A manifest's `spawn.fields` each take a value's `schema`, `words`, `form` (drawn on every spawn
  form unless `false`) and `options.from`, a path into its own floor part where its floor fold's `x` declares an array
  ([`compileFields`](ref:hub/src/bridge/extensions.ts#compileFields)); `plugins` is keyed by a runtime the tower knows.
  A spawn's `x.<cap>.<field>` is parsed by the field's schema ([`spawnFields`](ref:hub/src/tower/dispatch.ts#spawnFields):
  a capability nobody provides, off on the floor, or a field it doesn't declare is `invalid`) and logged as
  `tower.x.<cap>.<field>` in the host's spawn, before the PTY starts. `spawn.launch` means `start` returns `launch`,
  called for every spawn, resume and fork on floors where it is on, in resolved order, with `LaunchCtx` (the floor's
  settings, reads, its collections' list and read) ([`contribute`](ref:hub/src/tower/dispatch.ts#contribute)). Its
  parts are intents the runtime places: `systemPrompt` after the tower's brief, `prompt` after the first, `env` in
  Claude's `--settings` (the host's spawn carries no environment, and a host change would stop every worker) through
  the parent-session scrub, and so logged with the session's argv in its header for good, no place for secrets, `defaults` only where the spawn left a model or effort out, `args.claude` one flag each,
  placed before the core's, `exempt` and `reportsTo`; the last four a spawn's only
  ([`placeable`](ref:hub/src/bridge/launch.ts#placeable), [`mergeParts`](ref:hub/src/bridge/launch.ts#mergeParts)).
  A flag the core composes ([`CORE_FLAGS`](ref:hub/src/shared/launch.ts#CORE_FLAGS), read from a launch with every
  part set, never written out) or the config's `argv` passes, an env key the config's `env` sets (Claude's settings
  would override it in silence), and a flag, env key, `defaults` member or `reportsTo` two contributors give, refuse
  the launch naming both, a `conflict` problem on each. A contributor that throws, doesn't
  settle within 10 s (as `start`), or returns what the runtime can't place refuses a spawn carrying its fields (`internal`), and is otherwise dropped with a
  `launch` problem. Each `exempt` is logged as `tower.exempt {from, by}` and a `reportsTo` as `tower.reports-to
  {callsign, session, by}`, the session the callsign names on the board then: core facts the core's crews and hiring
  limits read ([[crews]], [[hiring-limits]]), drawn on the card as a badge, said by `tower whoami`, and listed per
  extension at `GET /extensions` (`exempted`). A resume logs nothing again; a fork carries copies of its lineage's
  `tower.x.*` facts and neither core fact ([`forkFacts`](ref:hub/src/bridge/launch.ts#forkFacts)). Each running
  extension's `plugins.claude` joins the config's plugins on its floors ([[plugins]]). The spawn form draws the fields
  ([`formFields`](ref:hub/src/shared/spawn-form.ts#formFields)); the roles fixture is the proof.
- **Held by the contract test.** `test/served-exports.json` lists the manifest's key paths, each lane's ctx members
  ([`CTX_SINCE`](ref:hub/src/shared/extensions.ts#CTX_SINCE)) and the core's problem codes, names and hooks, so removing one
  without a major fails `npm test` ([[renderer-api-contract]]).

Load, resolve, start and see arrived first (1.81), verbs and reads next (1.82), then stores (1.83), then folds and
contributions (1.84), then middleware and hooks (1.85), then triggers, checks and restart (1.86), then launch
(1.87). The bundled extensions arrive as additions to the manifest and ctx, each an API minor.

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
- *Fold problems kept as call problems*: each build would re-find them and change the board, which builds again.
- *Commands written per subject in `board.adds`*: every item of a kind would carry the same entry; the helpers derive
  them from `ExtensionView.commands`.
- *A link off its target's schema passed over, or a chain run with a restarting link left out*: a link may be the
  guard, and a guard that fails open is no guard.
- *Answers that see each other's*: an answerer that needs to see or change the others' wraps the hook with `around`;
  answers stay independent, so one failing costs only itself.
- *Contributed flags placed after the core's*: the core reads the model, effort and prompt back from argv's end
  (`launchFlags`, `launchPrompt`); placed first, and each a single `--flag` or `--flag=value`, none can be read as one.
- *The last contributor's flag winning*: no order of contributors would silently decide what Claude sees.
- *Contributed env through the host's spawn*: kept out of the log, but a host change, which stops every running
  worker; through `--settings` it is logged with the argv, which the docs say plainly.
- *A crew edge as a fold's contribution*: the core's board, built before any fold, couldn't read it; it is a core fact.
- *The hire's limit checked before its contributors*: an exemption is theirs to give, so the gate runs after them.
  Contributors read stores and the API, never a worktree's files, so on a cut they run with the worktree's path before
  it is cut (`LaunchRequest.cwd` may not exist yet) and a refused hire cuts nothing.
- *A process per extension*: isolation at the cost of every lane crossing a process boundary; same-user code is
  trusted, and the guards catch mistakes, not malice. It was also the other way to reload a folder's code; the resolve
  hook does it in the tower's process.
- *Slot facts kept by the core*: stored state for every extension's every slot, when only some need exactly once.
- *A board trigger as an event stream*: builds are debounced, so it could never see every transition anyway; comparing
  states says what it can honestly say.

**Impact.** API 1.81: `board.extensions`, `GET /extensions` listing them, the `extension` schema, and three config
keys (`extensions`, a floor's `extensions` and `capabilities`). API 1.82: the manifest's `verbs` and `reads`,
`ExtensionView.verbs`, `POST` and `GET /<cap>/…`, `ctx.call`, `ctx.read`, `ctx.deps` and the caller, and `tower x`. API 1.83: the manifest's `collections`, `streams` and `facts`, ctx's `streams`, `facts`,
`collections` and `own`, and a floor collection's `owner` and `doors` on the board. API 1.84: the manifest's `client`, `subjects`, `folds` and
`commands`, `Started.folds` and `FoldCtx`, `x` on cards, floors, items and the board, `board.adds`, `board.asks`,
`ExtensionView.commands`, a problem's `subject`, the problem code `slow`, `GET /x/<cap>/<file>`, and the helpers in
`/cards.js`.
API 1.85: the manifest's
`around`, `hooks` and `answers`, ctx's `raise`, the problem lanes `around` and `hook` and the code `hook`, `/schema`'s
`hooks`, `GET /extensions`' `chains`, `answers` and `composites`, the hooks `tower/discard.record` and
`tower/tidy.apply`, `worktree/discard`'s and `tidy`'s reply `x`, and `tidy`'s `plan.x`.
API 1.86: the manifest's `slots`,
`triggers` and `checks`, `Started.slots` and `board`, `ctx.run`, `ExtensionView.slots` and the state `restarting`, the
problem codes `paused` and `contract`, the verb `extension/restart`, and `/slots.js`. API 1.87: the manifest's
`spawn` and `plugins`, `Started.launch` and `LaunchCtx`, the problem lane `launch`, the spawn input's `x`,
`ExtensionView.spawn`, `card.crew` and `card.exempt`, `GET /extensions`' `exempted`, and the session facts
`tower.exempt` and `tower.reports-to`. API 1.88: the floor's `tidy` offered for extensions' entries alone, its call's
`plan.x` carrying every entry, and `addedTidyOf` in `/cards.js`.
API 1.89: drafts is the bundled `extensions/drafts` (its client the former
`/drafts.js`, [[collections]]), a floor collection's `by`, `.ts` client modules served bundled, client exports in
`contract.json`, and `LEGACY`'s first entry. `examples/extensions/` holds extensions to copy, `narrate` first (Listen
on every draft), each loaded by `npm test` as `tower extensions check` does.
No host change. The bundled ones move in one at a time.
