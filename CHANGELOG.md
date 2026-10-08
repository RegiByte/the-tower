# Changelog

One entry per release, a tag `vX.Y.Z`, newest first. `tower update` moves a checkout to the newest release and shows
the entries it passes. A change is flagged when it asks something of you:

- **host restart**: the host's code changed. It updates when restarted (`tower down`, then `tower up`), which ends
  every session and shell; sessions can be resumed. `tower update` says when the running host is older.
- **API major**: the renderer API broke a renderer (a rename, a removal, a changed meaning); the entry says what.
  A renderer kept apart from the tower moves with it, and its pin (`/tower.js?v=<major>.<minor>`) with it.
  Additions move only the API's minor and ask nothing.
- **config**: a key of `~/.tower/config.json` is new or changed.

Commit messages hold the detail.

## v1.0.0

The first public release. A host owns every Claude Code session in a real PTY and logs everything about it; the
bridge derives the board from the logs; the tower serves the board and the renderer API at `127.0.0.1:4317` (the config's `port`), with
two renderers, the tower page and Tower 3D (`npm run tower3d`). `npm run setup` installs, writes a first config,
checks the machine and starts everything; `tower up`, `down`, `doctor` and `update` run it after.

- **host restart**, from a checkout that ran the tower before this release.
- **API major**: the renderer API's version is `major.minor`, starting at `1.0`, where it was one integer (23 last).
  `tower.js` reads boards from any tower of its own major at its own minor or newer, and a renderer kept apart pins
  the version it was written against in its script URL (`/tower.js?v=1.0`).
- **config**: `port`, where the tower serves (4317 unless set; the `TOWER_PORT` variable is gone), `renderers` and
  `renderer` (renderers served at `/r/<name>/`), `editor`, `user.name`, `callsigns`,
  `retention.days`, each project's `plugins`, `worktrees`, `hiring` and `brief`, each collection's `description`,
  what it is for, shown to the user and the workers wherever it is listed, and the `item` shelf entry (a page kept in
  one of the project's collections): `docs/config.md` says what each takes, and `tower config check` checks an edit. Items kept from now on are named by the moment and a slug (`20261008T130025Z-life-garden.html`); items
  already kept keep their names.
- The `tower` command prints an expected failure as one line with its fix. `tower api` lists the API's verbs and
  reads, and `tower whoami` names the floor's shelf, its collections and the config.
