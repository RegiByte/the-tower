---
{
  "type": "decision",
  "name": "Probes: periodic readings of the account's rate limits, kept as facts in a stream, by the bundled quota extension",
  "summary": "The bundled extension quota reads each argv command's rate limits from Claude while no turn of that command does, decided each minute from its own stream, and appends each answer as a reading of the core's fact kind tower/rate-limits, which the core folds beside the sessions' readings, so the limits, the weekly budget and its pace have no holes while no session runs.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-11",
  "reviewed": "2026-11-07",
  "refs": [
    "hub/extensions/quota/extension.json",
    "hub/extensions/quota/server.ts",
    "hub/extensions/quota/status.ts#due",
    "hub/extensions/quota/status.ts#waitOf",
    "hub/extensions/quota/status.ts#step",
    "hub/extensions/quota/status.ts#stepByCommand",
    "hub/extensions/quota/status.ts#withReads",
    "hub/extensions/quota/status.ts#statusOf",
    "hub/src/shared/rate-limits.ts#RateLimitsReading",
    "hub/extensions/quota/usage.ts#usageAnswer",
    "hub/extensions/quota/usage.ts#usageReading",
    "hub/src/bridge/rate-limits.ts#limitsStep",
    "hub/src/bridge/rate-limits.ts#accountLimits",
    "hub/src/bridge/rate-limits.ts#accountsOf",
    "hub/src/bridge/rate-limits.ts#commandLimits",
    "hub/src/bridge/rate-limits.ts#streamLimitsStep",
    "hub/src/bridge/legacy.ts#LEGACY_READINGS",
    "hub/src/bridge/legacy.ts#respelled",
    "hub/src/bridge/rate-limits.ts#readingStreams",
    "hub/extensions/quota/client/quota.ts#quotaOf",
    "hub/extensions/quota/client/quota.ts#probeLine",
    "hub/extensions/quota/client/quota.ts#probeTitle",
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

**How.** The probe is the bundled extension `quota` ([[extensions]]), which keeps the stream and old names of the
core code it replaced.
- *Settings.* `extensions.quota.settings.every` (default `10m`, at least a minute) and `extensions.quota.off`
  ([`extension.json`](ref:hub/extensions/quota/extension.json)). The old spelling, `probes.quota.*`, is read by one
  pure function at config-read time ([`respelled`](ref:hub/src/bridge/legacy.ts#respelled)) until 2.0; both spellings
  of a field is a config error. The sandbox turns the extension off, so a throwaway system never reads the real account.
- *The reader.* The sessions' Claude, each command of `ctx.commands('claude')` in turn (through any wrapper), with `-p --input-format
  stream-json` and nothing loaded or saved, run through `ctx.run` from the temp dir with the scrubbed env
  ([[env-scrub]]), sent one line, the `get_usage` control request, and killed at a timeout
  ([`server.ts`](ref:hub/extensions/quota/server.ts)). The answer becomes a reading in the sessions' shape
  ([`usageAnswer`](ref:hub/extensions/quota/usage.ts#usageAnswer), [`usageReading`](ref:hub/extensions/quota/usage.ts#usageReading)),
  each reset rounded to the second as the mod reports it, so a window is one whichever read it. A read sends no
  prompt, starts no session and calls no verb.
- *Due, from facts.* The extension's `tick` slot fires every minute and reads when
  [`due`](ref:hub/extensions/quota/status.ts#due): never while a session's newer reading holds every limit the last
  answer had (a model's own weekly limit, which no session measures, keeps it reading); else once its wait
  ([`waitOf`](ref:hub/extensions/quota/status.ts#waitOf)) has passed: `every`, a doubling backoff after failures in a
  row, a long wait after an answer saying the account has no rate limits. The wait is read from the stream, so a
  restart doesn't reset it; the extension holds only the read in flight and a floor between a command's starts. Each
  command is due alone, over its own reads and its own turns; a tick reads what is due in turn, one in flight, so two
  accounts never run Claude at once and one failing leaves the next to read. `quota/read-now` takes a `command`, or
  reads every command but those read within the floor.
- *A stream, one writer.* Its stream `reads` lives in `streams/system/probe.quota/`, the folder the core wrote
  (`LEGACY`): `u` an answered read, of the core's kind `tower/rate-limits`; `f` a read with no answer; `p`, a read
  as the core wrote it, never written again. A read names its `command` where `argv` names them; the extension folds
  by that name ([`stepByCommand`](ref:hub/extensions/quota/status.ts#stepByCommand)), and what names none is the
  default command's, derived when read ([`withReads`](ref:hub/extensions/quota/status.ts#withReads)). Skipped reads are not logged; each read stands alone, so a broken line
  costs that read only.
- *Folded beside the sessions.* A stream fact declaring `tower/rate-limits`
  ([`RateLimitsReading`](ref:hub/src/shared/rate-limits.ts#RateLimitsReading)) in a system stream of any resolved
  manifest is folded by the core ([`readingStreams`](ref:hub/src/bridge/rate-limits.ts#readingStreams),
  [`limitsStep`](ref:hub/src/bridge/rate-limits.ts#limitsStep)), and an old `p` through
  [`LEGACY_READINGS`](ref:hub/src/bridge/legacy.ts#LEGACY_READINGS), so turning the probe off stops new reads and
  keeps every past one. Each `argv` command is an account ([`accountsOf`](ref:hub/src/bridge/rate-limits.ts#accountsOf)):
  a turn's reading is its session header's command's, a stream's its `command`'s, kept apart within the stream
  ([`streamLimitsStep`](ref:hub/src/bridge/rate-limits.ts#streamLimitsStep)), and what names none the default
  command's, derived when read, so old readings need no migration. What names a command `argv` no longer holds is no
  account's. `board.limits` has one entry per command in `argv`'s order
  ([`commandLimits`](ref:hub/src/bridge/rate-limits.ts#commandLimits)), each the newest of its sessions ∪ streams
  ([`accountLimits`](ref:hub/src/bridge/rate-limits.ts#accountLimits)), each limit only the other reads carried
  from a recent reading of the other; the top-level `rateLimits`, `rateLimitsAt`, `rateLimitsFrom`, `turnLimits` and
  `extraUsage` are the default command's copies until 2.0, and the weekly budget, its pace and the use from outside
  the tower read both of its sources ([[stats]]).
- *How it stands, derived.* The extension folds its stream ([`step`](ref:hub/extensions/quota/status.ts#step),
  [`statusOf`](ref:hub/extensions/quota/status.ts#statusOf)) into `x.quota` on the board: its state, last read, last
  error and `nextAt`, times rather than "due now": the default command's, and every command's in `commands`. Its
  client draws it under the limits
  ([`quotaOf`](ref:hub/extensions/quota/client/quota.ts#quotaOf), [`probeLine`](ref:hub/extensions/quota/client/quota.ts#probeLine),
  [`probeTitle`](ref:hub/extensions/quota/client/quota.ts#probeTitle)); the words `tower x quota limits` and
  `tower x quota probes` and the doctor's check `reading` ask the extension's reads
  ([`commandLimitsLine`](ref:hub/extensions/quota/status.ts#commandLimitsLine)), and `quota/read-now` reads at once through the path a tick takes.
- *Old names, until 2.0.* `POST /probe/run`, `GET /probe/quota`, `board.probes` and the copies in `/cards.js`
  ([`src/shared/limits.ts`](ref:hub/src/shared/limits.ts#probeLine)) answer through the extension, deprecated
  ([[extensions]], `LEGACY`).
- *Closed months archived* by Tidy like any stream's ([[log-retention]]).

**Alternatives considered.** A kind whose facts are Claude's raw answer (the core would parse each
runtime's answer for good; a reading of `RateLimit[]` keeps the core runtime-neutral, and only the old `p` code is
parsed by it); rewriting the old folder into the new codes (a rollback would find nothing). A timer in the host: it must stay small, its changes kill sessions, and it knows no
Claude flags ([[host-owns-ptys]]). A mod hook: runs only while a session runs, the gap itself. A daemon of its
own, cron or launchd: another process to supervise, blind to the board. Calling the OAuth usage endpoint: the tower
would handle the user's tokens. Readings in memory: no history. Readings in a pseudo-session's log: it would show on
the board, in chains and in Tidy. A collection: collections are the user's and workers' files, edited and deleted by
the user, and these are observed facts.

**Impact.** A fourth directory of logs, not a fourth kind of state: config (intent), logs (facts, `sessions/` by the
host and `streams/` by the tower), collections (files kept for later). The limits on the board stay current while no
session runs, at one short `claude` process per read.
