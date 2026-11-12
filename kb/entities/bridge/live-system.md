---
{
  "type": "library",
  "name": "Live system",
  "summary": "watchSystem: every session log folded and tailed, every stream an extension folds kept current, every collection's items and review threads (the policies extension's runs and approvals among the streams), the host's live set, the terms daemon's shells, the jobs log and the jobs daemon's jobs, leftover processes, the peer names of running Claudes and every project dir's git, read as it changes, with an onChange for renderers.",
  "in": "bridge",
  "reviewed": "2026-11-12",
  "refs": ["hub/src/system.ts#watchSystem", "hub/src/collections.ts#scanCollections", "hub/src/tail.ts#tailLog", "hub/src/tail.ts#factEvents", "hub/src/checkpoints.ts#foldLog", "hub/src/machine.ts#hostLive", "hub/src/machine.ts#scanProcesses", "hub/src/machine.ts#resourcesIn", "hub/src/machine.ts#peersIn", "hub/src/logged.ts#serially", "hub/src/tower/stores.ts#storesOf", "hub/src/system.ts#foldOn", "hub/src/bridge/streams.ts#streamFacts", "hub/src/worktrees.ts#readRepo", "hub/src/logged.ts", "hub/src/repo-reader.ts", "hub/src/repo-watch.ts#watchRepos", "hub/src/subscribe.ts#subscribe", "hub/src/logged.ts#exitUnwatched", "hub/src/bridge/repo-changes.ts#staleOf", "hub/src/bridge/repo-changes.ts#settleHandlers", "hub/src/worktrees.ts#rereadRepo", "hub/src/bridge/worktrees.ts#readsSince"],
  "links": [
    { "to": "system-root", "verb": "reads", "carries": "every sessions/*.jsonl, folded from its checkpoint, then tailed while the session runs; collections/ rescanned on any change" },
    { "to": "system-root", "verb": "reads", "carries": "streams/*/<folder>/YYYY-MM.jsonl, each stream an extension folds stepped on once a write settles" },
    { "to": "system-root", "verb": "reads", "carries": "streams/projects/<project>/<stream>/YYYY-MM.jsonl (the policies extension's in runs/ and approvals/) and collections/<project>/<collection>/*, folded and parsed again once a write settles" },
    { "to": "system-root", "verb": "reads", "carries": "an extension's streams, streams/{system|projects/<p>}/<cap>.<name>/YYYY-MM.jsonl, each folded by its reduce once a write settles" },
    { "to": "system-root", "verb": "writes", "carries": "cache/facts/<id>.v8, each log's checkpoint" },
    { "to": "host-daemon", "verb": "calls", "carries": "live (ids of running sessions and the host protocol it speaks) every 1 s" },
    { "to": "terms-daemon", "verb": "calls", "carries": "list (shells with foreground process and title) every 1 s" },
    { "to": "jobs-daemon", "verb": "calls", "carries": "list (the jobs it holds, running or kept) every 1 s, and after every job request" },
    { "to": "claude-code", "verb": "reads", "carries": "~/.claude/sessions/<pid>.json, each running Claude's registration (pid, peer name), every 5 s while observed" },
    { "to": "log-reductions", "verb": "uses", "carries": "factsAfter as the fold step for each event" },
    { "to": "system-root", "verb": "reads", "carries": "config.json, for the project dirs whose git it reads; its directory watched for the config changing" },
    { "to": "worktrees", "verb": "uses", "carries": "rereadRepo, each project dir's git read again for the parts a change made stale, while observed" }
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
the last by content. A repo read is compared without its `at`, but for a read that is the first dated after a
session started, which the board can read more from (below).

**Collections and streams.** The collections directory, `streams/system/` and `streams/projects/` are each watched
recursively ([`subscribe`](ref:hub/src/subscribe.ts#subscribe)), each watching before its first read, and read again
once changes settle: collections rescanned
([`scanCollections`](ref:hub/src/collections.ts#scanCollections); the board picks the declared ones), each
stream an extension folds stepped on (its `reduce`, and the core's fold of its `tower/rate-limits` readings, [[probes]]); the policies extension's `runs`
and `approvals` are kept in the folders `runs/` and `approvals/` by `LEGACY` ([[policies]]).
An extension's stream is folded by its `reduce` once registered (`foldStream`), the system's or each project's, and
again once a write settles: only facts past where it stood are stepped, from `init` again if the stream holds fewer
([`foldOn`](ref:hub/src/system.ts#foldOn)); a step that throws stops the fold before that fact, kept with why
(`threw`, a `threw` problem on the extension at its next board), and the state is frozen ([[extensions]]). A stream file at the same size, and a `reviews` item at the same `modifiedAt` (an extension's collection item: its
`parse`, cached the same way), is not read again.

**Config.** The config's directory is watched for the config file (an editor's save replaces it), and so is its
target's directory when the config is a link into another folder, where its writes land; a change signals, and a config fixed after it broke
brings the board back ([[board-errors]]). `refreshConfig` signals the same change at once, called by the config verbs
after the tower's own write ([[config-writes]]).
[`readConfig`](ref:hub/src/system.ts#readConfig) throws a `ConfigError` naming the file for a file gone or unreadable, and for JSON that doesn't parse.

**The machine.** `live()`, `shells()` and `heldJobs()` poll the host, the terms daemon and the jobs daemon every 1 s,
`undefined` while each is down. `jobs()` is the jobs log folded ([`jobsOf`](ref:hub/src/bridge/jobs.ts#jobsOf)), read
again as `jobs/` changes and right after a job request, since the daemon logs a job's start before it answers; a log
the fold can't read keeps the last read, and the tower's log says why ([[jobs]]).
`running()` (leftover processes) and `peers()` (the peer names of sessions' Claudes, [[agent-directory]]), both from one
`ps` scan, are read every 5 s, and `repos()` as git changes, only while someone [`observe`s](ref:hub/src/system.ts#watchSystem);
the first observer after none waits for a fresh read. A board client of the tower observes while it holds the board, a
reap or a Tidy for its request ([`streamBoard`](ref:hub/src/tower/publisher.ts#streamBoard)); with no renderer open, the
tower runs no `ps`, `lsof` or git, and watches no repo.

`repos()` is every project dir's git ([`watchRepos`](ref:hub/src/repo-watch.ts#watchRepos)), read on a worker thread
([`repo-reader.ts`](ref:hub/src/repo-reader.ts)) so its spawns never hold the tower's event loop: worktrees, kept
branches and origin's branches, without fetching, with `--no-optional-locks` (every git the tower runs goes through
`src/git.ts`) so a read neither takes the index lock a worker's git needs nor writes into what it watches.

- **A repo that hangs delays only its own reads.** A hook or an fsmonitor can hold a git call to its timeout, a minute
  ([`src/git.ts`](ref:hub/src/git.ts)). Each dir has one read at a time and each read is answered as it settles, so
  another dir's reads land meanwhile, and what the slow dir is asked waits for it. A caller waits for the read carrying
  its own ask, at most the one in flight and then that, so a repo that keeps being asked can't hold it. One repo, its worktrees included, holds
  at most six of git's eight places, so a hung one with many worktrees leaves the others some.
- **Watched.** While observed, each dir's tree is watched recursively ([`subscribe`](ref:hub/src/subscribe.ts#subscribe)),
  and its git's common dir when that lies outside it, the objects and the fsmonitor daemon's cookies left out. Each
  changed path is mapped to the parts of the repo's read it makes stale
  ([`staleOf`](ref:hub/src/bridge/repo-changes.ts#staleOf)): a file in the main checkout or a tower worktree, that
  checkout's status; its own index, the same; its HEAD, refs, `packed-refs`, the config or the worktree list, the
  repo's own facts; a branch's reflog, that branch's; a path in a nested project dir, nothing (that dir's own watch has
  it); an unknown path, everything. The worktrees folder is told apart before the common dir, which in a bare repo is
  the project dir itself.
- **Settled with a ceiling.** A repo's changes are read once they go quiet for `SETTLE_QUIET_MS` (1 s), and no later
  than `SETTLE_MAX_MS` (10 s) after the first, so a file a script rewrites forever costs one status a tree per 10 s and
  never starves the read ([`settleHandlers`](ref:hub/src/bridge/repo-changes.ts#settleHandlers), a machine,
  [[machines]]).
- **Partial reads.** [`rereadRepo`](ref:hub/src/worktrees.ts#rereadRepo) asks git only for the stale parts and keeps
  the rest from the repo's last parts, which the live system holds and sends with each read (a branch's reflog is read
  again once its head moved, a checkout's changed files once its status is read again or its base moved); answers
  about commits are remembered on the thread. The board's shape is the same.
- **Safety rounds.** The OS may drop or merge file events (FSEvents' "must rescan" is read as an unknown path; inotify
  drops on overflow without a word), so every 10 s a few repos' own facts and main status are read, each once per `SAFETY_REPO_MS` (2 min), and a
  few worktrees' status, each once per `SAFETY_TREES_MS` (10 min): on 6 repos of 40 worktrees, 48 git a minute idle.
  Each tick also starts the watches the config added or that failed, and closes those it removed.
- **Dated.** Each read is dated (`at`) by when its repo's own facts, the worktree list among them, began to be read:
  a partial read that keeps the last facts keeps their date. A session's card reads its worktree as gone, and can call it
  `unresumable: 'gone'`, only from reads of its project all dated after the session started
  ([`readsSince`](ref:hub/src/bridge/worktrees.ts#readsSince)): an older read may predate the worktree's cut, and a
  worktree git hasn't been read with yet is not one that was removed. Until then the card says nothing is gone, as
  before the first read. While the board is observed, git is read only as its changes settle, and a session's log is
  folded at once, so without this a new session's card could show its new worktree gone. A floor shows no worktrees
  until every dir of it was read once ([`projectReads`](ref:hub/src/bridge/worktrees.ts#projectReads)), so a dir landing
  before its neighbour never makes a worktree spanning both look removable.
- **Fresh for verbs.** A worktree verb and `refreshRepos` read every part afresh: every destructive verb decides from
  a read made after its fetch, never from the board's ([[tower-cuts-worktrees]]).
- **Platforms.** Every recursive watch is a `@parcel/watcher` subscription behind
  [`subscribe`](ref:hub/src/subscribe.ts#subscribe), ignores applied natively and events batched in native code. On
  macOS each is an FSEvents stream of its own, however many files: Node's recursive `fs.watch` shares one stream per
  process and recreates it whenever a watch opens or closes, so the repo watches coming and going with observers lost
  the collections' and streams' writes. On Linux it is inotify, a watch per directory but the ignored (a walk at start,
  bounded by `max_user_watches`), and under WSL2 files on `/mnt/c` edited from Windows raise no events at all, so only
  the safety rounds see them.

One read runs at a time, a read asked during one running once more after it, with every part asked since
([`serially`](ref:hub/src/logged.ts#serially), as the process scan does) ([[tower-cuts-worktrees]]).

**Failures.** No poll or watch callback can end the tower ([`logged.ts`](ref:hub/src/logged.ts)): a read that fails
keeps its last read (an unparseable config keeps every repo's) and says why in the tower's log, a repo's read once
until its reason changes or a read succeeds. One checkout's failure is not the repo's: it costs that checkout alone, on the board ([[worktrees]]). A log's tail whose
watcher fails says so and that session's facts stop there; a failed watch of the sessions directory, the collections,
the streams or the config's directory, or its root removed, ends the tower
([`watchedOrExit`](ref:hub/src/logged.ts#watchedOrExit), [`exitUnwatched`](ref:hub/src/logged.ts#exitUnwatched)), since
every board after it would look current and be stale. A repo's watch that fails, or a dir that doesn't exist, says
why once in the log and leaves that repo to the safety rounds until its watch starts again.

**Stopping.** [`watchSystem`](ref:hub/src/system.ts#watchSystem)'s `stop` closes every watcher and tail, clears the
polls and the settle timers, resolves the waits in flight, closes the repos' watches, and ends the git reader: nothing it started outlives it.
