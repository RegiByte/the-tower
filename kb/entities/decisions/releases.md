---
{
  "type": "decision",
  "name": "Releases, a changelog, and tower update",
  "summary": "A release is a tag vX.Y.Z cut by hand, with an entry in CHANGELOG.md that flags what it asks of the user (host restart, API major, config) and a CI check on the tag; tower update moves a checkout to the newest release, restarts the tower and never the host, says when the running host is older than the checkout, and refuses while the tower or the jobs daemon runs from another checkout.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-11-08",
  "refs": ["hub/src/update.ts#update", "hub/src/update.ts#moveTo", "hub/src/update.ts#leftBehindNote", "hub/src/update.ts#releasesBetween", "hub/src/update.ts#entriesFor", "hub/src/update.ts#sourcesOf", "hub/src/update.ts#changedSince", "hub/src/update.ts#updateJobs", "hub/src/cli.ts", "hub/CHANGELOG.md#L3-L13", "hub/.github/workflows/release.yml", "hub/src/machine.ts#REPO", "hub/src/checkouts.ts#updateRefusal", "hub/src/machine.ts#runningCheckouts"]
}
---
**Problem.** A `git pull` says nothing about whether it changed the host, whose restart ends every session, and gives
a renderer kept outside the repo no stable version to follow ([[renderer-api-contract]]).

**Why.** The tower is shared publicly. Its users run a checkout, not a package, and decide themselves when to stop
their sessions; an update has to tell them what it asks of them, and never end their work on its own.

**How.**
- **Releases are tags.** `vX.Y.Z`, cut by hand, each with an entry in `CHANGELOG.md` (newest first, `## vX.Y.Z`
  headings) that flags what it asks: **host restart**, **API major** (and what broke), **config** (a new or changed
  key). Commit messages hold the detail. A workflow on a pushed tag runs `npm ci`, the typecheck, the tests, the
  Tower 3D build and the Mac app's Swift typecheck on macOS, and checks the changelog has the tag's entry
  ([`release.yml`](ref:hub/.github/workflows/release.yml)).
- **`tower update`** ([`update`](ref:hub/src/update.ts#update)), on the checkout the command runs from
  ([`REPO`](ref:hub/src/machine.ts#REPO)):
  1. refuses, before anything else, while the tower or the jobs daemon, the two it restarts, runs from another checkout
     or when its checkout can't be told ([`updateRefusal`](ref:hub/src/checkouts.ts#updateRefusal)). The system root comes
     from the environment and not from the checkout, so a second checkout would otherwise stop the daemons and start
     them from its own tree. A daemon's checkout is its working directory
     ([`runningCheckouts`](ref:hub/src/machine.ts#runningCheckouts)), which `tower up` set: nothing records it, and it
     holds for daemons older releases started. Nothing running means nothing to compare, so stopping the daemons and
     starting them from a new checkout stays the way to move a system. The refusal names the command to run in the
     other checkout, unless that would be refused too or the checkout is gone, and how to move here only the daemons
     that aren't; a daemon `tower up` didn't start can't be stopped with `tower down`, so it is told to stop it where
     it runs;
  2. fetches the tags; up to date when the newest release is already in `HEAD`'s history (a checkout ahead of a
     release is left alone);
  3. shows the changelog entries after the release `HEAD` descends from
     ([`releasesBetween`](ref:hub/src/update.ts#releasesBetween), [`entriesFor`](ref:hub/src/update.ts#entriesFor));
  4. refuses while tracked files have changes, then stops the tower if it runs, moves the checkout to the tag
     ([`moveTo`](ref:hub/src/update.ts#moveTo), derived from its state): a branch the tag descends from is
     fast-forwarded with `merge --ff-only`, so it stays a branch; a detached `HEAD` or a diverged branch is checked
     out at the tag (detached), and either one's commits that the tag lacks are counted and named at the end of the
     update (a branch, or the sha of the detached `HEAD` to keep with `git branch`); then `npm ci`, rebuilds Tower 3D when its
     `out/` exists, and starts the tower again;
  5. restarts the jobs daemon only when its code changed since it started and it runs no job, since a restart ends
     every running job; otherwise it names the files and says to restart it once they end
     ([`updateJobs`](ref:hub/src/update.ts#updateJobs), [[jobs-own-daemon]]);
  6. never touches the host. When the host runs and a file its code is built from
     ([`sourcesOf`](ref:hub/src/update.ts#sourcesOf): the imports of `src/host/main.ts`, read by esbuild) was
     written after the host started (its control socket's birth time, [`changedSince`](ref:hub/src/update.ts#changedSince)),
     it names the files and says to restart the host when no session is mid-turn.

**Alternatives considered.**
- A GitHub release per merge with generated notes: a release no one chose to cut, and notes that flag nothing.
- The host check as the diff between the commits this update crosses: a host left running through two updates would
  be warned about once. Times on disk see every update since the host started, a `git pull` too.
- The board's `hostOutdated`: it moves only with `HOST_PROTOCOL`, not with every change to the host's code.
- Restarting the host when no session is live: a shell or a worker about to be resumed may still matter; the user
  decides.
- The tower's checkout served by the API, or written to a file at `tower up`: an API field says nothing about a running
  tower older than it, and a recorded path is stored state the process already holds.
- A flag to force an update from another checkout: moving the daemons is two commands, and a flag is a mode.
- Refusing `tower up` the same way: it stops nothing, and after a slip `tower up tower` from the right checkout is the
  way back ([[bring-up]]), so it only says what runs elsewhere.

**Impact.** A user updates with one command and learns what the release asks of them. The host's dependencies
(node-pty) are not in its sources: a release that bumps one flags **host restart** in its entry.
