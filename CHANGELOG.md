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

## v1.6.0

The Changes panel draws a diff side by side, and its head stays put while the diff scrolls. It asks nothing of you:
no host restart, no config change (API 1.31 → 1.32, additions only). Restart the tower (`tower down tower && tower up
tower`) and rebuild Tower 3D (`npm run tower3d`) where it is built.

- Unified · Split, in both renderers (PR #1 by @CarlosBonetti, the first from outside). A segmented control in the
  Changes head (`data-changes-layout`) draws each file's diff as one column or with the old side on the left and the
  new on the right: a context line on both sides, each run of removed lines beside the run of added lines after it,
  long lines wrapped so the sides stay aligned. The choice is kept in `tower.store` under `changes.layout`, Unified
  until one is made. Picking lines to note, the note box and anchors work the same in split: a drag or ⇧-click from
  one side to the other picks the rows between them in unified order.
- The Changes head with the layout and Read again sticks to the top while the diff scrolls, each file's header just
  below it, and an anchor's jump to a file no longer lands under the head.
- `/panels.js` serves `DiffLayout`'s names (`DIFF_LAYOUTS`, `DIFF_LAYOUT_KEY`, `DIFF_LAYOUT_LABEL`,
  `DIFF_LAYOUT_MEANS`) and `splitRows`, a file's rows side by side as indexes into `fileRows` (API 1.32);
  `changesHtml` takes a `layout`.

## v1.5.0

The stats tell the user's prompts from the workers', the weekly budget says whether today's spending lasts, and
agents can read the board's shape from `tower api`. It asks nothing of you: no host restart, no config change (API
1.28 → 1.31, additions only). Restart the tower (`tower down tower && tower up tower`), and run `npm ci` in a checkout
you develop in (a new dev dependency).

- A prompt a worker types through the tower is the worker's (API 1.31). `submit` and `spawn` take `by`, the requesting
  worker's session id; the tower appends a `tower.prompt` fact to the target's log before the prompt reaches it, and
  the fold counts that prompt as from workers (`peer`), answering no wait. `tower hire`, `tower review` and `tower send`
  pass it, so a hire's brief and a pointer to review notes no longer count as the user's prompts or waits. The card
  still shows a hired worker's brief as its prompt. Logs before this release keep their counts. The Stats panel's
  "prompts from you" adds the user's prompts per commit landed.
- The weekly budget's pace (API 1.29): `budget.pace` on `/stats` and `board.today`, `{perDay, runsOutAt?}`: the even
  daily spend that lasts until the reset, and when today's rate runs out what is left, only when that comes first
  (today's rate measured over an hour at least). The Stats panel's "left this week" and Tower 3D's Today board and roof
  draw it (`paceWords` in `/cards.js`).
- The board in `tower api` (API 1.30). `/schema` gains `streams`: `board` with how to read one event and its message
  (`{v, board}`) as a JSON Schema generated from the board's types and their docs (`src/shared/board.schema.json`,
  `npm run schema:board`, held by a test), and one line each for the screen, terminal, shell and mux streams.
  `tower api` lists them; `tower api board` prints the board's.
- The handbook says mechanical hires (landing, kb verify, cleanups, a changelog, a change fully specified) go to
  `model sonnet`.

## v1.4.1

A fix to v1.4.0's archive. It asks nothing of you: no host restart, no config change, no API change.

- A floor's archive reads its crews head first, in both renderers: a worker, then its hires and reviewers indented
  under it in the order they were hired, as a crew on duty reads. v1.4.0 drew each crew above the worker it reports
  to, so an indent seemed to belong to the row above it and a reviewer to the worker before its author. Crews still go
  by their latest start, the newest first.

## v1.4.0

Work that landed edited no longer reads as at risk, work that never landed can be thrown away on purpose, the archive
keeps crews together, and Tower 3D catches up with the page on letting go, presses and shells. It asks nothing of you:
no host restart, no config change (API 1.25 → 1.28, additions only).

- Work that landed edited, and work thrown away on purpose (API 1.26, additions only). A branch whose commits landed as
  cherry-picked, amended, renumbered or conflict-resolved copies is `carried`: every commit missing from its base has
  a copy there with the same author, author date and subject, committed no earlier (one amended on the branch after it
  landed stays at risk). Such a worktree reads `carried` ("landed, edited"), a kept branch `carried: true`, each with
  `carried: {commits, edited}` per repo; each is removed by its own `remove` or `delete`, never by Tidy all, after a
  look at `GET /landing?project&branch` (`tower.landing`): each edited commit, its copy and `git range-diff`. The
  card's `checkoutState` counts it as landed, with `edited` and `branch`. A new verb, `worktree/discard`, throws away
  an `at-risk` worktree as shown (`held`: each repo's head and uncommitted count, refused once either moved): its tips
  (uncommitted files committed on top) are noted on its review thread, recoverable with `git branch` until git
  collects them, then it is removed with force, its branches deleted and its thread filed. The tower page draws
  both, and Tower 3D does too.
- A floor's archive goes by crew (API 1.27): in both renderers a coordinator's hires are listed above it, indented a
  step per depth, crews by their latest start, the newest first, and a worker's earlier lives after its latest. A filter
  keeps the order. `/cards.js` adds `pastCrews`, `pastMatching` and `pastSize`. Tower 3D's archive list no longer runs
  past its panel.
- Tower 3D lets a stranded worker go (API 1.28 for this item and the three below, additions to `/cards.js` only): Let go beside Resume in its desk panel, X held at its desk in the world, and a floor panel's
  "resume all N stranded", each asked first the way the page asks. `/cards.js` adds `letGoAsk`,
  `letGoneLine`, `resumeAllAsk` and `resumeStranded`, the words and the loop both renderers share.
- Tower 3D's destructive buttons press through `/press.js`: busy until the tower answers, the second press's "sure?"
  showing the page's own question in its tip, a toast after killing a shell, and ending one leftover process at once,
  as the page does. `/cards.js` adds the questions both renderers ask (`sendHomeAsk`, `reapAsk`, `killShellAsk`,
  `shellWhere`, `tidyRowAsk`, `tidyAllAsk`).
- Tower 3D picks where a new shell starts: T at a floor's console opens every floor's hub, repos and worktrees
  (`shellPlaces`), that floor's first, picked with the arrows and Enter or the mouse; you are taken to the new shell's
  kiosk, on its own floor. The floor panel's shell buttons come from the same places.
- Tower 3D draws work that landed edited and work thrown away: a carried worktree or kept branch reads "landed,
  edited" with what landing changed (`tower.landing`, in a dialog, also from the settled line of Changes and Reviews),
  and the floor panel lists them under "landed edited", each removed on its own; an at-risk worktree offers discard,
  asked with `discardAsk` and signed with your name. Its worktree verbs now ask the page's questions: `/cards.js`
  serves `WORKTREE_ASK` and `WORKTREE_DONE`, and the page's Tidy asks through `tidyRowAsk` and `tidyAllAsk`. The
  landing dialog's look moves into `panelsCss`.

## v1.3.0

Follow-ups to v1.2.0: work that has landed says so, other workers' messages show in the brief, one icon set for both
renderers, and Tower 3D catches up with the page. It asks nothing of you: no host restart, no config change (API
1.18 → 1.25, additions only).

- Reviews and Changes on landed work (API 1.20, 1.24): each card says where its checkout's work stands
  (`checkoutState`: `live`, `landed` on its base, or `gone` with its worktree; `empty` when its branches made no
  commits of their own, from git's new `own` count) and where its review thread's does (`threadState`, with the thread
  Tidy filed). The card and each floor thread offer `note`, and the card `review`, only while that work goes on;
  `card.unseen` leaves out threads on landed work. A landed worker's Reviews read its thread under a line saying it
  landed, and its Changes say "Landed on <base>", "Nothing to land" or "Worktree removed" instead of an empty diff.
  `POST /review/append` still takes any checkout; `tower review` refuses landed work with the reason. `/panels.js`
  adds `threadItemFiles`.
- Tidy keeps a stranded worker's worktree: a worker the host stopped or lost holds its worktree until it is resumed or
  let go, so Tidy, a row's Tidy and the worktree verbs no longer remove the folder its resume needs.
- A worker's brief shows what other workers sent it by `SendMessage` as their own bubbles, named by the sender's
  callsign, beside the user's prompts and Claude's answers, in both renderers and in `tower agent`; they count toward
  `brief.pairs` (API 1.21: a turn of `/conversations/<id>` gains `from`). Stats' "from workers" no longer counts a
  subagent's hand-back.
- A resumed session given no prompt of its own is marked "resumed, no new turns" in the brief and on Tower 3D's
  session chips (API 1.19: `/brief.js` adds `resumedIdle` and `RESUMED_IDLE`).
- One SVG icon set (API 1.22, 1.25): the glyphs that stood for icons came from fallback fonts at their own weights and
  baselines. Both renderers draw `ICON` (`back`, `music` and `silent` new in 1.25); every close is one `.icon-btn`,
  every control at least `--control` (24 px), one selected look (`--selected`) for cards and tabs, panel gutters on
  the spacing scale.
- Toasts: one told again while it shows merges into it with a count (×2), and the stack is one aligned column.
- A file's Finder and editor controls are buttons named for the file wherever they sit outside another button
  (API 1.23: `/panels.js` adds `fileSpansHtml`). The new-worker form waits for its Start: busy until the spawn
  answers, closing on the new worker or saying why in the form, in both renderers.
- Copy works inside framed pages: the tower page's shelf frame, `html` items and shown files allow `clipboard-write`,
  as do Tower 3D's frames of shelf pages and shown files.
- Tower 3D's logbook reader shows the last screen and the logbook on two tabs, each the whole panel.
- Tower 3D catches up with the page: Tidy one row at a time, verbs held back listed with why, the archive's failed
  read with Read again, the keymap's pane keys and its sheet in the pause card, the shared toasts (Resume after
  sending home, Undo after deleting a draft), a tray per collection with an item reader, and an unsent prompt kept as
  a draft.

## v1.2.0

The second polish pass on the tower page, on the user's decisions from the first: a keymap, a chat brief, your own
faces and text size, collections everywhere, and the host able to let a stranded worker go. It asks a **host
restart** (letting go needs host protocol 2; everything else works before it) and adds a **config** key, `keys`.

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
- The brief reads as a chat, drawn inline by the tower page and Tower 3D's Logbook: your prompts and Claude's answers
  as bubbles, oldest to newest, each with when Claude answered and how long it took (a turn's `answeredAt`). Long
  answers fold behind "show all"; every bubble and code block has a copy button, and code blocks are highlighted.
  Rendered or raw is a per-viewer setting (`tower.store` `brief.markdown`, also in the settings popover). Review notes
  render as markdown (API 1.12).
- Your appearance is one record per browser, `tower.prefs` in `/tower.js` (`get`, `set`, `on`, `attributes`): the
  scheme, the text, heading and code faces (any face installed on your computer, by name), the terminal's font size,
  motion and contrast, applied before the page paints, synced across tabs and sent to framed pages. The settings
  popover gains Type and Accessibility, drawn from `PREF_SECTIONS` in `/settings.js`. Terminals draw in the code face
  at the chosen size; a driven terminal's session gets the columns and rows that size leaves. New modules `/prefs.js`
  and `/terminal.js` (API 1.13). `tower.schemeChoice`, `tower.chooseScheme`, the framed `scheme` verb and
  `themeSection` are deprecated, kept until a major.
- A session log holding an event the tower can't fold no longer takes the tower down: that session reads broken, with
  the reason as its gist and on hover (`Card.broken`, `statusTitle` in `/cards.js`), its facts stopped at the event;
  every other session lives on, and it can still be killed, resumed or let go. `tower ls` says it (API 1.14).
- Every collection a floor keeps has a tray in the tower page: its items by title, tag, who kept them and when, opened
  by kind (markdown, html framed without the API, images, text), deleted only when asked. Threads Tidy filed are under
  the threads tray. A New worker prompt closed with Cancel or Esc, or whose start fails, is kept as a draft. ✎ beside
  a floor's + starts a new draft, and + in the shell dock starts a shell in any of a floor's directories (API 1.10:
  `/items.js`).
- Text follows the browser's text size and a new Text size setting (Accessibility: 90–150%): every size is a step of
  one rem type scale (`--fs-*`), spacing a 4 px scale (`--sp-*`), and the small uppercase label one `.eyebrow` (API
  1.18). Overpass sits on its line without per-rule nudges. The tower page holds at 200% zoom: under 900 px the
  sidebar is a rail that ⌘B opens over the main pane, and the worker bar wraps. Terminals keep the Terminal size.

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
