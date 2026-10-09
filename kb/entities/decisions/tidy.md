---
{
  "type": "decision",
  "name": "Tidy: one list of what can go, computed, applied as shown",
  "summary": "Each floor's Tidy is a plan computed in the bridge: removable worktrees, absorbed kept branches, landed review threads, the processes of sessions no longer running, hired workers done with their purpose, and the logs of workers ended more than retention.days ago (log-retention): hires quiet between turns (a finished turn even with its answer unread), no running worker reporting to them, their worktree's work landed. A worker the user started is never offered. Its call carries the plan; POST /tidy applies exactly that list, or any part of it (each row of the list is its own call), and is refused once any of it no longer qualifies. A worker working with no word from Claude for 20 min is stuck: flagged on its card, never killed.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-08",
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
    "hub/src/tower/server.ts#tidyProject",
    "hub/src/tower/server.ts#movedOn",
    "hub/src/worktrees.ts#tidy",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/shared/cards.ts#tidyLine",
    "hub/src/shared/cards.ts#tidyRows",
    "hub/renderers/page/index.html",
    "hub/renderers/tower3d/src/running.ts#buildRunning",
    "hub/renderers/tower3d/src/cards.ts#landedRow",
    "hub/test/prunable.test.ts",
    "hub/test/board.test.ts"
  ]
}
---
**Problem.** The tower knew every process a session left ([[leftover]]) and every worker's status and how long it
had held it, and could end each by hand, but nothing said what could go. A user coming from an agent manager asked
for exactly that: keep track of stuck processes and idle workers and prune them, except what belongs to running
agents. A `tidy` floor verb already removed worktrees, deleted absorbed branches and filed landed threads.

**Why.** What can go is a policy over facts the board already has, so it is computed, not stored, and lives in the
bridge where every renderer and worker reads it ([[renderer-is-disposable]], [[agents-have-every-capability]]).
Ending a worker is not undoable the way a removed worktree is recut: the user sees the whole list before one press.

**How.**
- [`prunable`](ref:hub/src/bridge/prunable.ts#prunable), pure over a floor's cards and worktrees:
  - `reap` every process of a session no longer live (exited or lost), orphaned or not; a live session's are never
    listed.
  - `kill` only a hire (`hiredBy`), once its purpose is done ([`killable`](ref:hub/src/bridge/prunable.ts#killable)):
    live and quiet between turns: `done` (its turn finished, its answer read or not: `waiting` on the user or
    `waitsOn` its hirer) or `idle` with no wait; never one asking a question, held on a screen or failed; nobody
    running reports to it ([[crews]]); and its worktree's
    work has [`landed`](ref:hub/src/bridge/prunable.ts#landed): in every repo nothing uncommitted and the branch
    [[absorbed]], by the same read Tidy deletes branches by, a reviewer's fork with no commits of its own included.
    Landed is the signal, so there is no quiet period; `since`, when it went quiet or someone last typed into it,
    only orders and labels the rows. A hire in a main checkout has no work of its own to land and is never offered.
    A killed hire resumes, but its next turn reads the whole conversation again, uncached: the rows say so.
  - `logs`: the plain logs of workers ended more than `retention.days` ago, archived (gzipped in place) and read the
    same everywhere ([[log-retention]]).
  - A worker the user started (no `hiredBy`) is never offered, whatever its status or age. The user's words: "a job
    that is incomplete but needs to expand over time, e.g ADA-12 currently waiting 2 hours on a bunch of PRs to be
    merged, shouldn't be tidied up and the app shouldn't offer it. Top level workers remain until the user sends them
    home. Hired workers can be sent home after their purpose is complete and their work landed."
  - *Landed decides* (the user's call): a finished hire would otherwise never be offered, since its answer waits on
    its hirer while that runs and its latest prompt is the one it was hired on, and on the user otherwise, until
    someone types into it (a hirer's message isn't typing). The answer stays in its log and the brief, and a kill
    resumes, so the row says "answer unread" and the hire goes.

- A worktree is offered only while nobody holds it: a worker on duty holds the worktree it works in
  ([`occupantsOf`](ref:hub/src/bridge/board.ts#occupantsOf)), running or stranded by the host until it is resumed or
  let go, since its resume starts in that folder and fails once it is gone. Its state reads `live` ("in use"), and
  Tidy, a row's call and `worktree/remove` all fold the same occupants, so no path removes it. A worker let go
  ([[let-go]]) is off duty and holds nothing, like one killed: both stay resumable from the archive only while their
  folder is there. A stranded worker whose folder is already gone holds nothing either (its resume is refused,
  `unresumable: 'gone'`), so the worktree reads `lost` and can be recut or forgotten.
- *Stuck*: [`isStuck`](ref:hub/src/bridge/prunable.ts#isStuck), `working` with no hook or mod event for
  [`STUCK_MS`](ref:hub/src/bridge/prunable.ts#STUCK_MS) (20 min), read from a new fact, `heardAt`
  ([`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter)): `Card.stuck`, and the status word reads "stuck". Output
  doesn't count, since Claude's spinner draws while a tool hangs. Never listed: a long build looks the same.
- The floor's [`TidyPlan`](ref:hub/src/bridge/board.ts#TidyPlan), `floor.tidy`: worktrees and branches by name,
  landed threads by checkout, `prune`, and `logs` ([[log-retention]]). `tidy` is offered while it lists anything, its call
  `['tidy', { project, plan }]` ([`floorOffers`](ref:hub/src/bridge/verbs.ts#floorOffers)).
- [`tidyProject`](ref:hub/src/tower/server.ts#tidyProject) checks the plan against the floor as read now
  ([`movedOn`](ref:hub/src/tower/server.ts#movedOn): processes, workers, threads) and git's part after its fetch
  ([`tidy`](ref:hub/src/worktrees.ts#tidy)), and answers `refused` before touching anything when an item no longer
  qualifies, like `collection/write` on a stale version. It applies only what is listed, in order: worktrees and
  branches, threads filed, processes reaped (SIGTERM), workers killed through the host, old logs archived. Each worker is checked again
  just before its kill, since git's fetch takes seconds: one typed into meanwhile, or whose kill fails, is left alive
  and named in the reply's `skipped`, and the rest goes on, so a reply always says everything that was done.
- Time alone makes a worker stuck, so the tower republishes the board every minute; an unchanged board is not sent.
- Any part of the plan is a plan: [`tidyRows`](ref:hub/src/shared/cards.ts#tidyRows) gives each row the call that
  applies only it, the floor's plan cut down to that one item (one worker, one process, one worktree, one branch, one
  thread; the old logs together, as their one row). Applied and refused by the same checks as the whole.
- Renderers draw the shared words ([`tidyLine`](ref:hub/src/shared/cards.ts#tidyLine), "Tidy: 4 leftovers, 2 finished
  hires"; [`tidyRows`](ref:hub/src/shared/cards.ts#tidyRows)). The tower page folds it into a tray under the floor
  that unfolds the list with the press; its Tidy all button and each row's own ⌫ are confirmed before they run, the whole list named in the first. Tower 3D lists it in the floor panel, each row
  with its own ⌫ beside Tidy all, both run on a second click ("sure?", its arming in place of `confirm()`), and on the Running board
  ([`buildRunning`](ref:hub/renderers/tower3d/src/running.ts#buildRunning)): its head is the floor's `tidy` act (E
  the list at the console, held Z applies it), a leftover row ends that process, a finished hire's row is its own
  `landed` act whose held Z runs only its row's call ([`landedRow`](ref:hub/renderers/tower3d/src/cards.ts#landedRow)), and what Tidy ends is edged in amber.

**Alternatives considered.**
- *A let-go worker still holding its worktree*: let go means off duty without resuming, the stranded worker's
  send-home, and a worker sent home holds nothing. Holding for every resumable worker would keep every worktree ever
  worked in, since every past worker stays resumable.
- *A second verb* (`prune`) beside the worktree `tidy`: two buttons that each clean half of a floor. One list says
  everything that would go.
- *Recomputing on the server and applying whatever qualifies at the press*: the user would approve one list and get
  another, possibly a worker killed that wasn't shown. Refusing makes a stale press visible; the next board shows
  the new list.
- *Stuck as `broken` attention*: it would ring and paint a long build like a failure. Its own word, no sound.
- *Any worker idle for 2 h* (as first built): a worker the user started often waits on the world, not on itself
  (pull requests to merge, a job that grows over time); its finished turn reads `done` with an answer nobody has
  typed after, so the rule either offered it or, under "never a wait", almost nothing. Whether a hire's purpose is
  done is read from git instead.
- *Dismissed waits counting as read*: would need dismissals as a fact (they are per viewer, in `tower.store`).
  Unneeded once only hires are offered.
- *The stuck threshold in config*: a constant first; a setting once someone wants another number.
- *Shells from the terms daemon*: the user starts them by hand; Tidy never lists them.
- *Per-item verbs only* (`worktree/remove`, `branch/delete`, `reap/process`, `kill`): no verb files a landed thread or
  archives a log on its own, and each checks its own conditions, not the ones Tidy listed by. A row's call is Tidy's own, so a row does
  exactly what the whole would do to it.
- *Tidying on a timer*: whoever ended a worker must be a fact in a log, and the tower writes no logs. Designed when
  wanted.

**Impact.** A stranded worker's worktree reads `live` until it is resumed or let go, no API change. API 1.4: a `tidyRows` row carries `call`, and `POST /tidy` takes any part of the plan. API v13: `floor.tidy`, `Card.stuck`, `typedAt`, `heardAt`; `tidy` takes the plan and its reply adds
`reaped`, `killed` and `skipped`. The worktrees and threads trays lost their own tidy buttons. No host change. A `tidy` fixture
board in Tower 3D and the frames walk.
