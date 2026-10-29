---
{
  "type": "decision",
  "name": "Setup in one command",
  "summary": "npm run setup takes a fresh clone to a running tower: npm ci, tower init writes a first config unless one exists, the doctor's checks stop it on a failure, and tower up starts the host, the terms daemon and the tower, detached.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-29",
  "refs": ["hub/scripts/setup.ts", "hub/src/init.ts#initialConfig", "hub/src/init.ts#init", "hub/src/doctor.ts#readiness", "hub/src/doctor.ts#running", "hub/src/doctor.ts#doctor", "hub/src/shared/claude.ts#claudeRange", "hub/src/machine.ts#daemons", "hub/src/cli.ts", "hub/package.json", "hub/README.md"]
}
---
**Problem.** A tower that starts only after writing `config.json` by hand and running each process in a terminal of
its own, and that says nothing of what a machine lacks until something fails deep inside a session, is closed to
anyone but its author.

**Why.** The tower is shared with people who have Claude Code on a Mac and nothing else of ours. A clone and one
command should reach a running tower with a worker to spawn.

**How.**

- **`tower init [hub] [repos...]`** ([`init`](ref:hub/src/init.ts#init)) writes a first config and refuses to touch
  one that exists: `argv: ["claude"]`, one project whose hub is the current directory or `hub` (its id the folder's
  name), `repos` beside it, the `drafts`, `reviews` ([[review-threads]]) and `policies` ([[policies]]) collections, and
  `user.name` from `git config user.name` when set ([`initialConfig`](ref:hub/src/init.ts#initialConfig)). The rest
  keeps its defaults; the README shows it.
- **`tower doctor`** ([`doctor`](ref:hub/src/doctor.ts#doctor)) checks and fixes nothing. Each check is `ok`, `warn`
  (the tower runs with less: no editor command, a Claude newer than tested
  ([`claudeRange`](ref:hub/src/shared/claude.ts#claudeRange)) or one it cannot place, not signed in, a daemon not
  running yet, the quota probe failing or overdue as the running tower reports it ([[probes]]), an extension not
  started or a problem of one, each with its fix, its warnings only under `--all` ([[extensions]])) or `fail` (it can't
  run: not macOS, Node below 24, no `claude` or `curl`, `git` missing or older than 2.38 (the landing check runs
  `merge-tree --write-tree`), a Claude older than tested, a system root that isn't writable, a config that doesn't read
  or that `tower config check` fails ([[tower-cli]]), a daemon's place held by something else or its pid running
  without answering ([[bring-up]])), each `warn` and `fail` with one fix. Any `fail` exits 1. Sign-in is `claude auth
  status`; signing in can also happen at the first worker, whose sign-in screen reads `blocked` ([[stuck-booting]]).
- **`tower up` starts the tower too**, after the host and the terms daemon, and takes daemons by name
  ([[bring-up]]): `tower down tower && tower up tower` restarts the tower alone, never the host, which ends every
  session.
- **`npm run setup`** ([`setup.ts`](ref:hub/scripts/setup.ts)): `npm ci`, `init` unless a config exists (its project
  is the clone itself unless directories are given), the doctor's [`readiness`](ref:hub/src/doctor.ts#readiness)
  checks (all but the daemons, which it is about to start), then `up`, then what to do next (the URL, `npm link`, a
  first worker, the tour, the config and the commands that check and update it) for whoever ran it, a person or an
  agent setting up for one, and the URL opened in the browser unless `--no-open`. `--tower3d` also builds Tower 3D
  ([[renderers-in-config]]).

**Alternatives considered.**

- *An interactive wizard.* One first project is all a config needs to run, and the README shows the rest.
  Questions in a terminal are a second way to edit the config.
- *`doctor --fix`.* Every fix touches the user's machine (installing Node, signing in, the editor command), which is
  theirs to run.
- *A curl | sh installer with release tarballs.* The audience clones repos and has Node.
- *Asking the process on the tower's port whether it is ours.* An API change; reading its command and environment
  (`lsof`, `ps -E`) needs none and also counts a tower started by hand (`npm run tower`) as ours ([[bring-up]]).

**Impact.** The user's routine is `tower up`. A tower or host started by hand answers `tower up` as already up, and
`tower down` refuses it (no pid file) while still stopping the daemons it did start. The sandbox starts and stops
its system through the same bring-up. On a fresh account, a missing `~/.claude/sessions` means no peers.
