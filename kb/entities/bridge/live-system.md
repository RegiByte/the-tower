---
{
  "type": "library",
  "name": "Live system",
  "summary": "watchSystem: every session log folded and tailed, every probe's stream folded, every collection's items and review threads, every policy parsed and each project's policy facts folded, the host's live set, the terms daemon's shells, leftover processes and the peer names of running Claudes, with an onChange for renderers.",
  "in": "bridge",
  "reviewed": "2026-10-23",
  "refs": ["hub/src/system.ts#watchSystem", "hub/src/collections.ts#scanCollections", "hub/src/tail.ts#tailLog", "hub/src/tail.ts#factEvents", "hub/src/checkpoints.ts#foldLog", "hub/src/machine.ts#hostLive", "hub/src/machine.ts#scanProcesses", "hub/src/machine.ts#resourcesIn", "hub/src/machine.ts#peersIn", "hub/src/system.ts#serially", "hub/src/bridge/probes.ts#probeFacts", "hub/src/bridge/policies.ts#policyFacts", "hub/src/bridge/streams.ts#streamFacts", "hub/src/worktrees.ts#readRepo", "hub/src/logged.ts", "hub/src/repo-reader.ts"],
  "links": [
    { "to": "system-root", "verb": "reads", "carries": "every sessions/*.jsonl, folded from its checkpoint, then tailed while the session runs; collections/ rescanned on any change" },
    { "to": "system-root", "verb": "reads", "carries": "streams/system/probe.*/YYYY-MM.jsonl, folded again once a write settles" },
    { "to": "system-root", "verb": "reads", "carries": "streams/projects/<project>/{runs,approvals}/YYYY-MM.jsonl and collections/<project>/policies/*, folded and parsed again once a write settles" },
    { "to": "system-root", "verb": "writes", "carries": "cache/facts/<id>.v8, each log's checkpoint" },
    { "to": "host-daemon", "verb": "calls", "carries": "live (ids of running sessions and the host protocol it speaks) every 1 s" },
    { "to": "terms-daemon", "verb": "calls", "carries": "list (shells with foreground process and title) every 1 s" },
    { "to": "claude-code", "verb": "reads", "carries": "~/.claude/sessions/<pid>.json, each running Claude's registration (pid, peer name), every 5 s while observed" },
    { "to": "log-reductions", "verb": "uses", "carries": "factsAfter as the fold step for each event" },
    { "to": "system-root", "verb": "reads", "carries": "config.json, for the project dirs whose git it reads; its directory watched for the config changing" }
  ]
}
---
`src/system.ts`, with its machine edges in `src/machine.ts`.

**Logs.** Each log is folded from its checkpoint ([`foldLog`](ref:hub/src/checkpoints.ts#foldLog),
[[fold-checkpoints]]) and a running session's tail goes on from where the fold stopped; a session that exited, was let
go ([[let-go]]) or broke ([[broken-logs]]) is not tailed. A watch of the sessions directory picks up a new log, an
archived one, and an exited one that grew (a `tower.letGo`, folded again). Logs are read through
[`factEvents`](ref:hub/src/tail.ts#factEvents), a filter that tells from a line's bytes what the fold ignores: output
once the session has started (output holds a fact only while it is `booting` or `blocked`) and a `PostToolUse` past
its name. It folds the session's state over what it keeps, seeded with the state the read starts at, so a fold
resumed from a checkpoint skips exactly what one from the start skips; an event it can't follow, or a line that isn't
JSON, is kept for the fold to break on.

**Change.** `onChange` fires only when something renderers read changed: every poll and rescan compares its read with
the last by content.

**Collections and streams.** The collections directory, `streams/system/` and `streams/projects/` are each watched
recursively and read again once changes settle: collections rescanned
([`scanCollections`](ref:hub/src/collections.ts#scanCollections); the board picks the declared ones), each probe's
month files folded ([`probeFacts`](ref:hub/src/bridge/probes.ts#probeFacts), [[probes]]), each project's `runs` and
`approvals` folded into its policy facts ([`policyFacts`](ref:hub/src/bridge/policies.ts#policyFacts), [[policies]]).
A stream file at the same size, and a `reviews` or `policies` item at the same `modifiedAt`, is not read again.

**Config.** The config's directory is watched for the config file (an editor's save replaces it); a change signals,
and a config fixed after it broke brings the board back ([[board-errors]]).
[`readConfig`](ref:hub/src/system.ts#readConfig) throws a `ConfigError` naming the file for JSON that doesn't parse.

**The machine.** `live()` and `shells()` poll the host and the terms daemon every 1 s, `undefined` while either is down.
`running()` (leftover processes), `peers()` (the peer names of sessions' Claudes, [[agent-directory]]), both from one
`ps` scan, and `repos()` are read every 5 s only while someone [`observe`s](ref:hub/src/system.ts#watchSystem); the
first observer after none waits for a fresh read. A board client of the tower observes while it holds the board, a
reap or a Tidy for its request ([`streamBoard`](ref:hub/src/tower/server.ts#streamBoard)); with no renderer open, the
tower runs no `ps`, `lsof` or git.

`repos()` is every project dir's git, read on a worker thread ([`repo-reader.ts`](ref:hub/src/repo-reader.ts),
[`readRepo`](ref:hub/src/worktrees.ts#readRepo)) so its spawns never hold the tower's event loop, and again after a
worktree verb: worktrees, kept branches and origin's branches, without fetching, with `--no-optional-locks` so a read
never takes the index lock a worker's git needs. One read runs at a time, a refresh asked during one running once more
after it ([`serially`](ref:hub/src/system.ts#serially), as the process scan does) ([[tower-cuts-worktrees]]).

**Failures.** No poll or watch callback can end the tower ([`logged.ts`](ref:hub/src/logged.ts)): a read that fails
keeps its last read (an unparseable config keeps every repo's) and says why in the tower's log. A log's tail whose
watcher fails says so and that session's facts stop there; a failed watch of the sessions directory, the collections,
the streams or the config's directory ends the tower ([`watchedOrExit`](ref:hub/src/logged.ts#watchedOrExit)), since
every board after it would look current and be stale.
