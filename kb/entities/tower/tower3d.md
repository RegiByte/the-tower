---
{
  "type": "container",
  "name": "Tower 3D",
  "summary": "A first-person renderer over the renderer API: walk a tower with a floor per project, and sit at a worker's desk to drive its session.",
  "in": "web-tower",
  "reviewed": "2026-10-08",
  "refs": ["hub/renderers/tower3d/index.html", "hub/src/shared/cards.ts#renderersHtml", "hub/renderers/tower3d/src/outside.ts#outside", "hub/renderers/tower3d/src/outside.ts#traffic", "hub/renderers/tower3d/src/main.ts", "hub/renderers/tower3d/src/state.ts", "hub/renderers/tower3d/src/layers.ts#reconcile", "hub/renderers/tower3d/src/layout.ts#plan", "hub/renderers/tower3d/src/layers.ts#STATIONS", "hub/renderers/tower3d/src/layers.ts#NOTES", "hub/renderers/tower3d/src/layers.ts#CABINETS", "hub/renderers/tower3d/src/arcade.ts", "hub/renderers/tower3d/src/filing.ts#buildFiling", "hub/renderers/tower3d/src/archive.ts#readFloorArchive", "hub/renderers/tower3d/src/desk.ts#dressBinder", "hub/renderers/tower3d/src/main.ts#openLogbook", "hub/renderers/tower3d/src/cork.ts", "hub/renderers/tower3d/src/gallery.ts", "hub/renderers/tower3d/src/running.ts#buildRunning", "hub/renderers/tower3d/src/layers.ts#RUNNING", "hub/renderers/tower3d/src/layers.ts#GALLERY", "hub/renderers/tower3d/src/showing.ts#posterOf", "hub/renderers/tower3d/src/showing.ts#playFilms", "hub/renderers/tower3d/src/desk.ts#dressSide", "hub/renderers/tower3d/src/desk.ts#holdUp", "hub/renderers/tower3d/src/term.ts#mountTerm", "hub/renderers/tower3d/src/models.ts#instance", "hub/renderers/tower3d/src/zones.ts#furnish", "hub/renderers/tower3d/src/kit.ts#fillLayer", "hub/renderers/tower3d/src/zones.ts#cityModel", "hub/scripts/tour.ts", "hub/renderers/tower3d/src/room.ts#buildRoom", "hub/renderers/tower3d/src/party.ts#buildParty", "hub/renderers/tower3d/src/layout.ts#danceFloors", "hub/renderers/tower3d/src/party.ts#buildDanceFloors", "hub/renderers/tower3d/src/party.ts#mug", "hub/renderers/tower3d/src/avatar.ts#avatar", "hub/renderers/tower3d/src/palette.ts#floorPalette", "hub/renderers/tower3d/src/palette.ts#tintOf", "hub/renderers/tower3d/src/music.ts#band", "hub/renderers/tower3d/src/tv.ts#startShare", "hub/renderers/tower3d/src/sign.ts#paintSign", "hub/renderers/tower3d/src/world.ts#paintDirectory", "hub/renderers/tower3d/src/world.ts#paintStatsBoard", "hub/renderers/tower3d/models/kit.py", "hub/renderers/tower3d/models/catkit.py", "hub/renderers/tower3d/src/life.ts#catAt", "hub/renderers/tower3d/src/life.ts#guestAt", "hub/renderers/tower3d/src/life.ts#watcherOf", "hub/renderers/tower3d/src/life.ts#steer", "hub/renderers/tower3d/src/hands.ts#poseHands", "hub/renderers/tower3d/src/hands.ts#drawHands", "hub/renderers/tower3d/src/hands.ts#holdNote", "hub/renderers/tower3d/src/hands.ts#holdBeer", "hub/renderers/tower3d/models/hands.py", "hub/renderers/tower3d/src/pet.ts", "hub/renderers/tower3d/src/life.ts#purr", "hub/renderers/tower3d/src/compass.ts#pointers", "hub/package.json", "hub/src/shared/cards.ts#can", "hub/renderers/tower3d/src/acts.ts#offersOf", "hub/renderers/tower3d/src/acts.ts#KEY", "hub/renderers/tower3d/src/door.ts", "hub/renderers/tower3d/src/input.ts", "hub/renderers/tower3d/src/fixtures.ts#fixtureBoards", "hub/renderers/tower3d/src/contract.ts#CONTRACT", "hub/renderers/tower3d/src/lab.ts", "hub/scripts/drive.ts", "hub/scripts/sandbox.ts", "hub/scripts/frames.ts", "hub/renderers/tower3d/src/life.ts#chase", "hub/renderers/tower3d/src/outside.ts#airfield", "hub/renderers/tower3d/src/outside.ts#flight", "hub/renderers/tower3d/models/plane.py"],
  "links": [
    { "to": "tower-server", "verb": "calls", "carries": "through /tower.js: the board, every verb (spawn, resume, keys, submit, resize, kill, reap, reap/process, open, reveal, edit, shell/*, collection/*), shelf and collection reads, remember/recall, and screen and shell streams on /mux" }
  ]
}
---
The built-in renderer `tower3d`, served at `/r/tower3d/` ([[renderers-in-config]]). Its TypeScript is bundled into
`renderers/tower3d/out/tower3d.js` beside a copy of its page, `renderers/tower3d/index.html` ([[bundled-renderer]]):
`npm run tower3d`, or `npm run tower3d:watch` while working on it. `out/` is git-ignored and is the renderer's
root, so a fresh checkout lists Tower 3D as not built until it builds. Its settings name the cats by coat
(`settings.cats`, [`catName`](ref:hub/renderers/tower3d/src/acts.ts#catName)). It can sit on a shelf, framed, as a
`renderer` entry, its settings with it. Its pause card lists the declared renderers from `GET /renderers`
([`renderersHtml`](ref:hub/src/shared/cards.ts#renderersHtml)), each built one a link to `/r/<name>/`; framed,
where the frame can't navigate the tower page, a link opens a tab of its own.

**Board → plan → scene.** [`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan) is a pure function from
the board to the building as data: the lobby, a floor per project, the roof, one shared floor plate, every
workstation (taken or free) and shell kiosk slot, and what a walker bumps into. The scene, the walking and the panels all read
positions from it. The building is rebuilt when its shape changes. Desks are kept by session id and
re-dressed on every board, so a status change never tears the floor down. Only the levels you can see are drawn: yours, those a ride passes, all of them from outside ([[tower3d-levels]]). Every workstation is an L whose KayKit
props are derived from its worker's card ([[desk-dressing]]). Every level has KayKit zones placed from the plan
([`furnish`](ref:hub/renderers/tower3d/src/zones.ts#furnish), [[office-kaykit]]): on a floor, a rug under every
workstation, a lounge, a meeting table, a coffee point, planters, a hero at the end of the aisle you look down from
the elevator in the project's colour, and a couch facing the Running board, all in a pastel of the project's
colour; in the lobby a runner, a waiting corner, the reception dressed and the city model (a building per project
on a lit pad, as tall as its workers on duty, [`cityModel`](ref:hub/renderers/tower3d/src/zones.ts#cityModel)); on
the roof plant and a helipad behind the party, and lanterns and pumpkins in October. Their colliders come from the
models' bounds. They draw on one KayKit path shared with the playground
([`fillLayer`](ref:hub/renderers/tower3d/src/kit.ts#fillLayer)). A worker's desk is the lowest
free one when it came on duty, replayed from the floor's cards in the bridge and read as `card.seat` (a stranded worker holds its desk until its
conversation is resumed), so desks never shift when someone leaves, on any board or reload. Every floor has
the same workstations whether anyone sits at them or not ([[workstations]]): the lowest free one is open, lit,
and offers a hire. Every floor has a shared wall standing free before the back glass, right of the core
([[shared-wall]]): the corkboard on its left when the floor keeps drafts, a note per draft ([[corkboard]]), and
on its right a gallery of the floor's last nine showings, of the twelve the bridge gathers in `floor.gallery`. The control
room deepens to fit its floor's shelf and shells, and the plate with it.

**Inside** ([[tower3d-registries]]): one state record ([`state.ts`](ref:hub/renderers/tower3d/src/state.ts));
desks, free workstations, video walls, Running boards, pigeonholes, filing cabinets, arcade cabinets, the roof's dance
floors and guests, pinned notes and hung pictures as keyed layers reconciled against the plan on every board
([`reconcile`](ref:hub/renderers/tower3d/src/layers.ts#reconcile)); what each kind of thing offers and does as
tables keyed by act kind; a frame as an ordered list of ticks.

**Using it.** You walk (pointer lock, WASD, Space to jump) and look at things. You see your own hands, two round mitts in
sleeves ([`models/hands.py`](ref:hub/renderers/tower3d/models/hands.py)), in a scene of their own drawn over the world once its
depth is cleared ([`drawHands`](ref:hub/renderers/tower3d/src/hands.ts#drawHands)), so they never clip into a desk; they show
while walking or petting, never during a ride or a flight. They swing and bob with your pace, lag behind a turn and lift
mid-jump, all from how far you moved and turned this frame ([`poseHands`](ref:hub/renderers/tower3d/src/hands.ts#poseHands)).
A note you carry is held low in both hands, tipped back, its title painted on paper as on the board
([`holdNote`](ref:hub/renderers/tower3d/src/hands.ts#holdNote)): it rises when taken and drops when put back or handed
over, so it shows only where the hands do (not in the overview). Whatever you aim at lists what
it offers in the bottom-right corner, each verb on its own key ([[verb-prompts]]): E uses it (sit, open
here, read, watch, open its panel), F goes on (resume, go to whoever resumed it, next waiting), Q looks
closer (logbook, overview), G spawns, T opens a shell, C opens the user's editor, and held X or Z ends something (send
home, kill, stop sharing; reap) once its ring fills. A worker's card lists what it left running, and each floor's
Running board ([`buildRunning`](ref:hub/renderers/tower3d/src/running.ts#buildRunning)), on the control room's outer
wall between the back glass and the door, lists every process the floor's workers left running (worker, pid,
ports, orphan, command): held Z on a row ends that one process, F goes to its worker's desk; a hire whose work landed
is a row too, its own `landed` act, held Z killing only it through its Tidy row's call; past the rows that fit,
the floor panel lists them all, each ended on a second click, and lists Tidy's rows, each with a ⌫ that applies only
that row and Tidy all, both on a second click. The mouse wheel marks a verb and a click runs it.
[`offersOf`](ref:hub/renderers/tower3d/src/acts.ts#offersOf) derives each thing's offers from the board on
every frame. A stopped worker's desk offers resume first, and sitting there shows its last screen read-only.
Beside every worker's keyboard lies its logbook, a binder as thick as the sessions it ran as; E on it opens the desk
panel's Logbook tab where you stand, and a past session there replays its last screen, sepia and stamped, in the panel
and on the desk's monitor ([[logbook]]).
The open desk hires: E starts a worker in the hub with the defaults and sits you at its terminal, G opens the
new-session dialog. On the corkboard, E takes a note into your hand and Q opens it in the draft panel beside the
world; H hands the carried note to a worker offering `submit` or hires a worker on it at the open desk
([[corkboard]]).
Digits and R go
to a floor (0 the lobby, R the roof): a ride from inside the elevator car, a fade from anywhere else.
Sitting at a desk opens the session's real terminal in a modal centred over the world, which stops drawing
until it closes (a shell kiosk and the reader open the same way; a big screen still flies the camera to it); the worker
stays at its keyboard, posed for its status ([`poseDesk`](ref:hub/renderers/tower3d/src/desk.ts#poseDesk)). A live terminal
claims the PTY size as it opens when no other terminal is open on the session
([`mountTerm`](ref:hub/renderers/tower3d/src/term.ts#mountTerm), [[tower3d-desk]]), so typing works at once. Esc goes to Claude, so the panel closes with ✕ or a click on the world. Fast travel: N for
the next worker waiting on you, M for the directory, H for the tower from outside. P lets go of the mouse
without the pause card, the view held as it is (prompt card, HUD, crosshair), for a screenshot of the
running tower. Where you stand is kept
with `tower.remember`, so a reload puts you back. Which verbs a desk, a tile, a guest, the console, the archive or the
floor panel offers comes from the board's verbs ([[board-verbs]]), asked with
[`can`](ref:hub/src/shared/cards.ts#can); monitors stream while the card is `live`. With reduced motion
([`reducedMotion`](ref:hub/src/shared/prefs.ts#reducedMotion): the viewer's motion setting, or else the system's) the camera cuts where it would fly, and
waiting lights pulse once when someone new starts waiting, then hold. Waiting lights (a floor's lamp, a wall tile, the
beacon) take the colour of the loudest wait they light for ([`loudest`](ref:hub/src/shared/cards.ts#loudest)), and only
one that needs you pulses: an answer ready holds a calm green ([[design-system]]). A changing
monitor is repainted by the distance of its nearest monitor in sight (desk or video-wall tile): every 150 ms within 6 m, 600 ms
within 14 m, 2 s beyond ([`paintScreens`](ref:hub/renderers/tower3d/src/screens.ts#paintScreens)); one out of sight
waits.

**The control room** ([`buildRoom`](ref:hub/renderers/tower3d/src/room.ts#buildRoom)), in each floor's
back-left corner:
- A video wall with a live tile per worker on duty, framed in its status. E opens the terminal in place.
- The console, which opens the floor panel (dirs, new shell, archive, spawn, and a tray per collection holding items,
  [[collection-trays]]: a draft opens in its editor, a game at its cabinet, any other item in the reader).
- The floor's shells on a bench.
- The shelf: a bookcase per markdown collection or markdown item (a book per file, E reads it), a TV per
  `html`/`url`/`renderer` entry or other item ([[shelf-items]]), a poster per `link`. A page never opens itself (`self` from the board). An `html` entry opens in a frame
  in the page. A `url` opens in the tower's own view when framed, else in a new tab: a frame inside this
  page inherits the shelf sandbox (an opaque origin, no forms, no storage), so a web app's requests and
  state break there. A `renderer` opens the same way: it reads the board, which only the framing tower relays.
- A couch facing the video wall from the front glass, and racks and a planter in the front corners where the bench
  and the shelf leave room (KayKit zones, [[office-kaykit]]); nothing stands before the video wall.
- Outside it, against its outer wall between the back glass and the Running board, the filing cabinet: the floor's
  archive in four drawers by day, the latest on top, a folder per worker with its callsign on the tab. E pulls a
  drawer out and lists its workers beside the world; a folder opens the worker's logbook in the reader, its last
  screen over its sessions and conversations ([[logbook]]). The floor panel's archive lists the same read
  ([`readFloorArchive`](ref:hub/renderers/tower3d/src/archive.ts#readFloorArchive)); a first read that fails says so
  there with Read again (the shared `failedHtml`), and one failing over cards read before keeps them and toasts.
- On a floor keeping games, the arcade: a cabinet per game along the glass front, the couch stepped back; E plays
  the game in a sandboxed frame on the right half of the screen, the camera facing the cabinet and the music
  stopped until it closes ([[arcade]]).

**Panels and world** ([[design-system]]). The panels are the shared components of `/design.css` in the
viewer's scheme, which reaches the frame as the renderer API's `scheme` message: the HUD, one row of loose chips at the
bottom-left over the world, as wide as the prompt card leaves room for, the floor name the one that shrinks (the host lamp, a word beside it once the host is outdated or down, the music toggle and the settings gear, a floor sign for where you are, a waiting chip that is the
N button, lamp counts per attention and shells, rate-limit mini meters with when each resets, a pace tick on a weekly one (how much of the week has gone, [`weekElapsed`](ref:hub/src/shared/cards.ts#weekElapsed), shared with the tower page) and the reading's age, dimmed once it is past 15 minutes, new showings (V) and stop sharing, each shown only
while it says something; [`hudHtml`](ref:hub/renderers/tower3d/src/ui.ts#hudHtml)), the prompt card (what you aim at and its verbs on their keys), the elevator list,
the floor panel and directory (signs and worker cards; the left rail `#rail` stacks it from the top, above the fps readout and the HUD, so none of them needs an offset), the desk panel (status pill, an ask banner while the
worker needs you, Terminal, Logbook, Changes and, on a floor keeping review threads, Reviews tabs ([[shared-panels]]), and a tab per showing, the logbook or showing laid over the terminal so the PTY keeps its size) and the reader. What is drawn into the scene keeps one
palette: a desk's tag is a status pill in its attention colour, its glance line a paper card, its bubble
needs-red (a question), ready-green (an answer), broken (a failure) or a paper `z`; lamps, video-wall frames and monitors take the same fixed colours. The
building's signage is the panels' floor sign painted on canvas ([`paintSign`](ref:hub/renderers/tower3d/src/sign.ts#paintSign)):
over every landing's doors (the lobby and the roof in the lobby's amber), on the facade, a row per floor on the
lobby's directory board ([`paintDirectory`](ref:hub/renderers/tower3d/src/world.ts#paintDirectory), with who's on
duty or a needs chip) and a row per level on the car's panel. "The Tower" is display caps on enamel plates over
the core doors, the entrance and the roof; the big screens' placard is enamel too.

**Showings** ([[agent-show]]). A worker that showed something has a second monitor on its desk, turned to the
seat, with its latest showing: markdown typeset as a page with its images, an image letterboxed on the screen,
a video's frames, anything else a poster naming it ([`posterOf`](ref:hub/renderers/tower3d/src/showing.ts#posterOf)). A WebGL
texture can't take a framed page's pixels (an opaque origin taints them), so images and videos come in as blobs through the
renderer API ([[blob-reads]]) and pages get posters. A video plays muted and looping on a blob URL, each new frame
painted where it hangs; only the two newest on the floor you stand on play
([`playFilms`](ref:hub/renderers/tower3d/src/showing.ts#playFilms)), every other holds the frame it stopped on, and
on a stepped clock none plays, so its first frame is the same on every load. Its sound is in the reader.
E on the monitor sits at the desk with that showing's tab open. A showing new since the last board is held up
over the worker's head, turned to you, with a short arpeggio, then laid on the monitor
([`holdUp`](ref:hub/renderers/tower3d/src/desk.ts#holdUp)); a toast names it, and at its desk its tab opens.
Until you open it the monitor wears a NEW ribbon ([`dressSide`](ref:hub/renderers/tower3d/src/desk.ts#dressSide)),
its tab a dot, and the HUD counts it; V goes to the newest. What you opened is kept with your spot; on a first
visit everything already shown counts as seen. The floor's gallery ([[shared-wall]]) hangs the last nine showings
of any worker on it, framed in the worker's colour over a plaque: a new one flies from over its worker's head to
the centre once held up, the rest sliding aside. E on a picture opens it in the reader where you stand; F goes to
its worker's desk on that tab.

**Floors with their project's accents.** [`floorPalette`](ref:hub/renderers/tower3d/src/palette.ts#floorPalette)
derives every surface from the project's `color`, read as `#rrggbb` through a canvas (any CSS form,
[`tintOf`](ref:hub/renderers/tower3d/src/palette.ts#tintOf)): carpet, walls, ceiling and the shared wall are warm
neutrals with a few percent of the project mixed in (oklab, as `projectTones`), and the colour itself goes on a few
countable things: the landing rug with the floor's number painted on, the band between storeys and the glowing line
along the glass seen from outside, the control room's trim and the signs. The tower reads as stacked coloured lines,
and the workers' status colours stay the loudest thing on a floor.

**The big screens** ([`tv.ts`](ref:hub/renderers/tower3d/src/tv.ts#startShare)): one in a lobby lounge, a
jumbotron behind the roof's DJ, all showing one canvas texture. E shares a screen, window or tab through
`getDisplayMedia` and then watches it up close. Capture refuses opaque origins (`SecurityError: Invalid
security origin`, even with `allow="display-capture"`), so a Tower 3D framed from a shelf opens itself in a new tab,
at `/r/<name>/#tv` (a `renderer` entry) or `/run/…#tv` (an `html` one), landing at the lounge. The share lives in the page only.

**Music** ([`band`](ref:hub/renderers/tower3d/src/music.ts#band)): lo-fi generated live by WebAudio (no
recordings), started by the first click or key, B or the HUD to mute (kept with your spot), ducked while a
terminal or the big screen is open, opened up on the roof. The party dances to its beat.

**The roof** ([`buildParty`](ref:hub/renderers/tower3d/src/party.ts#buildParty)):
- The rate limits as glass columns filled to the share used, labelled with the reset's wall-clock time, a weekly one
  collared at the share of the week gone and labelled with what the week has left at its pace so far (`today.budget`);
  last in their row, the stats board ([`paintStatsBoard`](ref:hub/renderers/tower3d/src/world.ts#paintStatsBoard)):
  today's spend, agent-hours, waits on you and the week left, painted from `board.today` as it moves. E opens the
  shared Stats panel in the reader, the overview and every floor as tabs, read again every minute ([[stats]],
  [[shared-panels]]); and a party whose guests are today's off-duty workers. F on a guest resumes its
  conversation or goes to whoever resumed it; Q opens its logbook in the reader.
- A dance floor per project with guests today, in the board's order
  ([`danceFloors`](ref:hub/renderers/tower3d/src/layout.ts#danceFloors)): packed into the free roof on either side of
  the elevator and the rate limits, the first on the DJ's side, the next on the bar's, each as large as its side
  leaves room for (6×5 tiles at most). Each flashes in its project's colour under a sign with its name; past eight
  projects the eighth floor is shared by the rest, flashing in the party's colours. One instanced mesh holds every
  tile ([`buildDanceFloors`](ref:hub/renderers/tower3d/src/party.ts#buildDanceFloors)), kept as a layer and rebuilt
  only when the floors change.
- The guests roam ([`guestAt`](ref:hub/renderers/tower3d/src/life.ts#guestAt)): the party runs in legs of 15 to 25
  seconds, and on each, a guest wants to dance on its own project's floor, drink at the bar or mingle in a circle of up
  to three on the plaza between the elevator and the rate limits, hashed from its id and the leg. In the order of
  their ids, each takes the first free place it wants from a hashed start; one finding the bar or the plaza full
  dances. A few seconds into a leg it walks there around what a walker bumps into (the cats' grid), hurrying when the
  way is long. Its place comes from the simulated clock and the plan alone, so a stepped load puts it in the same
  place on every run; a board that brings a new guest moves only those whose place it takes.
- At the back, both facing the floors: the DJ before the jumbotron on the left, the bar on the right with four stools
  at its counter. A guest at the bar sits on one (standing, it is shorter than the counter) with a beer, a mug of
  amber glass under a foam head hung on its `hand_R` ([`mug`](ref:hub/renderers/tower3d/src/party.ts#mug)), and lifts
  it for a sip every few seconds. E at the bar grabs you one too, held in your right hand
  ([`holdBeer`](ref:hub/renderers/tower3d/src/hands.ts#holdBeer)) and sipped every ten seconds, wherever you walk;
  E there again puts it down. Taking a note off a corkboard puts it down (the note takes both hands), and it hides
  while you pet a cat.
- The DJ: E turns the music on or off.
- A firework in a worker's color for every turn it finishes (working → done or idle, between boards), over its
  project's dance floor if it has one.
- The sky follows the viewer's clock.

**Outside** ([`outside`](ref:hub/renderers/tower3d/src/outside.ts#outside)): a sky, light and city of windows
lit by the viewer's clock, and a ring road around the block, 42 to 57 m out, its asphalt and centre dashes one mesh.
Sixteen cars drive it on the right in two lanes ([`traffic`](ref:hub/renderers/tower3d/src/outside.ts#traffic)), three
instanced meshes (body, cabin, lamps); each lane is a convoy at its own speed whose cars drift ahead and back, never
into each other, so where every car is follows from the sim clock and hashed constants alone, the same on every
`?stepped` load. Their lamps light up at night. East of the ring is an airfield
([`airfield`](ref:hub/renderers/tower3d/src/outside.ts#airfield)): a runway along z at x 78 with a taxiway beside it,
grass, paving and markings one mesh and its edge and end lights another; the city leaves its ground and approaches
clear. A high-wing plane ([`models/plane.py`](ref:hub/renderers/tower3d/models/plane.py), pivots `prop` and `strobe`)
flies its round ([`flight`](ref:hub/renderers/tower3d/src/outside.ts#flight)): a hold at the runway's end, the roll
and climb-out, two laps around the tower 60 m or more out, up to 80 m and back down, the landing and the taxi back,
about 91 s. Its place is a spline through the round's points and a speed that changes evenly between them, banked
from its turn rate, so like the cars it follows from the sim clock alone. Its prop turns and its strobes flash from
the clock too. The plane joins once the models load (`fly`), and never comes between the roof and its big screen.

**Life:** new workers walk in from the elevator and leavers walk out, along the landing and the aisles
between desk columns, and through the elevator's doors. A landing's doors open ahead of a leaver, close
behind it once it stands in the car facing out, and only then is it gone ([`doorTarget`](ref:hub/renderers/tower3d/src/main.ts#doorTarget)). Three cats, Mochi (a grey tabby),
Patches (a calico) and Domino (a tuxedo), roam the tower on a schedule hashed from the time
([`catAt`](ref:hub/renderers/tower3d/src/life.ts#catAt)): every two minutes all three take distinct levels, project floors first in
a hashed order, the leftovers to the lobby and the roof. On each, a cat comes out of the elevator, takes a few walks
along a grid around what a walker bumps into, each ending in a sit, a groom or a nap, then goes back in. The same wall clock
puts them in the same places on every load. The cat on your floor follows you, about a metre behind and running to
catch up, and sits facing you when you stop; it lets you go when you ride away or twenty seconds before its turn there
ends, and walks back to its schedule along the grid ([`steer`](ref:hub/renderers/tower3d/src/life.ts#steer)). One of them sits on the desk of the first worker waiting on you, in the
board's order: the cat whose turn has it on that floor, so the watch changes hands with each turn, else the one
already there, else the tabby ([`watcherOf`](ref:hub/renderers/tower3d/src/life.ts#watcherOf)); watching wins over following. The watcher walks the
grid to the open cell beside the desk, coming out of the elevator when it starts on another floor, and hops up from there
([`chase`](ref:hub/renderers/tower3d/src/life.ts#chase)), so a hand-off never crosses desks. E on a cat pets it ([`pet.ts`](ref:hub/renderers/tower3d/src/pet.ts)): the camera flies low beside it
(the `pet` view, which ignores the building's keys), the right hand strokes its back head to tail three times while it
sits up and leans into the hand, hearts float off its head (placed from the time since the pet began and a hash of the
cat's name), it purrs unless the music is muted ([`purr`](ref:hub/renderers/tower3d/src/life.ts#purr)), and the camera flies home;
anything else that takes the view ends the pet where it is. A wait that begins rings, as the settings popover sets it (once,
remind every 30 s, off; the gear in the HUD or on the pause card, [[settings-and-tips]]), with one sound for an answer and another for every other wait ([[waiting-on-you]]); framed, it
rings nothing and leaves ringing to the page framing it ([[attention-list]]); N goes round the
waits; the desk panel's ✕ dismisses the worker's wait, which then stops pulsing; while you walk a floor, an arrow on the
screen's edge points to each worker on it waiting on you out of view
([`pointers`](ref:hub/renderers/tower3d/src/compass.ts#pointers)). A `blocked` worker turns round to you with a ?. A worker's look is its own, hashed
from the session id ([`lookOf`](ref:hub/renderers/tower3d/src/avatar.ts#lookOf)): a species (a bean, a puff
with its bulb on a curled stalk, or a bot), a color, maybe a hat or glasses. Its
status shows on its bulb, its bubble and its pose. Above its monitor, a tag
names it and its status, and a line over the tag says what it's up to, so the floor reads at a glance: the tool it runs or
asks for, else Claude's latest answer, else the latest prompt ([`glanceOf`](ref:hub/renderers/tower3d/src/cards.ts#glanceOf)).

**Models** are Blender scripts in `renderers/tower3d/models/` (`npm run tower3d:models`), exported to
committed `.glb` files and embedded in the bundle ([[bundled-renderer]]). The renderer reads a model only
by names ([`instance`](ref:hub/renderers/tower3d/src/models.ts#instance)): pivots (empties) for parts it
moves, and materials, where `glow` is unlit, `own` is copied per instance to be recolored, and anything
else is toon-shaded. The export merges meshes per pivot and material, so each desk costs a few draw calls.
Live surfaces (screens, books, tiles) stay in code. Every worker model keeps one contract
([`CONTRACT`](ref:hub/renderers/tower3d/src/contract.ts#CONTRACT), dressed by [`avatar`](ref:hub/renderers/tower3d/src/avatar.ts#avatar)): pivots `body`, `arm_L`, `arm_R`, anchors
`hat` and `face` for what it wears and `hand_R` for what it holds, the status light `bulb_glow_own` and optional `hue_own` parts; `wear.glb` holds what
they wear, hung on the anchors. The cats share one body (`models/catkit.py`, skipped by the build like `kit.py`),
each script painting its own coat, and keep their own contract: pivots `head`, `tail`, `paw_L` and `paw_R`.

**The door** ([[tower3d-door]]): `window.tower3d` ([`door.ts`](ref:hub/renderers/tower3d/src/door.ts)) is how an
agent drives and sees it. Keyboard and mouse produce intents (a move held, a turn taken per frame;
[`input.ts`](ref:hub/renderers/tower3d/src/input.ts)), and the door injects the same ones; its `capture()`
stands in for pointer lock, following every lock and unlock as the lock would. Each frame is `update(dt)` then
`render()` over a simulated clock: holds, flights, the fade between floors and every animation read it, so
`step(n)` advances exactly n frames and `?stepped` starts the clock stopped. Chance comes from one seeded
`random` (`?seed=`). `?board=<name>` renders a fabricated board
([`fixtureBoards`](ref:hub/renderers/tower3d/src/fixtures.ts#fixtureBoards): `busy`, `empty`, `tall`, `party`, `review`, `attention`: every attention side by side, a hire's answer waiting on its hirer among them, `tidy`, `logbook`: lineages and an archive over five days) in place
of the live one, its derived fields from the bridge's own functions, and `?at=` pins the wall clock. A fixture is a
list of boards: `advance()` delivers the next as if the tower had sent it (`busy` has three: the second with a new
showing, the third with everyone who waited answered, so the watching cat walks back). `acts(kind)`
lists what stands in the world, `locate` answers where a thing stands. `state()` reports frame times and counters
(boards, rebuilds, desks, stations, notes, pictures) and the note you carry; \` toggles the frame rate bottom left for a person. With the same seed and steps, two
loads give the same pixels. [`scripts/drive.ts`](ref:hub/scripts/drive.ts) (`npm run drive`) is the headless
Chrome driver (`--hover <css>` moves a real pointer, to look at hover states) and [`scripts/sandbox.ts`](ref:hub/scripts/sandbox.ts) (`npm run sandbox -- up | down`) a
throwaway system with a tower on port 4399. [`scripts/frames.ts`](ref:hub/scripts/frames.ts) (`npm run tool:frames`)
records a fixed walk's states and PNGs on every fixture board and compares two recordings byte for byte;
[`scripts/tour.ts`](ref:hub/scripts/tour.ts) (`npm run tool:tour`) shoots the busy board from fixed spots by day and night,
to judge a visual change. A fixture
board opens no streams ([`watchStream`](ref:hub/renderers/tower3d/src/fixtures.ts#watchStream)): monitors stay blank and a desk panel stays open to be shot. Model names the renderer reads are data in
[`CONTRACT`](ref:hub/renderers/tower3d/src/contract.ts#CONTRACT), checked against every `.glb` by `npm test`;
`lab.html` ([`lab.ts`](ref:hub/renderers/tower3d/src/lab.ts), bundled as `out/lab.js`) shows one model on a stand
with its draw calls, triangles and names, driven by `window.lab`.

The look (toon shading, bean workers) started from agent-office.
