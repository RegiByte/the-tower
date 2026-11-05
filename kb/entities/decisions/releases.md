---
{
  "type": "decision",
  "name": "Releases, a changelog, and tower update",
  "summary": "A release is a tag vX.Y.Z cut by hand, with an entry in CHANGELOG.md that flags what it asks of the user (host restart, API major, config) and a CI check on the tag; tower update moves a checkout to the newest release, restarts the tower and never the host, and says when the running host is older than the checkout.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-11-05",
  "refs": ["hub/src/update.ts#update", "hub/src/update.ts#releasesBetween", "hub/src/update.ts#entriesFor", "hub/src/update.ts#sourcesOf", "hub/src/update.ts#changedSince", "hub/src/update.ts#updateJobs", "hub/src/cli.ts", "hub/CHANGELOG.md#L3-L13", "hub/.github/workflows/release.yml", "hub/src/machine.ts#REPO"]
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
  1. fetches the tags; up to date when the newest release is already in `HEAD`'s history (a checkout ahead of a
     release is left alone);
  2. shows the changelog entries after the release `HEAD` descends from
     ([`releasesBetween`](ref:hub/src/update.ts#releasesBetween), [`entriesFor`](ref:hub/src/update.ts#entriesFor));
  3. refuses while tracked files have changes, then stops the tower if it runs, checks the tag out (a detached
     `HEAD`: a branch of the user's stays as it was), `npm ci`, rebuilds Tower 3D when its `out/` exists, and starts
     the tower again;
  4. restarts the jobs daemon only when its code changed since it started and it runs no job, since a restart ends
     every running job; otherwise it names the files and says to restart it once they end
     ([`updateJobs`](ref:hub/src/update.ts#updateJobs), [[jobs-own-daemon]]);
  5. never touches the host. When the host runs and a file its code is built from
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

**Impact.** A user updates with one command and learns what the release asks of them. The host's dependencies
(node-pty) are not in its sources: a release that bumps one flags **host restart** in its entry.
