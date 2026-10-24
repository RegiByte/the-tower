---
{
  "type": "decision",
  "name": "Stats: a reduction of the logs and of what landed, read on demand, today on the board",
  "summary": "Spend, tokens, turns, waits on the user, prompts by origin, asks, failures and the weekly budget are folded as timed facts from events the live fold already reads; a pure stats() reduces them, with what landed on each project's default branches (git log --numstat, read when asked), over any window per project and for all, served as GET /stats; the board carries only today's few numbers, and renderers draw one shared Stats panel.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-24",
  "refs": [
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/bridge/stats.ts#stats",
    "hub/src/bridge/stats.ts#overlap",
    "hub/src/bridge/stats.ts#weeklyBudget",
    "hub/src/bridge/stats.ts#weeklyRead",
    "hub/src/bridge/stats.ts#outsideUse",
    "hub/src/bridge/stats.ts#outsideIn",
    "hub/src/bridge/stats.ts#pace",
    "hub/src/bridge/stats.ts#today",
    "hub/src/bridge/probes.ts#probeFacts",
    "hub/src/shared/api.ts#QUERIES",
    "hub/src/tower/http.ts#statsRead",
    "hub/src/bridge/landed.ts#parseLog",
    "hub/src/landed.ts#readLanded",
    "hub/test/fixtures/landed.gitlog",
    "hub/test/stats.test.ts"
  ],
  "links": [
    { "to": "log-reductions", "verb": "uses", "carries": "timed facts folded from session.measure, turn.*, Stop, prompt.submit, PermissionRequest, PostToolUseFailure, agent.spawn" },
    { "to": "logs-are-facts", "verb": "follows", "carries": "every number is computed from the logs, nothing is kept" }
  ]
}
---
**Problem.** The past is in events the live fold already reads: what a day cost, how much work the floor did, how
long workers wait on the user, how far the weekly limit's pace will carry. The obvious sum is wrong: each card's
`costUsd` is Claude's running total for the conversation, carried into a resume, so summing cards overstates the spend.

**Why.** Stats are a capability: every renderer and every worker should reach them ([[renderer-is-disposable]]),
and they are computable from the logs, so they are computed ([[logs-are-facts]]).

**How.**
- *Timed facts.* [`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter) folds small arrays of epoch-ms entries:
  `spend` (what each `session.measure` reading added to its [[conversation]]'s total, the baseline keyed on the
  conversation, so a `/clear` or a resume counts from the right start), `tokens` per model step, `turnSpans`
  (main-loop `turn.start` to `turn.complete`), `waits` (a `Stop` to the user's next prompt), `prompts` by origin,
  `asks` (`PermissionRequest`: a dialog the user saw), `failures` (`PostToolUseFailure`), `subagentRuns` and
  `limitReadings`. None reads a `PostToolUse` body.
- *A pure reduction.* [`stats`](ref:hub/src/bridge/stats.ts#stats)`(sessions, landed, {from, to, bucket})` gives
  summaries, per-session shares, series per bucket and hour-of-day, per project and for all. Concurrency comes from
  [`overlap`](ref:hub/src/bridge/stats.ts#overlap) over main-loop turn spans only: subagents are not workers.
- *The weekly budget.* [`weeklyBudget`](ref:hub/src/bridge/stats.ts#weeklyBudget) reads the `seven_day` limit from
  every session's readings and every probe's reads ([[probes]]); it is the account's, so `/stats?project=` filters the
  stats and never the budget. The spend from the week's first reading to its latest, over the percent it climbed, is
  what 1% buys; [`weeklyRead`](ref:hub/src/bridge/stats.ts#weeklyRead) gives a past window's last reading, and
  [`pace`](ref:hub/src/bridge/stats.ts#pace) whether today's rate lasts to the reset.
- *Use from outside the tower.* claude.ai, the desktop app or another machine move the same limit, which would make
  1% look cheaper than it is. [`outsideUse`](ref:hub/src/bridge/stats.ts#outsideUse) sums climbs between two
  consecutive probe answers while no session used the API; only probe answers are compared with each other, since a
  session's reading and the probe's can differ by a point for the same use. Use outside while the tower works counts
  as the tower's, so the estimate errs low. [`outsideIn`](ref:hub/src/bridge/stats.ts#outsideIn) gives a window's.
- *What landed, from git's own records.* Per project: [`readLanded`](ref:hub/src/landed.ts#readLanded) walks the
  first parents of each repo's `origin/HEAD` over the window (as of the last fetch) with `--numstat`, and
  [`parseLog`](ref:hub/src/bridge/landed.ts#parseLog) reads each landing at its committer time: a merge is one
  landing counting the commits it brought, a commit made on the branch or a squash is one. A repo two projects share
  counts once in All. Nobody is credited: the tower parses neither commands nor commit messages, and a team repo's
  numbers count teammates' landings too. Git is read on each `/stats`, over a bounded window, and history on a branch
  never changes, so nothing is held between reads.
- *A read, not the board.* `GET /stats?from&to&bucket&project` ([`statsRead`](ref:hub/src/tower/http.ts#statsRead)),
  its query a schema in [`QUERIES`](ref:hub/src/shared/api.ts#QUERIES); `tower.stats(query)` reads it.
- *Today on the board.* `board.today` ([`today`](ref:hub/src/bridge/stats.ts#today)): today's spend, agent-hours,
  waits answered and the weekly budget with its pace. They move only with readings, turns and prompts, which already
  change the board, so they add no pushes; a day that turns while nothing happens shows within a minute, as the tower
  rebuilds the board on a clock ([`CLOCK_PUBLISH_MS`](ref:hub/src/tower/publisher.ts#CLOCK_PUBLISH_MS)), and
  `today.since` says which day it is.

**Alternatives considered.**
- *Sum each card's `costUsd`.* Resumes carry it, so it overstates.
- *Only deltas between readings, a drop counted in full.* A `/clear` with no reading between its two conversations
  shows no drop, and the new conversation's cost is lost.
- *Waits from a `Stop` to the next turn.* A turn a task's notification, a schedule or a peer starts is not the user
  answering.
- *Asks from `tool.check` with decision `ask`.* Nearly all are settled by auto mode; `PermissionRequest` is what the
  user saw.
- *Lines from the log's Edit/Write hooks*: they miss every edit made through Bash and would need `PostToolUse` bodies
  the live fold skips.
- *Commits by committer time without first parents*: in a repo that lands through merges, a branch's commits count
  on the days they were written and drop out when that falls before the window.
- *Attributing commits to workers*: a policy about who made what, which the tower doesn't declare.
- *History on the board, or prompt texts in facts.* The board is pushed on every change to every renderer; only
  times and numbers are folded, and the brief reads texts from the logs when asked ([[brief-turns]]).

**Impact.** Every renderer draws the shared Stats panel ([[shared-panels]]); any page or worker reads `/stats`.
