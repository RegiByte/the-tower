---
{
  "type": "decision",
  "name": "Setup in one command",
  "summary": "npm run setup takes a fresh clone to a running tower: npm ci, tower init writes a first config unless one exists, the doctor's checks stop it on a failure, and tower up starts the host, the terms daemon and now the tower too, detached.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-10",
  "refs": ["hub/scripts/setup.ts", "hub/src/init.ts#initialConfig", "hub/src/init.ts#init", "hub/src/doctor.ts#readiness", "hub/src/doctor.ts#running", "hub/src/doctor.ts#doctor", "hub/src/shared/claude.ts#claudeRange", "hub/src/machine.ts#daemons", "hub/src/machine.ts#bringAllUp", "hub/src/machine.ts#daemonsNamed", "hub/src/cli.ts", "hub/package.json", "hub/README.md"]
}
---
**Problem.** Starting the tower meant writing `config.json` by hand with absolute paths, then `npm run up`, then
`npm run tower` in a terminal of its own. Nothing said what a machine lacked until something failed deep inside a
session.

**Why.** The tower is shared with people who have Claude Code on a Mac and nothing else of ours: no config, no global
`CLAUDE.md`. A clone and one command should reach a running tower with a worker to spawn.

**How.**

- **`tower init [hub] [repos...]`** ([`init`](ref:hub/src/init.ts#init)) writes a first config and refuses to touch one
  that exists: `argv: ["claude"]`, one project whose hub is the current directory or `hub` (its id the folder's name),
  `repos` beside it, the `drafts` and `reviews` collections every project has (review threads are kept in `reviews`,
  [[review-threads]]), and `user.name` from `git config user.name` when set
  ([`initialConfig`](ref:hub/src/init.ts#initialConfig)). The rest of the config keeps its defaults (`renderer` is
  `page`, `editor` VS Code's) and the README shows it.
- **`tower doctor`** ([`doctor`](ref:hub/src/doctor.ts#doctor)) checks and fixes nothing: each check is `ok`, `warn`
  (the tower runs with less: no editor command, Claude newer than tested ([`claudeRange`](ref:hub/src/shared/claude.ts#claudeRange)), a version it cannot place, or not signed in, a daemon not running yet) or
  `fail` (it can't run: not macOS, Node below 24, no `claude` or `curl`, `git` missing or older than 2.38 (the landing check runs `merge-tree --write-tree`), Claude older than the tested range, a
  system root that isn't writable, a config that doesn't read or names a missing directory, a daemon's place held by
  something else), each `warn` and `fail` with one fix. Any `fail` exits 1. The config is checked by the same
  validators the tower runs as it reads it, the check `tower config check` prints in full ([[tower-cli]]). Claude's sign-in is `claude auth status`; signing in can also happen at the
  first worker, whose sign-in screen reads `blocked` ([[stuck-booting]]).
- **`tower up` starts the tower too** ([[bring-up]]), detached into `tower.log` with `tower.pid`, after the host and the
  terms daemon. Every place is checked before anything starts ([`bringAllUp`](ref:hub/src/machine.ts#bringAllUp)), so a
  port held by another tower starts nothing. `tower up|down [host|terms|tower...]` takes the daemons by name
  ([`daemonsNamed`](ref:hub/src/machine.ts#daemonsNamed)): `tower down tower && tower up tower` restarts the tower alone
  and never the host, which ends every session.
- **`npm run setup`** ([`setup.ts`](ref:hub/scripts/setup.ts)): `npm ci`, `init` unless a config exists (its project is
  the clone itself unless directories are given), the doctor's readiness checks
  ([`readiness`](ref:hub/src/doctor.ts#readiness): all but the daemons, which it is about to start), then `up`, then the
  URL. Tower 3D is opt-in: `--tower3d` builds it ([[renderers-in-config]]).

**Alternatives considered.**

- *An interactive wizard.* Rejected: one first project is all a config needs to run, and the README shows the rest.
  Questions in a terminal are a second way to edit the config.
- *`doctor --fix`.* Rejected: every fix touches the user's machine (installing Node, signing in, the editor command),
  which is theirs to run.
- *A curl | sh installer with release tarballs.* Deferred: the audience clones repos and has Node.
- *Telling our tower apart by asking it.* The tower's port is ours while a process running the tower's server with this
  system's config (`TOWER_CONFIG`, or `~/.tower/config.json` under its `HOME`) listens on it, read from `lsof` and
  `ps -E`: no API change, and a tower started by hand (`npm run tower`) counts as ours too.

**Impact.** The user's routine: `tower up` brings the tower up with the daemons, and `npm run tower` in a terminal of
its own is no longer needed. A tower started by hand still answers `tower up` as already up, but `tower down` refuses
it (no pid file), as it does a host started by hand, and still stops the daemons it did start. The sandbox starts and stops its tower through the same daemons.
A fresh account crashed the tower's first board, reading `~/.claude/sessions` before Claude ever made it; that
directory missing now means no peers.
