---
{
  "type": "decision",
  "name": "Fold checkpoints: a cache of each log's facts, keyed by the code that folds them",
  "summary": "Every reader that folds whole logs resumes each log from a checkpoint in <root>/cache/facts/: the facts at a line boundary of the log, kept with the log's header, the byte offset and a hash of the source of the code that folds. A checkpoint made by other code, past the log's end or for another header is not used; deleting the cache changes nothing but speed.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-26",
  "refs": ["hub/src/checkpoints.ts#foldLog", "hub/src/checkpoints.ts#FOLD", "hub/src/checkpoints.ts#sourceHash", "hub/src/checkpoints.ts#writeCheckpoint", "hub/src/tail.ts#readHeader", "hub/src/tail.ts#readEvents", "hub/src/tail.ts#factEvents", "hub/src/system.ts#watchSystem", "hub/src/cli.ts", "hub/src/archive.ts#archiveLog", "hub/src/shared/paths.ts#systemPaths", "hub/test/checkpoints.test.ts"],
  "links": [
    { "to": "system-root", "verb": "writes", "carries": "cache/facts/<id>.v8: a checkpoint per log, moved to its last full line by each fold that read past it" }
  ]
}
---
**Problem.** The [[live-system]] at every tower start, and `tower ls` and `tower kill`, need every log's facts.
Folding every log from byte 0 grows with history, yet nearly all of those logs have exited and never change.

**Why.** The facts of a closed file are a pure function of it and of the code that folds it; keep the result under
both and the next read is a lookup. A checkpoint is a cache, never authoritative and safe to delete, so it is not a
fourth kind of stored state ([[logs-are-facts]]).

**How.** [`foldLog`](ref:hub/src/checkpoints.ts#foldLog) reads a log's header, takes the checkpoint at
`cache/facts/<id>.v8` if it holds, folds the complete lines after its offset onto its facts, and moves the checkpoint
to the new offset when it read anything. A checkpoint is `{fold, header, offset, facts}`:

- **It holds** when `fold` is this code's hash, `offset` is within the log's size and `header` equals the log's.
  Otherwise, or when the file can't be deserialized (said in the reader's log), the log is folded from its start and a
  new checkpoint written. Logs are append-only, so a prefix never changes.
- **The fold hash is derived, never bumped by hand**: [`FOLD`](ref:hub/src/checkpoints.ts#FOLD) is a sha256 of the
  source of `src/checkpoints.ts` and every module it imports by a relative path, transitively
  ([`sourceHash`](ref:hub/src/checkpoints.ts#sourceHash)): the fold steps, the event filter and readers in `tail.ts`.
  A change to any of them retires every checkpoint at the next start; a comment or type change does too, costing one
  cold start. Imports are read from statements at a line's start and from dynamic `import('./…')`, so a path quoted in
  a comment is not one.
- **Resuming on a line boundary**: the fold continues with [`readEvents`](ref:hub/src/tail.ts#readEvents) from the
  offset, its filter ([`factEvents`](ref:hub/src/tail.ts#factEvents)) seeded with the checkpoint's state, so it skips
  exactly what a fold from the start skips. A live log's tail goes on from where its fold stopped.
- **Format**: `node:v8` serialization, which round-trips the facts exactly (a key holding `undefined`, `NaN`), written
  whole to a dot file and renamed into place ([`writeCheckpoint`](ref:hub/src/checkpoints.ts#writeCheckpoint)).
- **A broken log** ([[broken-logs]]): `broken` is a fact, so a checkpoint holds it. One made before the event the fold
  can't follow meets it again; one made after reads on with [`afterBreak`](ref:hub/src/tail.ts#afterBreak), folding
  only a `tower.letGo` ([[let-go]]).
- **Failures**: a write the file system refuses (`ENOSPC`, `EDQUOT`, `EACCES`, `EPERM`, `EROFS`) is said once per
  process and the fold goes on without it; any other error is thrown.
- **Archived logs**: [`archiveLog`](ref:hub/src/archive.ts#archiveLog) folds a log to its end before gzipping it, and
  that checkpoint holds without inflating the archive ([[log-retention]]).
- **Readers**: [`watchSystem`](ref:hub/src/system.ts#watchSystem), `tower ls` and `tower kill`
  ([`src/cli.ts`](ref:hub/src/cli.ts)) and `archiveLog`. Screens and single-log reads (`tower resume`, a brief)
  read the log whole and keep no checkpoint.

[`test/checkpoints.test.ts`](ref:hub/test/checkpoints.test.ts) resumes every fixture from a checkpoint at every event
boundary and asserts the facts deep-equal the fold from the start, and checks the misses and the hash's coverage.

**Alternatives considered.**
- A version constant bumped by hand: a change that forgets it serves stale facts silently, the one failure a cache
  must not have.
- Hashing a fixed list of files: misses a new import.
- Hashing the git commit: any commit invalidates, and a dirty working tree (every worker's) is not one.
- JSON: lossy (`undefined` keys vanish, `NaN` becomes `null`), so equality would hold only modulo JSON.
- A slot per fold hash (`facts/<fold>/<id>.v8`): two versions of the code reading one root would each keep theirs,
  but retired hashes' directories would pile up with nothing to remove them. With one slot per log they refold cold,
  still correct.
- Checkpoints beside the logs: `sessions/` is the facts, and its directory watch would wake on them.

**Impact.** Start time is proportional to what was appended since the last read; a cold start (no cache, or a fold
code change) folds every log once and writes every checkpoint.
