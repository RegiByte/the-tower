---
{
  "type": "decision",
  "name": "Probes: periodic readings the tower takes, kept as facts in a stream",
  "summary": "A probe is a named reader from a closed set in the core, run by the tower while due: a pure due(probe, its stream, the board, now) decides each read, each read (Claude's answer or why there is none) is appended to the probe's own log under streams/system/, and the bridge folds it into the same limit readings sessions give, so the rate limits, the weekly budget and its pace have no holes while no session runs; how each probe stands is derived from its stream onto the board, GET /probe/<name>, tower probes and tower doctor.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-11",
  "reviewed": "2026-10-13",
  "refs": [
    "hub/src/bridge/probes.ts#due",
    "hub/src/bridge/probes.ts#waitOf",
    "hub/src/bridge/probes.ts#probeFacts",
    "hub/src/bridge/probes.ts#accountLimits",
    "hub/src/bridge/probes.ts#probesOf",
    "hub/src/bridge/probes.ts#usageAnswer",
    "hub/src/bridge/probes.ts#readingsOf",
    "hub/src/bridge/probes.ts#probeStatus",
    "hub/src/bridge/probes.ts#ProbeStatus",
    "hub/src/bridge/probes.ts#probeView",
    "hub/src/tower/server.ts#probeRead",
    "hub/src/shared/cards.ts#probeLine",
    "hub/src/shared/cards.ts#probeTitle",
    "hub/src/directory.ts#probeCliLine",
    "hub/src/doctor.ts#quotaProbe",
    "hub/src/probes.ts#runProbes",
    "hub/src/system.ts#watchSystem",
    "hub/src/shared/paths.ts#systemStreamsPath",
    "hub/src/shared/model.ts#ProbeConfig",
    "hub/test/fixtures/probe-usage.out",
    "hub/test/fixtures/probe-quota.jsonl",
    "hub/test/probes.test.ts"
  ],
  "links": [
    { "to": "logs-are-facts", "verb": "amends", "carries": "one writer per log: the tower writes streams/" },
    { "to": "stats", "verb": "feeds", "carries": "seven_day readings from probe reads" },
    { "to": "env-scrub", "verb": "follows", "carries": "the probe's claude runs with the parent session scrubbed" },
    { "to": "log-retention", "verb": "follows", "carries": "a stream's closed months, archived by Tidy" }
  ]
}
---
**Problem.** The account's rate limits arrive only with a session's turn (`session.measure`). While nobody works the
board's limits age, and the weekly budget's history has holes exactly when use happens elsewhere (claude.ai, the
desktop app, a phone) or when the user is away: the moment standing work would need a fresh reading.

**Why.** The readings are facts about the account the system can observe on its own, at no cost: Claude Code answers
the `get_usage` control request with `/usage`'s data, `total_cost_usd: 0` and no API time (measured, kept in the
fixture). Facts go in a log ([[logs-are-facts]]); what they mean is folded.

**How.**
- *A probe, as data.* `config.probes.<name> = { reads, every, off }` ([`ProbeConfig`](ref:hub/src/shared/model.ts#ProbeConfig)).
  The core declares `quota` (`reads: "claude.usage"`, `every: "10m"`), on; the config overrides its fields or adds
  probes, read live ([`probesOf`](ref:hub/src/bridge/probes.ts#probesOf)). A probe the tower can't run (an unknown
  reader, an `every` under 60 s) is a config error, which `tower config check` prints at `probes`. The sandbox
  writes `{ "quota": { "off": true } }`, so a throwaway system never reads the real account. Top-level `probes` is
  the system's; a project's own probes will go under `projects.<p>.probes`, not built yet.
- *Readers are code, a closed set.* `claude.usage` is the only one: the config's `argv` (the sessions' Claude,
  through any wrapper) with `-p --input-format stream-json`, no
  tools, no setting sources, no MCP, no slash commands and nothing saved, run from the temp dir, its env the parent
  session scrubbed with the config's `env` merged ([[env-scrub]]), sent one line, the control request, and nothing
  else; killed by its pid at 30 s ([`runProbes`](ref:hub/src/probes.ts#runProbes)). The answer is taken from its stdout
  ([`usageAnswer`](ref:hub/src/bridge/probes.ts#usageAnswer)). No reader sends a prompt, starts a session or calls a
  verb. A reader a program the user writes could be is left for later: the core can't promise it only reads.
- *Due, from facts.* Every 30 s the tower runs the first probe [`due`](ref:hub/src/bridge/probes.ts#due) at `now`:
  never while `off`, nor while its reader can wait on the sessions (`claude.usage`: the sessions' newest reading is
  newer than `every` and has every limit the probe's last answer had: an account with a model's own weekly limit,
  which no session measures, is read every `every` while sessions work too); else once its wait ([`waitOf`](ref:hub/src/bridge/probes.ts#waitOf)) has passed since its stream's last
  read: `every`; after 3 failures in a row 10 min doubling to 1 h; 6 h after an answer saying the account has no rate
  limits (`rate_limits_available: false`: an API key, a cloud provider, signed out). Backoff is read from the
  stream, so a restart doesn't reset it. A last read dated after `now` (the clock moved back) is due. The tower holds
  only the read in flight (one at a time across all probes) and when the last one started: reads start at least
  60 s apart whatever the config, the stream or the clock say.
- *A stream per probe, one writer.* `streams/system/probe.<name>/YYYY-MM.jsonl` (the file's UTC month): a header
  `{stream, startedAt, version}`, `startedAt` the month's start, then `[t, "p", read]` events, `read` the reader's
  name, the ms it took, and `{ok: true, answer}` (Claude's answer as it came, nulls dropped, so a later fold reads
  every past read) or `{ok: false, error}`. Skipped reads are not logged: they follow from the session logs. Each read
  stands alone, so a line that is no JSON (an append torn by a crash, a hand edit) costs that read only: the fold
  passes over it and counts it, and the tower's log names the file. An append after a torn line starts a line of its
  own. A session's log stops at its break ([[broken-logs]]), because its events build on each other; a stream's reads
  don't. Project
  streams live at `streams/projects/<project>/<stream>/`: the first are a floor's policies' `runs` and `approvals`
  ([[policies]]), read and appended through the same stream code (`src/bridge/streams.ts`, `src/streams.ts`).
- *Folded beside the sessions.* [`watchSystem`](ref:hub/src/system.ts#watchSystem) watches `streams/system/` and
  folds each probe's months in order ([`probeFacts`](ref:hub/src/bridge/probes.ts#probeFacts)): `limitReadings` and
  `rateLimits` in the sessions' shape (`five_hour`, `seven_day`, and each model's own week from `model_scoped` as
  `seven_day_<model>`, each reset rounded to the second as the mod reports it, so a window is one whichever read it), the last read, failures in a row, and `rises`: each limit's climb from
  one answer to the next in the same window, which the stats read as use from outside the tower ([[stats]]). The board's `rateLimits` are the newest
  of sessions ∪ probes ([`accountLimits`](ref:hub/src/bridge/probes.ts#accountLimits)), with `rateLimitsFrom`
  (`session` or `probe`), and beside them each limit only the other reads, from the other's newest reading while that
  is at most 15 min older and its window had not reset by the newest (a model's week stays on the board while a
  session's turn is the newest and the probe reads at its interval; off or backing off, it leaves rather than show
  under a fresh reading's age), and `extraUsage`, the account's credits past the plan's
  limits from `rate_limits.extra_usage` (spent and the monthly limit in currency units, whether it is on or spent)
  as the newest answer that had it said, drawn under the limits (the tower page while on, Tower 3D once spent from;
  `extraUsageLine` in `/cards.js`); `weeklyBudget` and `pace` read the readings of both ([[stats]]).

- *How a probe stands, derived.* [`probeStatus`](ref:hub/src/bridge/probes.ts#probeStatus) folds each probe of
  the config with its stream's facts and the board's limits into a
  [`ProbeStatus`](ref:hub/src/bridge/probes.ts#ProbeStatus) on `board.probes`: `state` (`off`, `new`, `ok`,
  `failing`, `backoff` once failures lengthen its wait, `unavailable`), its last read, the error of a last read that
  failed, when one last answered, failures in a row, its `wait`, and `nextAt`, when it reads next: its wait after its
  last read, or later while a session's newer reading holds it (`held`). Times, never "due now": the board changes
  only with facts, and a renderer reads them against its clock. The tower's read in flight is not on it.
- *Where it shows.* Both renderers draw each probe under the limits from the same words
  ([`probeLine`](ref:hub/src/shared/cards.ts#probeLine), [`probeTitle`](ref:hub/src/shared/cards.ts#probeTitle) in
  `/cards.js`): the tower page a line under the meter, Tower 3D a lamp and its name in the HUD's limits, its state
  too while it asks for attention, the whole on hover. `GET /probe/<name>?last`
  ([`probeRead`](ref:hub/src/tower/server.ts#probeRead), [`probeView`](ref:hub/src/bridge/probes.ts#probeView);
  `tower.probe`) answers the status and its latest reads, newest first, each answer as it came. `tower probes`
  prints one line each ([`probeCliLine`](ref:hub/src/directory.ts#probeCliLine)), and `tower doctor` asks the running
  tower for the quota probe ([`quotaProbe`](ref:hub/src/doctor.ts#quotaProbe)): ok while it answers, else a warning
  with one fix by what failed (the command not found, no answer in time, anything else; no limits to read; overdue
  past its `nextAt`).
- *A read now.* `POST /probe/run {name}` ([`runProbes`](ref:hub/src/probes.ts#runProbes)'s `readNow`) reads a
  probe at once through the same path a tick takes, its read appended to its stream like any, and answers when it
  ends (`probed`: when it started, how long it took, whether it answered, why not). Refused while the probe is off,
  while a read is in flight, or within the 60 s floor of the last start, so a press can't read more often than the
  tick could. Each of `board.probes` offers it as `run` ([[board-verbs]]); the tower page has "read now" beside the
  probe's line, Tower 3D a press on its lamp, and `tower probes run <name>`.
- *Closed months archived.* Tidy offers a stream's months closed more than `retention.days` ago, gzipped in place
  and read the same ([[log-retention]]).

**Alternatives considered.** A timer in the host: it must stay small, its changes kill sessions, and it knows no
Claude flags ([[host-knows-no-flags]]). A mod hook: runs only while a session runs, the gap itself. A daemon of its
own, cron or launchd: another process to supervise, blind to the board. Calling the OAuth usage endpoint: the tower
would handle the user's tokens. Readings in memory: no history. Readings in a pseudo-session's log: it would show on
the board, in chains and in Tidy. A collection: collections are the user's and workers' files, edited and deleted by
the user, and these are observed facts.

**Impact.** A fourth directory of logs, not a fourth kind of state: config (intent), logs (facts, `sessions/` by the
host and `streams/` by the tower), collections (files kept for later). The limits on the board stay current while no
session runs, at one ~1.5 s `claude` process per read and ~1.7 KB per read kept. API 1.46 adds `board.probes`, `GET /probe/<name>` and
the Tidy plan's `streams`. API 1.47: outside use as a stat, a model's own week, extra usage, `POST /probe/run`.
