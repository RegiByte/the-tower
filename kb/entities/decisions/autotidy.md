---
{
  "type": "decision",
  "name": "Autotidy: what a worker leaves applied by itself once it goes home, by a bundled extension, opted into by kind",
  "summary": "The bundled extension autotidy reads who is going home from the floor's cards (off duty for less than two minutes, continued by none, ended by the tower's kill (card.killed) or let go, never stranded nor exited by itself) and from the running cards a board stops carrying as they end, and its board trigger asks the core's tidy once for the part of the floor's Tidy that is theirs, as its settings say (reap, worktrees, branches, extensions, each off unless set): their worktrees and kept branches as Tidy lists them, their processes and the extensions' entries naming their checkout unless someone on duty works there. It keeps nothing; what isn't safe to remove as a worker goes is left for Tidy's press. The core keeps Tidy a press and learns only whose an extension's entry is (TidyEntry.checkout).",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-29",
  "reviewed": "2026-10-29",
  "refs": [
    "hub/extensions/autotidy/extension.json",
    "hub/extensions/autotidy/server.ts",
    "hub/extensions/autotidy/plan.ts#goingHome",
    "hub/extensions/autotidy/plan.ts#leftBoard",
    "hub/src/bridge/board.ts#onBoard",
    "hub/extensions/autotidy/plan.ts#planOf",
    "hub/src/bridge/checkouts.ts#checkoutLanded",
    "hub/extensions/autotidy/plan.ts#fresh",
    "hub/extensions/autotidy/plan.ts#listedBefore",
    "hub/extensions/autotidy/plan.ts#byKind",
    "hub/extensions/autotidy/plan.ts#partOf",
    "hub/extensions/autotidy/plan.ts#GOING_MS",
    "hub/src/shared/extensions.ts#TidyEntry",
    "hub/extensions/reviews/filing.ts#tidyEntries",
    "hub/test/autotidy.test.ts"
  ],
  "links": [
    { "to": "tidy", "verb": "uses", "carries": "the floor's Tidy plan, and the tidy verb that applies any part of it" },
    { "to": "extensions", "verb": "uses", "carries": "a board trigger, a floor fold and settings" },
    { "to": "board-archive", "verb": "uses", "carries": "which cards the board carries, and so which leave it as they end" },
    { "to": "crews", "verb": "extends", "carries": "what a crew sent home leaves" },
    { "to": "review-threads", "verb": "uses", "carries": "a landed thread's tidy entry, naming its checkout" }
  ]
}
---
**Problem.** Sending a worker home ends its session and nothing else ([[crews]]): the processes it started, its
worktree, its kept branch and its review thread wait for a press of Tidy ([[tidy]]), one floor at a time. A user who
sends workers home all day wants that done without the press, and only for what those workers left.

**Why.** Tidy is a press by decision: the user sees the whole list before anything goes. Doing it by itself is a policy
over the same facts, opted into, so it is an extension ([[extensions]]), bundled and off until a setting turns a kind
on, which a user can turn off on a floor, copy or replace. The core keeps its rule and learns one generic fact: an
extension's tidy entry may name the `checkout` it belongs to, so whoever acts for a checkout's workers knows it is
theirs; the core reads nothing in it.

**How.**
- *Going home, read off the cards.* Going home is already a fact in the session log (its exit, or a let-go), and a
  card carries when it went off duty (`letGoAt`, else `enteredAt`). The floor fold, which is given the time, says who is
  going home now ([`goingHome`](ref:hub/extensions/autotidy/plan.ts#goingHome)): off duty for less than `GOING_MS` (two
  minutes: processes and git are read on their own beat, so a worker's leftovers and its worktree's state reach the
  board a little after its going), continued by none, and ended by the tower's kill (`card.killed`: sent home, gone
  home by itself, a hire Tidy ended) or let go. A worker that exited by itself or crashed is one the user may resume,
  and never counts. A stranded worker stays on duty until
  resumed or let go; after a restart its conversation may be found unresumable only once the tower's reads settle,
  long after it went, and it never counts. It lands on the board as `floor.x.autotidy.going` with the settings
  ([`partOf`](ref:hub/extensions/autotidy/plan.ts#partOf)), so the trigger stays pure over two boards.
- *Gone with its card.* The board drops an off-duty card that isn't waiting, left no processes and started before today
  ([`onBoard`](ref:hub/src/bridge/board.ts#onBoard), [[board-archive]]), so such a worker leaves the board on the very
  board that ends it, and the fold never sees it. The trigger sees it in the pair: running on the last board, carried by
  no card of the new one, its lineage in none ([`leftBoard`](ref:hub/extensions/autotidy/plan.ts#leftBoard)), and plans
  for it on that board alone. Nothing of it needs waiting for: it left no processes (or its card would stay), and its
  worktree and checkout's entries are read on that board, where nobody on duty is in it and git's read is unmoved.
  Its card is gone from that board, so how it ended isn't read there: one started before today that exits by itself,
  leaving nothing running and nothing waiting, counts too.
- *Theirs, as Tidy lists it.* [`planOf`](ref:hub/extensions/autotidy/plan.ts#planOf) cuts the floor's Tidy plan down to
  what the workers going home left: worktrees by name that Tidy lists (nobody in them, clean, nothing only local) and
  whose checkout has landed ([`checkoutLanded`](ref:hub/src/bridge/checkouts.ts#checkoutLanded)), since Tidy also lists
  a worktree whose branch is pushed and unmerged, for the user to confirm; kept branches by name, which Tidy lists once
  absorbed; reaps of their sessions and the extensions' entries naming their checkout only while nobody on
  duty works in that checkout, since a process names no checkout and may serve a worker sharing it.
- *Only as it goes, asked once.* A trigger is pure and keeps nothing between boards, so it asks `tower/tidy` only for
  what the new board lists that the last did not ([`fresh`](ref:hub/extensions/autotidy/plan.ts#fresh)): a Tidy in
  flight is not asked for again as its own removals change the board. A worktree the last board did not list is never
  asked for ([`listedBefore`](ref:hub/extensions/autotidy/plan.ts#listedBefore)): the going worker's own was listed
  while it worked there, so one that comes onto the board within the two minutes was just made, a recut of the one
  autotidy removed, by a user about to resume its worker. Each kind is its own call,
  each extension's entries a kind and each worker's reaps a kind ([`byKind`](ref:hub/extensions/autotidy/plan.ts#byKind)):
  Tidy refuses a whole call when any of it no longer qualifies, so a process exiting on its own between the board and
  the call takes down that worker's reaps, not another's, nor the worktree and the thread beside them, and a crew going
  home on one board asks a call per worker and a few more, within the 30 calls a minute past which a board trigger is
  paused. Tidy runs one floor's
  calls one at a time. Nothing is retried, and nothing is tidied after
  the going: what wasn't safe to remove as the worker went (a branch not yet merged, a process a worker on duty in its
  checkout may use) is the user's to Tidy by hand, and a refused call is too.
- Tidy's own checks hold for every call: a plan that moved on is refused, an entry no longer listed is not applied.

**Alternatives considered.**
- *Recording each going in a stream of its own* (`home`, through a verb `record`), the trigger then reading it back:
  it stored again a fact the session logs hold, and a record made from a card's settling after a restart was taken for
  a going. Reading the cards keeps nothing.
- *Keeping an off-duty card on the board a few minutes* in the core, so every going is seen in the fold: it changed
  what the board carries for every renderer, and the pair of boards already tells.
- *Reacting to an event*: the core raises none when a worker ends, a link around `kill` misses a worker ending by
  itself, and at the moment of either what it left isn't on the board yet.
- *A core config key* (`tidy.afterHome`) and a core loop applying `floor.afterHome`: built first and moved out. It put
  a policy of acting by itself in the core, against Tidy's own decision, and needed a board field for it.
- *Applying every extension entry as it appears*, unattributed: it would file threads, and apply any extension's
  entries, of checkouts no worker went home from.
- *Tidying every worker off duty*, archived ones included: it would act on workers gone home before the user turned it
  on.
- *Watching a worker for days after it went home*, so a worktree merged later goes too, retried by a sweep: tried, and
  dropped for acting only as a worker goes, so nothing is removed long after anyone looked at it.
