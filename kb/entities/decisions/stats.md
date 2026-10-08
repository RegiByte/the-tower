---
{
  "type": "decision",
  "name": "Stats: a reduction of the logs and of what landed, read on demand, today on the board",
  "summary": "Spend, tokens, turns, waits on the user, prompts by origin, asks, failures and the weekly budget are folded as timed facts from events the live fold already reads; a pure stats() reduces them, with what landed on each project's default branches (git log --numstat, read when asked), over any window per project and for all, served as GET /stats; the board carries only today's few numbers, and renderers draw one shared Stats panel.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/bridge/stats.ts#stats",
    "hub/src/bridge/stats.ts#overlap",
    "hub/src/bridge/stats.ts#weeklyBudget",
    "hub/src/bridge/stats.ts#today",
    "hub/src/shared/api.ts#QUERIES",
    "hub/src/tower/server.ts#statsRead",
    "hub/src/bridge/landed.ts#parseLog",
    "hub/src/landed.ts#readLanded",
    "hub/test/fixtures/landed.gitlog",
    "hub/src/tower/tower.js",
    "hub/test/stats.test.ts"
  ],
  "links": [
    { "to": "log-reductions", "verb": "uses", "carries": "timed facts folded from session.measure, turn.*, Stop, prompt.submit, PermissionRequest, PostToolUseFailure, agent.spawn" },
    { "to": "logs-are-facts", "verb": "follows", "carries": "every number is computed from the logs, nothing is kept" }
  ]
}
---
**Problem.** The tower showed what each worker is doing now and nothing about the past: what a day cost, how much
work the floor did, how long workers wait on the user, how far the weekly limit's pace will carry. A spike over the
logs showed all of it is in events the live fold already reads, and that the
obvious sum is wrong: each card's `costUsd` is Claude's running total for the conversation, carried into a resume,
so summing cards gave $901 where $694 was spent.

**Why.** Stats are a capability: every renderer and every worker should reach them ([[renderer-is-disposable]]),
and they are computable from the logs, so they are computed ([[logs-are-facts]]).

**How.**
- *Timed facts.* [`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter) folds small arrays, each entry with its epoch
  ms: `spend` (what each `session.measure` reading added to its [[conversation]]'s total: a conversation new to the
  session starts from zero, a resumed one from its first reading, a reading before Claude names the first
  conversation is where its total starts, a lower total started again), `tokens` per model step (main loop and
  subagents), `turnSpans` (main-loop `turn.start` to `turn.complete`), `waits` (a `Stop` to the user's next prompt,
  `composer` or `bridge`), `prompts` by origin, `asks` (`PermissionRequest`: a dialog the user saw), `failures`
  (`PostToolUseFailure`), `spawns`, and each rate limit's readings where they moved (`limitReadings`). None reads a
  `PostToolUse` body.
- *A pure reduction.* [`stats`](ref:hub/src/bridge/stats.ts#stats)`(sessions, {from, to, bucket})` gives per
  project and for all: summaries (sessions started, sessions that ran a turn, resumes, spend, tokens by model,
  agent-hours, turns, prompts by origin, subagents, asks, failures, and the spread (min, p50, avg, p90, max) of waits,
  turn durations and active minutes per session), series per local hour or day, spend and turns by hour of day, and
  concurrency: [`overlap`](ref:hub/src/bridge/stats.ts#overlap) sweeps every main-loop turn span cut to the window (and
  to each bucket) for the wall time anyone worked (`busyHours`), the workers working at once on average over it
  (`atOnce`: turn time over busy time) and the most at once (`peak`, per bucket in `series.peak`). Subagents' turns
  are not workers and are not counted. [`weeklyBudget`](ref:hub/src/bridge/stats.ts#weeklyBudget) reads the `seven_day` limit from
  every session's readings (it is the account's, so `/stats?project=` filters the stats and never the budget): over the window it is in, the spend from its first reading to the
  latest where it moved, divided by the percent it climbed, is what 1% buys; the percent left times that is "$ left
  this week".
- *What landed, from git's own records.* Per project only: for each of a project's dirs (its hub and `repos`),
  [`readLanded`](ref:hub/src/landed.ts#readLanded) walks the first parents of `origin/HEAD` over the window (as of the
  last fetch) with `--diff-merges=first-parent --numstat`, and [`parseLog`](ref:hub/src/bridge/landed.ts#parseLog)
  reads each landing: the time it reached the branch (its committer time) and the lines it changed against the
  branch before it. A merge is one landing that counts the commits it brought, itself included (`rev-list --count
  M^1..M`), its lines those of all of them; a commit made straight on the branch, or a squash, is one. Repos are keyed
  by their top level, so two dirs in one repo read it once. `stats()` takes the read as data (`landed`, by project)
  and adds to every scope the commits, the merges among the landings, lines added and removed, lines by file
  extension and each repo's branch, and series of commits and lines by landing time; the All scope counts a repo two
  projects share once, and the panel draws the All tab's commits and lines from it, naming each project's share in the
  readout. Nobody is credited: the tower parses neither commands nor commit messages, and a user who wants attribution
  signs commits by their own convention. A team repo's numbers count teammates' landings too.
- *A read, not the board.* `GET /stats?from&to&bucket&project` ([`statsRead`](ref:hub/src/tower/server.ts#statsRead)),
  its query a schema in [`QUERIES`](ref:hub/src/shared/api.ts#QUERIES) served at `/schema` under `reads`, defaults the
  last seven local days by day, and refuses windows over 2400 buckets. `tower.stats(query)` reads it.
- *Today on the board.* `board.today` ([`today`](ref:hub/src/bridge/stats.ts#today)): today's spend, agent-hours,
  waits answered (count and p50), the day's start and the weekly budget. The roof draws them live beside the rate
  limits. They move only with readings, turns and prompts, which already change the board, so they add no pushes; a
  day that turns while nothing happens shows yesterday's until the next event, which `today.since` tells.

Git is read on demand, on each `/stats`: one `git log` per repo over a bounded window (about 0.45 s for this repo's
busiest week), the panels read every minute at most, and history on a branch never changes, so nothing would be
gained by holding it between reads. A cache keyed on each repo's origin/HEAD commit is the next step if a repo
grows slow; the 5 s board poll of `repos` is the wrong cadence for it (it runs whenever anyone watches the board).

**Alternatives considered.**
- *Sum each card's `costUsd`.* Wrong by 30% (resumes carry it).
- *Only deltas between readings, a drop counted in full* (the spike's rule). A `/clear` with no reading between
  its two conversations shows no drop, and the new conversation's cost was lost (the `clear` fixture); keying the
  baseline on the conversation counts it.
- *Waits from a `Stop` to the next turn* (the spike's). A turn a task's notification, a schedule or a peer starts is
  not the user answering; 60 of 332 waits were those.
- *Asks from `tool.check` with decision `ask`.* 9,225 of them, nearly all settled by auto mode without a dialog;
  `PermissionRequest` (131) is what the user saw.
- *Lines from the log's Edit/Write hooks* (the spike's first look): they miss every edit made through Bash and
  would need `PostToolUse` bodies the live fold skips. Git saw +45.8k −9.8k where the hooks saw +30.4k −1.3k.
- *Commits by committer time* (`git log --numstat` without `--first-parent`, phase 2's first cut): in a repo that
  lands through merges, a branch's commits counted on the days they were written and dropped when that fell before
  the window; on the cfi repos it read 16 and 21 commits in two days where 31 and 63 reached main.
- *Attributing commits to workers* by matching `git commit` commands or commit messages (79% in the spike): a policy
  about who made what, which the tower doesn't declare.
- *Concurrency counting every `turn.complete`* (the survey's `extract.py`): subagents' turns counted as workers,
  which read Oct 3–7 as 1.2 at once with a peak of 8; the main loops alone are 1.14 with a peak of 3.
- *History on the board.* It is pushed on every change to every renderer; a week of series doesn't belong there.
- *Prompt texts or per-turn records in facts.* Only times and numbers are folded: the brief reads texts from the logs
  when asked ([[brief-turns]]).

**Impact.** Each session's facts hold a few hundred small entries more. The tower page's sidebar (the floor in view
and All floors) and Tower 3D's roof (a stats board beside the rate-limit columns, the overview and every floor as tabs)
draw the shared Stats panel ([[shared-panels]]); any page or worker reads `/stats`. The panels show commits landed and
lines changed per bucket beside the log stats, per project and on the All tab.
