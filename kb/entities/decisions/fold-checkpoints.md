---
{
  "type": "decision",
  "name": "Fold checkpoints: a cache of each log's facts, keyed by the code that folds them",
  "summary": "Every reader that folds whole logs resumes each log from a checkpoint in <root>/cache/facts/: the facts at a line boundary of the log, kept with the log's header, the byte offset and a hash of the source of the code that folds. A checkpoint made by other code, past the log's end or for another header is not used; deleting the cache changes nothing but speed.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/checkpoints.ts#foldLog", "hub/src/checkpoints.ts#FOLD", "hub/src/checkpoints.ts#sourceHash", "hub/src/checkpoints.ts#writeCheckpoint", "hub/src/tail.ts#readHeader", "hub/src/tail.ts#readEvents", "hub/src/tail.ts#factEvents", "hub/src/system.ts#watchSystem", "hub/src/cli.ts", "hub/src/shared/paths.ts#systemPaths", "hub/test/checkpoints.test.ts"],
  "links": [
    { "to": "system-root", "verb": "writes", "carries": "cache/facts/<id>.v8: a checkpoint per log, moved to the log's last full line by each fold that read past it" }
  ]
}
---
**Problem.** Every start of the [[live-system]] (the tower) and every `tower ls` and `tower resume` folded every log
ever written from byte 0. On 2026-10-07 that was 235 logs, 881 MB: the tower took 1.64 s and peaked at 430 MB,
`tower ls` 4.3 s and 1.77 GB (it parsed every line). It grows linearly with history, yet 230 of those logs had
exited and can never change.

**Why.** Roadmap decision D2 settled it: a checkpoint is a cache, never authoritative, always safe to delete, so
it is not a fourth kind of stored state ([[logs-are-facts]]). The facts of a closed file are a pure function of
it and of the code that folds it; keep the result under both and the next read is a lookup.

**How.** [`foldLog`](ref:hub/src/checkpoints.ts#foldLog) reads a log's header, takes the checkpoint at
`cache/facts/<id>.v8` if it holds, folds the complete lines after its offset onto its facts, and moves the
checkpoint to the new offset when it read anything. A checkpoint is `{fold, header, offset, facts}`:

- **It holds** when `fold` is this code's hash, `offset` is within the log's size and `header` equals the log's.
  Anything else, and a file that can't be deserialized (said once in the reader's log, the tower's for the tower),
  folds the log from its start and writes a new one. Logs are append-only, so a log's prefix never changes.
- **The fold hash is derived, never bumped by hand**: [`FOLD`](ref:hub/src/checkpoints.ts#FOLD) is a sha256 of
  the source of `src/checkpoints.ts` and of every module it imports by a relative path, transitively
  ([`sourceHash`](ref:hub/src/checkpoints.ts#sourceHash)): the fold steps (`bridge/facts.ts`, `status.ts`,
  `conversation.ts`, `blocked.ts`, …), the event filter and readers in `tail.ts`, and the resume itself. A change
  to any of them, a new import among them, retires every checkpoint at the next start. It errs towards refolding:
  a comment or a type change also invalidates, which costs one cold start. Imports are read from statements at
  the start of a line (braces may span lines) and from dynamic `import('./…')`, so a path quoted in a comment is
  not one.
- **Resuming on a line boundary**: an offset is always the start of a line, and the fold continues with
  [`readEvents`](ref:hub/src/tail.ts#readEvents) from it, its filter
  ([`factEvents`](ref:hub/src/tail.ts#factEvents)) seeded with the checkpoint's state: the filter's state is the
  facts' state at every step, so it skips exactly what a fold from the start skips. Live logs get a checkpoint the
  same way, and the tail goes on from where the fold stopped.
- **Format**: `node:v8` serialization, which round-trips the facts exactly (a key holding `undefined`, `NaN`):
  resumed facts are deep-equal (strict) to facts folded from the start. Written whole to a dot file and renamed
  into place, so a reader never sees half of one.
- **A broken log** ([[broken-logs]]): `broken` is a fact like any other, so a checkpoint holds it. One made before
  the event the fold can't follow meets it again; one made after it reads on with
  [`afterBreak`](ref:hub/src/tail.ts#afterBreak), folding nothing but a `tower.letGo` ([[let-go]]), and moves to the
  log's end.
- **Failures**: a write the file system refuses (`ENOSPC`, `EDQUOT`, `EACCES`, `EPERM`, `EROFS`) is said once per
  process and the fold goes on without it; any other error is thrown.
- **Archived logs** ([[log-retention]]): a log Tidy gzipped is read as the plain log it was, offsets in plain
  bytes; its size is the gzip trailer's, so the checkpoint archiving leaves at its end holds and `readEvents`
  returns nothing without inflating it.
- **Readers**: [`watchSystem`](ref:hub/src/system.ts#watchSystem)'s `track` (the tower's start and every new log)
  and `tower ls`/`tower resume` ([`src/cli.ts`](ref:hub/src/cli.ts)). The archive read (`GET /archive/<project>`) reads
  the live system's sessions in memory and folds nothing. Screens (`/screen`, `tower screen`, `tower attach`) replay
  output, a separate cache (ScreenCheckpoint) left for later.

[`test/checkpoints.test.ts`](ref:hub/test/checkpoints.test.ts) resumes every fixture from a checkpoint at every
event boundary and asserts the facts deep-equal the fold from the start; checkpoints of other code, past the end,
of another header or unreadable are not used; and the hash covers the fold's modules and changes with any of them.

**Alternatives considered.**
- A version constant bumped by hand: a change that forgets it serves stale facts silently, the one failure a cache
  must not have.
- Hashing only `bridge/facts.ts`, or a fixed list of files: misses a new import or a change in the filter.
- Hashing the git commit: any commit anywhere invalidates, and a dirty working tree (every worker's) is not one.
- JSON files: readable with `cat`, but lossy (a key holding `undefined` disappears, `NaN` becomes `null`), so
  equality would hold only modulo JSON, and a future fact holding a `Map` would break it silently.
- One file for all logs: a write rewrites everything, and a corrupt file loses every log's checkpoint.
- A slot per fold hash (`facts/<fold>/<id>.v8`): two versions of the fold code reading one root (the main
  tower, and `tower ls` from a worktree whose bridge changed) would keep their own checkpoints, where one slot per log
  makes each throw out the other's and fold cold on every run (still correct, ~2 s). Retired hashes' directories
  would pile up with nothing to remove them, and workers check changes on sandboxes with roots of their own. One
  slot per log it is.
- Keeping checkpoints beside the logs: `sessions/` is the facts, and the store's directory watch would wake on them.

**Impact.** On a copy of the real sessions (235 logs, 881 MB): the tower's start goes from 1.64 s and 430 MB
peak to 36 ms and 115 MB warm; cold (no cache, or after a fold code change) it is 1.78 s, the extra ~90 ms
writing 235 checkpoints (3.2 MB) once. `tower ls` goes from 4.3 s and 1.77 GB to 0.36 s and 110 MB warm (2.1 s
cold). Start time is now proportional to what was appended since the last read, not to history. `sessionState`
and `stateOf` went with `tower ls`'s whole-log read.
