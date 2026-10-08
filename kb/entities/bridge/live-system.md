---
{
  "type": "library",
  "name": "Live system",
  "summary": "watchSystem: every session log folded and tailed, every collection's items, the host's live set, the terms daemon's shells, leftover processes and the peer names of running Claudes, with an onChange for renderers.",
  "in": "bridge",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/system.ts#watchSystem", "hub/src/collections.ts#scanCollections", "hub/src/tail.ts#tailLog", "hub/src/tail.ts#factEvents", "hub/src/checkpoints.ts#foldLog", "hub/src/machine.ts#hostLive", "hub/src/machine.ts#scanProcesses", "hub/src/machine.ts#resourcesIn", "hub/src/machine.ts#peersIn", "hub/src/system.ts#serially", "hub/src/worktrees.ts#readRepo"],
  "links": [
    { "to": "system-root", "verb": "reads", "carries": "every sessions/*.jsonl, read to its last full line from its checkpoint on, then tailed while the session runs; collections/ rescanned on any change" },
    { "to": "system-root", "verb": "writes", "carries": "cache/facts/<id>.v8, each log's checkpoint, moved on by every fold that read past it" },
    { "to": "host-daemon", "verb": "calls", "carries": "live (ids of running sessions and the host protocol it speaks) every 1 s" },
    { "to": "terms-daemon", "verb": "calls", "carries": "list (shells with foreground process and title) every 1 s" },
    { "to": "claude-code", "verb": "reads", "carries": "~/.claude/sessions/<pid>.json, each running Claude's registration (pid, peer name), every 5 s while observed" },
    { "to": "log-reductions", "verb": "uses", "carries": "factsAfter as the fold step for each event" },
    { "to": "system-root", "verb": "reads", "carries": "config.json, for the project dirs whose git is read every 5 s while observed; its directory is watched for the config changing" }
  ]
}
---
`src/system.ts`, with its machine edges in `src/machine.ts` (host and terms requests, `ps`/`lsof`, git
origins, the editor, `bringUp`). A new log file is picked up by a directory watch; an exited session stops being
tailed, as does one whose fold breaks on an event it can't follow ([[broken-logs]]): it costs that session's facts,
and the tower and every other session carry on. Each log is folded from its checkpoint on ([`foldLog`](ref:hub/src/checkpoints.ts#foldLog),
[[fold-checkpoints]]): an exited log costs a header read and a lookup, so a start is about 36 ms for 235 logs
(881 MB) once checkpointed, against 1.6 s folding them all; a running session's tail goes on from where its fold
stopped. Logs are read and tailed through an event filter ([`factEvents`](ref:hub/src/tail.ts#factEvents)) that tells
from a line's bytes what the fold ignores, before decoding or parsing it: output is skipped once the session has started
(the filter folds the session's state over what it keeps, and reads output only while it is `booting` or `blocked`, the
only time output holds a fact), and a `PostToolUse` is read for its name alone (output and tool responses are over 90% of
a log's bytes). An event whose state the filter can't follow is kept, for the fold to break on, with nothing after it. A filter is
made from the state a read starts at (`factEvents(state)`): the
fold's own state at every step, so a fold resumed from a checkpoint and the tail after it skip exactly what a fold
from the start skips. Folding every log from its start (235 logs, 881 MB) takes about 1.7 s, the same with the
boot-time output read as without it. `onChange` fires only when something renderers read changed, each poll comparing its read with the last by
content: output changes no fact but a blocking screen
(`factsAfter` hands back the same facts for any other `o` event), and the directory watch, which fires on every append,
signals only a newly tracked log. The collections directory is watched recursively (one FSEvents stream on macOS, no descriptor per file) and
rescanned once changes settle for 100 ms ([`scanCollections`](ref:hub/src/collections.ts#scanCollections): every
item with its size and mtime; ~0.3 ms for 50 items, ~39 ms for 10,000), so a burst of writes costs one rescan,
signalling only when the listing differs; the store doesn't read the config, so the board picks the declared ones. Leftover processes and the peer names of sessions' Claudes are re-read every 5 s, from one `ps` scan ([[agent-directory]]), run
off the event loop (`ps -E` and `lsof` take about 260 ms on a machine of 1,150 processes). The config's directory is
watched for the config file (an editor's save replaces it), and a change signals: the board reads the config, and a
config fixed after it broke brings the board back ([[board-errors]]). [`readConfig`](ref:hub/src/system.ts#readConfig)
throws a `ConfigError` naming the file for JSON that doesn't parse; the repos read then keeps its last read.

The machine (`running()`, `peers()` and `repos()`) is read only while someone observes it: `observe()` keeps the 5 s
polls running until its release, and the first observer after none reads it at once and waits for the read, so
whoever observes sees it current. Every board client of the tower observes while it holds the board, and a reap
observes for the length of the request; with no renderer open, the tower runs no `ps`, `lsof` or git at all (a
read is about 100 git processes over 7 dirs). `live()` and `shells()` are `undefined` while the host or
the terms daemon is down, which renderers show as such.

`repos()` is every project dir's git, by dir, read every 5 s while observed and after a worktree verb
([`readRepo`](ref:hub/src/worktrees.ts#readRepo)): the tower's worktrees, its kept branches and origin's branches,
without fetching, every command with `--no-optional-locks` so a read never takes the index lock a worker's git needs.
One read runs at a time (a refresh asked during one runs once more after it, [`serially`](ref:hub/src/system.ts#serially), as the process scan does); a dir git fails to read keeps its last
read and the failure is logged ([[tower-cuts-worktrees]]).
