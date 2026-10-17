---
{
  "type": "decision",
  "name": "A worker's callsign: drawn free of the names on duty, then read from its log",
  "summary": "Every spawn that starts a new worker draws session ids until the id's callsign has a name no worker on duty holds, the callsign staying a function of the id; a typed bare NAME follows the same rule and a typed NAME-NN is refused only while that exact callsign is on duty. Once started, the board names a worker by the --name its first session's Claude ran under, read from that log's header, so a changed callsigns list names new workers only.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-10",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/src/shared/callsign.ts#freshId",
    "hub/src/shared/callsign.ts#nameIn",
    "hub/src/shared/callsign.ts#callsignRefused",
    "hub/src/bridge/chains.ts#heldCallsigns",
    "hub/src/bridge/chains.ts#heldNames",
    "hub/src/bridge/chains.ts#workerName",
    "hub/src/bridge/chains.ts#runsAs",
    "hub/src/bridge/chains.ts#namer",
    "hub/src/bridge/chains.ts#resumeName",
    "hub/src/shared/launch.ts#spawnRequest",
    "hub/src/tower/server.ts#newWorker",
    "hub/src/tower/server.ts#workerIds",
    "hub/src/tower/server.ts#freeName",
    "hub/src/cli.ts#workerId"
  ]
}
---
**Problem.** A callsign ([[callsign]]) drawn by hashing the session id over the names list is a fair draw, so workers
on duty together often shared a name (two HOLMES on one floor): the birthday problem, which more names lower but never
to zero. And derived again from the list every time a board is built, any change to the list renamed past and running
workers alike, while a running worker kept the `--name` it started with: its card and its peer name split, and review
notes signed with the old callsign pointed at a worker the board now called something else.

**Why.** What removes repeats is a local rule, each new worker avoiding the names its neighbours on duty hold, with no
central allocator and nothing stored. And every spawn and resume already passes the callsign to Claude as `--name`,
which the host keeps in the log's header: the name a worker ran under is a fact in its log ([[logs-are-facts]]), and
deriving it again from a list that can change can say it wrongly.

**How.**
- *Drawn free.* The random part of a new session id is drawn again while its callsign's name
  ([`nameIn`](ref:hub/src/shared/callsign.ts#nameIn)) is held ([`freshId`](ref:hub/src/shared/callsign.ts#freshId)), up
  to a bound past which nearly every name is held and the last draw stands, its number telling it apart. The held names
  are those of the sessions given ([`heldNames`](ref:hub/src/bridge/chains.ts#heldNames)), a session whose log isn't
  read yet holding its id's callsign. The tower passes its workers on duty with the host's live set
  ([`workerIds`](ref:hub/src/tower/server.ts#workerIds)), so a burst of spawns and a worker stranded by a host restart
  both count; the CLI, which reads no board, passes the host's live set ([`workerId`](ref:hub/src/cli.ts#workerId)).
  Spawns, worktree cuts (whose draw also needs a free worktree name, [`freeName`](ref:hub/src/tower/server.ts#freeName)),
  forking resumes, reviewers and policy runs draw; a resume that carries a worker on keeps its name.
- *Typed.* A callsign typed as a worker starts (the spawn verb's `callsign`, the New worker dialog, `tower spawn
  --callsign`, `tower hire … callsign`) is checked by [`callsignRefused`](ref:hub/src/shared/callsign.ts#callsignRefused),
  which refuses it naming the holder. A typed `NAME-NN` is the user's exact choice: refused only when a worker on duty
  has that very callsign, so it may share a name with another. A bare `NAME` takes its id's number at the spawn, so it
  follows the drawn rule: refused when a worker on duty has that name, whatever the number
  ([`heldCallsigns`](ref:hub/src/bridge/chains.ts#heldCallsigns), the tower's in
  [`newWorker`](ref:hub/src/tower/server.ts#newWorker)). The dialog checks it against the board's cards on duty as it is
  typed, the tower again at the spawn.
- *Read from the log.* [`workerName`](ref:hub/src/bridge/chains.ts#workerName) takes the first session of the worker's
  lineage and reads its `--name` ([`runsAs`](ref:hub/src/bridge/chains.ts#runsAs)); a log without one (written before
  sessions were named) falls back to the id's callsign over the current list. [`namer`](ref:hub/src/bridge/chains.ts#namer)
  (the board, kept items, hires, briefs) and [`resumeName`](ref:hub/src/bridge/chains.ts#resumeName) (the name a
  carry-on resume runs under) both go through it. The first session's stamp, not each session's own: a few
  continuations recorded before resumes carried their worker's name were stamped with their own.

**Alternatives considered.**
- *A seeded generator for the draw.* A callsign is one draw per session, which is what the hash already is.
- *Assigning names from history* (each session takes its top-ranked name not held by the previous N): a name would
  depend on every earlier session, so a deleted log could rename later ones. Choosing the id keeps the name a function
  of the id alone.
- *Only adding names to the list*: fewer repeats, never none.
- *A `tower.name` fact in the log*: `--name` in the header argv already records it from the first moment.
- *Names lists versioned by the start time in the id*: a dated generation concept in the config and code for what the
  log already holds.

**Impact.** Workers on duty together have different names while the list has a free one. Two spawns raced at the same
moment can still pick the same name, each having read the held names before the other started, and a carry-on resume
can meet a fresh worker under its name if the fresh one took it while the first was off duty. Changing `callsigns`
names new workers only; a name removed from the list keeps naming the workers that ran under it. Only logs from before
sessions were named still derive their callsign from the current list, so a change can rename those.
