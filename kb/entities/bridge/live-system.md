---
{
  "type": "library",
  "name": "Live system",
  "summary": "watchSystem: every session log folded and tailed, every probe's stream folded, every collection's items, every policy parsed and each project's policy facts folded, the host's live set, the terms daemon's shells, leftover processes and the peer names of running Claudes, with an onChange for renderers.",
  "in": "bridge",
  "reviewed": "2026-10-15",
  "refs": ["hub/src/system.ts#watchSystem", "hub/src/collections.ts#scanCollections", "hub/src/tail.ts#tailLog", "hub/src/tail.ts#factEvents", "hub/src/checkpoints.ts#foldLog", "hub/src/machine.ts#hostLive", "hub/src/machine.ts#scanProcesses", "hub/src/machine.ts#resourcesIn", "hub/src/machine.ts#peersIn", "hub/src/system.ts#serially", "hub/src/bridge/probes.ts#probeFacts", "hub/src/bridge/policies.ts#policyFacts", "hub/src/bridge/streams.ts#streamFacts", "hub/src/worktrees.ts#readRepo", "hub/src/logged.ts"],
  "links": [
    { "to": "system-root", "verb": "reads", "carries": "every sessions/*.jsonl, read to its last full line from its checkpoint on, then tailed while the session runs; collections/ rescanned on any change" },
    { "to": "system-root", "verb": "reads", "carries": "streams/system/probe.*/YYYY-MM.jsonl, watched recursively and folded again once a write settles, a file at the same size not read again" },
    { "to": "system-root", "verb": "reads", "carries": "streams/projects/<project>/{runs,approvals}/YYYY-MM.jsonl and collections/<project>/policies/*, folded and parsed again once a write settles" },
    { "to": "system-root", "verb": "writes", "carries": "cache/facts/<id>.v8, each log's checkpoint, moved on by every fold that read past it" },
    { "to": "host-daemon", "verb": "calls", "carries": "live (ids of running sessions and the host protocol it speaks) every 1 s" },
    { "to": "terms-daemon", "verb": "calls", "carries": "list (shells with foreground process and title) every 1 s" },
    { "to": "claude-code", "verb": "reads", "carries": "~/.claude/sessions/<pid>.json, each running Claude's registration (pid, peer name), every 5 s while observed" },
    { "to": "log-reductions", "verb": "uses", "carries": "factsAfter as the fold step for each event" },
    { "to": "system-root", "verb": "reads", "carries": "config.json, for the project dirs whose git is read every 5 s while observed; its directory is watched for the config changing" }
  ]
}
---
`src/system.ts`, with its machine edges in `src/machine.ts` (host and terms requests, `ps`/`lsof`, git origins, the
editor, `bringUp`).

**Logs.** A new log file is picked up by a directory watch. Each log is folded from its checkpoint on
([`foldLog`](ref:hub/src/checkpoints.ts#foldLog), [[fold-checkpoints]]), and a running session's tail goes on from where
its fold stopped; an exited session stops being tailed, as does one let go ([[let-go]]) and one whose fold breaks on an
event it can't follow ([[broken-logs]]), which costs that session's facts alone. Logs are read through an event filter
([`factEvents`](ref:hub/src/tail.ts#factEvents)) that tells from a line's bytes what the fold ignores, before decoding
it: output once the session has started (output holds a fact only while it is `booting` or `blocked`), and a
`PostToolUse` past its name. The filter folds the session's state over what it keeps and is made from the state a read
starts at (`factEvents(state)`), so a fold resumed from a checkpoint skips exactly what a fold from the start skips. An
event whose state it can't follow, or a complete line that isn't JSON, is kept for the fold to break on.

**Change.** `onChange` fires only when something renderers read changed, each poll comparing its read with the last by
content: output changes no fact but a blocking screen, and the directory watch, which fires on every append, signals
only a newly tracked log.

**Collections and streams.** The collections directory, the system's streams (`streams/system/`) and the projects'
streams (`streams/projects/`) are each watched recursively (one FSEvents stream on macOS, no descriptor per file) and
read again once changes settle, so a burst of writes costs one read, signalling only when the result differs:
collections rescanned ([`scanCollections`](ref:hub/src/collections.ts#scanCollections), every item with its size and
mtime; the store doesn't read the config, the board picks the declared ones), each probe's month files folded in order
([`probeFacts`](ref:hub/src/bridge/probes.ts#probeFacts), [[probes]]), each project's `runs` and `approvals` folded
into its policy facts ([`policyFacts`](ref:hub/src/bridge/policies.ts#policyFacts), [[policies]]); a stream file at the
same size is not read again. Each item of a `policies` collection is parsed and hashed when the collections settle,
again only when its `modifiedAt` moves.

**Config.** The config's directory is watched for the config file (an editor's save replaces it), and a change
signals: the board reads the config, and a config fixed after it broke brings the board back ([[board-errors]]).
[`readConfig`](ref:hub/src/system.ts#readConfig) throws a `ConfigError` naming the file for JSON that doesn't parse; the repos read then keeps its last read.

**The machine.** `live()` and `shells()` poll the host and the terms daemon every 1 s, and are `undefined` while either is
down, which renderers show as such. `running()` (leftover processes), `peers()` (the peer names of sessions' Claudes,
[[agent-directory]]), both from one `ps` scan run off the event loop, and `repos()` are read only while someone
observes, every 5 s: `observe()` keeps those polls running until its release, and the first observer after none reads at once and
waits for the read. Every board client of the tower observes while it holds the board, and a reap for the length of
its request; with no renderer open, the tower runs no `ps`, `lsof` or git at all.

`repos()` is every project dir's git, by dir, read every 5 s while observed and after a worktree verb
([`readRepo`](ref:hub/src/worktrees.ts#readRepo)), on a thread of its own so its spawns never hold the tower's event
loop ([`readRepos`](ref:hub/src/system.ts#readRepos)): the tower's worktrees, its kept branches and origin's branches,
without fetching, every command with `--no-optional-locks` so a read never takes the index lock a worker's git needs.
One read runs at a time, a refresh asked during one running once more after it
([`serially`](ref:hub/src/system.ts#serially), as the process scan does) ([[tower-cuts-worktrees]]).

**Failures.** No poll or watch can end the tower ([`logged.ts`](ref:hub/src/logged.ts)): a read that fails (the host,
the terms daemon, the process scan, git) keeps its last read and says why in the tower's log, and the next
poll reads again; a watcher's callback that throws is logged and runs again on the next change. A log's tail whose
watcher fails says so and that session's facts stop there; a failed watch of the sessions directory, the collections, the
streams or the config's directory ends the tower with the reason, since every board after it would look current and be stale.
