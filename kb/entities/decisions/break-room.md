---
{
  "type": "decision",
  "name": "The break room: a hire whose answer waits on its hirer passes the time in the game room",
  "summary": "In Tower 3D, a worker the board says waits on its hirer (`card.waitsOn`) leaves its desk, or its seat in a meeting, for its floor's game room two minutes after its answer came, and plays at a free cabinet or stands about until someone prompts it or it goes home. Its desk reads AWAY in the Game room. A pure function of one board and the wall clock: the plan says when it next changes by time alone, and the page plans again then.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-17",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/renderers/tower3d/src/breaks.ts#breaksOf",
    "hub/renderers/tower3d/src/breaks.ts#GRACE",
    "hub/renderers/tower3d/src/breaks.ts#standingIn",
    "hub/renderers/tower3d/src/breaks.ts#nextBreak",
    "hub/renderers/tower3d/src/layout.ts#breakPlaces",
    "hub/renderers/tower3d/src/layout.ts#plan",
    "hub/renderers/tower3d/src/layout.ts#Plan",
    "hub/renderers/tower3d/src/layout.ts#DeskSlot",
    "hub/renderers/tower3d/src/main.ts#update",
    "hub/renderers/tower3d/src/desk.ts#standingPose",
    "hub/renderers/tower3d/src/fixtures.ts#breakroom",
    "hub/scripts/frames.scenario.js",
    "hub/src/bridge/board.ts#answerWait"
  ],
  "links": [
    { "to": "whereabouts", "verb": "uses", "carries": "the place-in-a-room machinery: a desk at a place, the AWAY workstation, the walk on the floor's paths" },
    { "to": "arcade", "verb": "uses", "carries": "the game room's cabinets, a place to play before each" },
    { "to": "crews", "verb": "uses", "carries": "card.waitsOn: whose prompt a hire's unread answer answers" }
  ]
}
---
**Problem.** A hire that finished sat at its desk exactly like one waiting on the user, though nobody but its hirer
had anything to do with it. The office didn't say "this one is done and waits on its coordinator".

**Why in Tower 3D, from `waitsOn`.** The board already holds the fact: `card.waitsOn` is set while a worker is done,
nobody has typed to it since, its latest prompt was its hirer's and the hirer runs
([`answerWait`](ref:hub/src/bridge/board.ts#answerWait)). The game room is Tower 3D's metaphor, so the rule is Tower
3D's code ([[whereabouts]]'s reasoning); no board field was added.

**How.**
- *Who* ([`breaksOf`](ref:hub/renderers/tower3d/src/breaks.ts#breaksOf)). Every worker on duty with `waitsOn` whose
  answer came at least [`GRACE`](ref:hub/renderers/tower3d/src/breaks.ts#GRACE) (two minutes) ago, by its `enteredAt`.
  A worker with no hirer waiting on it (a done lead, a hire whose hirer has gone) waits on the user, at its desk. A
  prompt from anyone, or going home, ends the break.
- *A reviewer stays beside its author.* A reviewer works one round and has no next task coming: its `waitsOn` means
  its verdict is delivered, not that it waits for more work, and the game room means a hire waiting on its coordinator
  for more. Beside its author it keeps saying the work is under review until its hirer sends it home, and its chair,
  carried in beside the author ([[reviewer]]), makes no second walk. A reviewer with a seat of its own (its author gone
  first) is a worker like any other.
- *The break wins over a meeting.* A crew gathers once three of it are on duty ([[whereabouts]]), so with the meeting
  winning only a lead's single hire would ever reach the game room. A crew member on a break steps out: its place in
  the meeting's replay is kept, drawn as an empty chair, and it walks back to it when prompted. The table shows who
  is working; the game room shows who waits on the coordinator. A lead never goes: it has no hirer.
- *The grace without a timer.* The plan is made for a board at the wall clock's `now`
  ([`plan`](ref:hub/renderers/tower3d/src/layout.ts#plan)) and says when it next changes by time alone, the next
  worker's `enteredAt + GRACE` ([`nextBreak`](ref:hub/renderers/tower3d/src/breaks.ts#nextBreak), `Plan.until`). The
  page's [`update`](ref:hub/renderers/tower3d/src/main.ts#update) plans the board again once the wall clock passes it,
  so a quiet tower, whose board doesn't change, still sends the worker off, and every viewer and reload agree. Under
  `?at=` the clock is pinned, so a fixture draws the same frames.
- *Places* ([`breakPlaces`](ref:hub/renderers/tower3d/src/layout.ts#breakPlaces)). Before each cabinet, facing it,
  playing (`Idle_A` with `Type`'s arms, [`standingPose`](ref:hub/renderers/tower3d/src/desk.ts#standingPose)); then the
  room's standing places ([`standingIn`](ref:hub/renderers/tower3d/src/breaks.ts#standingIn)): the room prefab's
  `stand_<n>` slots, placed by hand in the prefab editor. A floor keeping no
  games has only the standing places, beside the empty room's sign. Past them all, a worker stays where it was.
- *Who takes which.* Workers are placed in the order their breaks began; each takes a free cabinet while any is, else a
  free standing place, the one its id scores highest for (`rendezvous`). The board keeps no history of who left the
  room, so a worker going back frees a place a later one may score higher; it moves, freeing its own for the next, and
  a freed cabinet draws a stander over. Usually a short chain.
- *Drawn as a meeting place.* A worker on a break gets the [`DeskSlot`](ref:hub/renderers/tower3d/src/layout.ts#DeskSlot)
  a meeting gives (`meeting`, room `game`, standing, `play` at a cabinet): its workstation reads AWAY "in Game room",
  E there goes to the worker, and every move between desk, meeting seat and game room walks the floor's paths.

**Alternatives considered.**
- *The meeting wins*, the draft's suggestion: the break room would almost never be seen, since every crew of three
  gathers.
- *A done lead goes too*: it waits on the user, and the user looks for it at its desk.
- *Reviewers go too*, as `waitsOn` alone would have it: nearly every finished reviewer would leave its author's side,
  and the pair would show only while a review runs.
- *A renderer timer from the moment the page sees the answer*: two viewers, or a reload, would disagree on who is where.
- *Deciding the grace only when a board comes*: the tower sends a board only when it changes, so on a quiet tower the
  worker would wait at its desk until something else happened.
- *The first free place in order*: one worker going back would move every later one along a place.

**Impact.** Tower 3D only; no board or API change. The `attention` and `tidy` fixtures' hires waiting on their
hirers now stand in the game room. A `breakroom` fixture covers players, standing places, a crew member stepping out
of its meeting, one still within its grace, a done lead at its desk, a reviewer waiting on its author beside it and
an empty game room; frames' `break-room` stage looks at the room and `reviewer-stays` at the reviewer. A lead hired
from another floor would have `waitsOn` and go too, once crews span floors.
