---
{
  "type": "decision",
  "name": "Renaming a worker is a fact in its log, and its Claude is renamed through its composer",
  "summary": "A worker on duty takes a new callsign with the rename verb (on the tower page, its card's callsign edited in place, or Rename in its sidebar row's right-click menu; tower rename): refused while another worker on duty holds it, as a typed callsign is at a spawn; the tower has the host append tower.rename {callsign} to its current session's log, and the board names the worker, in every session it ran as, by the latest rename along its chain, else by its first session's --name. A running worker's Claude is renamed too, by /rename typed into its composer, so its peer name follows; a stopped one takes the name as its resume runs under it. Its worktree and branch keep their names.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-02",
  "reviewed": "2026-11-02",
  "refs": [
    "hub/src/bridge/facts.ts#RENAMED",
    "hub/src/shared/callsign.ts#CALLSIGN",
    "hub/src/bridge/chains.ts#workerName",
    "hub/src/bridge/chains.ts#namer",
    "hub/src/bridge/verbs.ts#cardVerbs",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/tower/dispatch.ts#rename",
    "hub/src/directory.ts#rename",
    "hub/src/views/card.ts#renameWhy"
  ]
}
---
**Problem.** A callsign ([[callsign]]) is drawn or typed once, as a worker starts, and was kept for good: a worker
whose work turned out to be something else than its name says, or a drawn name the user would rather not read all
day, had no way to change it short of starting another worker.

**Why.** The name a worker ran under is already a fact in its log (the `--name` in its first session's header,
[[callsign-free-name]]); a later name is one more fact, appended by the host like `tower.letGo` ([[let-go]]), so
nothing outside the logs is stored and every renderer reads it from the board ([[logs-are-facts]]). Its Claude's
peer name is Claude Code's own session name, which `/rename` sets in the session registry the tower reads peers
from: typing it is how the user would rename it, and needs no change to the host ([[host-owns-ptys]]).

**How.**
- *Offered.* A card offers `rename` while its worker is on duty at Claude's composer (idle, working, watching, done,
  failed) or stranded waiting to be resumed, unless its log is broken, where a fact after the break would never be
  read ([`cardVerbs`](ref:hub/src/bridge/verbs.ts#cardVerbs), [[board-verbs]]).
- *Checked.* The new callsign follows the rules of a typed one ([`callsignRefused`](ref:hub/src/shared/callsign.ts#callsignRefused))
  against the other workers on duty, a bare `NAME` taking the number its session id hashes to. The card's callsign
  turns into a field in place, left alone by the board's draws while it is open, and the page's right-click menu on a
  worker's row opens its card and that field once the card's terminal has taken focus; the page checks the name as it
  is typed, the tower again on the call ([`rename`](ref:hub/src/tower/dispatch.ts#rename)). A running worker is
  refused (`not_at_prompt`, `composer_holds`) before anything is logged where typing would answer a question or
  join text the composer holds.
- *Logged, then typed.* The host appends `tower.rename {callsign}` (with `by` when a worker asks) to the session's
  log ([`RENAMED`](ref:hub/src/bridge/facts.ts#RENAMED)); the fold takes only a whole callsign
  ([`CALLSIGN`](ref:hub/src/shared/callsign.ts#CALLSIGN)) and breaks the session on anything else, as any fact of a
  shape it doesn't expect ([[broken-logs]]), since renderers draw the name as html. Then the tower types `/rename <callsign>` and Enter into a
  running worker's composer: an immediate command, run even mid-turn. A stopped worker's resume runs under the new
  name as its `--name`.
- *Read.* [`workerName`](ref:hub/src/bridge/chains.ts#workerName) walks the worker's whole chain, the sessions it
  continues and those that continue it ([`namer`](ref:hub/src/bridge/chains.ts#namer)), and takes the latest
  rename, else the first session's `--name`: every card, `SessionRef`, brief, hire count and held name says the new
  callsign, past sessions of the same worker included. A fork is a new worker and keeps its own name.

**Alternatives considered.**
- *Renaming through a config or a collection*: state outside the logs, for what is a fact about one worker.
- *Logging the rename only once Claude confirms it*: `/rename` writes nothing the host's log sees but the keys and
  the command it runs, and a stopped worker has no Claude to confirm it.
- *Renaming the worktree and branch too*: they are the checkout's names, which review threads and other workers
  already point at ([[checkout]], [[tower-cuts-worktrees]]), and outlive the worker anyway.

**Impact.** What was written under the old name stays as written: review notes signed with it, a crew edge's
`callsign` logged at a spawn, a reviewer's first prompt. Crews and threads resolve by session and checkout, so they
follow. If Claude's `/rename` yields because another live session on the machine holds the name, the card says
the new callsign while its peer name is the one Claude picked; `tower agents` shows both.
