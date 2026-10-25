---
{
  "type": "decision",
  "name": "Probes: periodic readings of the account's rate limits, kept as facts in a stream, by the bundled quota extension",
  "summary": "The quota probe reads the account's rate limits from Claude while no session's turn does: since 1.90 the bundled extension quota, whose tick slot decides each read with a pure due(every, its stream, the board's turnLimits, now), appends each read to its stream (kept in the folder streams/system/probe.quota/), an answer as a reading of the core's fact kind tower/rate-limits, which the core folds beside the sessions' readings, so the rate limits, the weekly budget and its pace have no holes while no session runs; how it stands is its board part x.quota, drawn by renderers, tower probes and its doctor check, and its old names answer through LEGACY until 2.0.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-11",
  "reviewed": "2026-10-25",
  "refs": [
    "hub/extensions/quota/extension.json",
    "hub/extensions/quota/server.ts",
    "hub/extensions/quota/status.ts#due",
    "hub/extensions/quota/status.ts#waitOf",
    "hub/extensions/quota/status.ts#step",
    "hub/extensions/quota/status.ts#statusOf",
    "hub/src/shared/rate-limits.ts#RateLimitsReading",
    "hub/src/shared/rate-limits.ts#usageAnswer",
    "hub/src/shared/rate-limits.ts#usageReading",
    "hub/src/bridge/rate-limits.ts#limitsStep",
    "hub/src/bridge/rate-limits.ts#accountLimits",
    "hub/src/bridge/legacy.ts#LEGACY_READINGS",
    "hub/src/bridge/legacy.ts#respelled",
    "hub/src/tower/stores.ts#storesOf",
    "hub/src/shared/limits.ts#quotaOf",
    "hub/src/shared/limits.ts#probeLine",
    "hub/src/shared/limits.ts#probeTitle",
    "hub/src/directory.ts#probeCliLine",
    "hub/src/shared/paths.ts#systemStreamsPath",
    "hub/test/fixtures/probe-usage.out",
    "hub/test/fixtures/probe-quota.jsonl",
    "hub/test/quota.test.ts"
  ],
  "links": [
    { "to": "logs-are-facts", "verb": "amends", "carries": "one writer per log: the tower writes streams/" },
    { "to": "stats", "verb": "feeds", "carries": "seven_day readings from probe reads" },
    { "to": "env-scrub", "verb": "follows", "carries": "the probe's claude runs with the parent session scrubbed" },
    { "to": "log-retention", "verb": "follows", "carries": "a stream's closed months, archived by Tidy" },
    { "to": "extensions", "verb": "follows", "carries": "the first built-in moved into a bundled extension, through LEGACY" }
  ]
}
---
**Problem.** The account's rate limits arrive only with a session's turn (`session.measure`). While nobody works the
board's limits age, and the weekly budget's history has holes exactly when use happens elsewhere (claude.ai, the
desktop app, a phone) or when the user is away: the moment standing work would need a fresh reading.

**Why.** The readings are facts about the account the system can observe on its own, at no cost: Claude Code answers
the `get_usage` control request with `/usage`'s data at no cost and no API time (`test/fixtures/probe-usage.out`). Facts go in a log ([[logs-are-facts]]); what they mean is folded.

**How.** The quota probe was core code from 1.29 to 1.89; at 1.90 it moved into the bundled extension `quota`
([[extensions]]), the first built-in to move, keeping its behaviour, its stream and its old names.
- *Settings.* `extensions.quota.settings.every` (`10m`, at least a minute) and `extensions.quota.off`
  ([`extension.json`](ref:hub/extensions/quota/extension.json)). The old spelling, `probes.quota.every` and `.off`, is
  read there by one pure function at config-read time ([`respelled`](ref:hub/src/bridge/legacy.ts#respelled)) until
  2.0, `tower config check` warning with the line to write; both spellings of a field is a config error, and any other
  probe or field reads nothing, a `config check` failure. The sandbox turns the extension off, so a throwaway system
  never reads the real account.
- *The reader.* The config's `argv` (the sessions' Claude, through any wrapper, `ctx.runtime('claude')`) with
  `-p --input-format stream-json`, no tools, no setting sources, no MCP, no slash commands and nothing saved, run
  through `ctx.run` from the temp dir, its env the config's `env` over the scrubbed one ([[env-scrub]]), sent one line,
  the control request, and nothing else; killed by its process group at 30 s ([`server.ts`](ref:hub/extensions/quota/server.ts)).
  The answer is taken from its stdout ([`usageAnswer`](ref:hub/src/shared/rate-limits.ts#usageAnswer)) and read as a
  reading ([`usageReading`](ref:hub/src/shared/rate-limits.ts#usageReading)): the limits in the sessions' shape
  (`five_hour`, `seven_day`, and each model's own week from `model_scoped` as `seven_day_<model>`, each reset rounded
  to the second as the mod reports it, so a window is one whichever read it) and the account's extra usage. A read
  sends no prompt, starts no session and calls no verb.
- *Due, from facts.* The extension's `tick` slot fires every minute; it reads when
  [`due`](ref:hub/extensions/quota/status.ts#due): never while a session's turn holds it (`board.turnLimits`, the
  sessions' newest reading, is newer than `every` and has every limit the last answer had: an account with a model's
  own weekly limit, which no session measures, is read every `every` while sessions work too); else once its wait
  ([`waitOf`](ref:hub/extensions/quota/status.ts#waitOf)) has passed since its stream's last read: `every`; after 3
  failures in a row 10 min doubling to 1 h; 6 h after an answer saying the account has no rate limits
  (`rate_limits_available: false`: an API key, a cloud provider, signed out). Backoff is read from the stream, so a
  restart doesn't reset it. A last read dated after `now` (the clock moved back) is due. The extension holds only the
  read in flight and when the last one started: reads start at least 60 s apart.
- *A stream, one writer.* Its stream `reads` is kept in the folder `streams/system/probe.quota/YYYY-MM.jsonl`, the one
  the core wrote ([[extensions]], `LEGACY`): a header `{stream, startedAt, version}`, then `[t, code, fact]` events:
  `u` an answered read (`ms`, Claude's answer as it came, nulls dropped, and the reading made of it), of the core's
  kind `tower/rate-limits`; `f` a read with no answer (`ms`, `error`); and `p`, a read as the core wrote it before
  1.90 (`{reads: "claude.usage", ms, ok, answer | error}`), kept and never written again. Skipped reads are not
  logged. Each read stands alone, so a line that is no JSON costs that read only. Project streams live at
  `streams/projects/<project>/<stream>/`: the first are a floor's policies' `runs` and `approvals` ([[policies]]).
- *Folded beside the sessions.* A stream fact code declaring `tower/rate-limits`
  ([`RateLimitsReading`](ref:hub/src/shared/rate-limits.ts#RateLimitsReading): `limits`, `extraUsage?`, `runtime?`,
  Claude's when it names none) in any started extension's system stream is folded by the core
  ([`storesOf`](ref:hub/src/tower/stores.ts#storesOf), [`limitsStep`](ref:hub/src/bridge/rate-limits.ts#limitsStep)),
  and an old `p` through [`LEGACY_READINGS`](ref:hub/src/bridge/legacy.ts#LEGACY_READINGS), so every past read folds
  as it did: `limitReadings` and `rateLimits` in the sessions' shape and `rises`, each limit's climb from one reading
  to the next in the same window, which the stats read as use from outside the tower ([[stats]]). The board's
  `rateLimits` are the newest of sessions ∪ streams ([`accountLimits`](ref:hub/src/bridge/rate-limits.ts#accountLimits)),
  with `rateLimitsFrom` (`session` or `probe`), and beside them each limit only the other reads, from the other's
  newest reading while that is at most 15 min older and its window had not reset by the newest, and `extraUsage` as
  the newest reading that had it said; `weeklyBudget` and `pace` read the readings of both ([[stats]]).
- *How it stands, derived.* The extension's fold of its stream ([`step`](ref:hub/extensions/quota/status.ts#step))
  and its board fold ([`statusOf`](ref:hub/extensions/quota/status.ts#statusOf)) put `x.quota` on the board: `state`
  (`new`, `ok`, `failing`, `backoff` once failures lengthen its wait, `unavailable`), its last read, the error of a
  last read that failed, when one last answered, failures in a row, its `wait`, and `nextAt`, when it reads next: its
  wait after its last read, or later while a session's newer reading holds it (`held`). Times, never "due now".
- *Where it shows.* Renderers draw it under the limits from the same words
  ([`quotaOf`](ref:hub/src/shared/limits.ts#quotaOf), [`probeLine`](ref:hub/src/shared/limits.ts#probeLine),
  [`probeTitle`](ref:hub/src/shared/limits.ts#probeTitle) in `/cards.js`). `GET /quota/reads?last` answers its latest
  reads, newest first. `tower probes` prints its line ([`probeCliLine`](ref:hub/src/directory.ts#probeCliLine)), and
  `tower doctor` runs its check `reading`, the read `quota/status`: it answers while the probe reads, else refuses with
  one fix by what failed (the command not found, no answer in time, anything else; no limits to read; overdue past its
  `nextAt`).
- *A read now.* `quota/read-now` reads at once through the same path a tick takes, its read appended like any, and
  answers when it ends (when it started, how long it took, whether it answered, why not). Refused while a read is in
  flight, or within the 60 s floor of the last start. "Read now" in either renderer, `tower probes run quota` and
  `tower x quota read-now` call it. (`read`, the spec's name, is refused for a verb: `ctx.deps.<cap>.read` holds a
  capability's reads.)
- *Old names, until 2.0.* `POST /probe/run {name: "quota"}` answers through `quota/read-now`, `GET /probe/quota`
  through `quota/reads` and the board, both deprecated (RFC 9745); `board.probes` is copied from `x.quota` as it stood
  at 1.89, with its `run` offer ([[extensions]], `LEGACY`).
- *Closed months archived.* Tidy offers a stream's months closed more than `retention.days` ago, gzipped in place
  and read the same ([[log-retention]]).

**Alternatives considered.** At the move: a kind whose facts are Claude's raw answer (the core would parse each
runtime's answer for good; a reading of `RateLimit[]` keeps the core runtime-neutral, and only the old `p` code is
parsed by it); rewriting the old folder into the new codes (a rollback would find nothing). Before it: a timer in the host: it must stay small, its changes kill sessions, and it knows no
Claude flags ([[host-owns-ptys]]). A mod hook: runs only while a session runs, the gap itself. A daemon of its
own, cron or launchd: another process to supervise, blind to the board. Calling the OAuth usage endpoint: the tower
would handle the user's tokens. Readings in memory: no history. Readings in a pseudo-session's log: it would show on
the board, in chains and in Tidy. A collection: collections are the user's and workers' files, edited and deleted by
the user, and these are observed facts.

**Impact.** A fourth directory of logs, not a fourth kind of state: config (intent), logs (facts, `sessions/` by the
host and `streams/` by the tower), collections (files kept for later). The limits on the board stay current while no
session runs, at one short `claude` process per read.
