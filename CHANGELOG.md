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

## Unreleased

- **host restart** Let a stranded worker go (API 1.16): a worker the host stopped or lost leaves duty for the archive,
  still resumable, from its card's `let-go` (the page's "let go", `POST /let-go`, `tower let-go <CALLSIGN>`). The host
  appends it as a `tower.letGo` fact through a new control message (host protocol 2); until the host is restarted,
  letting go answers that the running host is too old. A floor with stranded workers offers "resume all N", asked
  first with the list, and a worktree's row names the workers in it, each a link, with ↻ for its last worker.
- Every explanation in the tower page, the shared views and Tower 3D's HUD and panels is a `data-tip`, shown by the
  shared tooltip on hover and on keyboard focus; icon-only controls carry an `aria-label`. `title` stays only on
  iframes and markdown links. A renderer that draws the shared views without `watchTips` (`/tips.js`) shows none of
  their tips. The tower page's review threads and shelf files are buttons, and the dock's grip resizes the shells
  with ↑ and ↓. No tip shows while a button is held, so a drag across line numbers stays clear.
- **config** One shared keymap: every key the tower page answers is a command in `/keymap.js` (API 1.11), with its
  default chords, and the config's new `keys` rebinds or unbinds any of them by id (`docs/config.md`, checked by
  `tower config check`); the board carries the result as `board.keys`, and the `?` sheet, tooltips and
  `aria-keyshortcuts` are drawn from it. ⌥Esc leaves a terminal, back to where focus was before it, and ⌃1–4 show the
  selected worker's Terminal, Brief, Changes and Reviews, from inside the terminal too. Tower 3D moves by the same
  keys. `MOVE_KEYS` and `moveOfKey` are deprecated for `commandOf` over `board.keys`.
- A past session's screen (the tower page's terminal of an exited worker, Tower 3D's logbook replay, `tower screen`)
  is its final frame, the conversation and status line as Claude last drew them, no longer the empty screen and resume
  line Claude leaves as it exits the alternate screen.
- A review note picks a range of lines in Changes by dragging across line numbers as well as by ⇧-click, in the
  tower page and Tower 3D's desk; a range stays within one hunk. `/panels.js` (API 1.15) adds `spanned`, the pick of
  a drag, `watchPickDrag`, which wires the gesture, and `picking` on `ChangesView`, which holds the note box until the
  drop.
- Every press is answered. A button that asks the tower something stays busy until the reply, a bar sweeping along
  its foot, and a second press does nothing; every button sinks when pressed and fades when held (`/design.css`,
  `pressing` in the new `/press.js`). Toasts stack, wait while the pointer or focus is on them, and can carry an
  action (the new `/toasts.js`): after Kill, Resume; after deleting a draft, which no longer asks first, Undo, which
  puts its file back under its own id through the new verb `collection/restore` (API 1.17).

## v1.1.0

A polish pass on the tower page, from five audits of it: what it looks like, what it lets you do, the keyboard and
screen readers, its settings, and the brief.

- Markdown is drawn through one served module, `/markdown.js`, safe for Claude's words: raw HTML in an answer shows as
  its text (Claude's `<details>` and `<br>` included), links go only to http(s), mailto or relative paths, images come
  only from the tower, and a remote image becomes a link. Shelf and shown files keep their HTML inside script-less
  frames, and the shelf no longer follows a `javascript:` link.
- Resume refuses a conversation a running session already holds, and the tower runs resumes one at a time; `tower
  resume` goes through it while it runs. A double press on Resume or Review starts one.
- Tidy one thing at a time: every Tidy row has its own ⌫, asked first. Tidy all is a button and asks first; worktree
  remove, forget and branch delete ask, and say what they did. Kill's confirm says what killing costs.
- When the tower stops answering, every renderer says so, holds what it can't run, and reconnects when it is back; the
  tower page dims the board, stops its clocks and reads the host as unknown. A read that fails offers Read again. A
  verb the host or the terms daemon can't run is drawn disabled, with the reason.
- The tower page by keyboard and screen reader: workers are links (`#<id>`, Back works), the panes are tabs with the
  arrow keys, the terminal leaves the Tab order under another pane, waits and toasts are announced, and every icon
  button has a name.
- Every colour pair the renderers draw reaches WCAG AA in both schemes, with the hues kept; `npm run tool:contrast`
  measures them.
- The tooltip waits for the pointer to rest and fades in and out; keyboard focus shows it at once, reduced motion
  without the fade.
- Words: plurals, a resume of the same worker names its earlier session, and a stranded worker reads "lost" or
  "stopped" in the colour it shows. The tower page keeps its view state in `tower.store`, where a sibling renderer
  reads it.
- API 1.4: a `tidyRows` row carries `call`, the call that tidies only it; `POST /tidy` takes any part of the plan.
- API 1.5: `/markdown.js`: `markdownHtml` for Claude's and workers' words, `documentHtml` for a file framed without
  scripts, `safeHref`, `imagePath`.
- API 1.6: `keepingFocus` in `/panels.js`; `waitsBeganLine` and `WAIT_SAID` in `/cards.js`.
- API 1.7: contrast tokens: text and on-colours per scheme, `deco`, `lineStrong`. `onAttention` is deprecated, kept
  until a major.
- API 1.8: `plural`, `noun`, `resumesRow` and `tagOf` in `/cards.js`; a resume link on the board carries `startedAt`.
- API 1.9: the board error `disconnected` with `boardErrorTitle`, `whyNot` and the host state `unknown` in
  `/cards.js`; `failedHtml` in `/panels.js`.

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
