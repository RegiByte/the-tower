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

## v1.66.1

Faster reads of a floor's archive and of every board. No restart beyond the tower's own (`tower down tower`, then
`tower up tower`), no config change, no API change.

- **The archive read is about 4× faster** on a floor with hundreds of archived workers. The extensions' folds redid
  floor-wide work on every archived card: the floor's collections listed again, the config read from disk, every
  review thread matched again. They now do it once per read (#244).
- **Every board is built faster:** crews and message receipts are indexed once, where each card searched every
  other (#244).
- A slow archive read logs a line of its own naming the read. It no longer reads as the board's (#244).

## v1.66.0

Extensions can address what a worker showed, renderers declare the regions they draw, and the tower stops losing file
events on macOS. No restart beyond the tower's own (`tower down tower`, then `tower up tower`), no config change, the
renderer API 1.97 → 1.101 (additive, no major). **`npm ci` first** on a checkout moved by hand: a new native
dependency, `@parcel/watcher`, and the `tower` command fails until it is installed (`tower update` and
`npm run setup` already run it). **`npm run tower3d`** rebuilds Tower 3D, which changed.

- **No more lost file events.** On macOS, one recursive `fs.watch` opening or closing dropped what changed on disk
  meanwhile, for every watch of the process: a kept item or a review note could stay off the board until a later
  write. Every recursive watch now goes through `@parcel/watcher`, one stream each, and inotify with native ignores
  on Linux; a rescan the OS asks for is read as "everything stale" (#241). Not checked on Linux or WSL2.
- **`spawn` answers once the tower tracks the session.** The reply used to come before the log existed, so a read of
  the new id right after could miss. `spawn`, `cut`, `hire`, `resume` and `fork` now wait for it, normally
  milliseconds, and after 5 s answer `spawned` as before. No shape changes (#235).
- **Subjects** (API 1.98): extensions address what a worker showed (`shown:<card>/<at>`), a floor's collections
  (`collection:<project>/<c>`) and shelf entries (`shelf:<project>/<n>`), and their own kinds resolve, keyed by
  instance (`<cap>.<kind>:<instance>/<key>`, the old key kept until 2.0). Items and shown files carry `text` and
  `type`; commands take `accepts` (media types) and `on: ["item.*"]`, `runCommand` passes `target` beside `subject`,
  and a fold's actions may carry their own `words`. `parentOf` and `textOf` are new in `/cards.js`. The page draws a
  showing's badges and actions beside the worker's tabs, and the `narrate` example listens to any markdown or text
  item or shown file (#233).
- **Keys from frames** (API 1.99): ⌘K, Escape and the pane chords work with focus in a shown markdown file, a shelf
  page, a kept item or a framed renderer. The tower appends `/frame-keys.js` to the html it serves sandboxed;
  `url` frames are never heard. Tower 3D answers a key only when the building used it, so a shelf no longer also
  goes home on its Escape (#236).
- **Tower 3D lets go of the mouse when its window loses focus**, so ⌘K opens the palette over a framed Tower 3D
  with the mouse free and one Escape closes it. Other renderers that lock the pointer should do the same
  (`docs/extending.md`) (#237).
- **Flows** (API 1.100): `/schema`'s `flows` lists every core verb's stages, each open, wrapped or sealed, and
  `GET /extensions` gains `launchers`. `tower flows [verb] [--floor <project>]` shows where extensions take part in a
  verb and who does now. Spawn's `where`, `gate`, `cut` and `unplace` are listed as `planned`; nothing raises them
  yet (#238).
- **Renderers declare their regions** (API 1.101): a `renderer.json` at a renderer's root says its `regions`, `kit`,
  `keeps` and `layout`, served on each renderer by `GET /renderers` and `tower.renderer()`. A file that doesn't
  parse declares nothing and carries its `problem`; every renderer keeps serving. The page, Tower 3D and The Week
  declare what they draw today, and nothing drawn changes. `landing(drawers, extension)` in `/cards.js` and
  `tower extensions check` say where an extension's commands and contributions land, per renderer. The renderers
  table in `docs/extending.md` is generated by `npm run served:update` (#239).
- **Fixes** (#232). A git read no longer crashes the tower when a timeout's kill answers `EPERM` (macOS, a group
  whose leader exited and isn't reaped yet). An `around` link or hook answerer on a floor where its extension is off
  is passed over before its liveness is asked. `kept.js` types the policies verbs' replies as the extension's own.
  `npm test` runs in a zone where it is noon, so it no longer fails in the first hour after midnight (#240).
- **Claude 2.1.311** is tested, the supported range raised. `package.json`'s `allowScripts` names the three install
  scripts the tower relies on (`@parcel/watcher`, `esbuild`, `fsevents`), for npm's coming block (#242).

## v1.65.0

Extensions draw where their words were missing, and a worker's sandbox can't reach the real tower. No restart beyond
the tower's own (`tower down tower`, then `tower up tower`), no config change, the renderer API 1.96 → 1.97
(additive).

- **The page and Tower 3D draw what extensions add to a card and a conversation.** A card's `lines` show as quiet
  text under the card in the sidebar, in the worker header and in Tower 3D's desk head. A conversation's badges and
  actions show on its heading in the Brief (`/brief.js`'s `briefHtml` takes an `adds` callback), and its badges in
  Tower 3D's logbook (#228).
- **The quota probe's words and whose work a reviewer reviews come from their extensions' clients** (API 1.97):
  `/x/quota/quota.js` (`quotaOf`, `probeLine`, `probeTitle`, `probedLine`, `PROBE_STATE_NAME`, `PROBE_ATTENTION`) and
  `/x/reviews/reviews.js` (`reviewerOf`, `threadCheckoutOf`); `pairLineOf` and `whereLineOf` in `/cards.js` take the
  reviewed callsign. The old names stay in `/cards.js`, deprecated. `tower probes` reads its words from the new
  `quota/said` read. Every line reads as before (#227).
- **A worker's own sandbox:** `npm run sandbox -- up`, run by a tower worker, starts at `/tmp/tower-<callsign>` on a
  free port; `npm run -s sandbox -- run <command>` points `tower`, curl and `drive` at it and never at the real
  tower. `docs/extending.md` answers what three extensions built from it alone had to find in the code, with a table
  of which renderer draws which subject and contribution (#229).

## v1.64.0

The spawn form's From says where a cut really starts. No restart beyond the tower's own (`tower down tower`, then
`tower up tower`), no config change, the renderer API 1.95 → 1.96 (additive).

- **Origin's default is named only when every repo has the same one.** On a floor whose repos' default branches
  differ but share another branch, From showed that shared branch as "origin's default", and the cut started each
  repo from its own default instead. It did the same on a clone that never recorded `origin/HEAD`. From now reads
  "each repo's origin default" in both cases, and every branch the repos share is a choice of its own that cuts
  from it (#225).
- **`floor.defaultBase`** (API 1.96): origin's default branch when every directory of the floor has the same one,
  absent otherwise.

## v1.63.1

A floor whose repos have different default branches can cut a worktree. No restart beyond the tower's own
(`tower down tower`, then `tower up tower`), no config change, no renderer API change.

- **New worktree is offered whenever every directory is a git repo with an origin.** A floor whose hub and repos
  default to different branches (`main` here, `development` there) and share no other branch name lost New worktree
  and the `cut` verb, and the spawn form blamed the hub. A cut starts each repo from its own origin default, as it
  always could; the form's From says so, and a refusal now says whether the host is down or a directory is not a git
  repo with an origin (#222, by @vitoraderaldo).

## v1.63.0

Git is read when it changes, not every 5 s. While a page was open, the tower read every repo and every worktree of
every floor every 5 s, changed or not: on a floor of many worktrees the reads never stopped, and a laptop's battery
drained (#218). No restart beyond the tower's own (`tower down tower`, then `tower up tower`), no config change, no
renderer API change.

- **Reads follow changes.** Each project dir is watched; a change re-reads only what it touched (one worktree's
  status, a branch, or the repo's refs) once it settles, within a second or two and at most 10 s after the first
  change, however long a file keeps changing. Slow safety rounds catch what the OS doesn't report. On a sandbox floor
  of 6 repos and 240 worktrees, an idle tower went from about 6,800 git runs a minute to 48, and its CPU from 9.3 s a
  minute to 0.6 s. Tidy, discard and the other worktree verbs still read git afresh before they act.
- **Bare repos.** A project dir that is a bare repo is read: its worktrees and branches reach the board. Its read
  failed every time before.
- **Quieter log.** A repo whose read keeps failing the same way says so once in the tower's log, not on every read.
- **Linux and WSL2.** Watching uses Node's `fs.watch`, one FSEvents stream per tree on macOS. On Linux it costs an
  inotify watch per directory, and under WSL2 files on `/mnt/c` edited from Windows raise no events, so only the
  safety rounds see them. `@parcel/watcher` is planned behind the same seam for both.

## v1.62.0

Review threads are an extension: the last built-in to move, now the bundled `reviews` extension in the checkout's
`extensions/`. Every thread, filed thread, unseen mark, crew and reviewer reads as before, and every old name still
answers until 2.0. No restart beyond the tower's own (`tower down tower`, then `tower up tower`), no config change,
the renderer API 1.92 → 1.95 (additive).

- **Reviews is an extension.** Its client and the Reviews panel are served at `/x/reviews/`; `review/append` is
  `reviews/append` and `GET /reviews/<project>` is `reviews/history/<project>`. A config's `collections.reviews` line
  now sets the collection's label and description, and `projects.<p>.capabilities.reviews.off` turns review threads
  off on a floor.
- **Resolve a note.** The Reviews tab offers Resolve on a note while the work goes on, and dims a resolved note under
  a mark naming its resolution. `tower note resolve n3 n4` does the same from a worker. A resolution is a note like
  any other: threads stay append-only and read the same in an older checkout.
- **A reviewer is known by its spawn.** `tower review` and the Review action hire through `reviews/hire`, which logs
  the reviewer's crew and its exemption from hiring limits before it starts, in place of reading its prompt. Reviewers
  hired before this release keep their crew, seat and exemption. `tower whoami` names both.
- **Tidy and discard.** Tidy files a landed thread, and a discard leaves its recovery note, through the reviews
  extension. Discard is offered where something records what it throws away (reviews, when on) and refused elsewhere,
  as before. A landed thread's row in Tidy now comes after the core's rows.
- **Archived workers** carry their extensions' parts again: an archived worker's Reviews tab is back, and a policy
  run's card shows on archived workers, both missing since the moves.
- **For extension authors.** A new core hook, `tower/discard.done`, raised after a discard removed its worktrees.
  Tidy entries take `does` and a count noun `kind: {one, many}`.

## v1.61.1

A policy's last run names its worker again when that worker has left the board, as before v1.61.0. No restart beyond
the tower's own (`tower down tower`, then `tower up tower`), no config change, the renderer API 1.91 → 1.92
(additive).

- **For extension authors.** A fold's `ctx.callsignOf(session)` names the worker of any session the tower has known,
  archived ones included.

## v1.61.0

The first built-ins are extensions: quota, drafts and policies now live in the checkout's `extensions/`, each a
bundled extension a user can turn off or replace, and `examples/extensions/` holds the first one to copy. Everything
behaves as before, every old name still answers until 2.0. **config**: `probes.quota` is now `extensions.quota`. No
restart beyond the tower's own (`tower down tower`, then `tower up tower`), the renderer API 1.87 → 1.91 (additive).

- **config: quota is an extension.** The quota probe is the bundled `quota` extension, its readings a core fact kind
  (`tower/rate-limits`) that the limits, the weekly budget and `/stats` fold whether the extension runs or not.
  `probes.quota.off` is now `extensions.quota.off` and `probes.quota.every` is `extensions.quota.settings.every`; the
  old spelling is still read until 2.0, and `tower config check` and `tower doctor` print the line to write instead.
  `tower probes [run quota]` works as before; `tower x quota read-now` reads too.
- **Drafts is an extension.** Its client is served at `/x/drafts/drafts.js`; `projects.<p>.capabilities.drafts.off`
  turns drafts off on a floor. A config's `collections.drafts` line now sets the collection's label and description.
- **Policies is an extension.** Every policy keeps its file, its approval, its runs and its slots across the update:
  nothing to approve again. The page's Policies panel is served at `/x/policies/`, and an offer is announced once, as
  the extension's ask. `tower policies` and `tower runs` print as before.
- **Example extensions.** `examples/extensions/narrate` reads a draft aloud with the browser's voice: copy the folder,
  replace `speak` with the voice you like, and add it under `extensions` in the config. Every example is loaded by the
  tests, so none goes stale.
- **Tidy and extensions.** Tidy shows and applies what an extension asks to tidy, in the page and in Tower 3D, and
  offers to archive an extension's stream months as it does the core's.
- **For renderer authors.** The moved names answer through `LEGACY` until 2.0: `probe/run`, `GET /probe/quota`,
  `board.probes`, `policy/*`, `GET /runs/<project>`, `floor.policies`, `card.run`, `board.offers`, `/drafts.js` and
  `/policies.js`, each with a deprecation header or tag naming its replacement. Count a policy's offer from
  `board.asks`, never beside `board.offers`. `wireSpawn` takes the drafts client as `io.drafts` and the palette as
  `draftsOf`; a renderer that passes neither keeps no drafts there. Pass the extensions' tidy entries
  (`addedTidyOf`) to `tidyAllAsk`.

## v1.60.0

The extension mechanism is complete: an extension can now do everything the spec gives it, short of drawing its own
views. No extension ships yet (the built-ins move one at a time next). No restart beyond the tower's own
(`tower down tower`, then `tower up tower`), no config change, the renderer API 1.81 → 1.87 (additive).

- **Verbs and reads.** An extension declares verbs and reads, the tower dispatches them by qualified name
  (`POST /<cap>/<verb>`), and `tower x <cap> <verb>` reaches them from the CLI. Every call carries its caller (the
  CLI sends the worker's session) and the chain of verbs it is a step of, so a guard sees who started it. A policy's
  run spawns through the same dispatch as everything else.
- **Stores.** An extension may own a collection, declaring the five doors others use to list, read, create, edit
  and delete it; the generic writes and `tower keep` are refused there, naming the right verb. Its streams are folded
  as they grow, and it logs facts on sessions.
- **Folds and contributions.** An extension adds its part to cards, floors, items and the board, actions and badges to
  any subject (`board.adds`), and asks for the user beside the waits (`board.asks`). Commands run in the browser from
  its own files, served at `/x/<cap>/`. The page, the ⌘K palette and Tower 3D draw them through `/cards.js`.
- **Middleware and hooks.** An extension wraps verbs and hooks (`around`), raises hooks of its own and answers the
  core's: discard asks before removing, Tidy hands each extension its own entries. Tidy and discard act through the
  core's verbs, so a guard sees every step.
- **Slots, triggers and checks.** The policies' loop is the core's slot loop, `every` beside crons: policies behave as
  before. Extensions fire on time and on board changes, declare checks `tower doctor` runs, and run processes with the
  environment scrubbed. `tower extensions restart <id>` loads an extension's whole folder fresh; `tower extensions
  check <dir>` and `freeze <dir>` (`contract.json`) are the author's loop.
- **Launch.** An extension adds fields to the new-worker form, logged as facts before the worker starts, and
  contributes instructions, a first prompt's tail, env, default model and effort, flags and a plugin to the workers it
  launches; two contributors on one flag or env key, or one on a key the config sets, refuse the launch, naming both.
  Contributed env is logged with the session's argv: it is no place for secrets. Crews and the hiring limits read the
  new `tower.reports-to` and `tower.exempt` facts, and an exemption is drawn on the card it lifted a limit for.

## v1.59.0

The tower finds, resolves, starts and shows extensions: the first of the extension mechanism's lanes, with no
extension using it yet. No restart beyond the tower's own (`tower down tower`, then `tower up tower`), no config change
(three new optional keys), the renderer API 1.80 → 1.81 (additive).

- **Extensions, loaded and seen.** An extension is a folder holding an `extension.json` and, optionally, a server
  module: bundled ones in the checkout's `extensions/` (none yet), the user's named by the config's `extensions`. Each
  manifest is strict (an unknown key refuses it, at its path) and resolved before any code runs: invalid, too new or
  too old, unmet, in a cycle or in conflict, it is refused and its dependents skipped, each with a reason. The rest
  start as resources of the tower's system and restart on their own when a config edit changes them.
- **Config:** `extensions` (by id: `path`, `off`, `settings`), and per floor `projects.<p>.extensions.<id>.settings`
  and `projects.<p>.capabilities.<cap>.off`. `tower config check` reads each extension's settings against its
  manifest. `docs/config.md` has them.
- `board.extensions`, `GET /extensions` (the registry and the topology), `tower extensions` and `tower doctor` say
  what each extension is doing and why; the tower page draws them beside the probes. `/schema` serves the manifest's
  JSON Schema as `extension`, every key marked with the version it arrived in.
- braided 0.3.2: the topology's Mermaid and DOT quote every resource id.

## v1.58.0

The host logs what extensions will need, and the tower process becomes a system of resources. It asks a **host
restart** (protocol 3): `tower down`, then `tower up`, which ends every session and shell; all can be resumed. No
config change, the renderer API 1.79 → 1.80 (additive). Until the host restarts, a newer tower shows the host as
outdated; spawns and resumes still work.

- **host restart** Each session's header names its `runtime` (`claude`; a header without it is Claude's). A spawn may
  carry `tower.*` facts, logged right after the header and before the session's first event; nothing sends them yet,
  and the tower refuses a spawn with facts while the host is older. A worker ended by a signal it didn't catch, as by
  `kill -9` or a crash, is now stranded (resume, carry on or let go), where before it read as an ordinary end.
- The tower process is a system of resources (braided 0.3.1), started in dependency order and halted cleanly on
  `tower down`; a resource that fails to start fails the boot clearly.
- `GET /extensions` answers the extensions the tower runs (none yet) and the topology of its resources, Mermaid
  included; `/schema` lists it. Nothing else changes for a renderer.

## v1.57.0

The new-worker form names Claude's real defaults, and the shared modules split by concern. No host restart, no
config change, the renderer API at 1.79 (additive). Restart the tower (`tower down tower && tower up tower`), then
reload the page; rebuild Tower 3D (`npm run tower3d`) if you use it.

- The new-worker form shows the model and effort Claude would start on, as `opus 5.5 (default)` and `medium
  (default)`, where it said only "Claude's default". The tower reads them from what workers actually ran on: the latest
  turn of a worker launched without a model, and that model's latest effort (Claude keeps effort per model). A
  `/model` pick, which Claude saves for every new session, shows from that session's next turn. One value for the
  machine: a project whose own `.claude/settings.json` pins a model still shows the machine's. Before any worker has
  run, the form reads as before. On the board as `claudeDefaults`.
- `keepingViewedFileTop` (`/panels.js`): the Viewed box's scroll, its own function. `keepingFileTop`'s `viewed`
  argument still works.
- `cards.ts` and `panels.ts` are split into a module per concern; `/cards.js` and `/panels.js` serve exactly what
  they did.

## v1.56.1

Changes with the file tree. No host restart, no config change, the renderer API unchanged at 1.77. Reload the page;
rebuild Tower 3D (`npm run tower3d`) if you use it.

- With the file tree open beside the diffs, ticking a file's Viewed box now always scrolls that file to the top, the
  next file right after it. It only did when the reader was inside the file's diff, so a header partway down the
  screen folded in place and left the reader to find the next file. Without the tree, and for the fold caret, nothing
  changes. Thanks to Carlos Bonetti (#185).

## v1.56.0

Groundwork for extensions, and a reap that stays in its own root. No host restart, no config change, the renderer API
at 1.77 (additive). Restart the tower (`tower down tower && tower up tower`), then reload the page.

- `tower reap` with no id ends only what this system root's sessions left running. It took every process on the
  machine carrying a session id, so run against a sandbox (`TOWER_CONFIG` elsewhere) it ended every real session on
  every floor. `tower reap <id>` now refuses an id that isn't one of the root's sessions, as `screen` and `attach` do.
- `GET /schema` lists every GET route under `reads`, derived from the server's own route table: each with its `path`
  (named params, `/screen/{id}`), its `kind` (`json`, `stream`, `page` or `schema`) and its `query` as JSON Schema
  when it takes one. A client that read `reads[name].query` for every entry should check for it: `query` is present
  only when the read takes one. The streams are described on their routes too.
- The `tower` command's verbs are one table both its dispatchers read: usage, help and dispatch derive from it, and
  every verb behaves and prints as before.
- The attention machine (`/attend.js`) runs on `loop`'s `Handlers` like the other shared machines: what the viewer's
  window shows (`focus`, `visible`) and which worker their view is on (`watch`) are events, kept in its state.
  `attendHandlers` and the new events are additions; the old step functions remain as wrappers.
- Terminal: hovering a second tab's terminal and then clicking it no longer flickers. The first window's focus-out
  report took the PTY back as if typed; focus reports now pass to the PTY without taking it.

## v1.55.1

The palette in WebKit. No host restart, no config change, the renderer API unchanged at 1.76. Reload the page.

- In `tower app` and Safari, ⌘K opened the palette empty: the input and the footer with nothing between them. Its
  list now keeps its rows' height in WebKit as it does in Chrome, and still scrolls under the palette's height
  (thanks, Carlos Bonetti).

## v1.55.0

The palette after a first night of use, and keys macOS leaves alone. No host restart, no config change, the renderer
API unchanged at 1.76. Restart the tower (`tower down tower && tower up tower`): the keymap's defaults ride the
board. Then reload the page.

- The panes' default chords are now ⌃⇧1–⌃⇧4 (terminal, Brief, Changes, Reviews). macOS takes ⌃1, ⌃2… for "Switch
  to Desktop N", one per desktop, so they never reached the page. A config that sets `keys` for them keeps its own.
- `shell-here` hides the shell dock from any shell, not only the selected worker's: open the worker's shell, open
  another, and the same chord still takes you back to the worker.
- The palette on an empty query lists everything it can reach, to scroll through before you know what to type: the
  selected worker's actions, who waits on you and recent picks on top, then every worker (yours first), command,
  floor action, floor, shelf entry and draft in groups, with the capabilities and the patterns last. Group headings
  stick as the list scrolls. A worker's earlier conversations and leftover processes are a group of their own.
  The footer's hint stays one line.
- The tower page reserves its scrollbars' space (`scrollbar-gutter: stable`), so a scrollbar appearing doesn't shift
  the sidebar, the panels, the sheets or the palette sideways.

## v1.54.0

The command palette, and the foundations extensions will build on. No host restart, no config change, the renderer
API 1.75 → 1.76 (additive). Restart the tower (`tower down tower && tower up tower`) and reload the page. A checkout
that serves Tower 3D rebuilds it (`npm run tower3d`).

- The command palette (⌘K): go to any worker, floor, shelf entry or draft, or do what the selected worker and its
  floor offer, by typing. An empty query shows the selected worker's actions, who waits on you and your recent picks;
  a query ranks by how well it matches (a better match always wins), then by the selected worker and its floor.
  Entries show their chords, so the palette teaches the keys it replaces. Nothing in it is a form: a pick runs, or
  opens the dialog its button opens, and asks the same confirm. Capabilities that name a command are its hint; the
  rest show only when a query matches them. "Patterns users are discovering" opens a sheet of the patterns. Entries
  and ranking are pure and served at `/palette.js`, so any renderer can draw the same palette.
- Verb words: every verb the board offers has a label, a hint and the API verb it calls, keyed `<subject>/<verb>`
  (`card/send-home`, `worktree/recut`), served at `/verb-words.js`. The tower page's buttons read their labels from it.
  Keymap commands gain a short `label`.
- `shell-here` toggles: from the worker's shell it hides the shell again and goes back to the worker's terminal; with
  several shells in that directory it focuses the one the dock shows.
- Every GET the tower serves is an entry of one table, each naming its API read or its kind (page, stream, schema),
  checked against the API's declared reads by the typecheck. A query string on `/archive`, `/conversations`,
  `/reviews`, `/screen` and `/shell` no longer answers 404.
- `board()` and `allCards` take one `SystemView` record, the snapshot of the system the board is derived from.
- `npm run test:page-boot` boots the tower page over a tower alone in headless Chrome, clean of page errors, in CI
  beside Tower 3D's boot.

## v1.53.0

What the tower can do, shown where you look. No host restart, no config change, the renderer API 1.72 → 1.75
(additive). Restart the tower (`tower down tower && tower up tower`) and reload the page. A checkout that serves
Tower 3D rebuilds it (`npm run tower3d`).

- Tips: the tower page shows one tip at a time at the right of the shells strip, hidden when the strip has no room.
  A tip is a capability (a line on something the tower lets you do; one naming a command shows its chord and runs it
  on a click) or a pattern (a short story of what users found doing with the tower, the story on hover). A × dismisses
  a tip for good; Settings turn tips off or bring the dismissed back. Capabilities are data in `/capabilities.js`,
  patterns are markdown files in `docs/patterns/`, read at `GET /patterns`: add yours by pull request (API 1.75).
- `shell-here` (⌃\`): a shell in the selected worker's directory, the one already open there or a new one, and from
  that shell back to the worker. Every button a command runs names its chords on hover, and a plain chord is named
  with where it fires (`Esc outside a terminal or a text field`); `/keymap.js` exports `keysHint` (API 1.73).
- Setup ends with what to do next and opens the tower in the browser (`--no-open` leaves it closed). Until a first
  worker runs, the skyline welcomes you: what a floor and a worker are, a button to start one on each floor, and the
  tour to ask it for.
- The shortcuts, landing and send-to-a-worker sheets close from a × beside their title and from a click on the
  backdrop; selecting text past a sheet's edge keeps it open.
- Policies and their offers carry `actions` beside their `calls`, and the core reads offers only from `actions`:
  `can()` checks them (API 1.74).
- Claude Code 2.1.306 tested.

## v1.52.1

A patch release. No host restart, no config change, the renderer API unchanged at 1.72. Reload the page; a checkout
that serves Tower 3D rebuilds it (`npm run tower3d`) for the prefab editor's dialog.

- The tower page asks before its destructive verbs (Tidy and Tidy all, send home, let go, resume all, discard, the
  worktree verbs, kill shell, reap, deleting a kept item) in a dialog of its own, drawn from the design's tokens: the
  question, then what it means, and a button named for the verb. Cancel, Escape and the backdrop answer no, a long
  ask scrolls inside the dialog, and no shortcut runs while it is open. The prefab editor asks and names new states
  the same way; cancelling a name adds nothing (#156, by @CarlosBonetti).

## v1.52.0

The Changes panel's file tree. No host restart, no config change, the renderer API 1.71 → 1.72 (additive). Restart
the tower (`tower down tower && tower up tower`) and reload the page. A checkout that serves Tower 3D rebuilds it
(`npm run tower3d`).

- The Changes panel can show the changed files as a tree beside the diffs, off until you turn it on in Settings
  (Changes: Tree) or with the Files button in the panel's head. Folders come first, a folder holding a lone folder is
  joined to it (`src/app/routes/`), and each repo gets its own root while a worker spans more than one, with its name
  on each file's header too. Folders and roots fold; a file in the tree scrolls to its diff and is checked once
  viewed. The tree sticks below the panel's head, scrolls on its own and keeps its place as files are marked viewed.
  The choice is the viewer's `changesTree`, so the tower page and Tower 3D's desk show it alike (#153, by
  @fliptaboada).
- The viewer's record reads a value kept in `tower.store` that is not of its field's kind as the field's default (#154).

## v1.51.0

Wave D of the consolidation pass, its last. No host restart, no config change, the renderer API 1.70 → 1.71
(additive). Restart the tower (`tower down tower && tower up tower`) and reload the page. A checkout that serves
Tower 3D rebuilds it (`npm run tower3d`).

- Every terminal holds the PTY's one size the same way, through one shared machine served as `/term-view.js`: the
  page's worker terminal, the page's shell and Tower 3D's desk. A new terminal takes the size when no other views it,
  typing takes it back, and a resize from another viewer hands it over while the view follows at a font that fits.
  Shells follow this rule now: the page's shell took the size on every pane resize and never followed another
  viewer, so two viewers fought over it. Its pane says how it holds the shell, as the worker's terminal does.
  Tower 3D's desk no longer takes the size back when its panel resizes after another viewer took it. A view keeps
  control when the echo of its own earlier resize arrives late (#150).
- Ticking durations (the worker's pill, the sidebar's ages, the panels' "read … ago") are marked `translate="no"`:
  a page translator rewrote `4m 23s` into words each second, flickering the pill. The pill keeps its width as its
  digits tick (#149).

## v1.50.1

A patch release. No host restart, no config change, the renderer API unchanged at 1.70. Workers spawned from now on
read Claude Code 2.1.304 as tested; restart the tower (`tower down tower && tower up tower`) to drop the "untested"
flag from the board.

- Claude Code 2.1.304 is tested. Its check read the same as 2.1.303's: a subagent's failed tool call carries
  `agent_id` and `agent_type`, as earlier releases' do, now in the baseline (#147).

## v1.50.0

A small release. No host restart, no config change, the renderer API unchanged at 1.70. Restart the tower
(`tower down tower && tower up tower`) and reload the page. A checkout that serves Tower 3D rebuilds it
(`npm run tower3d`).

- The settings and limits popovers, and the new-shell picker, are sized to their content in `tower app` and Safari.
  WebKit stretched them to the window's height, spreading the limits' rows apart (#144, by @CarlosBonetti).
- A worker killed by a signal from outside the tower (a stray `pkill`, say) is stranded, not ended: it stays on duty,
  "resume all stranded" brings it back, and it carries on when it was mid-turn. A worker the tower killed or sent home
  still ends.
- The worker brief says a path named in an answer is not shown to you, and to stop a process by its PID, since a
  pattern kill matches other workers' command lines. Workers spawned or resumed from now on get it.
- Tower 3D's desks carry the forge's real-size props (mugs, plate, bowl, slice, pen cup and plant), vendored in
  `renderers/tower3d/forge` and measured as one more pack of the kit (decision `forge-kit`), drawn at ×1.25 for now.

## v1.49.0

The third wave of the consolidation pass: the tower page split into a module per pane, and what each renderer has open
held as machine state, fed only by events. No host restart, no config change. The renderer API moved 1.66 → 1.70,
additions only but for two removals made as minors by exception (below). Restart the tower
(`tower down tower && tower up tower`) and reload the page. A checkout that serves Tower 3D rebuilds it
(`npm run tower3d`).

- Escape now leaves every view of the page's main pane: policies, a collection and an item included. The stats open on
  the floor in view from every view, and the ask banner no longer shows over a collection or an item. Behind it, what
  the main pane shows is one value (`MainView`, `renderers/page/view.js`), named by the URL hash and read back from it,
  and every way into a view goes through one `go`.
- Reloading on a worker keeps the pane you picked: the hash names it (`#<id>/changes`, `#<id>/reviews`, a shown page),
  and a plain `#<id>` still opens the default. A pane the worker no longer has falls back to the default.
- The watched worker, whose waits stay quiet, is the one on screen while the window is focused and visible, on the page
  and in Tower 3D alike (`watching`, `/attend.js`). Focus moving into a page framed in the tower keeps it watched.
  Tower 3D's open desk is now its machine's state, so a desk's waits ring while Tower 3D's window is in the background,
  as on the page.
- Tower 3D opened or reloaded behind another tab rings for waits: before, every board reached its attention only once
  the tab was shown, and the first one it saw was the silent first board. A browser may still mute sound in a
  background tab; the notification shows.
- The tower page is `page.js` composing a module per pane (sidebar, worker, review, screen, shells, stats, settings,
  shelf, archive, draft, kept, dialogs and others), 2,777 lines down to 709. The board, its error, the viewer's record,
  N's round and a draft's autosave are the page's machine's state, each changed by its own event; the sidebar's stats
  are a machine of their own over held reads.
- **Removed, as minors by exception:** `/attend.js`'s `attendHandlers` and `AttendCtx` (released in 1.66), and the
  `ctx` argument of `/loop.js`'s handlers and `loop` (released in 1.61). Both shipped in v1.48.0 the same day and no
  renderer outside this repository used them. Run attention's steps with `attendStep(a, event, watched)` in your own
  machine, with `watching` and `eyeStep`; handlers take `(state, event)`. The world enters a machine only as events
  (decision `machines`).
- New shared exports (API 1.68, 1.70): `attendStep`, `watching`, `eyeStep`; `when`, `shownKey`, `shownHref` and
  `sentHome` in `/cards.js`; `AUTOSAVE_MS` and `DRAFT_STATE`; `MOVE_COMMAND`; the settings popover's `section` and
  `choice`. The page and Tower 3D read each from shared where each kept a copy. Tower 3D's send-home now says it as the
  page does: the worker first, then its crew.
- `policy/run` takes `start` and `slot` paired (API 1.67): a run by hand takes no slot, any other start requires one. A
  call that was already invalid is refused at the input, in the schema's words.
- `esc` is one function escaping all five characters, used by The Week and Tower 3D's tools. `tower ls` says a
  worker's time as every renderer does (`1h 12m`), and `tower kept` says sizes in decimal units, as the page does.

## v1.48.0

The second wave of the consolidation pass: the logic the tower page and Tower 3D each wrote by hand, now run from shared
machines, which fixed the places where the two had drifted. No host restart, no config change, the renderer API moved
1.61 → 1.66 with additions only, which ask nothing. Restart the tower (`tower down tower && tower up tower`) and reload
the page. A checkout that serves Tower 3D rebuilds it (`npm run tower3d`).

- Tower 3D now rings for a policy's offer that opens, as the tower page always did, and stops reminding you of waits
  while the tower is lost, as the page did. It counts the tower as answering again only when a live board lands, not
  when its plan re-runs the board it held. The attention machine (`/attend.js`) says what a viewer is told about waits
  and offers once for both: what begins is said, notified and rung but for the watched worker's, a reminder is a timer
  that never rings while the tower is lost, and a dismissal is kept in the viewer's record and its notification closed.
  On the page, a wait you looked away from is reminded on the next 30 s beat.
- The new-worker dialog: a second Esc while Start waits no longer closes it and leaves your prompt kept as a draft
  beside the worker started on it. A start that fails opens the dialog again on its error, as it was asked to open. The
  dialog is one machine (`/spawn.js`: closed, editing, starting; `wireSpawn` runs it), where each renderer kept its
  floor, its draft and "starting" in a data attribute, a variable and a styling attribute. Tower 3D unlocks the pointer
  as it shows, also when a failed start opens it again.
- A press the board stopped offering now says so. Resume pressed after the worker was resumed elsewhere did nothing; it
  now toasts that the worker no longer offers it, the same sentence for send home, a discard whose worktree moved, a
  resume of the stranded and a spawn. Behind it, a card, conversation, resource, floor, worktree, branch, thread and
  probe carry `actions`, each offered verb paired with its call (API 1.64); `verbs` and `calls` stay on the board,
  derived from it so the two can no longer disagree. Both renderers, the CLI and the server take a call through
  `callOf`, and `offeredCall` fails with the sentence the toast shows. The server logs a leaver
  whose card offers no send-home. Removing `verbs` and `calls` is a later major.
- The viewer's settings are one record (`/viewer.js`, API 1.63): dismissals, the ring, the brief rendered or raw, the
  diff layout, unfolded crews and the Stats range, read whole on every board and when a framed page writes to the
  store. The keys are unchanged, so what you set reads back. A rendered-or-raw choice or diff layout made in one
  renderer now reaches the other on its next board, a shown brief redrawing as it changes, instead of after a reload.
  Tower 3D now keeps the Stats range as the page does, and the two follow each other.
- Changes and review threads are read by the same held reads in both renderers (`/reads.js`, run by `/panels.js`): the
  last read stays drawn until the next lands, a read overtaken by a later one lands on nothing, and a failure shows only
  while nothing is held. Fixed: the tower page's Changes poll kept reading after leaving for a shelf page or a draft,
  until another worker was selected; a review thread whose new version failed to read was fetched and toasted on every
  draw, and now only when asked (Read again, the poll, a new version); a Changes read that failed under another scope
  showed "loading", and now shows Read again. In Tower 3D a desk's Changes are read again when its worker's turn ends,
  and its poll stops as the desk closes or leaves Changes and Reviews. The page keeps the compared scope for each
  worker, as Tower 3D did.
- The `machines` convention (decision, and a line in AGENTS.md): state with more than two states, anything timed or
  anything two renderers need is a machine of pure steps, one handler per event, run by the shared loop (`/loop.js`,
  API 1.62), where a timer is an effect carrying the event it fires and a renderer's executors do the I/O. A machine
  any renderer needs lives in `src/shared`, served. The five served modules this release adds (`/loop.js`, `/reads.js`,
  `/viewer.js`, `/spawn.js`, `/attend.js`) are additions, and `ringing` stays exported from `/cards.js`.

## v1.47.0

The first wave of a consolidation pass (the bridge's types made honest), hiring across floors, and Tower 3D's larger
meeting rooms. No host restart, no config change, the renderer API moved 1.60 → 1.61 with additions only, which ask
nothing. Restart the tower (`tower down tower && tower up tower`) and reload the page. A checkout that serves Tower 3D
rebuilds it (`npm run tower3d`).

- `tower hire … floor <id>` starts a worker on another floor, refused with the floors listed when none has that id. The
  new floor's defaults cut the worker, and its hiring limits decide, counting the hirer's depth and live hires on every
  floor. A hire on another floor heads its crew on its own floor with "hired by X (floor)", and is linked under its
  hirer in `tower agents`, in `tower agent`, in `tower home` and in the tower page's crew, where clicking the row opens
  the hire's card on its floor. A card's `hiredBy` names the hirer's floor (API 1.60).
- Consolidation, first wave: the bridge's types say what the data is. A session's state is a union (a blocked one
  carries its screen and nothing else, a compaction's trigger is read once), and a worker's lifecycle (live, stranded,
  cut off, waiting, stuck, on duty, leaving) is derived in one place, `lifeOf`, read by the board and by Tower 3D's
  fixture boards. The fixtures had drifted from the board: a reviewer the user started now reports to its author, a hire
  names its hirer, and one board no longer keeps a worker blocked after it turned to working. The board's fields are
  unchanged, and the frames are identical.
- A policy's view is valid or invalid, a run is by hand or at a slot, a check exited or errored: unions in place of
  optional fields and casts, the JSON on the wire the same and the board's schema now saying it as `anyOf`. The API
  adds `standingOf`, `checkFound` and `ValidPolicyView` to the served modules (1.61).
- The Week waits for its first board: its steps start disabled and attach once the board and the archives land, a link
  to a week read by the first draw.
- Tower 3D's meeting rooms are deeper and Meeting · 4 wider, their tables centred with room to walk round and a fourth
  laptop seat on the counter. `tower3d.ready()` rejects when the start fails, a file that would not load among the
  causes and named in the error, so the CI boot check fails in seconds instead of at its timeout.
- Claude Code 2.1.303 is tested, and `tool:claude-check` sees a turn that starts in the same read as the session
  (a prompt given at spawn) instead of waiting out interrupts.
- `fork` fetches origin first, as every worktree verb does, so a review's base and the unpushed commits it snapshots are
  read as origin has them now.
- The kb is re-reviewed across most entities, and says other local accounts are the machine's to guard.

## v1.46.0

Hardening: one way to start a worker, a stricter API, the client JavaScript and the tower page's script under the
typecheck, and the tower's API and Tower 3D tested in CI. No host restart, no config change, the renderer API
unchanged. Restart the tower (`tower down tower && tower up tower`) and reload the page. Restart the terms daemon
(`tower down terms && tower up terms`, which ends open shells) when convenient: until then an unknown shell still
answers `refused`.

- `tower spawn` and `tower resume` go through the tower's `/spawn` and `/resume`, so the CLI follows the tower's
  rules (a lost worktree refused, a typed callsign checked against the workers on duty), and fail clearly when no
  tower runs. `spawn`'s usage names `--callsign`.
- The API reads a command's body up to 8 MiB and refuses one past it as `invalid`. `/shown/<id>/` and
  `/r/<name>/` serve nothing hidden below a shown page's folder or a renderer's root (`.git`, `.env`, `.ssh`). Every
  GET is read-only, as the decision `agents-have-every-capability` now says.
- `tower.js`, The Week's `week.js`, the mod's `register.js` and the tower page's script, now its own `page.js`
  beside `index.html`, are checked by `npm run typecheck` through JSDoc. The check found a worktrees tray that
  threw on a floor with an edited kept branch, fixed.
- Claude Code 2.1.302 is tested. `tool:claude-check` takes `--retries` (default 1), keeps its scenario folders
  across runs so Claude's trust list stops growing, and answers `due`, exit 0 when the installed release is
  untested: a policy's `check` line, so a floor can be offered a check run on each new release (runbook
  `new-claude-release`).
- An unknown shell answers `not_found`. A manual `/compact` while a worker watches a subagent leaves it `watching`.
  Tidy archives a floor's closed project-stream months. `tower config check` flags unknown keys at any depth. `tower
  runs --limit` stops at 20. A bare `*` minute in a policy's cron says why it is refused.
- The kb skill's `kb.mjs diagrams` parses every diagram its page draws with the mermaid the page loads, in headless
  Chrome; two broken flow diagrams are fixed.
- CI runs one integration test of the tower's API and boots Tower 3D (`npm run test:tower3d-boot`), and reads the
  kb's suspects against a pull request's base without racing it.

## v1.45.0

Tower 3D gets a break room, and reviewers carry their chairs. No host restart, no config change, the renderer API
unchanged. A checkout that serves Tower 3D rebuilds it (`npm run tower3d`).

- A hire whose answer has waited on its hirer for two minutes takes a break in its floor's game room: it plays at a
  free cabinet, else stands among the onlookers, and walks back to its desk or meeting seat when prompted. Its desk
  reads AWAY, and a meeting holds its seat as an empty chair, so the table shows who is working and the game room who
  waits on the coordinator. Leads and reviewers stay put. The game room's standing places are slots, placed by hand.
- A reviewer rolls its chair in beside its author and out ahead of it into the elevator, sits turned as the desk
  dressing's reviewer slot is, and walks its author's aisle however that slot is turned.
- The prefab editor survives a model the vendored kit lacks: the build names the model, the prefab placing it and the
  `vendor` command, the editor draws the error over the last build and stays up, and a bad scene path answers 404.

## v1.44.0

A review loop closes at whoever hired the author, and Tower 3D's meeting rooms are lighter and solid. No host restart,
no config change. The renderer API moves to 1.59, additions only. Restart the tower (`tower down tower && tower up
tower`), rebuild Tower 3D (`npm run tower3d`) and reload both. Workers started after the update read the new skills.

- A hired worker reports to its hirer once it has answered a review's notes, and its reviewer tells the hirer the
  verdict, so a coordinator hears the loop close without you relaying it. Send, from a worker (`tower send`), the
  tower page or Tower 3D, tells a hired worker whom to report to (`sendText` takes the hirer).
- Tower 3D draws a level's empty meeting chairs as two instanced meshes, up to ~180 fewer draw calls facing a room,
  and you no longer walk through meeting chairs, taken or empty.
- The meeting tables, rooms and lounge are placed by hand: seats spread so workers stop brushing elbows, the eighth
  seat at the table's foot, counter chairs tucked in. October's candy and the working pencils clear the monitor.

## v1.43.1

Tower 3D stays smooth near workers. No host restart, no config change, the renderer API unchanged. A checkout that
serves Tower 3D rebuilds it (`npm run tower3d`).

- Aiming tests a worker's shape exactly only when the crosshair's ray enters the box round its posed bones. Near a
  crowd, a crew's meeting room or a row of desks, the frame's CPU time drops from 10–24 ms to 3–7 ms, and what you aim
  at is the same as before.

## v1.43.0

Tower 3D's desks turn, and crews meet. No host restart, no config change, the renderer API unchanged. A checkout that
serves Tower 3D rebuilds it (`npm run tower3d`).

- Desks face +x, away from the control room, so from its console you read screens over the workers' shoulders.
  Workers walk the aisles between the columns to and from their chairs, sit, stand and pull the chair out along the
  desk's turn; reviewers, rugs and colliders follow it.
- A crew of three or more on duty, lead included, gathers in a meeting room and walks back to its desks when its lead
  goes home. The first crew takes Meeting · 8, the next Meeting · 4. The lead sits at the head of a long table that
  grows with the crew, members past its seats sit at the room's counter, then stand. A member sent home leaves the room,
  and a resumed worker comes back as a new arrival.
- Each seat in a meeting has a laptop showing its worker's live terminal, and sitting there drives the worker.
- A desk whose worker is in a meeting reads AWAY and says where it went; E there takes you to it.

## v1.42.0

Tower 3D's floor gets a plan: a loft over the control room, and rooms placed from anchors. No host restart, no config
change, the renderer API unchanged. A checkout that serves Tower 3D rebuilds it (`npm run tower3d`). The desks are not
yet turned and the meeting rooms have no tables: later releases.

- A floor is a 6.6 m storey, up from 4.2: three floors stand 25.3 m to the roof. The elevator's car keeps its speed, so
  a floor takes a little longer to ride.
- Every floor has a loft deck over the left wing's back, with a straight stair you walk up and glass rails on its open
  edges. The walker stands on the stair's treads and on the deck, and what you see and bump into depends on which you
  are on.
- The control room stands on the deck, entered from the terrace, and its inner wall is glass toward the desks: from the
  console you see the floor. Its video wall is a two-sided band in that glass, one face into the room and one out over
  the desks, each read left to right from its side. Picks and sight pass the glass and stop at the band, and the door
  finds the tile on the face turned toward you.
- A floor's rooms are prefabs placed from its anchors, on a plate sized for three rows and a meeting strip: the archive,
  holding the shelf, and the game room, holding the arcade, under the deck; the lounge; two meeting rooms, for eight and
  for four, along the front glass, still empty; and the hero between them. A game room with no games hangs a sign saying
  how to fill it, which comes down with the first game kept.
- Every shelf entry and every shell is drawn: the pieces keep full size while they fit (seven shelf entries, four
  shells), then shrink together to fit. The Running board reads whole at its nook's width.
- The kit carries a prefab's boxes, drawn and walked round (glass writes no depth and casts no shadow), and the prefab
  editor resizes them along each axis, by the gizmo or by numbers.
- Boxes that shared a face no longer flicker: the rooms' walls, jambs, glazing and panes each belong to one box, and
  what meets the building's glass, the deck's slab and the control room's shell included, runs 2 cm past it.
- Closing anything that took the camera (a tile, a desk screen, a kiosk shell, a game, the overview) while you stand on
  the deck no longer flies the camera 3.3 m low into the archive before it snaps back.

## v1.41.2

The desk's remaining fixed places are placed by hand. No host restart, no config change, the renderer API unchanged. A
checkout that serves Tower 3D rebuilds it (`npm run tower3d`).

- A scene's states can fall in `groups` that exclude each other, and a desk takes one state from each: its status, the
  pile its context has grown, and the season. The prefab editor picks a state per group.
- The second monitor, the cat's perch, the trophies, a reviewer's seat and the visitors are slots of `desk_dress.json`,
  and the context pile and October's candy are its states, placed in the editor; per-worker jitter is gone from them.
- A desk's slots are read in its states, so a place moved in one state shows in the office as in the editor.
- A reviewer going home stands up out of its chair and takes the chair along.

## v1.41.1

The desk's props placed by hand, and a gizmo you can use from where you sit. No host restart, no config change, the
renderer API unchanged. A checkout that serves Tower 3D rebuilds it (`npm run tower3d`).

- The desk dressing's props are placed by hand in the prefab editor, clear of the monitor: the desk's own cactus and
  mug, the watching mug, the done pizza, and the logbook and papers per state.
- The prefab editor's and the dresser's two-axis handles stand on the side of the object you look from: a desk seen
  from the worker's seat no longer hides them behind its monitor.

## v1.41.0

Tower 3D loads its models as files, and the prefab editor shows the real desk. No host restart, the renderer API
unchanged. A checkout that serves Tower 3D rebuilds it (`npm run tower3d`).

- **config**, only if your shelf frames one of Tower 3D's built pages as an `html` entry (such as
  `renderers/tower3d/out/lab.html`): it can no longer load its models, because an `html` shelf page fetches nothing
  beside it. Declare it as a renderer, `"renderers": { "lab": { "root": "<checkout>/renderers/tower3d/out", "entry":
  "lab.html" } }`, and make the shelf entry `{ "label": "Lab", "renderer": "lab" }`.
- Tower 3D's pages fetch their models, the KayKit kit and the test film from `out/assets/` as they start, instead of
  carrying them inlined: `tower3d.js` goes from about 18 MB to 2 MB, and the four pages share one copy of the files.
- The prefab editor draws the workstation's real desk, monitor and chair where it drew ghost boxes, so what you place
  is what the office shows. A scene's guide can name a host model (`{ "model": "desk" }`). Drops land on faces, never
  on a guide's edge lines.
- The desk's own cactus and mug leave its model and become items of `desk_dress.json`, placed in the editor like any
  other prop. A model item can carry its own `theme`: the desk's grey return says so in its document.

## v1.40.0

Tower 3D's workers move by the board. No host restart, no config change, the renderer API unchanged. A checkout that
serves Tower 3D rebuilds it (`npm run tower3d`).

- More clips: eight more of KayKit's, and nine of Quaternius's Universal Animation Library (CC0) baked onto KayKit's
  Rig_Medium by the character packer, which takes the unpacked library as a sixth argument. The dresser plays any
  packed clip (`tool:dresser shot --pose <clip>`).
- Moments from the board: a failed worker flinches, then slumps; compacting casts a spell, a stuck worker picks a
  lock, a new subagent run is summoned, an idle worker the user types to talks; parties dance and mingle.
- Workers sit back into a chair pulled out for them and rise forward out of it, come and go by the side toward their
  way, turn gradually, and walk with their feet planted, at 1.1 m/s.

## v1.39.0

A prefab editor for Tower 3D's scenes, and scene documents that hold states and slots. No host restart, no config
change, the renderer API unchanged. A checkout that serves Tower 3D rebuilds it (`npm run tower3d`).

- Scene documents (`renderers/kaykit/src/scene.ts`) gain optional `id`s, `states` (named changes over the shared
  scene: remove, set, add, applied as a list in the document's order), `slots` (named places set by hand that code
  fills from the board: a person's, sitting or standing, or a thing's) and `guides` (ghost boxes for what the host
  draws itself). `tool:kaykit check` covers them and `render --states` draws a state. The playground's four desk
  scenes are one `prefabs/desk.json`, and the meeting nook has `seat_1..5`.
- Tower 3D's desk props come from `prefabs/desk_dress.json`, a state per status, and the places around a worker (the
  twin, subagents, logbook, papers, a reviewer's notebook) from its slots. Hand-placed props are no longer nudged per
  worker. The idle desk's cactus no longer cuts through the monitor.
- The editor (`renderers/tower3d/editor.html`, `npm run tool:editor -- serve [scene.json]`, `shot`): open any scene
  from a list, select models, placed prefabs and slots (people drawn as posed ghost workers), move, turn and scale
  them with a gizmo, snap, drop onto the surface below, add from the catalog, edit inside a prefab, edit per state,
  undo, and save after seeing each file's changed lines. `window.editor` drives it for agents. It needs the playground's
  catalog built (`npm run tool:kaykit -- build`).

## v1.38.0

A tool that checks a new Claude Code release against the tower. No host restart, no config change, the renderer API
unchanged. Nothing to restart: the tool runs from a checkout.

- `npm run tool:claude-check -- run` records, on the installed Claude, a scenario for every fixture of real Claude's
  in a throwaway system of its own (about 30 Haiku sessions, ~6 minutes), and reports what reads differently from the
  tested releases: the events and payload keys Claude posts against `test/claude-shapes.json`, each recording's
  statuses against its fixture's, the surfaces no fixture covers, what Claude's `sec-default` held back, and the
  release's changelog entries about those surfaces. It exits 0 when the release reads clean, and then raising the
  tested range is mechanical; `report` prints the last run again and `accept` takes its shapes as the baseline. The
  runbook `new-claude-release` says what stays human.

## v1.37.2

The tower is tested on Claude Code up to 2.1.301. No host restart, no config change, the renderer API unchanged.
Restart the tower (`tower down tower && tower up tower`) and a worker on 2.1.301 is no longer flagged untested.

- Claude Code 2.1.301 passed the runbook `new-claude-release`: nothing the tower reads changed. Inside a Team or
  Enterprise organization a compaction still starts from the classic `PreCompact`.

## v1.37.1

Fixes to the Changes view's hunk colouring, found testing v1.37.0 end to end. No host restart, no config change, the
renderer API unchanged. Restart the tower (`tower down tower && tower up tower`), rebuild Tower 3D
(`npm run tower3d`) and reload both.

- A hunk takes the colours of the code above it only where highlight.js reads that code right: a comment, or a string
  or fence that closes within the hunk. A stray `*` in Markdown no longer turns every hunk below it italic, nor does a
  regex in a template literal's `${}` turn the rest of a file into a string.
- The lines before hunks are capped by size: a minified line above a hunk no longer sends megabytes per poll and holds
  the page. A working tree's file is read only through its last hunk, never through a symlink or a fifo, and a file
  that fails to read goes without its lines instead of failing the read. A commit's files are read by blob id, fast on
  wide commits of deep paths.
- With `diff.submodule=log` in the user's git config, a moved submodule keeps its row and no longer breaks the file
  before it. A hub in a subdirectory of its repo gets the lines before its hunks, and a root commit since the base
  reads as added files where it failed the read.

Thanks to Carlos Bonetti.

## v1.37.0

The Changes view colours a hunk in the code it stands in. No host restart, no config change. The renderer API moves
to 1.58, additions only. Restart the tower (`tower down tower && tower up tower`), rebuild Tower 3D
(`npm run tower3d`) and reload both.

- A hunk that starts inside a comment or a string is coloured as one: an apostrophe in a JSDoc block no longer opens
  a string that runs through the code after it. Each hunk of a modified or renamed file carries the unchanged lines
  before it (`before` on `/changes` hunks), read from the working tree or the commit, within caps on lines and bytes
  per file and per read; a file past them is coloured hunk by hunk, as before.
- Blank context lines keep their line numbers when `diff.suppressBlankEmpty` is set in the user's git config.
- `/changes` answers a git failure as an error, which the panel shows with Read again, where it used to send an
  empty body.

Thanks to Carlos Bonetti.

## v1.36.2

The Mac app's icon has rounded corners on macOS before 26. No host restart, no config change, the renderer API
unchanged. Run `tower app` again to redraw the icon.

- Before macOS 26, `tower app` puts the icon on Apple's icon grid: the rounded square with a soft shadow, its corners
  transparent. Earlier versions showed a hard-edged square there. macOS 26 masks the icon itself and draws it as
  before. Thanks to Yuri Galindo.

## v1.36.1

A callsign typed with its number starts beside a worker of the same name. No host restart, no config change, the
renderer API unchanged. Restart the tower (`tower down tower && tower up tower`) and reload it.

- `PEDRINHO-12` is refused only while `PEDRINHO-12` itself is on duty, so it starts beside `PEDRINHO-33`. A bare
  `PEDRINHO` still takes its number at the start, so it's refused while any PEDRINHO is on duty, and the refusal
  suggests adding a number.

## v1.36.0

Name a worker yourself when you start it. No host restart, no config change. The renderer API moves to 1.57,
additions only. Restart the tower (`tower down tower && tower up tower`), rebuild Tower 3D (`npm run tower3d`) and
reload both; new workers pick up the handbook's new lines as they start.

- The New worker dialog has a **Callsign** field, under every place a worker can start. Type `ZECA` and the worker
  runs as `ZECA-` and the number its session gives it; type `ZECA-07` and it runs as `ZECA-07`. Left empty, it's drawn
  as before. A name a worker on duty already holds is refused, with who holds it. The callsign is chosen once: a
  resumed worker keeps it.
- The dialog's old "Name" field, the new worktree's folder, now reads **Worktree name**.
- `spawn` takes an optional `callsign`; `tower spawn --callsign <C>` and `tower hire … callsign <C>` pass it.

## v1.35.0

Floors fold to one line in the tower page's sidebar. No host restart, no config change, the renderer API unchanged.
Restart the tower (`tower down tower && tower up tower`), rebuild Tower 3D (`npm run tower3d`) and reload both.

- A press on a floor's sign folds it to one line: its waits on you, its offers and its workers on duty, each a lamp
  and a number. The choice is kept per viewer. A floor nobody has chosen for is open while a worker on it needs you,
  and folded otherwise. An open floor's sign stays at the top of the sidebar while its workers scroll under it.
  ⌥J, N and ⌥↑/↓ open the floor of the worker they land on, and fold it again when they move on.
- The New worker dialog lists every repo under "Main checkout": the list no longer stops at a fixed height with a
  scroll of its own. Tower 3D's dialog gets the same.

## v1.34.0

One button to end a worker, a limits chip, and red only for a worker that needs you. No host restart, no config
change. The renderer API moves to 1.56, additions only. Restart the tower (`tower down tower && tower up tower`),
rebuild Tower 3D (`npm run tower3d`) and reload both.

- **Send home** is the one way to end a worker in the tower page and Tower 3D: it ends the worker with every hire
  under it, the deepest first, and a worker with nobody under it ends alone. The board offers `send-home` on every
  worker now (a lone worker's is its own `kill`); `kill` stays on the API and `tower kill`. Its confirmation says what
  resuming later costs, and sending one worker home offers Resume in its toast.
- A stranded worker offers **resume** and **let go**; "resume all" still carries on the workers the host cut off
  mid-turn, and resumes the rest as they were. A selected stranded worker's actions show once, in the header.
- The sidebar's rate limits fold into one chip naming the tightest limit and its share; a click opens the full meters,
  "as of", extra usage and the probes.
- **Red means a worker needs you**: a question, a permission, a screen. A finished answer still waits on you and
  still counts, drawn calm; the count of waits is ringed, and "needs you" has its own count. New marks are drawn in
  the accent; problems (at risk, invalid, extra spent) in the broken tone; meters stay ink until a limit runs hot.
  Tower 3D's HUD, signs and directory follow the same rule.

## v1.33.0

A calmer tower page that holds up under a lot of data: the first pass from a design audit of the page on a busy
board. No host restart, no config change. The renderer API moves to 1.54, additions only. Restart the tower
(`tower down tower && tower up tower`), rebuild Tower 3D (`npm run tower3d`) and reload both. Thanks to Carlos
Bonetti for the header feedback.

- The worker header is one line. The move chips and the "now" line are gone: the sidebar and the terminal already say
  both, and the ⌥ move keys still work. The showings scroll sideways after the Terminal, Brief, Changes and Reviews
  tabs, with a fade on an edge that hides more, and the selected one scrolls into view. Tower 3D's desk tabs scroll
  the same way. "dismiss" sits beside the status it dismisses.
- The sidebar has bounds: a floor's drafts and kept trays list their newest 6, then "+N more", which opens the whole
  collection in the main pane. Shelf chips and trays keep to one line. The sidebar grows with the window, up to 28rem.
- The skyline fits any number of floors in one row, and a floor's sign never runs past its building.
- A card's time never gets cut off: its status word gives way first. A stranded worker reads "stranded", and its
  carry on, resume and let go show when it's selected or hovered. A hire under its hirer drops "hired by".
- The header counts use the cards' words, "done" and "failed".
- A stuck worker's pill is drawn as "needs you", readable in both schemes, and "offered" has a colour of its own.
- A subagent compacting during a manual `/compact` no longer leaves its worker reading `working`.
- Long unbroken words wrap inside a toast.

## v1.32.5

Tidy keeps a hire while the worker that hired it is on duty. No host restart, no config change, the renderer API
unchanged. Restart the tower (`tower down tower && tower up tower`) to pick it up.

- Tidy no longer offers to send home a hire whose hirer is still on duty, however finished it looks: a hire whose
  work isn't code (a spec, research, an advisor) reads as landed from its first minute. The hirer sends it home, or
  Tidy offers it once the hirer is gone. A reviewer stays while its author works. The hirer is followed through its
  resumes and across floors.
- For contributors: a sandbox's sessions run the sandbox checkout's own `tower` command, ahead of a global one.

## v1.32.4

New looks for Tower 3D's workers, made in the dresser. No host restart, no config change, the renderer API
unchanged. Rebuild Tower 3D (`npm run tower3d`) and reload it.

- Three outfits: `fixerclankr`, `mageskeleton` and `mechwizz`. No worker wears them yet: outfits join the mix only
  when `mix.outfits.share` rises above 0.
- Hats, glasses, the Clanker's top hat and beacon, the wand and the mug are fitted per head on the Clanker, the
  skeleton mage's skull and the Combat Mech, so they sit where they should on every worker wearing them.

## v1.32.3

Claude Code 2.1.300 is tested, and the board's "untested" notice clears. No host restart, no config change, the
renderer API unchanged. Each worker reads the mod as its Claude starts, so restart the tower
(`tower down tower && tower up tower`) and new or resumed workers pick it up.

- A compaction starts from Claude's classic `PreCompact` hook. Since 2.1.299, for a Team or Enterprise organization
  or a machine with managed settings, Claude's built-in `sec-default` mod keeps the mod event `session.compact` from
  every user mod, the tower's included, and a worker read `idle` in the middle of an automatic compaction. Only a
  manual `/compact` moves the status, so an idle compaction of a waiting worker keeps its wait.
- A subagent resumed through `SendMessage` reopens its run, where it was counted twice.
- `docs/usage.md` says what Claude's idle compaction does to a waiting worker, and how to turn it off.

## v1.32.2

Two small fixes to what renderers draw. No host restart, no config change, the renderer API unchanged. Restart the
tower (`tower down tower && tower up tower`) and reload it.

- A policy opened from the Policies panel has a back button beside its label, to the floor's policies.
- The Changes panel highlights JSX in TypeScript, and the scripts and styles embedded in html, where they read as
  plain text before.

## v1.32.1

Fixes found by the first real policy run. No host restart, no config change. The renderer API moves to 1.50, additions
only. Restart the tower (`tower down tower && tower up tower`) and reload it.

- `tower kill` takes a callsign as well as a session id.
- `tower <verb> --help` (or `-h`) prints every verb's usage, the user's verbs included.
- `tower home <CALLSIGN>` also sends home a worker in no crew, a policy's run for one: it ends, and can be resumed.
- A slot held because `live` is full shows under "Needs you", in `tower policies` and the Policies panel: which run
  holds it and since when. It doesn't ring.

## v1.32.0

Policies: standing work the tower starts on a schedule. A worker can also end its own session once its turn ends.
**config**: a floor runs policies once its config declares a `policies` collection. No host restart. The renderer API
moves to 1.49, additions only. Restart the tower (`tower down tower && tower up tower`), run `npm install` (croner is
new), rebuild Tower 3D (`npm run tower3d`) and reload it.

- A policy is a markdown item in a floor's `policies` collection: a `# Title` line, then a fenced `json` header, then
  the prose that becomes the worker's prompt. The header takes these keys:
  - `when`: a list of crons and a time zone. Only crons the tower can say in words are accepted.
  - `check`: a shell line run at the slot. Exit 0 means there is work.
  - `start`: `ask` or `auto`.
  - `live`: how many runs of the policy can work at once.
  - `hire`: the spawn verb's own fields.
  - `runner` and `x.<runner>`: for a runner of your own.

  An unknown key makes the policy invalid. `docs/config.md` and the handbook ("Policies and runs") describe it.
- The tower's runner checks each policy's slots every 30 s. It starts an `auto` policy whose current file is approved.
  Otherwise it offers the slot to you, open until the next slot. Any edit to a policy drops its approval.
- Each run is a fact in `streams/projects/<floor>/runs/`, and each approval is one in `approvals/`. Everything else is
  derived from those facts and the worker's own log.
- New commands:
  - `tower policies` lists each policy, its rule in words, the next slot and why it would or wouldn't run now.
  - `tower policies approve <tag>` approves the policy as its file reads now.
  - `tower policies run <tag>` starts a policy by hand.
  - `tower runs [<tag>] [--limit n]` lists a policy's latest runs, each with its latest answer cut short.

  `tower whoami` tells a run which policy started it.
- The tower page has a Policies panel per floor, opened from the line under the floor. It lists:
  - **Needs you:** an auto policy edited since its approval, or one turned invalid.
  - **Offered:** slots you can accept.
  - **Every policy:** its rule and next slot in words, its approval, live count and last run, with Run now and
    Approve buttons.

  Offers sit above the floor's workers. They count with the waits, `N` reaches them, and they ring with a sound of
  their own. A run's card says "run 3 · Bug hunt".
- `tower home <your own callsign>` sends a worker home once its current turn ends, keeping its last answer. A prompt
  sent before then cancels it, and the card reads "going home" meanwhile. A bare `tower home` is a usage error.

## v1.31.1

The shelf's file buttons draw their icon centred in the box on hover. No host restart, no config change. The renderer
API stays at 1.47. Restart the tower (`tower down tower && tower up tower`) and reload it.

## v1.31.0

Shelf entries offer the Finder and editor buttons the panels already have, for their folder and their files, and the
usage guide says what copy and paste do in a worker's terminal. No host restart, no config change. The renderer API
stays at 1.47. Restart the tower (`tower down tower && tower up tower`), rebuild Tower 3D (`npm run tower3d`) and reload it.

- A markdown glob's folder is on the shelf entry's head: `.regibyte/sessions/*.md` gives `.regibyte/sessions`. Each file
  the glob lists has its own buttons beside it, in the page and in Tower 3D's reader.
- An html page's head has its file and its folder.
- `docs/usage.md`: a worker's terminal is Claude Code's own screen, so drag to select and Ctrl+C copy (⌘C doesn't),
  and Ctrl+V pastes text and images.

## v1.30.0

The quota probe tells use outside the tower from the tower's own, reads a model's own week and extra usage, and
reads on request. No host restart, no config change. The renderer API moves to 1.47, additions. Restart the tower
(`tower down tower && tower up tower`), rebuild Tower 3D (`npm run tower3d`) and reload it.

- Outside use: a climb in the weekly quota between two consecutive probe answers, over a span in which no session
  made a model call, spent or had a turn, is use from outside the tower (claude.ai, the desktop app, a phone). The
  weekly budget's `outside` is this week's, `GET /stats` carries it for any window, and the Stats panel and The
  Week's cover show it. What 1% buys (`usdPerPercent`) now comes from the tower's own climb, outside use left out.
  Outside use during a span the tower also works counts as the tower's: the stat errs low.
- A model's own weekly limit, when the account has one, is on the board as `seven_day_<model>`, kept while its
  reading is fresh and its window hasn't reset. On such an account the quota probe reads every 10 minutes while
  sessions work too, so that week doesn't go stale while it is spent.
- Extra usage: `board.extraUsage`, drawn under the limits on the tower page and in Tower 3D's HUD once some is spent.
- `POST /probe/run` reads a probe now: offered as `run` on each probe, refused while off, while a read runs, or
  within 60 s of the last start. "Read now" on the tower page, a click on Tower 3D's lamp, `tower probes run
  <name>`.
- Fixed: a turn cut short by an exit no longer stays open for outside use.

## v1.29.0

A guide to the tower for new users and their Claudes, the probes' status everywhere, and The Week reads past weeks.
No host restart, no config change. The renderer API moves to 1.46, additions. Restart the tower
(`tower down tower && tower up tower`), rebuild Tower 3D (`npm run tower3d`) and reload it. Workers started after
the update know the new `tower:guide` skill.

- `docs/usage.md` opens with setting up your floors: a floor's hub, where sessions start and its notes live, and the
  repos it spans, granted as file access only, so their own `CLAUDE.md` and skills stay out. New sections: who's
  waiting on you, the brief, resume and carry on, Tidy, shells, Stats and The Week, Tower 3D. The README, `tower
  init` and `npm run setup` point at it. AGENTS.md, the README and `docs/config.md` said repos were passed as
  `--add-dir`: they are `permissions.additionalDirectories`.
- `tower:guide`, a third skill in the mod: ask any worker "show me how to use the tower" and it gives a tour of your
  own floors, shelf and collections, then offers one live demo, run only on a yes.
- A probe's status is on the board (`board.probes`: off, new, ok, failing, backing off or unavailable, its last read
  and error, when it is next due) and drawn under the limits in the tower page and Tower 3D. `GET /probe/<name>`
  and `tower.probe()` read one with its recent reads; `tower probes` lists them; `tower doctor` says whether the
  quota probe answered lately.
- Tidy archives a probe stream's closed months, gzipped in place. The row shows on every floor's Tidy; whichever
  floor applies it archives them.
- `GET /stats` carries `sessions`, each session's turns, agent-hours, spend, longest turn and longest wait in the
  window, and `weekly`, the weekly limit as last read in it. The Week draws a past week's quota, each worker's turns
  and spend, who holds the longest turn and the longest wait, and the most worker-hours.
- Test fixtures and the kb no longer carry paths from the maintainer's machine.

## v1.28.5

Name tags on the roof clear every guest's head. No host restart, no config change, the renderer API is unchanged.
Rebuild Tower 3D (`npm run tower3d`) and reload it.

- A party guest's callsign floats just over its head and what it wears there. It sat at one height for everyone,
  fit for the adventurers: on a Clanker or a mech it landed in the chest, and under a top hat, an antenna or a
  wizard's hat it hid behind the hat.

## v1.28.4

Typing in a session no longer stutters every 5 s. No host restart, no config change, the renderer API is unchanged.
Restart the tower (`tower down tower && tower up tower`).

- The board's git reads, every project dir every 5 s while a renderer is open, run on a thread of their own. Each
  git process they start held the tower's event loop about 3 ms on macOS, and a read starts hundreds: every
  keystroke and screen the tower relays waited behind them, up to half a second.
- A read asks git only what can change: each worktree's status and reflog, and each base's commit once per repo.
  Answers about commits are remembered, the 1024 asked for most recently. About half the git processes per read.
- At most 8 git processes run at once, across every verb and read.

## v1.28.3

Changes lists a repo's files in path order again when a worker adds a file. No host restart, no config change, the
renderer API is unchanged. Restart the tower (`tower down tower && tower up tower`). Thanks to Carlos Bonetti (#7).

- A repo's files are sorted by the path in each file's header (the new path for a rename), untracked files among the
  rest, in every scope: all, uncommitted and one commit. Before, every untracked file came after all tracked ones,
  and staging a file moved it.

## v1.28.2

The knowledge base's verify ranks what may be stale instead of hiding part of it. Nothing that runs changes: no host
restart, no config change, the renderer API is unchanged, and nothing needs a restart or a rebuild.

- `kb.mjs verify` keeps every suspect. First come those whose commits changed what an entity reads: an anchored
  symbol's lines, named in the line, or a file read whole. After them come those changed only elsewhere in the file.
  A ref read at line ranges alone counts only the commits inside them.
- `--symbols` is gone. Replayed over the 302 commits since v1.0.0, it hid 20 real changes, 8 of them claims that
  had become false, while dropping 41% of suspects. A pull request's kb warnings on CI now list them all.

## v1.28.1

The docs and the knowledge base agree with the code again. Nothing that runs changes: no host restart, no config
change, the renderer API is unchanged, and nothing needs a restart or a rebuild.

- The README says three renderers ship (the tower page, Tower 3D and The Week). `THIRD_PARTY.md` lists the KayKit
  character packs Tower 3D has vendored since v1.25.0, all CC0.
- `docs/config.md`: `tower config check` exits 1 only on a problem the tower can't take; only `reviews` means
  something to the tower itself. `docs/extending.md`: `whyNot` also answers `carry-on` and `let-go`, and
  `/changes/<id>` takes `scope=all`, the default.
- The kb has a `doc` type: the README, `THIRD_PARTY.md` and `docs/config.md`, `extending.md` and `usage.md` are
  entities that ref the code they restate, so `kb.mjs verify` flags them when it changes. The project and
  web-tower entities name The Week; `renderer-api` no longer states a version number; `releases` reads the
  changelog at its format rules, so `verify --symbols` stops flagging it on every release.


The Clanker family. No host restart, no config change, the renderer API is unchanged. Rebuild Tower 3D
(`npm run tower3d`) and reload it.

- The Clanker stands a head over a worker. He was drawn at 1.14 m, shorter than the adventurers, and is 1.82 m now.
- He comes in nine looks: the plain Clanker, Sentinel, Tinker, Brute, Clanksworth, Scout, Frostbyte, Sludge and
  King Bolt. Each is a colourway with its own eye glow, props worn in the slots (antennas, a top hat and a crown as
  `Hat`, a wrench and a sledgehammer as `Gear`, a drill, a cannon, a beacon and a canister as `Prop`), his exhausts
  as `Cape`, and an outfit `shape` that scales bones over the clips (Tinker's big head, Brute's arms, Scout's long
  legs). The dresser fits them like any part. The wardrobe's `mix.outfits.bodies` dresses every Clanker the mix rolls
  in one of the nine, picked from the session's id. The variants were generated by Claude from the CC0 Clanker
  (`renderers/tower3d/kaykit/Characters/README.md`).
- A Rig_Large body sits back against the chair's back rest, by its pelvis, with its hunch over the rest. The
  Clanker sat half a metre forward, off the seat's front edge.
- The Clanker's weight in `mix.bodies` is 4 (was 2): about 1 in 9 of the workers who aren't bots is a Clanker.
  This re-dresses those workers once.

## v1.27.0

More KayKit characters on the floor, the Clanker among them, and Tower 3D drawing again. No host restart, no config
change, the renderer API is unchanged. Rebuild Tower 3D (`npm run tower3d`) and reload it.

- Fixed: since v1.26.0 Tower 3D drew nothing. A dresser save had deleted the roof's bartender, whom Tower 3D dresses
  by name. He is back, and the outfits worn by name are locked: the dresser won't rename or delete them, and a
  wardrobe without them is refused on save and named on load.
- New characters (CC0): the four KayKit Skeletons, the Helpers and the Combat Mech, and the Clanker, the first worker
  on KayKit's big skeleton (Rig_Large). He sits, types, waves and dances on the same clips as everyone, retargeted to
  his frame. Their parts mix within a skeleton (a skeleton in a knight's helmet), each character keeps a head of its
  kind, and the Clanker and the mech come in two colourways. The dresser starts from any of them.
- `mix.bodies` is a weight per character: adventurers 6 each, the Clanker 2, the others 1, so about a quarter of the
  workers who aren't bots become a new character. This re-dresses that quarter of the floor once.
- `mix.named` gives an outfit to every worker whose callsign has a name. CLANKER is a new callsign, and every
  CLANKER is the Clanker. Adding the name renames about 1 in 181 sessions, past ones included.

## v1.26.0

Tower 3D's looks are data, and a character creator dresses them by hand. No host restart, no config change, the
renderer API is unchanged. Rebuild Tower 3D (`npm run tower3d`) and reload it.

- The wardrobe: `renderers/tower3d/wardrobe.json`, checked as Tower 3D loads. **Fits** move, turn and scale a worn
  piece over where it was made, by default and per head (or any part worn with it). **Outfits** are named looks (the
  roof's bartender and DJ among them). The **mix** is how the rest are hashed: the bot's share, each slot's chance and
  pool, and the palettes. Parts are a catalogue derived from the models, so a new part needs no code; the old hats and
  glasses are ordinary parts in a new `Hat` slot and in `Face`.
- Bodies, colours and hats are chosen by rendezvous like the other parts, so a part, colour or outfit added re-dresses
  only the workers it wins. This re-dresses the floor once.
- Hats sit on each head and glasses on the eyes; the glasses' and shades' temples reach the ears, and the glasses
  weigh a quarter of what they did.
- The dresser, `renderers/tower3d/dresser.html`: start from a body or randomize, pick a part per slot and colours from
  the palettes, pose the worker (seated in the office chair, typing, walking, dancing), and fit a piece with a gizmo
  (T, R, S) on every head of a line-up, each head saving its own fit. Keep looks as outfits, see what a save changes
  before it writes, and read the worker's draw calls and triangles. `npm run tool:dresser -- serve` opens it with saving
  to the file; `tool:dresser shot` renders it for agents.

## v1.25.2

v1.25.1's fix, read as `window.origin`: the same origin in a browser, and what the tower's checks run (v1.25.1 failed
them). Nothing else changes. Restart the tower (`tower down tower && tower up tower`) and reload.

## v1.25.1

Pages framed on a shelf reach the tower again, Tower 3D among them. No host restart, no config change, the renderer
API is unchanged. Restart the tower (`tower down tower && tower up tower`) and reload.

- v1.24.1 decided whether a page is relayed from `location.origin`, which is its URL's origin, the tower's, even in a
  sandboxed frame: a page framed on a shelf called the routes itself and CORS refused it (`/renderers`, `/origins`).
  `tower.js` now reads the page's own origin, `self.origin`, `null` in a sandboxed frame.

## v1.25.0

Tower 3D's workers are KayKit characters. No host restart, no config change, the renderer API is unchanged. Rebuild
Tower 3D (`npm run tower3d`) and reload it.

- Every worker is a KayKit adventurer on one rig (CC0), posed by KayKit's clips on the sim clock: typing at its desk,
  walking in and out, beside its author as a reviewer, dancing and serving on the roof. Its look is hashed from its
  session: a body, a head, hair, helm, cape and gear shown or swapped, its colours. The robot stays, on the same bones;
  the bean and the puff retire. A new pose fades in over the last.
- A worker sits by its own mesh, on the seat and against the back rest, and the office chair swivels with it when it
  turns to you. What it wears (glasses, the bartender's cap, the DJ's shades) fits its head.
- A parts kit to make new looks: `renderers/tower3d/parts/parts.blend`, five bodies wearing every part at once, the
  kit's atlases wired; `npm run tower3d:parts` exports what you model there into Tower 3D, refusing a part with what
  to fix. A part's slot is its name's prefix, so a new part needs no code, and adding one dresses only the share of
  workers it wins. Its README walks the loop.

## v1.24.1

A renderer opens framed. No host restart, no config change, the renderer API is unchanged. Restart the tower
(`tower down tower && tower up tower`).

- A renderer shown beside a worker, framed at the tower's origin, waited forever for a relay: `tower.js` now relays
  only when its page is framed at an origin of its own, and otherwise calls the routes itself.
- A renderer framed on a shelf runs at an opaque origin, where its ES modules (The Week's) were refused by CORS: a
  renderer's files are now readable from any origin, as the served modules already were.

## v1.24.0

The Week: a third renderer, the tower's week as a yearbook. No host restart, no config change, the renderer API is
unchanged (`GET /renderers` lists one more). Restart the tower (`tower down tower && tower up tower`), then open
`/r/week/`, or frame it on a shelf with `{ "label": "The Week", "renderer": "week" }`.

- The budget week, from one reset to the next, with ‹ › to earlier weeks and `#YYYY-MM-DD` to link one: a cover (the
  share of the weekly quota, spend, sessions, worker-hours, commits landed and lines), the class photo (every worker
  of the week by floor, the busiest first, each with a line of what it did), the week's rhythm (turns by day and hour,
  spend and commits per day), superlatives and a quote of the week. Every number is read from `/stats`, the archive
  and the board.
- A plain page, no build: a small renderer to start from. `docs/extending.md` now says what `/stats` and
  `/archive/<project>` answer, which reads `tower api` leaves out, and the formatters `/panels.js` serves.

## v1.23.0

Tower 3D's city follows the clock through the night. No host restart, no config change, the renderer API is
unchanged. Rebuild Tower 3D (`npm run tower3d`) and reload it.

- The city's lit windows keep office hours: they come on through dusk and go dark through the evening, a few burning
  all night and a few back on before dawn, each window by its own hours (on the GPU, the same frame for the same
  hour). Daytime is unchanged.
- Red warning lights flash on the parapets of the tallest towers, and the tower's own mast flashes with them.
- A few soft clouds drift over the city, pink at dusk and grey-blue at night.

## v1.22.0

Tower 3D's city has a neighbourhood. No host restart, no config change, the renderer API is unchanged. Rebuild
Tower 3D (`npm run tower3d`) and reload it.

- West of the tower, between the ring road and the towers: about 35 gabled houses on two curved lanes, some with
  porches, a few lit at night; an L-block, a stepped tower and a water tower on braced legs; and trees along the ring
  road. Generated at load from constants (`exterior/neighbourhood.ts`), six draw calls in all.

## v1.21.2

The note you carry in Tower 3D stays steady while you turn. No host restart, no config change, the renderer API is
unchanged. Rebuild Tower 3D (`npm run tower3d`) and reload it.

- Turning the mouse with a draft in hand made the note flicker: it followed how fast you turned frame by frame, which
  mouse events make uneven, while your hands smoothed it. The note now eases with your hands.

## v1.21.1

Tower 3D's landing rugs show whole again. No host restart, no config change, the renderer API is unchanged. Rebuild
Tower 3D (`npm run tower3d`) and reload it.

- The rug before each floor's elevator, with the floor's number, ran under the first row's desk rugs, which were drawn
  over it. It now ends before them, its number a little smaller to fit.

## v1.21.0

The tower reads your quota while no session runs, Tower 3D starts under a loading screen, and fixes across both
renderers. **host restart**: a pty's read error no longer takes the host down (`tower down`, then `tower up`; sessions
can be resumed). **config**: a new key, `probes`. The renderer API moves to 1.44, additions. Rebuild Tower 3D
(`npm run tower3d`). The tower folds every log once on its first start (the fold's code changed).

- Probes: the tower reads the account's weekly and 5-hour quota every 10 minutes while no session reports it, through
  the sessions' own `argv` (`claude -p` with only a usage request: no prompt, $0), and keeps each answer in
  `~/.tower/streams/system/probe.quota/`. The board's rate limits, the weekly budget and its pace read sessions and
  probes alike, so the budget has no holes while you're away; `board.rateLimitsFrom` says which read is newest. On by
  default; `probes.quota.off` turns it off. `streams/projects/` is reserved for a project's own streams (decision
  `probes`, API 1.44).
- `tower.relay(frame, url, …)` in `tower.js` frames a shelf page with the board and the API; the tower page relays
  through it, and Tower 3D's `html` shelf entries now get the board and the API too (they got neither). API 1.43.
- Tower 3D starts under a loading screen, the elevator panel lighting a floor per stage, and compiles its shaders
  before the first draw: the half-loaded city and most of the start's freeze are gone (decision `tower3d-start`).
- Tower 3D: walls, glass and shut landing doors stop your aim, so a shelf behind a wall no longer offers its acts.
  Shadows stay on while the camera flies home from a panel. The ✕ closes a review thread and a logbook. Far
  skyline buildings leave out detail thinner than a pixel, so they flicker less as you walk.
- A pty's read error ends that session or shell, never the host or the terms daemon.
- The tower page holds the next wait's row in place in its short layout too.
- Workers: a bare `tower kept` gives each collection's count and its 5 latest items (`tower kept <collection>` lists
  all); `tower <verb> --help`; `tower thread` names the repos a note's anchors take. CI lists a pull request's own kb
  suspects as warnings.

## v1.20.1

Tower 3D's floor signs read at night again. No host restart, no config change, the renderer API is unchanged.
Rebuild Tower 3D (`npm run tower3d`) and reload it.

- With the lighting on, the night's bloom spread over each landing's floor sign (the level's number and the project's
  name) and washed the lettering out. Signs are printed plates, not lights, so they no longer bloom.

## v1.20.0

Tower 3D's new look: a procedural city and shell, and a sun that follows the clock. No host restart, no config change,
the renderer API is unchanged. Rebuild Tower 3D (`npm run tower3d`) and reload it.

- The city around the tower is generated at load: tiered towers with windows, bands, cornices and roof plant. The
  building's shell has capped mullions, panelled spandrels and a coped parapet, and its roof carries plant in steel
  and bronze. These replace the box city and the old shell.
- Lighting, a new setting in Tower 3D's settings popover, on by default: the sun follows the clock, casts shadows and
  sets the toon bands, the interior keeps its own ceiling light, contact shadows ground what stands on your level,
  and at night what glows blooms. It costs GPU time (the night overview takes 11.9 ms against 7.8 ms without it), so
  Off lights everything with Tower 3D's old even light. It is kept in `tower.store` and applies on reload; a fixture
  page takes `?lighting=off` (decision `tower3d-look`).
- Known: shadows can reappear late after a dialog closes.

## v1.19.0

Workers keep their callsigns, new workers don't repeat the name of one on duty, and 74 more names. No host restart, no
config change, the renderer API is unchanged. Restart the tower (`tower down tower && tower up tower`).

- A worker's callsign is read from its log: the `--name` its first session's Claude ran under. Changing `callsigns`
  (or the tower's list) names new workers only; no worker named since 2026-10-04 is renamed, running or past, and a
  name taken out of the list keeps naming the workers that ran under it. Logs from before then still derive theirs
  from the list. 18 sessions from 2026-10-04/05 get back the names they ran under (decision `callsign-from-log`).
- A new worker's session id is drawn until its callsign's name is one no worker on duty holds: spawns, worktree cuts
  and forking resumes, from the tower and from `tower spawn`/`tower resume`. Workers on duty together share a name
  only once every name is held (decision `callsign-free-name`).
- `CALLSIGNS` grows from 81 to 155 names: MYCROFT, ADLER, the Musketeers to keep ATHOS company, PHOBOS for DEIMOS,
  ROOK and EIFFEL for the tower, and more. With a list of your own in the config, nothing changes.

## v1.18.0

A worker's kills, keys and `tower submit` prompts are named in the target's log, and the next wait stays in view
on the tower page. No host restart, no config change. The renderer API moves to 1.42, an addition. Restart the
tower (`tower down tower && tower up tower`).

- `kill` and `keys` take `by`, the acting worker's session id. With it, the tower appends `tower.kill` before a
  running session's kill, and `tower.keys` once per burst (again when another worker types, or after a minute), to
  the target's log; the fold keeps them as `facts.killedBy` and `facts.keyedBy`. The user's kills and keys carry no
  `by` and are never named (decision `worker-acts`). `tower home`, `tower kill` and `tower submit` name their caller
  from `TOWER_SESSION_ID`, so a worker's `tower submit` no longer counts as the user's prompt in Stats.
- Tower page: the selected row holds still while any of it is in sight, so the worker N went to stays in view when
  rows above it grow; otherwise the top row holds, as before.
- `npm run sandbox -- up` writes the sandbox's config only when it has none, and `--port` updates an existing one:
  keys set by hand survive.
- Dead code removed (`scripts/migrate-tower.ts`, a pre-v1.0 migration) and `noUnusedLocals` on; AGENTS.md lists
  the `live`, `keep`, `kept` and `read` verbs and the `keys` config key.

## v1.17.0

Hiring limits hold when a worker hires several at once, ⌥← / ⌥→ move by word in shells, and a round of small
failure paths closed. No host restart, no config change. The renderer API moves to 1.41, an addition. Restart the
tower (`tower down tower && tower up tower`) and run `npm ci` where you develop: esbuild and tsx moved to runtime
dependencies. A checkout's `tower` CLI asks the tower for hiring limits from now on, so restart the tower before the
next `tower hire`.

- The tower enforces the floor's `hiring` limits: `spawn` takes `hire: true` (with `by`), weighs it against every
  card, logs `tower.hire` in the hirer's log and counts it before the hirer's next hire is weighed. Parallel
  `tower hire` calls from one worker no longer all pass. A hire past the limits answers the new error `limited`
  (409). `tower review` is still never limited.
- ⌥← / ⌥→ in a browser terminal send readline's `ESC b` / `ESC f` (new keymap commands `word-left`, `word-right`,
  rebindable in `keys`): a shell moves by word instead of printing `D` / `C`, and Claude's prompt still does.
- `review/append` refuses a body that leaves a code fence open, which hid every later note in the thread.
- `marked` 18.1.0 (from 16.4.2): rendered markdown unchanged.
- Small failure paths: an unwatch waits for its watch, so no stream or terminal count is left open; a malformed `%`
  answers 400 and a directory under a shelf entry 404; one unreadable origin no longer fails `/origins` for every
  project; a repo without an origin can have its forks removed; `/stats` reads paths whatever `core.quotepath` says;
  `tower doctor` fails on git older than 2.38; a request the host or terms daemon leaves unanswered fails after 30 s,
  naming the daemon; a let-go session's tail closes; `@lydell/node-pty` is pinned exactly.

## v1.16.0

A worker's subagents, forks included, are on the board one by one: what each is, its task, whether it still runs,
and its tokens. No host restart, no config change. The renderer API moves to 1.40, an addition. Restart the tower
(`tower down tower && tower up tower`) and rebuild Tower 3D (`npm run tower3d`) where it is built. The mod changed:
each Claude reads it as it starts, so a worker already running is followed from its next resume.

- The mod posts `agent.spawn` once Claude started the subagent, with the `agentId` its loop's events carry. The
  bridge folds each into `facts.subagentRuns`: type, description, background, parent, model, start, its steps'
  tokens, and how its last turn ended (`answer`, or `aborted` when TaskStop stopped it). Cards carry the followed
  ones as `subagentRuns`, each `running` while its loop is mid-turn in a live session; `subagents` still counts
  them all.
- The tower page draws the running ones under their worker in the sidebar, a fork marked as the worker's twin; one
  that ends fades out. The worker's details list every run with its tokens. Tower 3D seats a running fork in a
  second chair at its worker's right, in the worker's look; the minis on a desk are now the subagents running, no
  longer every one the session started.
- `/cards.js` adds `satellitesOf`, `subagentTitle`, `subagentEnd`, `subagentTokens`, `tokenCount` and
  `SUBAGENT_FADE_MS`, for any renderer.

## v1.15.2

Claude Code 2.1.296 is tested: the board and `tower doctor` no longer flag it. It asks nothing of you: no host
restart, no config change. Restart the tower (`tower down tower && tower up tower`) to clear the notice.

- Every scenario of the fixture set recorded from Claude was recorded again on it and read the same as before
  (runbook `new-claude-release`): no event or field the bridge reads was renamed or lost. The surfaces no fixture
  covers were checked by hand: long prompts through `submit`, the peer registry, resume, the trust and sign-in
  screens, and the fullscreen TUI.

## v1.15.1

A review thread's new notes are new to whoever's view you're looking at. It asks nothing of you: no host restart, no
config change. The renderer API moves to 1.39, an addition. Restart the tower (`tower down tower && tower up tower`)
and rebuild Tower 3D (`npm run tower3d`) where it is built.

- An author and its reviewer take turns on one thread: in the reviewer's view, the author's notes since the
  reviewer's last are new; in the author's, the reviewer's are. Tower 3D's reviewer desk marked what was new to the
  author; it now reads as the reviewer, as the tower page does. The floor's pigeonhole reads as the worker on duty in
  that checkout. Tower 3D's Reviews tab finds anchors in the desk worker's own Changes.
- Both renderers build the Reviews view with one shared builder (`threadViewOf`, `cardThread`, `floorThread` in
  `/panels.js`; `sendTarget` in `/cards.js`).

## v1.15.0

**Host restart.** Workers the host cut off carry on, and the host and terms daemons never die on bad input. No config
change; the renderer API moves to 1.38, an addition. Restart the tower (`tower down tower && tower up tower`) and
rebuild Tower 3D (`npm run tower3d`) where it is built. The host and terms fixes take effect when you restart them
(`tower down`, then `tower up`), which ends every running session and shell; each session can be resumed, and those
cut off mid-turn now say so.

- A worker that was mid-turn (working, compacting or asking permission) when the host stopped reads "stopped
  mid-turn" (or "lost mid-turn"), and offers **Carry on** beside Resume: it resumes the conversation with "You were
  cut off mid-turn when the tower's host stopped. Carry on where you left off." The floor's Resume all carries on
  the cut-off workers and plainly resumes the rest, listing which is which. `tower resume <id> --carry-on` does the
  same. The board carries `card.cutOff`, and `resume` takes an optional `prompt`.
- The host's sockets and the terms daemon's answer input that isn't a JSON object, or a message they don't know,
  with an error and keep serving; one such message used to end every session (or every shell).
- Terminal sizes are whole numbers from 1 to 1000: a fractional or huge size used to end the terms daemon, or break
  a session's screen for good.
- A write or resize the terminal refuses is not logged, and letting a worker go cuts a line a dead host left half
  written instead of turning it into a line that isn't JSON.

## v1.14.1

Finished sessions' screens open at once too. It asks nothing of you: no host restart, no config change, no API change.
Restart the tower (`tower down tower && tower up tower`).

- A session that has ended has a last frame that never changes: the tower computes it once and keeps it in memory
  (the last 500), so reopening one takes milliseconds where a long log took a third of a second each time. Nothing is
  stored.

## v1.14.0

Screens open at once. It asks nothing of you: no host restart, no config change, no API change. Restart the tower
(`tower down tower && tower up tower`).

- A running session's screen is one live mirror in the tower, shared by everyone watching it: the first viewer builds
  it from the log, later viewers are sent its screen in milliseconds instead of a replay of the whole log, and it is
  kept 30 s after its last viewer leaves, so switching back or reconnecting finds it built. Tower 3D, which opens a
  screen per monitor, reloads in a few milliseconds where it took about a second on a busy floor. Nothing is stored.
- A session with more than ~50 MB of output opens its screen: its replay used to be cut short by the terminal.

## v1.13.1

The tower stays up through rare failures. It asks nothing of you: no host restart, no config change, no API change.
Restart the tower (`tower down tower && tower up tower`); its first start refolds every log's checkpoint once.

- A screen or shell that fails to open answers the viewer with an error; it used to end the tower moments later.
- A poll or a watcher that fails says so in `tower.log` and runs again on the next tick or change. A watch of the
  sessions, collections or config directory that fails ends the tower with the reason, instead of serving a board
  that no longer moves.
- A reply from the host or the terms daemon that isn't JSON fails that one request.
- A prompt from a worker (`tower hire`, `send`, `review`) on a host too old to record who sent it is refused before
  anything is typed.
- A log line that isn't JSON (a write cut short) marks its session broken, as decision `broken-logs` says; it used to
  end the tower, and again on every start.
- A viewer that stops reading (a suspended tab, a frozen web view) is closed after 30 s of reading nothing, or once
  64 MB wait for it, and reconnects from fresh snapshots; a board viewer behind is sent the newest board. The tower
  used to queue everything for it, without limit.

## v1.13.0

The tower's git can't lose your work. It asks nothing of you: no host restart, no config change. The renderer API
moves to 1.37, an addition. Restart the tower (`tower down tower && tower up tower`) and rebuild Tower 3D (`npm run
tower3d`) where it is built.

- New files count as uncommitted whatever your git config says: with `status.showUntrackedFiles=no`, a worktree
  holding only new files read clean, and Tidy or Remove deleted them. Every git call the tower makes now pins the
  config that changes what it reads.
- A branch is deleted only at the commit the tower judged it by: one that moved since (a commit made in between) is
  kept, and the reply names it. Remove, Prune, Delete and Discard answer `kept`, and Tidy lists such branches as
  skipped; both renderers say so in their toast.
- The tower deletes only branches it cut (a `towerBase` record). A worktree made by hand under `.worktrees/` loses
  only its folder, never its branch.
- Every git call stops past a timeout (60 s; 10 min for writing or removing a whole worktree), its hooks with it: a
  hung hook or fsmonitor fails one verb and names it, instead of holding every verb on every floor.

## v1.12.0

Changes compares one slice of a worker's work, and every pull request is checked. It asks nothing of you: no host
restart, no config change. The renderer API moves to 1.36, an addition. Restart the tower (`tower down tower && tower
up tower`) and rebuild Tower 3D (`npm run tower3d`) where it is built. Thanks to Carlos Bonetti (#5).

- Changes has a compare picker in its head, on the tower page and on Tower 3D's desk panel: All changes since the
  base (as before), Uncommitted, or one commit since the base, newest first. It shows while a repo has commits since
  its base. Viewed marks are kept per scope; notes are picked on All and Uncommitted, never on a commit.
- `GET /changes/<id>?scope=all|uncommitted|<commit>`: each repo carries its `commits` since the base and `shows`,
  the scope it drew.
- CI runs on every pull request and on main: the release's checks, then a clean tree and `kb verify`. The served
  modules' test now fails on any change to `test/served-exports.json` instead of rewriting it; `npm run
  served:update` writes it.

## v1.11.2

Tower 3D takes the mouse in Tower.app. It asks nothing of you: no host restart, no config change, no API change, and
the tower needs no restart. If you use the app, quit it (⌘Q) and run `tower app` again.

- A click in Tower 3D, opened in the app's window or framed on its shelf, locks the mouse for walking and looking.
  WebKit gives pointer lock to a page only when the app hosting it grants it, and the app now does; until then every
  click said "Pointer lock requires the window to have focus".

## v1.11.1

Tower.app starts nothing. It asks nothing of you: no host restart, no config change, no API change, and the tower
needs no restart. If you use the app, quit it (⌘Q) and run `tower app` again.

- Start the system from a terminal with `tower up`, as without the app; then `tower app` shows it. Opened with the
  system down, the window says what to run and opens the tower by itself once it answers. Started by the app, the
  daemons and every session under them asked macOS for Documents, Desktop and Downloads in the app's name, again
  after each rebuild; started from a terminal, they stay the terminal's.

## v1.11.0

The tower as a Mac app, opt-in beside the browser, and typing an apostrophe on a dead-key layout in Safari. It asks
nothing of you: no host restart, no config change, no API change. Restart the tower (`tower down tower && tower up
tower`) and rebuild Tower 3D (`npm run tower3d`) where it is built. Thanks to Carlos Bonetti (#4).

- `tower app` builds `apps/macos` from your checkout (it needs the Swift compiler: `xcode-select --install`) and
  opens it: the tower in a window of its own, which starts the system as `tower up` does and shows who waits on you
  on its Dock icon, in notifications and in the menu bar, in the tower page's words and less the waits you
  dismissed. Quitting it leaves the system running. A sandbox's config gets an app of its own. The browser stays
  the default and nothing changes if you never run it.
- macOS holds whatever starts the daemons responsible for their access to Documents, Desktop and Downloads, and
  takes a rebuilt app for a new one, so it asks again after each rebuild. If your repos live there, run `tower up`
  from a terminal first: the app then shows the system it finds, and the grants stay the terminal's.
- In Safari (and the app), on a layout whose apostrophe is a dead key (Brazilian, US International), `user's` typed
  into a terminal arrived as `user'`: WebKit reports the dead key and the next one as a single key. Both renderers
  and the docked shells now type both. Chrome was never affected.
- The release checks that the app's Swift sources compile.

## v1.10.0

Marking a file Viewed in the Changes view keeps your place. It asks nothing of you: no host restart, no config change
(API 1.34 → 1.35, additions only). Restart the tower (`tower down tower && tower up tower`) and rebuild Tower 3D
(`npm run tower3d`) where it is built. Thanks to Carlos Bonetti (#3).

- Marking a file Viewed, or folding it by its caret, while you read inside its diff (its header stuck under the
  panel's head) scrolls back to that file's header, so the next file follows right below. The scroll used to stay
  put, leaving you as far past the next file as the fold took away. A file whose header was not stuck does not move.
  Both renderers.
- `/panels.js` serves `keepingFileTop(el, key, write)`, for a renderer's own Changes panel (API 1.35).

## v1.9.0

**host restart.** Sessions and shells no longer inherit the terminal `tower up` was run from. No config change, no
API change. Restart everything (`tower down`, then `tower up`): it ends every session and shell, and sessions can be
resumed.

- A session's and a shell's environment drop the launching terminal's identity: `TERM_PROGRAM`,
  `TERM_PROGRAM_VERSION`, `VSCODE_*`, `CURSOR_*`, `ITERM_*`, `GHOSTTY_*`, `KITTY_*`, `WEZTERM_*`, `TMUX` and the like.
  Started from VS Code's or Cursor's terminal, every Claude believed it ran in an editor's xterm.js and scrolled for
  one: a flick moved many times its travel and the last ~30 rows eased in after the wheel stopped. Now the transcript
  follows the wheel about one to one and stops when it stops, and `/scroll-speed` matters little. `GIT_ASKPASS` goes
  with `VSCODE_*` (it reaches the running editor through them): git in a session falls back to your credential
  helper. The config's `env` can set any of these again.

## v1.8.0

Scrolling a session's terminal follows your mouse and trackpad. It asks nothing of you: no host restart, no config
change (API 1.33 → 1.34, additions only). Restart the tower (`tower down tower && tower up tower`) and rebuild Tower
3D (`npm run tower3d`) where it is built.

- A session's terminal sends the wheel to Claude itself, in both renderers: one wheel report per row your finger
  travels, at the terminal's own row height, the remainder carried to the next event. xterm.js sent one report per
  wheel event however far it went and damped a trackpad's small movements, so a flick reached Claude as about a
  quarter of its travel and a slow stroke started late and stopped early. Claude's `/scroll-speed` now scales the
  travel, from your finger's: leave it on auto or set it to taste. A shell's terminal keeps xterm's wheel.
- `/terminal.js` serves `reportWheel(term, send)`, for a renderer's own Claude terminals (API 1.34).

## v1.7.0

The Changes panel marks the words an edited line changed, as GitHub does. It asks nothing of you: no host restart, no
config change (API 1.32 → 1.33, additions only). Run `npm ci` (a new dependency, `diff`), restart the tower
(`tower down tower && tower up tower`) and rebuild Tower 3D (`npm run tower3d`) where it is built.

- Word marks, in both layouts and both renderers (PR #2 by @CarlosBonetti). Each removed line and the added line
  `splitRows` sets beside it are diffed by token with jsdiff (`diff` 9, BSD-3), and the changed words are marked over
  the syntax colours. A pair sharing less than half its characters (`WORDS_ALIKE`) reads as rewritten, and lines over
  1000 characters (`WORDS_LONGEST`) as data: neither is marked. The diff gives up past `WORDS_EDITS` tokens changed,
  so a large rewrite costs little.
- New tokens `addedWord` and `removedWord` in both schemes; a few syntax colours moved one step and the dark line
  washes are slightly darker, every pair still at AA.
- `/panels.js` serves `wordRanges`, `markRanges`, `WORDS_ALIKE`, `WORDS_EDITS` and `WORDS_LONGEST` (API 1.33).

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
