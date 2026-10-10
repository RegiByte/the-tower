---
{
  "type": "decision",
  "name": "A new worker takes a name no worker on duty holds",
  "summary": "Every spawn that starts a new worker (a spawn, a worktree cut, a forking resume, the tower's and the CLI's) draws session ids until the id's callsign has a name no worker on duty holds; the callsign stays a function of the id.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-10",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/shared/callsign.ts#freshId", "hub/src/shared/callsign.ts#nameIn", "hub/src/bridge/chains.ts#heldNames", "hub/src/tower/server.ts#workerIds", "hub/src/tower/server.ts#freeName", "hub/src/cli.ts#workerId"]
}
---
**Problem.** Workers on duty together often shared a name (two HOLMES on one floor). Measured over 432 real sessions,
the callsign hash was uniform (χ² 88.9 on 80 degrees of freedom); the repeats were the birthday problem: with 81 names,
45% of any 10 consecutive sessions held a repeated name, against 44% predicted for a fair draw. More names lower it
but never to zero.

**Why.** A seeded generator would not help: a callsign is one draw per session, which is what the hash already is.
What removes repeats is a local rule, each new worker avoiding the names its neighbours on duty hold, with no central
allocator and nothing stored.

**How.** The random part of a new session id is drawn again while its callsign's name
([`nameIn`](ref:hub/src/shared/callsign.ts#nameIn)) is held ([`freshId`](ref:hub/src/shared/callsign.ts#freshId)),
up to 64 draws; past that nearly every name is held and the last draw stands, its number telling it apart. The held
names are those of the sessions given ([`heldNames`](ref:hub/src/bridge/chains.ts#heldNames)), a session whose log
isn't read yet holding its id's callsign, since it was just spawned. The tower passes its workers on duty with the
host's live set ([`workerIds`](ref:hub/src/tower/server.ts#workerIds)), so a burst of spawns and a worker stranded by
a host restart both count; the CLI, which reads no board, passes the host's live set
([`workerId`](ref:hub/src/cli.ts#workerId)). Spawns, worktree cuts (whose draw also needs a free worktree name,
[`freeName`](ref:hub/src/tower/server.ts#freeName)) and forking resumes draw; a resume that carries a worker on keeps
its name ([[callsign-from-log]]).

**Alternatives considered.**

- *Port emergent-boids' hierarchical seeded RNG (cyrb53 into mulberry32 streams).* Rejected: it makes many
  reproducible draws from one seed; a callsign needs one, and the distribution was already measured uniform.
- *Assign names from history (each session takes its top-ranked name not held by the previous N).* Rejected: a name
  would depend on every earlier session, so a deleted log could rename later ones. Choosing the id keeps the name a
  function of the id alone.
- *Only add names.* Kept as well (repeats among 12 consecutive spawns fall from 13.8% to 8.6% with 50 more), but alone
  it never reaches zero; with the draw, simulated repeats are 0% at 1.1 draws per spawn.

**Impact.** Workers on duty together have different names while the list has a free one. Two spawns raced at the same
moment can still pick the same name, each having read the held names before the other started. A carry-on resume can
still meet a fresh worker under its name if the fresh one took it while the first was off duty.
