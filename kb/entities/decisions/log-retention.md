---
{
  "type": "decision",
  "name": "Log retention: ended workers' logs archived by Tidy, gzipped in place",
  "summary": "A session's log whose worker, as it runs now, ended more than the config's retention.days ago (not running, not stranded with a conversation to resume) is offered by its floor's Tidy to be archived: gzipped in place as <id>.jsonl.gz; so is a system stream's month file closed that long, on every floor's Tidy. Every reader reads an archived log as the plain log it was, its offsets in plain bytes; the fold takes the checkpoint archiving leaves at the log's end without inflating it. Never automatic, never deleted; retention.days unset offers nothing.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-15",
  "refs": [
    "hub/src/bridge/retention.ts#oldLogs",
    "hub/src/bridge/retention.ts#LogFile",
    "hub/src/bridge/retention.ts#oldStreams",
    "hub/src/bridge/retention.ts#StreamMonth",
    "hub/src/archive.ts#archiveStream",
    "hub/src/shared/model.ts#RetentionConfig",
    "hub/src/bridge/board.ts#TidyPlan",
    "hub/src/tail.ts#ARCHIVED",
    "hub/src/tail.ts#logFileOf",
    "hub/src/tail.ts#logSize",
    "hub/src/tail.ts#logBytes",
    "hub/src/tail.ts#readHeader",
    "hub/src/tail.ts#readEvents",
    "hub/src/archive.ts#archiveLog",
    "hub/src/system.ts#watchSystem",
    "hub/src/tower/server.ts#tidyProject",
    "hub/src/shared/cards.ts#tidyRows",
    "hub/test/checkpoints.test.ts"
  ],
  "links": [
    { "to": "system-root", "verb": "writes", "carries": "sessions/<id>.jsonl.gz: an ended worker's log, gzipped in place by Tidy" },
    { "to": "tidy", "verb": "extends", "carries": "the plan's logs: the old logs to archive, each with its size" },
    { "to": "tidy", "verb": "extends", "carries": "the plan's streams: the system streams' closed months to archive, each with its size" },
    { "to": "probes", "verb": "reads", "carries": "streams/system/probe.<name>/YYYY-MM.jsonl.gz: a closed month, gzipped in place by Tidy" }
  ]
}
---
**Problem.** Nothing ever removed or shrank a session log. [[fold-checkpoints]] keep the tower's start fast, but the
disk only fills.

**Why.** A log is the fact ([[logs-are-facts]]): an old worker's card, brief, screen and stats are read from it, so
deleting it loses facts. Session logs are mostly terminal output and repeated JSON, which gzip shrinks several
times over. Compressing keeps every fact readable and gives back
most of the space; moving logs to another directory gives back none.

**How.**
- *What is eligible is derived* ([`oldLogs`](ref:hub/src/bridge/retention.ts#oldLogs)), per floor: a plain log
  whose worker, as it runs now (the card at the end of its resume chain), ended more than `retention.days` ago:
  not live, and not on duty (stranded with its latest conversation waiting to be resumed). A worker's sessions go
  together, so a chain still in use keeps every log its brief reads plain. The end is the card's `enteredAt`, when
  it exited or was lost. `retention.days` ([`RetentionConfig`](ref:hub/src/shared/model.ts#RetentionConfig)) is
  top level; unset, nothing is offered.
- *Offered by Tidy* ([[tidy]]): the floor's [`TidyPlan`](ref:hub/src/bridge/board.ts#TidyPlan) gains `logs`, each
  `{id, bytes}` (bytes on disk), drawn as one row
  ([`tidyRows`](ref:hub/src/shared/cards.ts#tidyRows)), since a floor can hold hundreds. Applied whole with the rest
  of the plan, refused like the rest once a listed log no longer qualifies; the reply's `archived` names them.
  Never automatic: whoever changes the system root is the user's press.
- *Archiving* ([`archiveLog`](ref:hub/src/archive.ts#archiveLog)): fold the log first, so its checkpoint reaches
  the log's end; gzip it to a staging file, rename that to `<id>.jsonl.gz`, then remove the plain log. At every
  moment one whole log exists; while both do, the plain one is the log.
- *Reading* (`src/tail.ts`): an archived log is read as the plain log it was, offsets counted in plain bytes.
  [`logFileOf`](ref:hub/src/tail.ts#logFileOf) finds a session's log, plain while it is.
  [`logSize`](ref:hub/src/tail.ts#logSize) of an archive is the gzip trailer's plain size (modulo 2³², exact under
  4 GiB), so a checkpoint at the archive's end holds and [`readEvents`](ref:hub/src/tail.ts#readEvents) returns
  nothing without inflating it: the tower's start reads the checkpoint and one header.
  [`readHeader`](ref:hub/src/tail.ts#readHeader) inflates only the archive's first bytes; everything else that
  reads a whole log ([`logBytes`](ref:hub/src/tail.ts#logBytes): screens, `tower screen`, the brief's turns, a
  fold after the fold code changed) inflates it whole. `GET /stats` reads facts, never logs. An archived log is
  never tailed: its session ended.
- *The live view* ([`watchSystem`](ref:hub/src/system.ts#watchSystem)) tracks plain and archived logs and keeps
  each session's `LogFile` (`{archived, bytes}`), its size read when tracked, when it exits and when it is archived;
  the board reads it as `system.logs()`.
- *Streams' months* ([[probes]]): a stream's file is its UTC month's, appended to only during that month, so a
  month that ended more than `retention.days` ago is eligible ([`oldStreams`](ref:hub/src/bridge/retention.ts#oldStreams)).
  Streams under `streams/system/` belong to no floor, so every floor's Tidy lists them in the plan's `streams`, each
  `{file, bytes}` by its path under `streams/`, as one row; whichever
  floor applies it archives them, and the others' plans move on. Two floors' Tidy pressed together pass the same check,
  so the tower archives stream months one at a time and skips, naming it in `skipped`, a month already gone. A project's own streams (`streams/projects/`,
  [[policies]]' runs and approvals) are not offered yet. [`archiveStream`](ref:hub/src/archive.ts#archiveStream) gzips in place the same way, with
  no fold first (streams keep no checkpoints); the live view reads a month plain while it is, else archived
  ([`StreamMonth`](ref:hub/src/bridge/retention.ts#StreamMonth) on `system.streamMonths()`), and its reads fold the same.

[`test/checkpoints.test.ts`](ref:hub/test/checkpoints.test.ts) folds every fixture gzipped to the plain log's facts
and offset, from its start and from the checkpoint it leaves, and replays its screen the same.

**Alternatives considered.**
- *Moving logs to `sessions/archive/`*: saves no space, the problem itself.
- *Deleting old logs*: loses the facts the archive, briefs and stats read. Only ever the user's explicit choice,
  by hand; nothing in the tower offers it.
- *Archiving on a timer*: a change to the system root nobody pressed for surprises. Tidy is the one place what can go is listed and applied as shown.
- *Eligibility per session, by its own end*: archives the earlier sessions of a chain whose current session still
  runs, and its brief would inflate them on every open.
- *Statting every log on each change of the sessions directory*: the directory changes on every append. Sizes are
  read when a log is tracked, ends or is archived, which is when an eligible log's size can change.

**Impact.** API: `TidyPlan.logs` and `TidyPlan.streams`, the `tidy` reply's `archived` and `streams` (the `tidy`
input's `streams` defaults to none, so a plan built before it still parses). Config `retention.days`. No host
change and no log format change: an archive inflates to the log byte for byte.
