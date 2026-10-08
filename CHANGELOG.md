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

## v1.0.4

- [docs/extending.md](docs/extending.md): every way to extend the tower, each with its contract, and what isn't one.
  It has the recipe for customizing a renderer: copy the tower page or Tower 3D out of the checkout, declare it in the
  config, layer your own stylesheet and modules on top, and take an update by copying again. There is no plugin API:
  the config, the logs and the collections hold the whole state, and the API does the work.
- The served modules (`/tower.js`, `/design.css`, `/cards.js`, `/panels.js` and the rest) are part of the renderer
  API's contract: removing or renaming an export is an API major, with a line here saying what to use instead, and
  adding one is a minor. `test/served-exports.json` lists every name they serve, and `npm test` fails on a removal that
  doesn't move the major.
- Settings live in one popover behind a gear, on the tower page and in Tower 3D (its HUD and pause card): how a wait
  rings, with each sound to play, notifications, and the colour scheme. The status counts, the host's lamp and the
  Stats bars explain themselves in one tooltip shared by both renderers, and the ? sheet has a legend of the statuses.
- API 1.3: two served modules, `/settings.js` and `/tips.js`; `tower.schemeChoice()` and `tower.chooseScheme(c)`, which
  a framed page asks of the tower that frames it. `RING_NAME` and `RING_MARK` in `/cards.js` are deprecated, kept
  until a major. A renderer that draws the Stats panel or the settings popover calls `watchTips(document)` from
  `/tips.js`: the Stats bars' readouts show through it.

## v1.0.3

**host restart** (optional): the host no longer adds its own `--settings`. Until it restarts, the one it adds comes
first and the client's, which now carries everything, replaces it, so nothing waits on the restart.

- Every worker runs Claude's fullscreen TUI, whatever your own `tui` setting, so the mouse wheel in the tower scrolls
  Claude's transcript instead of walking your prompt history. Claude takes one `--settings`, the last, so the tower
  composes it whole: the project's other repos and the fullscreen TUI.
- A worker's tab row no longer spills past its header at any width: shown tabs' titles narrow first, then the move
  keys and any shown tabs that don't fit wrap onto a line of their own, and the selected tab keeps its controls
  (tower page and Tower 3D's desk).
- A worker whose worktree is gone no longer offers Review, live or not, and `tower review` says which reason stops it.
- `POST /spawn` without a `cwd` starts in the floor's hub, the call the floor itself offers. A malformed spawn names
  the field that is wrong, where it said "Invalid input". API 1.2: spawn without `cwd`, `card.worktree.gone`, and
  spawn's exclusions (`cwd` or `cut`, `base` or `from`) in `/schema`.

## v1.0.2

Claude Code 2.1.295 is tested: the board and `tower doctor` no longer flag it. Every scenario of the fixture set
was recorded again on it and read the same as before (runbook `new-claude-release`), and the surfaces no fixture
covers were checked by hand: long prompts through `submit`, the peer registry, resume, the trust and sign-in screens.

- The "claude <version> untested" notice has a line of its own, under the sidebar's head on the tower page and above
  the HUD strip in Tower 3D. Beside the title it pushed the help and collapse buttons out of the sidebar, and in the
  HUD it squeezed the floor sign. On the tower page "host outdated" and "host down" share that line, and the bell's
  first-open label reads "🔔?", where "🔔 alerts?" alone overflowed the head.
- The selected shown tab keeps ↗, its Finder and editor buttons and ×: only its title truncates. A long title used
  to clip the controls first. Tower 3D's desk tabs had the same problem and have the same fix.

## v1.0.1

A past worker that can no longer be resumed says so before you click: its `cwd` is no longer one of its floor's
directories (the floor's hub moved, or the project left the config), or its worktree's folder is gone (removed by
Tidy, or deleted). The archive of the tower page and of Tower 3D marks it "outside the floor" or "folder gone" in
place of ↻ resume, and `tower agent` says why. Derived on the board from the config and git, never stored.

- The renderer API is `1.1`: cards carry `unresumable` (`outside` or `gone`) while their worker isn't running and
  can't be resumed where it ran, and such a card and its conversations offer no `resume`. A worker the host stopped
  that can't be resumed is no longer on duty: it moves to the archive.
- The release workflow runs `actions/checkout` and `actions/setup-node` v7, on Node 24 (v4 ran on Node 20, which
  GitHub deprecated).

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
