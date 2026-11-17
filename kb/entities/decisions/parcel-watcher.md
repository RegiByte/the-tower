---
{
  "type": "decision",
  "name": "Every folder watch is a @parcel/watcher subscription",
  "summary": "The repo watches and the collections, streams, sessions and config watches go through subscribe on @parcel/watcher: on macOS a stream each, so a watch opening or closing never drops another's events.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-27",
  "reviewed": "2026-11-17",
  "refs": ["hub/src/subscribe.ts#subscribe", "hub/src/system.ts#watchSystem", "hub/src/repo-watch.ts#watchRepos", "hub/src/file-versions.ts#fileVersions", "hub/package.json"]
}
---
**Context.** On macOS Node's recursive `fs.watch` goes through libuv's FSEvents backend, which keeps one
FSEventStream per event loop for every recursive watch and recreates it, from "now", whenever one opens or closes.
What changes on disk during the swap is never reported, to any of them. The repo watches open and close with the
board's observers ([[live-system]]), so items written into a collection, and lines appended to a stream, stayed off
the board until a later write: `test/server.test.ts` failed about one run in eighteen under parallel load waiting for
a review thread. Standalone, a recursive `fs.watch` with another opening and closing every 3 ms missed 98 to 113 of
200 file events; without the churn, none.

**Decision.** [`subscribe`](ref:hub/src/subscribe.ts#subscribe) is the one place a backend lives, and it is
`@parcel/watcher`: one FSEventStream per subscription on macOS, inotify on Linux with ignored directories never
watched. The repo watches ([`watchRepos`](ref:hub/src/repo-watch.ts#watchRepos)), the collections, system streams
and project streams watches ([`watchSystem`](ref:hub/src/system.ts#watchSystem)), and the folders of files whose
versions someone follows ([`fileVersions`](ref:hub/src/file-versions.ts#fileVersions), its subfolders ignored, opened
and closed as views come and go), the sessions directory and the config's directory (and a linked config's target
directory) all go through it: no folder in the tower is an `fs.watch`, only single files are (the tails). On macOS
libuv watches a folder through the same shared FSEventStream whether or not it is recursive; only a watch of a single
file is kqueue. Measured the same way, a non-recursive folder `fs.watch` missed 30 to 55 of 200 events while another
folder `fs.watch`, recursive or not, opened and closed every 3 ms, and none while a file watch or a parcel
subscription did.
The config's directory is the system root, and a subscription there reports its whole tree, every cache and log write
included. Under a writer doing about 12,000 private-index operations a second in `cache/`, no watch missed a change
to a file in the root, but an unfiltered subscription handed every subtree event to JavaScript (about 30% of a core);
ignoring the root's subfolders by path, which FSEvents drops before the process, cost about 3%, a non-recursive
`fs.watch` about 1%. So the config watch ignores the subfolders its folder holds when it starts, `cache/` made first
since it is otherwise made on first use, and signals only for the config's own path. A subfolder made after it starts is not ignored: its events cost CPU until the tower restarts,
never a wrong signal.
A subscription resolves once watching, so each reader starts watching before its first read. FSEvents' "must
rescan", which `fs.watch` never surfaced, is reported as an unknown change; a removed root, which parcel reports once
and then goes silent on, as a failure. Measured with the same churn: a parcel subscription missed 0 of 200 under
`fs.watch` or parcel churn, and so did a recursive `fs.watch` under parcel churn, so the move to the one backend is
for the hazard and for Linux, not because a leftover `fs.watch` would lose.

**Alternatives considered.** An ignore glob (`*/**`) on the config's directory: covers subfolders made later, but
is matched per event in native code, about three times the cost of ignored paths under the same writer. A rescan after each watch opens or closes: compensates for one known churner and leaves
the next recursive watch someone adds to lose events again. Keeping the repo watches open while nobody observes:
watches every repo forever on a headless tower, and fixes only the churn the tower has today. Chokidar: in Node 24 it
is `fs.watch` underneath.

**Consequences.** A native dependency, prebuilt for macOS, Linux (glibc and musl) and Windows through optional
packages: `npm ci` installs it (`npm run setup` and `tower update` run it); a checkout moved by hand needs `npm ci`
before the tower starts again. The host and the terms daemon don't load it, so neither needs a restart. inotify's
overflow still drops events without a word, which the repo watch's safety rounds cover and the collections watch does
not.
