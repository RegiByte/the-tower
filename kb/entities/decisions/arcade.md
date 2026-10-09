---
{
  "type": "decision",
  "name": "The arcade: a floor's games as cabinets in its control room",
  "summary": "Workers make mini-games, each one self-contained html file, and keep them in the floor's games collection; Tower 3D draws each as an arcade cabinet along the control room's glass front, and E plays it in a sandboxed frame on the right half of the screen while the camera faces the cabinet and the music stops. The core learns nothing about games.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-09",
  "refs": [
    "hub/renderers/tower3d/src/games.ts",
    "hub/renderers/tower3d/src/layout.ts#arcadeFor",
    "hub/renderers/tower3d/src/arcade.ts",
    "hub/renderers/tower3d/src/layers.ts#CABINETS",
    "hub/renderers/tower3d/src/zones.ts#controlZones",
    "hub/renderers/tower3d/src/main.ts#openGame",
    "hub/renderers/tower3d/src/main.ts#frameAside",
    "hub/renderers/tower3d/src/ui.ts#gameHtml",
    "hub/src/shared/titles.ts",
    "hub/src/tower/server.ts#collectionItem",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/renderers/tower3d/src/fixtures.ts#FIXTURE_GAMES",
    "hub/scripts/frames.scenario.js"
  ]
}
---
**Problem.** Workers on a night shift asked to make something fun had nowhere to put it: a game shown with
`tower show` sits beside one worker and leaves with it, and nothing in the building is a place to play.

**Why.** The tower is the user's HQ, lived in all day. A floor's own games, made by its workers and played in the
building, make it a place. It also exercises [[collections]] as designed: a kind of file nobody had named, given a
meaning by one renderer, with no change to the core.

**How.**
- **A collection like drafts.** `games` is declared in the config's `collections`, for every project (the user's
  answer: each floor has its own games). A worker keeps one with `tower keep games game.html` ([[agent-keep]]); the
  board carries the items, their tags and keepers, never content. What a game is lives in Tower 3D
  ([`games.ts`](ref:hub/renderers/tower3d/src/games.ts)), named once there.
- **One cabinet per game** ([`arcadeFor`](ref:hub/renderers/tower3d/src/layout.ts#arcadeFor)), only on a floor
  that declares `games`: along the control room's glass front, facing into the room, the newest (latest id, as
  created items are named) by the door, as many as fit (six on a 9 m room), each with a collider. While a floor
  has cabinets, the watch couch ([[office-kaykit]],
  [`controlZones`](ref:hub/renderers/tower3d/src/zones.ts#controlZones)) steps 1.6 m back from the glass; the
  world rebuilds when that changes.
- **The cabinet** ([`arcade.ts`](ref:hub/renderers/tower3d/src/arcade.ts)): blocks in the floor's colour, a marquee
  (the room's `picture`) with the game's title and its keeper, an attract screen with the tag. The title is the
  html's `<title>`, else the tag, read once per `modifiedAt` through
  [`itemTitles`](ref:hub/src/shared/titles.ts) (shared with drafts and `tower kept`). A
  [`CABINETS`](ref:hub/renderers/tower3d/src/layers.ts#CABINETS) layer keyed by project and id redraws one when its
  title, keeper or tint changes.
- **Playing** ([`openGame`](ref:hub/renderers/tower3d/src/main.ts#openGame)): the act `{kind: 'arcade', project,
  id}` offers E play. The panel takes the right half of the screen (head: title, keeper, ↗ to play it in a browser
  tab, ✕); the body is `<iframe sandbox="allow-scripts allow-pointer-lock">` on
  `/collection/<project>/games/<id>`, focused at once. The camera flies to face the cabinet straight on in the
  left half of the view ([`frameAside`](ref:hub/renderers/tower3d/src/main.ts#frameAside)). The music pauses and
  nothing restarts it while a game is open (B unmutes without playing); closing (✕, a click on the world, Esc when the page has the keys) flies
  home and resumes it unless muted. While the game has focus the page gets no keys, so ✕ is the way out. A
  game kept meanwhile moves every cabinet along: the camera follows the open game's cabinet, and a game pushed off the
  end of the arcade closes.
- **Contained by what exists.** The tower serves a collection's html under the shelf CSP sandbox
  ([`collectionItem`](ref:hub/src/tower/server.ts#collectionItem)): an opaque origin, so a game's POST is refused
  (403) and it has no storage. High scores are kept in memory (the user's answer).
- **Workers are told how** ([`SKILL.md`](ref:hub/src/mod/skills/handbook/SKILL.md)): one html file, inline CSS and JS,
  no network, a `<title>`, no storage, alert or forms, keyboard and mouse, any frame size; preview with
  `tower show`, keep with `tower keep games`. The tower brief is unchanged.
- **Checked by frames**: `busy`'s alpha keeps three games (titled and keeper, titled, untitled without keeper,
  [`FIXTURE_GAMES`](ref:hub/renderers/tower3d/src/fixtures.ts#FIXTURE_GAMES)); the walk aims at a cabinet, plays
  it and closes it.

**Alternatives considered.**
- *One cabinet that opens a list.* The user chose one per game: a cabinet is a thing you walk up to.
- *The large centred modal.* The user chose the side panel, half the screen, with the cabinet in view.
- *A `connect-src 'none'` CSP on games.* It would stop a game reaching the network, but the server would have to
  know what `games` means. The skill asks for no network instead; a game can still `fetch`.
- *Saving high scores.* Would need a writer the sandbox can't reach; in memory is enough for now.
- *Cabinets elsewhere in the room.* The side walls hold the shell bench and the shelf, the back wall the video wall;
  the glass front is the one stretch that grows with nothing else.
- *A game room per floor.* A follow-up: a room of its own with cabinets (dummies and a plate saying how to make a
  game when there are none). `arcadeFor` takes a stretch of wall; a game room would give it another one.

**Impact.** Tower 3D gains an act kind, a layer, a panel and a camera framing; the couch moves while a floor has
games. No API, board or host change. Every floor shows its arcade once the user declares `games` in the config.
