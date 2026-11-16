---
{
  "type": "decision",
  "name": "Tower 3D starts as a braided system of its long-lived resources",
  "summary": "Tower 3D's long-lived pieces (the tower's API, its lighting setting, the extension clients, the stage, input, music, the terminal, the asset loads, the port its reads send their events through, the titles read from items' texts and the archive's reads) are braided resources: plain start and stop functions in their own modules, wired in one record (system.ts) that boot.ts starts, each once its dependencies have. The page itself is resources too, each in its module and handed what it reads, started in this order: the views, the world, hiring (spawn), the HUD, navigation, the panels, the app loop, the controls, the frames, the feed of boards, the door and the keeper of your spot. The modules below them read nothing as they load: what they draw by is handed to them, as arguments or a start's dependencies, and system.ts imports every module statically. A resource that fails, and each one skipped for it, is said on the loading screen by name. No module imports itself through others, and test:tower3d-boot fails on a cycle. Inside the page, one app loop holds what it has decided (app.ts): panels move by a `go` event whose pure handler returns leave, enter and draw effects at once, re-frame style, and a draw only writes the DOM.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-11-16",
  "reviewed": "2026-11-16",
  "refs": [
    "hub/renderers/tower3d/src/system.ts",
    "hub/renderers/tower3d/src/boot.ts",
    "hub/renderers/tower3d/src/titles.ts#startTitles",
    "hub/renderers/tower3d/src/archive.ts#startArchive",
    "hub/renderers/tower3d/src/layers.ts#pigeonholesOf",
    "hub/renderers/tower3d/src/acts.ts#OfferReads",
    "hub/renderers/tower3d/src/clients.ts#startClients",
    "hub/renderers/tower3d/src/light/setting.ts#startLighting",
    "hub/renderers/tower3d/src/toon.ts#lightRamp",
    "hub/renderers/tower3d/src/stage.ts#startStage",
    "hub/renderers/tower3d/src/input.ts#startInput",
    "hub/renderers/tower3d/src/music.ts#startMusic",
    "hub/renderers/tower3d/src/term.ts#startTerminal",
    "hub/renderers/tower3d/src/loads.ts#startAssets",
    "hub/renderers/tower3d/src/tv.ts#screenMaterial",
    "hub/renderers/tower3d/src/prefab.ts",
    "hub/scripts/tower3d-boot.ts#importCycles",
    "hub/src/tower/spine.ts",
    "hub/package.json",
    "hub/renderers/tower3d/src/app.ts",
    "hub/renderers/tower3d/src/app.ts#Db",
    "hub/renderers/tower3d/src/app.ts#appHandlers",
    "hub/renderers/tower3d/src/app.ts#went",
    "hub/renderers/tower3d/src/app.ts#subjectLeft",
    "hub/renderers/tower3d/src/app.ts#AppReads",
    "hub/renderers/tower3d/src/app.ts#Motion",
    "hub/renderers/tower3d/src/app.ts#Arrival",
    "hub/renderers/tower3d/src/app-loop.ts#ARRIVED",
    "hub/renderers/tower3d/src/frames.ts#tickCamera",
    "hub/renderers/tower3d/src/navigation.ts#travel",
    "hub/renderers/tower3d/src/app.ts#Aim",
    "hub/renderers/tower3d/src/app.ts#Capture",
    "hub/renderers/tower3d/src/navigation.ts#offersNow",
    "hub/renderers/tower3d/src/frames.ts#tickAim",
    "hub/renderers/tower3d/src/frames.ts#tickHold",
    "hub/renderers/tower3d/src/panels.ts#RUN",
    "hub/renderers/tower3d/src/panels.ts#LEAVE",
    "hub/renderers/tower3d/src/panels.ts#ENTER",
    "hub/renderers/tower3d/src/panels.ts#TAB_ENTER",
    "hub/renderers/tower3d/src/panels.ts#drawPending",
    "hub/renderers/tower3d/src/panels.ts#deskEntered",
    "hub/renderers/tower3d/src/panels.ts#docClosed",
    "hub/renderers/tower3d/src/panels.ts#readerEntered",
    "hub/renderers/tower3d/src/app.ts#followCabinet",
    "hub/renderers/tower3d/src/app.ts#took",
    "hub/renderers/tower3d/src/app.ts#settled",
    "hub/renderers/tower3d/src/port.ts#startPort",
    "hub/renderers/tower3d/src/archive.ts#settledArchives",
    "hub/renderers/tower3d/src/app.ts#Building",
    "hub/renderers/tower3d/src/building.ts#worldRebuilt",
    "hub/renderers/tower3d/src/building.ts#worldFurnished",
    "hub/renderers/tower3d/src/building.ts#planOf",
    "hub/renderers/tower3d/src/archive.ts#archivedAt",
    "hub/renderers/tower3d/src/layers.ts#desksAfter",
    "hub/renderers/tower3d/src/layers.ts#galleryAfter",
    "hub/renderers/tower3d/src/door.ts#Engine",
    "hub/renderers/tower3d/src/views.ts#startViews",
    "hub/renderers/tower3d/src/spawn.ts#startSpawn",
    "hub/renderers/tower3d/src/hud.ts#startHud",
    "hub/renderers/tower3d/src/navigation.ts#startNavigation",
    "hub/renderers/tower3d/src/panels.ts#startPanels",
    "hub/renderers/tower3d/src/app-loop.ts#startAppLoop",
    "hub/renderers/tower3d/src/controls.ts#startControls",
    "hub/renderers/tower3d/src/frames.ts#startFrames",
    "hub/renderers/tower3d/src/feed.ts#startFeed",
    "hub/renderers/tower3d/src/door.ts#startDoor",
    "hub/renderers/tower3d/src/keeper.ts#startKeeper",
    "hub/renderers/tower3d/src/building.ts#startWorld"
  ]
}
---
**Problem.** Tower 3D started as a side effect of loading its modules: the stage built a renderer, added its
listeners and set a clock running as it was imported, the terminal subscribed to the viewer's prefs, the lighting set
an exported `let` the rest read as they loaded, and the extension clients loaded in a top-level await. The start order
was the order esbuild ran the imports in, and nothing stopped. Splitting `main.ts` by concern (a WIP split, parked)
then hung the page silently: esbuild wraps a lazily imported module and everything it imports in init functions; a
top-level await on that path makes every wrapper async, and two async wrappers in an import cycle wait on each other
forever.

**Why.** The topology is data. Declaring each resource and what it needs, and letting a library derive the order, is
what the tower process already does ([[spine]]). It removes the hang's cause (no top-level await, no cycles) instead
of tolerating it, and gives later passes a place to put what `main.ts` holds today.

**How.**
- *Resources are plain functions.* Each module exports a start (`startStage`, `startInput`, `startMusic`,
  `startTerminal`, `startClients`, `startLighting`, `startAssets`) that does what its import used to and returns what
  its users call, with a stop where stopping is cheap. Nothing calls the stops yet.
- *One record wires them.* [`system.ts`](ref:hub/renderers/tower3d/src/system.ts) is the only module that knows
  where each is implemented: `defineResource` calls with their dependencies (the stage needs the lighting, the input
  needs the stage's canvas), the record `tower3d`. [braided](ref:hub/package.json) is bundled into `tower3d.js` like
  three.js, not served at `/lib/`, so the renderer API is untouched.
- *Boot starts it.* [`boot.ts`](ref:hub/renderers/tower3d/src/boot.ts) sets the placeholder door, then imports
  `system.ts` lazily and starts it. The placeholder must exist before three.js and the city evaluate: Chrome can fire
  the load event before a module that takes long to evaluate has run, and an agent awaits `tower3d.ready()` from the
  load event on ([[tower3d-door]]). braided collects each failed start and skips its dependents; boot writes every one
  on the loading screen with the resource's name and rejects `ready()` with them ([[tower3d-start]]).
- *The tower is a resource.* The API the page reads and writes through is the `tower` resource, `window.tower` on the
  live page, handed to every resource that calls it; `api.ts` exports its type and helpers that take it
  (`shelfFiles(tower, …)`), never the object, so no module reaches the API except through the record.
- *The clock is a resource.* The wall clock the page draws by, pinned by `?at=`, is the `clock` resource
  ([`startClock`](ref:hub/renderers/tower3d/src/clock.ts#startClock)): `now` and whether it `moves`. The resources
  that stamp or draw an age read it from their start; the pure builders below them (`ui.ts`'s, the gallery's, the
  desks' dressing, the stats board) take the instant they draw at as an argument.
- *A fixture page is a record, not a mode.* `system.ts` exports the live record (`liveTower3d`) and
  `fixtureTower3d(name)`, the live one with the resources that differ swapped: a `fixture` resource that reads the
  file ([`startFixture`](ref:hub/renderers/tower3d/src/fixtures.ts#startFixture)), the `tower` that answers from it
  with the live one's interface ([`fixtureTower`](ref:hub/renderers/tower3d/src/fixtures.ts#fixtureTower)), a clock
  pinned at the instant it was built at ([`fixtureClock`](ref:hub/renderers/tower3d/src/clock.ts#fixtureClock)), the
  lighting `?lighting=off` gives, and a feed that delivers its boards
  ([`startFixtureFeed`](ref:hub/renderers/tower3d/src/feed.ts#startFixtureFeed)) over the live feed's core, drawn
  from its start (the frames' `drawEachFrame`). A fixture page keeps what the viewer chooses in its own store, which
  fires on its own writes as the live one does, so the page reacts to them the same way. `boot.ts` reads `?board=` once and starts one record or the other, and no module asks which page
  it is on. What a fixture page writes stays in it: its store is kept in the page, its calls and runs are refused,
  and it recalls no kept spot, so the sandbox it is served by never reaches it.
- *The lighting bands the ramp.* Lit, the lighting's start bands every toon material by the rig's ramp
  ([`lightRamp`](ref:hub/renderers/tower3d/src/toon.ts#lightRamp)) before anything draws; the stage gets `lit` as an
  argument. The pages that never start it (the lab, the dresser, the editor) stay unlit.
- *State built once is a resource; everything else is handed what it reads.* The titles read from notes', kept items'
  and games' texts ([`startTitles`](ref:hub/renderers/tower3d/src/titles.ts#startTitles)) and every floor's archive
  reads ([`startArchive`](ref:hub/renderers/tower3d/src/archive.ts#startArchive)) are caches made once, so each is a
  resource whose start makes it and tells the port as a read lands. A module of pure builders takes what it reads as
  arguments from the resource that calls it: an act's offers take their reads
  ([`OfferReads`](ref:hub/renderers/tower3d/src/acts.ts#OfferReads): the clients' words and the archive's drawers),
  the panel builders in `ui.ts` take theirs, a layer that draws by a read is made from it
  ([`pigeonholesOf`](ref:hub/renderers/tower3d/src/layers.ts#pigeonholesOf), `notesOf`, `cabinetsOf`, `filingsOf`),
  built once by the world, and the levels hang on the scene they are handed. The monitors' streams and the pictures of
  what workers showed are caches too, so each is a resource (`screens`, `pictures`) the world, the frames and the door
  are handed, and the builders take what they paint by as arguments (a desk's `DeskReads`, `wallsOf`, `galleryAfter`). The world exposes `hang`, `reconcile`
  and `syncFilings` to the resources after it. A resource composes the record it hands on (`{ ...clients, ...titles,
  drawersAt }`) in its own start. No module reads a started resource as it loads, so `system.ts` imports every
  module statically and evaluating one starts nothing.
- *The page is split by resource.* What was one page module is twelve resources, each a start in its own module
  handed the resources it calls, in an order the dependencies give and the page's needs pin where nothing else does:
  the views, the world ([`startWorld`](ref:hub/renderers/tower3d/src/building.ts#startWorld)), hiring
  ([`startSpawn`](ref:hub/renderers/tower3d/src/spawn.ts#startSpawn)), the HUD
  ([`startHud`](ref:hub/renderers/tower3d/src/hud.ts#startHud)), navigation
  ([`startNavigation`](ref:hub/renderers/tower3d/src/navigation.ts#startNavigation)), the panels
  ([`startPanels`](ref:hub/renderers/tower3d/src/panels.ts#startPanels)), the app loop
  ([`startAppLoop`](ref:hub/renderers/tower3d/src/app-loop.ts#startAppLoop)), the controls
  ([`startControls`](ref:hub/renderers/tower3d/src/controls.ts#startControls)), the frames
  ([`startFrames`](ref:hub/renderers/tower3d/src/frames.ts#startFrames)), the feed of boards
  ([`startFeed`](ref:hub/renderers/tower3d/src/feed.ts#startFeed)), the door
  ([`startDoor`](ref:hub/renderers/tower3d/src/door.ts#startDoor)) and the keeper of your spot
  ([`startKeeper`](ref:hub/renderers/tower3d/src/keeper.ts#startKeeper)). A resource calls only those started before
  it; one that reads the app's db or dispatches before the app starts does it through the port (`now.ts`). Window and
  document listeners register in the order they always did, so a resource that adds one on a target an earlier
  resource listens on starts after it (the controls after the app, for blur and visibility). A listener that reads the app's db
  or dispatches to it is added only once the app is attached: the HUD's and the panels' are each gathered in a
  `listen` the app calls as it attaches, the HUD's before its own and the panels' after, so none can run before the
  app exists (a resource's start is an `await import` away from the next). A flag one resource keeps
  and another set is a function on its owner (the panels' `askDraw`, the frames' `beginDrawing`, `drawEachFrame` and `play`, the
  editor's last save a cell hiring exposes).
- *No cycles.* [`importCycles`](ref:hub/scripts/tower3d-boot.ts#importCycles) in `test:tower3d-boot` walks the import
  graph esbuild reads for the four pages and fails, naming the modules, on any cycle. The one there was (`layout`,
  `meetings`, `zones`, `breaks`) is broken by [`prefab.ts`](ref:hub/renderers/tower3d/src/prefab.ts).
- *The loads are a resource that hands out a promise.* [`startAssets`](ref:hub/renderers/tower3d/src/loads.ts#startAssets)
  starts loading the models, the kit, the faces, the viewer's kept spot and the renderer's settings, and returns
  `loaded`, which settles once all are in. Its start does not wait for them: the page reads its viewer and subscribes
  to the board while they load, so a page behind another tab still rings ([[tower3d-start]]). The feed, which
  starts the first board once the models are in, handles a failed load only once it is imported, after most other
  resources, so `loaded` is marked handled: a resource that fails first skips the feed, and the loading screen already
  says why. The loading screen's models stage is lit by `feed` as it starts, so "your settings" shows while the settings are read. Its module is `loads.ts` because `src/assets.d.ts` types the asset imports, and a module named
  `assets.ts` would shadow it.
- *Moving an import can move pixels.* three.js orders opaque draws by `material.id`, and ids are handed out as
  materials are made, many of them as their module is evaluated. A change to what is imported first renumbers them,
  which flips the draw order of any two surfaces within the depth buffer's precision of each other, so a refactor can
  change frames without changing what anything draws. A surface that must win such a tie says so itself, the way the
  big screens' [material](ref:hub/renderers/tower3d/src/tv.ts#screenMaterial) and the contact shadows' floor take a
  polygon offset.
- *Music alone.* The chimes keep their own audio context: muting suspends the band's.
- *The reads that land reach the app through one port.* The archive reads and the titles read from notes', kept
  items' and games' texts start before the app that handles what they bring. They send their events to `port`
  ([`startPort`](ref:hub/renderers/tower3d/src/port.ts#startPort)), a resource with no dependencies, and the `app`
  resource attaches the app to it once it is made: the one late binding between the page's event sources and its app. An
  event sent before the app attached throws, naming the source. A resource that starts before the app and reads its
  db reads it through the port too (`state`), which throws the same way before the app attached.

**The app loop.** The page's decisions live in one machine, `app` (the shared loop, [[machines]]), as the tower page's
do in its `page` loop ([[web-tower]]). Its pure part is [`app.ts`](ref:hub/renderers/tower3d/src/app.ts); the
`app` resource ([`startAppLoop`](ref:hub/renderers/tower3d/src/app-loop.ts#startAppLoop)) runs it with executors that call
the resources started before it, where the DOM and the building are. Every panel kind moves through it; a filing
cabinet's drawer still opens through a bridge (`openSide`), which shows the side its enter doesn't.
- *The db* ([`Db`](ref:hub/renderers/tower3d/src/app.ts#Db)): what the building took (below), the panel open, attention, the view, the desk's tab,
  what is pending for the next board (a desk or shell to go to, the tab or showing a desk opens on), a replay, and
  what moves on its own (`motion`), what is aimed at and held (`aim`), whether walking has the mouse (`capture`), each
  below, the board waiting for its floors' archives (`waiting`), and the Stats panel's read (`stats`).
  Readers call `app.state()`, through the port (`panelNow`, `viewNow`, `deskTabNow`, `replayNow` in `now.ts`; the door through
  [`Engine.app`](ref:hub/renderers/tower3d/src/door.ts#Engine)). Three.js objects, DOM handles, the walker and
  anything written every frame stay out of it.
- *`go` moves a panel* ([`went`](ref:hub/renderers/tower3d/src/app.ts#went)), the page's `go` over Tower 3D's
  `Panel` union: the open panel is left unless the next stays in its room (desks, shells and the big screen share
  one, `ROOM`), the next is entered, and a `draw` follows; a kind entered again from itself is entered again, not
  left. Entering a desk, a shell, the big screen or a game focuses the view (`FOCUSES`); leaving one for a panel
  that doesn't walks again, with a `fly-home`. Two names for two things: a game focuses the view but shares no
  room, so a game is left when you go to any other panel. `go` is a transition: a change to the
  open panel's own data (a read landing, a filter typed, a tray unfolded) is `panel`, which patches it and draws,
  never leaving or entering, and throws for a panel that isn't the open one's kind. A desk opens on its screen, then on the
  tab and the showing pending for it, all in the same transition. A desk's tabs move the same way inside it (`tab`,
  with `tab/leave` and `tab/enter`); a tab entered again is entered again, so the logbook is read again.
- *Leave and enter are tables by kind* ([`LEAVE`](ref:hub/renderers/tower3d/src/panels.ts#LEAVE),
  [`ENTER`](ref:hub/renderers/tower3d/src/panels.ts#ENTER), [`TAB_ENTER`](ref:hub/renderers/tower3d/src/panels.ts#TAB_ENTER)),
  total over `Panel['kind']`. An opener is a check and a `go`; a closer is a `go(undefined)`. The drawer's enter
  is empty (`opensItself`), its opener showing the side, and its leave hides it; the shell picker's leave is empty
  and the side hides it; the elevator's are empty, since it draws nothing of its own (`renderElevator` shows the car's
  panel from where you stand). So every enter still hides the side and the picker (`sideClosed`), as
  [`deskEntered`](ref:hub/renderers/tower3d/src/panels.ts#deskEntered) does. The reader's kinds share one enter and
  leave ([`readerEntered`](ref:hub/renderers/tower3d/src/panels.ts#readerEntered),
  [`docClosed`](ref:hub/renderers/tower3d/src/panels.ts#docClosed)); entered again from its own kind, which isn't
  left, the reader is closed before it opens again, except a kept item, which keeps the body it shows until the new
  one is read. What a panel's keys go to once drawn is a `focus` effect from a table by kind (`FOCUS_ON`: the
  picker's first place, the archive's filter, the draft's text).
- *Handlers return every effect at once, the db first.* The loop applies `state` when it meets it, so an executor
  reads the new db, and none dispatches while a transition runs: an event dispatched from an executor waits until
  the transition's effects have all run, after the state they assumed. So an enter or a leave hides and shows, and
  never sends `go`: a close that would (`closeSide`, kept for the drawer) is split into what it hides
  (`sideClosed`) and the `go(undefined)` it sends, and an enter runs only the first. A close that asked which panel
  was open asks the `from` its enter is handed. A leave that must not do what it usually does is told by the state
  it finds, not by a flag: the draft editor's leave saves the draft open, and a close that must not save (a draft
  deleted, sent or gone) lets the draft go first.
- *Draw is state to DOM, once a frame.* `draw` asks for the panels to be drawn at the next animation frame, however
  many transitions asked; [`drawPending`](ref:hub/renderers/tower3d/src/panels.ts#drawPending) draws them now, which a
  stepped door frame does as a real frame would, and which a `focus` effect does first, since it needs what the draw
  writes. An effect that needs the drawn DOM calls it first; a handler never does. Each visible change has its `draw` in `tower3d.events()`, so a missing one shows ([[tower3d-door]]).
- *The building takes a board by an event.* `board/arrived` keeps the board in the db as `waiting`, a later one
  replacing it, and its `archives/read` effect reads each floor's archive at the board's keys, then dispatches
  `archives/asked`. That and every read landing or failing (`archive/landed`, sent through the port) take the board
  waiting once every floor's archive is read at its keys, or failed to be
  ([`settled`](ref:hub/renderers/tower3d/src/app.ts#settled), through `AppReads.archivesSettled`), so no board is
  taken with an archive older than itself; `archive/landed` also files the cabinets again (`filings`) and draws. The
  first board reads its archives before it is dispatched
  ([`settledArchives`](ref:hub/renderers/tower3d/src/archive.ts#settledArchives)), so it is taken within the
  start's own dispatch and a failure taking it fails the start ([[tower3d-start]]). What the building takes
  ([`Building`](ref:hub/renderers/tower3d/src/app.ts#Building)) is the board, the shelf entry this page is, each
  floor's archive as read for it (`AppReads.archivedAt`) and the wall time it is planned at, which the event that
  settles it carries. Its pure handler ([`took`](ref:hub/renderers/tower3d/src/app.ts#took)) keeps it in the db first, then returns in order: a
  firework for each turn finished, `waits/began` for the lamps, an `asked` toast for each ask begun and not dismissed,
  `world/apply`, each showing arrived (opened on its tab at its open desk), the replay ended if its desk left, the
  panel closes below, `logbooks` and `elevator`, and the desk or shell pending gone to once the plan stands it.
  The `world/apply` executor has the `world` resource rebuild and reconcile the building and write what it shows
  outside the panels, in two steps with the hires told of the board between them, as the stations they open are
  reconciled after the desks ([`worldRebuilt`](ref:hub/renderers/tower3d/src/building.ts#worldRebuilt),
  [`worldFurnished`](ref:hub/renderers/tower3d/src/building.ts#worldFurnished)); the desk's views, the viewer's
  record, a draft open in the editor and the HUD are told by the executor around them. It dispatches nothing: it reads the db the
  handler left, with the panel still the one open before the board, as the world did before the panels close. Steps
  run on the db the step before left (`steps`). `world/apply` dispatches nothing; what `desk/go` and
  `shell/go` dispatch (a close, a cut, an arrival) is handled after the transition.
- *A panel whose subject left closes in the board handler, not the draw.* The board handler closes the panel whose
  subject the board no longer holds ([`subjectLeft`](ref:hub/renderers/tower3d/src/app.ts#subjectLeft)): a desk's worker gone, a
  shell ended, a floor removed, a shelf entry, a kept item, a game or a review thread gone, a floor no longer keeping
  drafts, a drawer its floor's archive no longer fills (`AppReads.drawersAt`, the archive's latest read), a picture
  its gallery, derived with the plan, no longer hangs. An archive read landing with no board to take checks the same
  (`archive/landed`), which only a drawer's subject can then fail. A kept item deleted says so in a `toast` effect. What it reads through an extension's client (a floor's
  review threads, whether it keeps drafts) is handed to the handlers once, as pure reads
  ([`AppReads`](ref:hub/renderers/tower3d/src/app.ts#AppReads)), so `app.ts` holds no client. It drops what
  is pending that the board no longer holds (a tab of a worker gone, a showing withdrawn), so what a desk opens on is
  derived from the board it arrives on; the db keeps a showing's target, never a copy of it. A kept item whose file
  changed is entered again, so its body is read again (`drawn` names the `modifiedAt` it was read for); no draw
  reads a body or writes the db.
- *Nothing in the board flow draws at once.* Each close is the handler's, so the draw only writes the DOM, at the
  next frame. [`followCabinet`](ref:hub/renderers/tower3d/src/app.ts#followCabinet) is the handler's: it closes a game whose
  cabinet the arcade no longer stands and frames again (`game/frame`) one a game kept since moved along.
- *The plan is derived, the boards before it too.* The db keeps what the building's plan comes from, not the plan: the
  board, each floor's archive as read for it ([`archivedAt`](ref:hub/renderers/tower3d/src/archive.ts#archivedAt))
  and the wall time it was planned at; [`planOf`](ref:hub/renderers/tower3d/src/building.ts#planOf) derives the plan,
  memoized on the identity of those three, not on their value: each board taken brings a fresh snapshot and instant,
  and each replan a fresh instant, so the memo misses then, as the stored plan was rebuilt then, and serves every read until the next; it is handed to the handlers as a read (`AppReads.planOf`). The archive is a snapshot taken with the board: read live, the standing board's archive
  goes undefined once a newer board's read lands, and its plan would lose its seats while that board waits. What
  changed since the board before (a turn finished, a showing arrived, the first board) is derived from that board,
  `was` in the handler and `world/apply`, and the desk and gallery layers are made over it
  ([`desksAfter`](ref:hub/renderers/tower3d/src/layers.ts#desksAfter),
  [`galleryAfter`](ref:hub/renderers/tower3d/src/layers.ts#galleryAfter)). The caches of what the walker bumps
  into, what blocks a look and where the monitors stand stay keyed by the plan: they read the desks, the meeting
  chairs and the meshes, which change with any board, not only with the building's shape.
- *The views mounted in panels tell the app.* A view that changed what it draws sends `views/changed`, whose
  handler returns a `draw`, and a subject it hands Tower 3D to place sends `display`, whose effect places it; both go
  through the port, since the views ([`startViews`](ref:hub/renderers/tower3d/src/views.ts#startViews)) start before
  the panels that draw them.
- *Reads that land are events.* A title's text arriving (`titles/arrived`, through the port) draws the panels, and
  the notes' boards or the arcade's cabinets again (`notes`, `cabinets`). The Stats panel's read is the db's
  (`stats`): entering the panel and its minute's poll send `stats/read`, which numbers the read and returns
  `stats/fetch`; its answer comes back as `stats/landed` or `stats/failed` with that number, and one overtaken lands
  on nothing. A range changed (`stats/range`) drops what is held; the scope shown is `stats/scope`.
- *What sets the view outside a panel* (the overview) sends a `view` event; a pet sets it with the `pet` that starts it.
- *Motion is timestamps.* A ride, a camera flight, a cut and a pet are plain data in the db
  ([`Motion`](ref:hub/renderers/tower3d/src/app.ts#Motion)): when each started (simulated ms), vectors and rotations
  as numbers, and the event a flight or a cut fires as it ends (`then`, as a timer's `fire`). The db changes as one
  starts and as it ends, never in between: a frame reads `app.state()`, derives how far along each is from
  `now - start`, and dispatches once when it is done (`cut-reached`, `ride-arrived`, `flight-landed`, `pet-done`).
  No frame dispatches otherwise, and [`tickCamera`](ref:hub/renderers/tower3d/src/frames.ts#tickCamera) writes the
  camera through vectors it keeps, allocating nothing. What a cut or a flight leaves you to do is an `arrived` event
  ([`Arrival`](ref:hub/renderers/tower3d/src/app.ts#Arrival)): an ask's floor opened by `went`, the rest by
  [`ARRIVED`](ref:hub/renderers/tower3d/src/app-loop.ts#ARRIVED), since whether a desk or a kiosk still stands, the mouse,
  the orbit and a purr are the building's. A cut to where you already are fires its `then` at once
  ([`travel`](ref:hub/renderers/tower3d/src/navigation.ts#travel)). The walker stays the frames': riding turns it to the doors
  and sets its level as the ride ends, before `ride-arrived`; a `place` stands it where a cut or the door says, the ride
  and flight ended. The pet's hearts are three.js sprites, kept beside the frames that place them. A flight an
  executor starts (`fly-home`, a big screen or a game entered) is dispatched from it, so it lands in the db once the
  transition's other effects have run; only frames read it.
- *The replan is a timer.* The board handler starts a `replan` timer for the plan's `until` (the next worker leaving
  for the break room), and a plan with no end cancels the one an earlier plan started. It fires `replan-due`, whose
  `replan/at` effect reads the wall clock and dispatches `replan` at `until` or later: a timer a hidden tab or a
  napping window fires late plans for when it fired, as the first frame after `until` would, never the past. A pinned
  clock (`?at=`, every fixture) never replans: the handler is told once whether the clock moves
  (`AppReads.clockMoves`). A replan plans the same board again at that instant and keeps the archive snapshot it was taken with: only a new board takes
  a new read, so a newer board's reads half landed can't unseat a floor's workers while it waits. The cost, accepted:
  a floor whose archive read failed for a board and was read again seats its workers only at the next board.
- *Aim is written on change.* [`tickAim`](ref:hub/renderers/tower3d/src/frames.ts#tickAim) still raycasts every frame,
  but dispatches `aimed` only when the act's key changes ([`Aim`](ref:hub/renderers/tower3d/src/app.ts#Aim)). The db
  keeps the act last aimed at and the act the prompt offers verbs for apart: the prompt empties when the view leaves
  walking, while the act last aimed at is kept (`offered`). A different act starts the wheel's mark and the hold over.
  What the prompt offers is never kept: [`offersNow`](ref:hub/renderers/tower3d/src/navigation.ts#offersNow) derives it from
  the board and what you hold on every read, and the mark is read within it (`markedIn`). A hold is its start time:
  [`tickHold`](ref:hub/renderers/tower3d/src/frames.ts#tickHold) writes the ring's `--hold` every frame, dispatches
  `hold-filled` once, then runs the verb itself, outside the loop, as a key does. A verb runs outside the loop because
  many verbs dispatch and then read the db, which inside an executor they would find stale.
  [`RUN`](ref:hub/renderers/tower3d/src/panels.ts#RUN)'s entries that are transitions (a floor's panel, the
  directory, the elevator) return their event, which `run` dispatches; the rest act at once.
- *Capture is a fact reported to the app.* Pointer lock (`pointerlockchange`) and the door's capture each dispatch
  `capture`, and `captured()` reads the db ([`Capture`](ref:hub/renderers/tower3d/src/app.ts#Capture)). `still`
  (the mouse let go with P) is written by `let-go`, cleared by `unlock` and by the mouse being taken. Entering any panel
  lets go of the mouse: `went` returns an `unlock` effect before the `enter`, so no enter unlocks itself. `lock` stays a
  plain function: it writes nothing to the db, and the door's capture comes back as a `capture` event. No `port` is
  needed, since every source of these events starts after the app.
- *A leg that moves a family*:
  - gives its kinds `LEAVE` and `ENTER` entries and folds its opener and closer into them and `go`, its data
    updates into `panel`;
  - for a kind the view focuses on, adds it to `FOCUSES`, and to `ROOM` only if it shares the desk's room, and drops
    its `view` event, in one change;
  - adds a clause for each kind to `subjectLeft` and deletes the draw's own close for it (`return closeX()` in
    `renderPanel`) in the same commit, or it closes twice;
  - gives a subject check that needs an extension's pure read that read as a handler dependency (`AppReads`), never
    through a client of its own; one that needs the plan or a read outside the board waits for P3, its close left in the draw;
  - moves a body read or a state write out of the draw into the enter, or into the board handler entering it again;
  - drops its close from the bridge closes the moved kinds' enters run;
  - records `tool:frames` before and after: state, panel markup and pictures identical, the events changed as the
    transitions say.
  The drawer moved last, with P3: its close is `subjectLeft`'s, the board handler's `redraw` is gone, and `draw` is
  the only draw.

**Alternatives considered.**
- *esbuild's `--splitting`*: main becomes a real ES module chunk and native ESM tolerates cycles. It treats the
  symptom: cycles still hand out half-made bindings, the start order stays implicit, and the build gains hashed chunks
  the boot check would have to follow. It remains a separate size and caching choice.
- *Late binding by hand* (callbacks set at wire-up, a registry): the page did it four times (`onArchives`,
  `onTitles`, `onKeptTitles`, `onGameTitles`) until the reads became events through the port. Each was a cycle hidden
  at run time, and the topology stayed code spread across modules.
- *The parked split by concern* (eleven modules cut by responsibility, branch `tower/percival-32`): one strongly
  connected component of all eleven. Removing the top-level await lets it boot, but it keeps the cycle and its
  load-order hazards.

**Impact.** The start order is the graph, and a failure names its resource. No module reads a started resource as it
loads: the page's effects (its listeners, timers, the board's subscription) and its caches (the titles, the archive
reads) are each in the start of the resource they belong to, and a module is handed what it reads, so importing one
needs no resource started before it. Every panel changes state only through the app loop, and the draw writes nothing back. The spawn dialog is not a panel: a modal over whatever panel is open, run by its own machines (`hiring`,
`spawning`, started as the `spawn` resource: [`startSpawn`](ref:hub/renderers/tower3d/src/spawn.ts#startSpawn)), it stays out
of the panel union. Motion, aim and capture are in the db as well. What is left outside it
is the walker, which the frames own, the door's mode and a pointer press.
[[tower3d-registries]] rejected a full split by concern for its cycles; this is where that changes.
