---
{
  "type": "container",
  "name": "Tower 3D",
  "summary": "A first-person renderer over the renderer API: walk a tower with a floor per project, and sit at a worker's desk to drive its session.",
  "in": "tower-core",
  "reviewed": "2026-10-23",
  "refs": ["hub/renderers/tower3d/index.html", "hub/src/shared/cards.ts#renderersHtml", "hub/renderers/tower3d/src/outside.ts#outside", "hub/renderers/tower3d/src/outside.ts#traffic", "hub/renderers/tower3d/src/main.ts", "hub/renderers/tower3d/src/state.ts", "hub/renderers/tower3d/src/layers.ts#reconcile", "hub/renderers/tower3d/src/layout.ts#plan", "hub/renderers/tower3d/src/layers.ts#STATIONS", "hub/renderers/tower3d/src/layers.ts#NOTES", "hub/renderers/tower3d/src/layers.ts#CABINETS", "hub/renderers/tower3d/src/arcade.ts", "hub/renderers/tower3d/src/filing.ts#buildFiling", "hub/renderers/tower3d/src/archive.ts#readFloorArchive", "hub/renderers/tower3d/src/desk.ts#dressBinder", "hub/renderers/tower3d/src/main.ts#openLogbook", "hub/renderers/tower3d/src/cork.ts", "hub/renderers/tower3d/src/gallery.ts", "hub/renderers/tower3d/src/running.ts#buildRunning", "hub/renderers/tower3d/src/layers.ts#RUNNING", "hub/renderers/tower3d/src/layers.ts#GALLERY", "hub/renderers/tower3d/src/showing.ts#posterOf", "hub/renderers/tower3d/src/showing.ts#playFilms", "hub/renderers/tower3d/src/desk.ts#dressSide", "hub/renderers/tower3d/src/desk.ts#holdUp", "hub/renderers/tower3d/src/term.ts#mountTerm", "hub/renderers/tower3d/src/models.ts#instance", "hub/renderers/tower3d/src/zones.ts#furnish", "hub/renderers/tower3d/src/kit.ts#fillLayer", "hub/renderers/tower3d/src/zones.ts#cityModel", "hub/scripts/tour.ts", "hub/renderers/tower3d/src/room.ts#buildRoom", "hub/renderers/tower3d/src/party.ts#buildParty", "hub/renderers/tower3d/src/layout.ts#danceFloors", "hub/renderers/tower3d/src/party.ts#buildDanceFloors", "hub/renderers/tower3d/src/party.ts#mug", "hub/renderers/tower3d/src/avatar.ts#avatar", "hub/renderers/tower3d/src/palette.ts#floorPalette", "hub/renderers/tower3d/src/palette.ts#tintOf", "hub/renderers/tower3d/src/music.ts#band", "hub/renderers/tower3d/src/tv.ts#startShare", "hub/renderers/tower3d/src/sign.ts#paintSign", "hub/renderers/tower3d/src/world.ts#paintDirectory", "hub/renderers/tower3d/src/world.ts#paintStatsBoard", "hub/renderers/tower3d/models/kit.py", "hub/renderers/tower3d/models/catkit.py", "hub/renderers/tower3d/src/life.ts#catAt", "hub/renderers/tower3d/src/life.ts#guestAt", "hub/renderers/tower3d/src/life.ts#watcherOf", "hub/renderers/tower3d/src/life.ts#steer", "hub/renderers/tower3d/src/hands.ts#poseHands", "hub/renderers/tower3d/src/hands.ts#drawHands", "hub/renderers/tower3d/src/hands.ts#holdNote", "hub/renderers/tower3d/src/hands.ts#holdBeer", "hub/renderers/tower3d/models/hands.py", "hub/renderers/tower3d/src/pet.ts", "hub/renderers/tower3d/src/life.ts#purr", "hub/renderers/tower3d/src/compass.ts#pointers", "hub/package.json", "hub/src/shared/cards.ts#can", "hub/renderers/tower3d/src/acts.ts#offersOf", "hub/renderers/tower3d/src/acts.ts#KEY", "hub/renderers/tower3d/src/door.ts", "hub/renderers/tower3d/src/input.ts", "hub/renderers/tower3d/src/fixtures.ts#fixtureBoards", "hub/renderers/tower3d/src/contract.ts#CONTRACT", "hub/renderers/tower3d/src/lab.ts", "hub/scripts/drive.ts", "hub/scripts/sandbox.ts", "hub/scripts/frames.ts", "hub/renderers/tower3d/src/life.ts#chase", "hub/renderers/tower3d/src/outside.ts#airfield", "hub/renderers/tower3d/src/outside.ts#flight", "hub/renderers/tower3d/models/plane.py"],
  "links": [
    { "to": "tower-server", "verb": "calls", "carries": "through /tower.js: the board, the API's verbs and reads, and screen and shell streams on /mux" }
  ]
}
---
The built-in renderer `tower3d`, served at `/r/tower3d/` ([[renderers-in-config]]). Its TypeScript is bundled into
a git-ignored `renderers/tower3d/out/` beside copies of its pages ([[bundled-renderer]]): `npm run tower3d`, or
`npm run tower3d:watch`. `out/` is the renderer's root, so a fresh checkout lists Tower 3D as not built until it
builds. Its settings name the cats by coat (`settings.cats`, [`catName`](ref:hub/renderers/tower3d/src/acts.ts#catName)).
It can sit on a shelf, framed, as a `renderer` entry, its settings with it. Its pause card lists the declared
renderers from `GET /renderers` ([`renderersHtml`](ref:hub/src/shared/cards.ts#renderersHtml)).

**The start.** A loading screen, the elevator's panel, lights a button per stage; a live page draws nothing until
its first board is built and its shaders compiled ([[tower3d-start]]).

**Board → plan → scene.** [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan) is a pure function from the board
to the building as data: the lobby, a floor per project, the roof, one shared floor plate, every workstation (taken
or free) and shell kiosk slot, and what a walker bumps into. The scene, the walking and the panels all read
positions from it. The building is rebuilt when its shape changes; desks are kept by session id and re-dressed on
every board, so a status change never tears the floor down. Only the levels you can see are drawn
([[tower3d-levels]]). Every workstation is an L dressed from its worker's card ([[desk-dressing]]); every level has
KayKit zones placed from the plan ([[office-kaykit]]). A worker's desk is `card.seat`, and every floor has the same
workstations whether anyone sits at them or not, the lowest free one open and offering a hire ([[workstations]]).
Every floor has a shared wall with the corkboard and the gallery ([[shared-wall]], [[corkboard]]), and a loft over
its left wing with the control room on its deck; the rooms under and before it are [[floor-plan]]'s.

**Inside** ([[tower3d-registries]]): one state record ([`state.ts`](ref:hub/renderers/tower3d/src/state.ts)); the
things drawn per board as keyed layers reconciled against the plan
([`reconcile`](ref:hub/renderers/tower3d/src/layers.ts#reconcile)); what each kind of thing offers and does as tables
keyed by act kind; a frame as an ordered list of ticks.

**Using it.** You walk in first person and see your own hands, drawn over the world so they never clip
([`drawHands`](ref:hub/renderers/tower3d/src/hands.ts#drawHands)), carrying a note you took. Whatever you aim at
(within reach, on your level, not behind a wall, glass or a shut landing door:
[`walls`](ref:hub/renderers/tower3d/src/layout.ts#walls)) lists what it offers, each verb on its own key
([[verb-prompts]]); [`offersOf`](ref:hub/renderers/tower3d/src/acts.ts#offersOf) derives them from the board every
frame, and which verbs a thing offers comes from the board's verbs ([[board-verbs]]), asked with
[`can`](ref:hub/src/shared/cards.ts#can). The building's own keys (floors, the next wait, the directory, the view from
outside) are [`onKey`](ref:hub/renderers/tower3d/src/main.ts#onKey)'s. A stopped worker's desk offers resume first
and shows its last screen read-only; a stranded one offers Let go beside Resume ([[let-go]], [[carry-on]]). Beside
every keyboard lies the worker's logbook ([[logbook]]). Each floor's Running board
([`buildRunning`](ref:hub/renderers/tower3d/src/running.ts#buildRunning)) lists what the floor's workers left running
and the hires whose work landed, ended from there or from the floor panel's Tidy ([[tidy]], [[carried]],
[[discard]], [[press-feedback]]). Where you stand is kept with `tower.remember`.

Sitting at a desk opens the session's real terminal in a modal over the world, which stops drawing until it
closes; the worker stays at its keyboard, posed for its status
([`poseDesk`](ref:hub/renderers/tower3d/src/desk.ts#poseDesk)). How the terminal claims the PTY is [[tower3d-desk]]
([`mountTerm`](ref:hub/renderers/tower3d/src/term.ts#mountTerm) over `/term-view.js`). Monitors stream while the card
is `live`, a changing one repainted less often the farther its nearest monitor in sight
([`paintScreens`](ref:hub/renderers/tower3d/src/screens.ts#paintScreens)). With reduced motion
([`reducedMotion`](ref:hub/src/shared/prefs.ts#reducedMotion)) the camera cuts where it would fly and waiting lights
pulse once, then hold. Waiting lights take the colour of the loudest wait they light for
([`loudest`](ref:hub/src/shared/cards.ts#loudest)), and only one that needs you pulses. A wait that begins rings
as the settings popover sets it ([[viewer-prefs]]); framed, it rings nothing and leaves ringing to the page
framing it ([[attention-list]]); an arrow on the screen's edge points to each worker on your floor waiting on you
out of view ([`pointers`](ref:hub/renderers/tower3d/src/compass.ts#pointers)).

**The control room** ([`buildRoom`](ref:hub/renderers/tower3d/src/room.ts#buildRoom)) on each floor's deck: a video
wall with a live tile per worker on duty, one face into the room and one over the floor, either opening the worker's
desk panel; the console facing it, which opens the floor panel (dirs, new shell, archive, spawn, and a tray per
collection, [[collection-trays]]); the floor's shells on a bench. Under the deck, the archive holds the shelf, a
bookcase, TV or poster per entry ([[shelf-items]]), and the game room, on a floor keeping games, the arcade
([[arcade]]). In the nook by the archive stand the filing cabinet, the floor's archive by day ([[logbook]],
[`readFloorArchive`](ref:hub/renderers/tower3d/src/archive.ts#readFloorArchive)), the Running board, and a pigeonhole
holding the floor's review threads ([`buildPigeonhole`](ref:hub/renderers/tower3d/src/pigeonhole.ts#buildPigeonhole),
[[review-threads]]). A [[reviewer]] sits beside its author with a notebook, and notes new to a worker lie on its
desk.

**Panels and world** ([[design-system]]). The panels are the shared components of `/design.css` in the viewer's
scheme: the HUD ([`hudHtml`](ref:hub/renderers/tower3d/src/ui.ts#hudHtml)), the prompt card, the elevator list, the
floor panel and directory, the desk panel (Terminal, Logbook, Changes, Reviews and a tab per showing,
[[shared-panels]]) and the reader. What is drawn into the scene keeps one palette with them, and the building's
signage is the panels' floor sign painted on canvas
([`paintSign`](ref:hub/renderers/tower3d/src/sign.ts#paintSign),
[`paintDirectory`](ref:hub/renderers/tower3d/src/world.ts#paintDirectory)).
[`floorPalette`](ref:hub/renderers/tower3d/src/palette.ts#floorPalette) derives every surface of a floor from the
project's `color`: warm neutrals with a little of it mixed in, and the colour itself on a few countable things, so
the workers' status colours stay the loudest thing on a floor.

**Showings** ([[agent-show]]). A worker that showed something has a second monitor on its desk with its latest
showing ([`posterOf`](ref:hub/renderers/tower3d/src/showing.ts#posterOf)): a page typeset, an image or a video read
as a blob ([[blob-reads]]), anything else a poster. Only the newest videos on your floor play
([`playFilms`](ref:hub/renderers/tower3d/src/showing.ts#playFilms)), and none on a stepped clock. A showing new
since the last board is held up over the worker's head, then laid on the monitor
([`holdUp`](ref:hub/renderers/tower3d/src/desk.ts#holdUp)), wearing a NEW ribbon until opened
([`dressSide`](ref:hub/renderers/tower3d/src/desk.ts#dressSide)).

**The big screens** ([`startShare`](ref:hub/renderers/tower3d/src/tv.ts#startShare)): one in the lobby lounge and a
jumbotron behind the roof's DJ, showing one canvas a viewer shares through `getDisplayMedia`. Capture refuses opaque
origins, so a framed Tower 3D opens itself in a new tab at `#tv` to share. The share lives in the page only.

**Music** ([`band`](ref:hub/renderers/tower3d/src/music.ts#band)): lo-fi generated live by WebAudio, kept on or off
with your spot, ducked while a terminal or a big screen fills the view.

**The roof** ([`buildParty`](ref:hub/renderers/tower3d/src/party.ts#buildParty)): the rate limits as glass columns
and the stats board painted from `board.today` ([[stats]]); a dance floor per project with guests today
([`danceFloors`](ref:hub/renderers/tower3d/src/layout.ts#danceFloors)), the guests being today's off-duty workers,
placed from the sim clock and the plan alone ([`guestAt`](ref:hub/renderers/tower3d/src/life.ts#guestAt)) and
offering resume and their logbook; a DJ who turns the music on or off and a bar that hands you a beer; a firework in
a worker's colour for every turn it finishes.

**The building and outside** ([[tower3d-look]]). The building's shell, the city and the roof plant are geometry
generated at load (`renderers/tower3d/src/exterior/`); the lighting (`renderers/tower3d/src/light/`) is a setting,
applied on the next load ([`startLighting`](ref:hub/renderers/tower3d/src/light/setting.ts#startLighting)). Around
the block, cars drive a ring road ([`traffic`](ref:hub/renderers/tower3d/src/outside.ts#traffic)) and a plane flies
its round from an airfield ([`flight`](ref:hub/renderers/tower3d/src/outside.ts#flight)), each placed from the sim
clock alone, so stepped loads repeat.

**Life.** New workers walk in from the elevator and sit down, and leavers stand up and walk out through its doors
([`doorTarget`](ref:hub/renderers/tower3d/src/main.ts#doorTarget)). A worker's look is its own, from the wardrobe
([`lookOfWorker`](ref:hub/renderers/tower3d/src/wardrobe.ts#lookOfWorker), [[kaykit-workers]]); its status shows on
the light over its head, its bubble and its pose, and a line over its tag says what it is up to
([`glanceOf`](ref:hub/renderers/tower3d/src/cards.ts#glanceOf)). Cats roam the levels on a schedule hashed from the
time ([`catAt`](ref:hub/renderers/tower3d/src/life.ts#catAt)); the one on your floor follows you, one sits on the desk
of the first worker waiting on you ([`watcherOf`](ref:hub/renderers/tower3d/src/life.ts#watcherOf)), and you can pet
one ([`pet.ts`](ref:hub/renderers/tower3d/src/pet.ts)).

**Models** are Blender scripts in `renderers/tower3d/models/` (`npm run tower3d:models`), exported to committed
`.glb` files, built beside the pages and fetched as they start ([[bundled-renderer]]). The renderer reads a model only
by names ([`instance`](ref:hub/renderers/tower3d/src/models.ts#instance)): pivots for parts it moves, and materials,
where `glow` is unlit, `own` is copied per instance to be recoloured, and anything else is toon-shaded. Live surfaces
(screens, books, tiles) stay in code. The names it reads are data in
[`CONTRACT`](ref:hub/renderers/tower3d/src/contract.ts#CONTRACT), checked against every `.glb` by `npm test`; the
workers' characters and the parts made by hand in `parts/parts.blend` are [[kaykit-workers]]'. `lab.html`
([`lab.ts`](ref:hub/renderers/tower3d/src/lab.ts)) shows one model on a stand with its draw calls and names, and
`dresser.html` dresses, poses and fits one worker and saves the wardrobe ([[character-creator]]).

**The door** ([[tower3d-door]]): `window.tower3d` ([`door.ts`](ref:hub/renderers/tower3d/src/door.ts)) is how an
agent drives and sees it: intents in ([`input.ts`](ref:hub/renderers/tower3d/src/input.ts)), a simulated clock
stepped frame by frame, a seeded `random`, and fixture boards
([`fixtureBoards`](ref:hub/renderers/tower3d/src/fixtures.ts#fixtureBoards)) that open no streams
([`watchStream`](ref:hub/renderers/tower3d/src/fixtures.ts#watchStream)), so two loads with the same seed and steps
give the same pixels. [`drive.ts`](ref:hub/scripts/drive.ts), [`sandbox.ts`](ref:hub/scripts/sandbox.ts),
[`frames.ts`](ref:hub/scripts/frames.ts) and [`tour.ts`](ref:hub/scripts/tour.ts) drive, host, record and shoot it;
[`tower3d-boot.ts`](ref:hub/scripts/tower3d-boot.ts) boots it once in CI, on a tower alone
([`tower-alone.ts`](ref:hub/scripts/tower-alone.ts)).
