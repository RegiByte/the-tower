---
{
  "type": "decision",
  "name": "Every recursive watch is a @parcel/watcher subscription",
  "summary": "The repo watches and the collections and streams watches go through subscribe on @parcel/watcher: on macOS a stream each, so a watch opening or closing never drops another's events.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-27",
  "reviewed": "2026-10-29",
  "refs": ["hub/src/subscribe.ts#subscribe", "hub/src/system.ts#watchSystem", "hub/src/repo-watch.ts#watchRepos", "hub/package.json"]
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
watched. The repo watches ([`watchRepos`](ref:hub/src/repo-watch.ts#watchRepos)) and the collections, system streams
and project streams watches ([`watchSystem`](ref:hub/src/system.ts#watchSystem)) all go through it; the sessions
directory and the config's directory stay non-recursive `fs.watch` (kqueue, which FSEvents' churn does not touch).
A subscription resolves once watching, so each reader starts watching before its first read. FSEvents' "must
rescan", which `fs.watch` never surfaced, is reported as an unknown change; a removed root, which parcel reports once
and then goes silent on, as a failure. Measured with the same churn: a parcel subscription missed 0 of 200 under
`fs.watch` or parcel churn, and so did a recursive `fs.watch` under parcel churn, so the move to the one backend is
for the hazard and for Linux, not because a leftover `fs.watch` would lose.

**Alternatives considered.** A rescan after each watch opens or closes: compensates for one known churner and leaves
the next recursive watch someone adds to lose events again. Keeping the repo watches open while nobody observes:
watches every repo forever on a headless tower, and fixes only the churn the tower has today. Chokidar: in Node 24 it
is `fs.watch` underneath.

**Consequences.** A native dependency, prebuilt for macOS, Linux (glibc and musl) and Windows through optional
packages: `npm ci` installs it (`npm run setup` and `tower update` run it); a checkout moved by hand needs `npm ci`
before the tower starts again. The host and the terms daemon don't load it, so neither needs a restart. inotify's
overflow still drops events without a word, which the repo watch's safety rounds cover and the collections watch does
not.
