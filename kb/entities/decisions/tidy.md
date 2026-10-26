---
{
  "type": "decision",
  "name": "Tidy: one list of what can go, computed, applied as shown",
  "summary": "Each floor's Tidy is a plan computed in the bridge: removable worktrees, absorbed kept branches, the processes of sessions no longer running, hired workers done with their purpose (hirer gone, quiet, work landed), and old logs and stream months to archive, with what extensions' floor folds add (the reviews extension's landed threads); a worker the user started is never offered. Its call carries the plan; POST /tidy applies exactly that list, or any part of it (each row of the list is its own call), and is refused once any of it no longer qualifies. A worker working with no word from Claude for 20 min is stuck: flagged on its card, never killed.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-26",
  "refs": [
    "hub/src/bridge/prunable.ts#prunable",
    "hub/src/bridge/prunable.ts#isStuck",
    "hub/src/bridge/prunable.ts#killable",
    "hub/src/bridge/prunable.ts#landed",
    "hub/src/bridge/prunable.ts#STUCK_MS",
    "hub/src/bridge/board.ts#TidyPlan",
    "hub/src/bridge/board.ts#occupantsOf",
    "hub/src/bridge/board.ts#board",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/bridge/verbs.ts#floorOffers",
    "hub/src/bridge/verbs.ts#withAddedTidy",
    "hub/src/bridge/folds.ts#foldBoard",
    "hub/src/tower/dispatch.ts#tidyProject",
    "hub/src/tower/dispatch.ts#movedOn",
    "hub/src/worktrees.ts#tidyable",
    "hub/src/shared/api.ts#COMPOSITES",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/shared/tidy.ts#tidyLine",
    "hub/src/shared/tidy.ts#tidyRows",
    "hub/src/shared/tidy.ts#addedTidyOf",
    "hub/src/shared/tidy.ts#tidiedLine",
    "hub/src/shared/worktree-words.ts#editedRows",
    "hub/renderers/tower3d/src/running.ts#buildRunning",
    "hub/renderers/tower3d/src/cards.ts#landedRow",
    "hub/test/prunable.test.ts",
    "hub/test/board.test.ts"
  ]
}
---
**Problem.** The tower knows every process a session left ([[leftover]]), every worker's status and how long it has
held it, and every worktree's and thread's state, and can end or remove each by hand, but something has to say what
can go, without touching what belongs to running agents.

**Why.** What can go is a policy over facts the board already has, so it is computed, not stored, and lives in the
bridge where every renderer and worker reads it ([[renderer-is-disposable]], [[agents-have-every-capability]]).
Ending a worker is not undoable the way a removed worktree is recut: the user sees the whole list before one press.

**How.**
- [`prunable`](ref:hub/src/bridge/prunable.ts#prunable), pure over a floor's cards and worktrees:
  - `reap` every process of a session no longer live (exited or lost), orphaned or not; a live session's are never
    listed.
  - `kill` only a hire (`hiredBy`) whose hirer is no longer on duty, once its purpose is done
    ([`killable`](ref:hub/src/bridge/prunable.ts#killable)): live and quiet between turns: `done` (its turn finished,
    its answer read or not) or `idle` with no wait; never one asking a question, held on a screen or failed; nobody
    running reports to it ([[crews]]); and its worktree's work has [`landed`](ref:hub/src/bridge/prunable.ts#landed):
    in every repo nothing uncommitted and the branch [[absorbed]] or [[carried]], a reviewer's fork with no commits of
    its own included. Landed is the signal, so there is no quiet period; `since`, when it went quiet or someone last
    typed into it, only orders and labels the rows. A hire in a main checkout has no work of its own to land and is
    never offered. A killed hire resumes, but its next turn reads the whole conversation again, uncached: the rows
    say so.
  - `logs`: the plain logs of workers ended more than `retention.days` ago, to be archived ([[log-retention]]).
- *The hirer's to send home*: while a hire's hirer (`reportsTo`, carried through either's resumes, on any floor) is on
  duty, the hire is never offered. Landed says nothing of a hire whose output isn't code (a spec, research, a standing
  advisor, a reviewer beside its author): its worktree reads landed from the first minute. The hirer sends it home
  (`send-home`, whole crew), or Tidy offers it once the hirer is gone.
- A worker the user started (no `hiredBy`) is never offered, whatever its status or age: it may be waiting on the
  world (pull requests to merge, a job that grows over time), and stays until the user sends it home.
- *Landed decides*: a finished hire's answer waits on its hirer, and its latest prompt is the one it was hired on, so
  a rule over unread answers would never offer it. The answer stays in its log and the brief, and a kill resumes, so
  the row says "answer unread" and the hire goes.
- A worktree is offered only while nobody is in it: no worker on duty (a stranded one holds its folder until it is
  resumed or let go) and no shell ([`occupantsOf`](ref:hub/src/bridge/board.ts#occupantsOf), [[tower-cuts-worktrees]]); Tidy, a row's call and
  `worktree/remove` fold the same occupants.
- *Stuck*: [`isStuck`](ref:hub/src/bridge/prunable.ts#isStuck), `working` with no hook or mod event for
  [`STUCK_MS`](ref:hub/src/bridge/prunable.ts#STUCK_MS), read from the fact `heardAt`
  ([`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter)): `Card.stuck`, and the status word reads "stuck". Output
  doesn't count, since Claude's spinner draws while a tool hangs. Never listed and never rung: a long build looks
  the same. Time alone makes a worker stuck, so the tower republishes the board every minute; an unchanged board is
  not sent.
- The floor's [`TidyPlan`](ref:hub/src/bridge/board.ts#TidyPlan), `floor.tidy`: worktrees and branches by name,
  `prune`, `logs`, and `streams`, the closed months of the system's streams, which every floor
  lists, and of the floor's own ([[log-retention]]). `tidy` is offered while it lists anything, its call `['tidy', { project, plan }]`
  ([`floorOffers`](ref:hub/src/bridge/verbs.ts#floorOffers)).
- [`tidyProject`](ref:hub/src/tower/dispatch.ts#tidyProject) checks the plan against the floor as read now
  ([`movedOn`](ref:hub/src/tower/dispatch.ts#movedOn): processes, workers, logs, stream months) and git's part
  after its fetch ([`tidyable`](ref:hub/src/worktrees.ts#tidyable)), and answers `refused` before touching anything when an
  item no longer qualifies. It applies only what is listed, in order: worktrees removed and branches deleted, processes reaped (SIGTERM), workers killed, old logs and stream months archived. What another verb does it
  does through that verb, by the dispatch, for its caller with `tower/tidy` in `within`
  ([`COMPOSITES`](ref:hub/src/shared/api.ts#COMPOSITES): `worktree/remove`, `branch/delete`, `reap/process`, `kill`),
  so whatever an extension wraps around one of them sees Tidy's acts too ([[extensions]]). Each worker is checked again
  just before its kill, since git's fetch takes seconds: one typed into meanwhile, and any entry its verb refuses (a
  kill that fails, a guard), is left and named in the reply's `skipped`, and the rest goes on, so a reply always says
  everything that was done. A branch that moved since git's read is kept the same way ([[tower-cuts-worktrees]]).
- *Extensions' entries.* A floor fold contributes tidy entries (`board.adds['floor:<p>'].tidy`, `{key, label, hint,
  does?, kind?}`), the reviews extension one per thread whose work landed, filed by its answer as
  `<checkout>@<stamp>.md` ([[review-threads]]);
  the plan carries the confirmed ones as `x: {[cap]: keys}`, checked against the adds with the rest, and after the
  core's parts each capability's answer to `tower/tidy.apply` applies its keys, reported in the reply's `x.<cap>`
  ([[extensions]]). Once the folds ran, [`foldBoard`](ref:hub/src/bridge/folds.ts#foldBoard) gives each floor with
  entries its Tidy with them ([`withAddedTidy`](ref:hub/src/bridge/verbs.ts#withAddedTidy)): `tidy` is offered while
  anything is listed, the core's or an extension's, and its call carries every entry's key as `plan.x`, so Tidy all
  applies them with the rest in every renderer and the CLI alike. `floor.tidy` stays the core's plan. Renderers read the
  entries with [`addedTidyOf`](ref:hub/src/shared/tidy.ts#addedTidyOf) and pass them to the shared words: `tidyLine`
  counts them by their `kind` (`1 landed thread`), `tidyRows` gives each its row (its `label`, its `does` or
  `apply · <cap>`, its `hint`) with the call that applies only it, and [`tidiedLine`](ref:hub/src/shared/tidy.ts#tidiedLine) names each key applied and each skipped or refused.
- Any part of the plan is a plan: [`tidyRows`](ref:hub/src/shared/tidy.ts#tidyRows) gives each row the call that
  applies only it (one worker, one process, one worktree, one branch, one extension entry; the old logs as one row), applied
  and refused by the same checks as the whole.
- *Until 2.0* (`LEGACY`): `floor.tidy.threads` is copied from the reviews extension's entries, an input's
  `plan.threads` is added to `plan.x.reviews`, and the reply's `threads` is copied from `x.reviews.done`.
- *Never in bulk*: a [[carried]] copy may hold less than the branch did (the lander dropped a hunk), so a worktree
  landed edited is never in the plan and `tidy` refuses it.
  [`editedRows`](ref:hub/src/shared/worktree-words.ts#editedRows) lists each such worktree and kept branch with its own
  `remove` or `delete` call and its `landing` read, drawn under the plan. A finished hire whose worktree is carried
  still counts as landed for its kill; its worktree then waits for its own press.
- Renderers draw the shared words ([`tidyLine`](ref:hub/src/shared/tidy.ts#tidyLine),
  [`tidyRows`](ref:hub/src/shared/tidy.ts#tidyRows)), and confirm the whole list or a row before it runs; Tower 3D's
  Running board carries it too ([`buildRunning`](ref:hub/renderers/tower3d/src/running.ts#buildRunning),
  [[verb-prompts]]).

**Alternatives considered.**
- *A second verb* (`prune`) beside the worktree `tidy`: two buttons that each clean half of a floor. One list says
  everything that would go.
- *Recomputing on the server and applying whatever qualifies at the press*: the user would approve one list and get
  another, possibly a worker killed that wasn't shown. Refusing makes a stale press visible; the next board shows
  the new list.
- *Any worker idle for a while*: a worker the user started often waits on the world, not on itself; whether a hire's
  purpose is done is read from git instead.
- *Offering a landed hire whose hirer is on duty*: a hire kept to answer its implementers' questions, its work living
  outside the repo, would be offered and sent home by mistake. No explicit "keep" fact is stored: the hirer being on
  duty is already on the board.
- *Per-item verbs only* (`worktree/remove`, `branch/delete`, `reap/process`, `kill`): no verb archives a log on its own, and each checks its own conditions, not the ones Tidy listed by. A row's call is Tidy's
  own, so a row does exactly what the whole would do to it. Tidy checks its conditions first, then calls those verbs
  for each entry, so their own checks and whatever wraps them run as well.

**Impact.** The board carries `floor.tidy` and `Card.stuck`. Shells from the terms daemon are never listed.
