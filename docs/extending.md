# Extending the tower

The tower keeps its whole state outside its code: the config (what you want), the session logs (what happened) and
the collections (files kept for later). Its API does the work, and the modules it serves are a convenience on top.
So there is no plugin API into a renderer. You extend the tower by editing the config, by writing clients of the API (a
renderer, a shelf page, a script), by reading its files, and, for what must run inside the tower, by an extension.

This guide is for you and your workers alike. A worker asked to customize the tower or build a renderer reads it
first.

## What you can build on

| Point | For | Its contract |
|---|---|---|
| [The config](#the-config) | floors, shelves, collections, editor, callsigns, hiring, worktrees, how sessions start | [config.md](config.md), checked by `tower config check` |
| [Renderers](#your-own-renderer) | your own view of the whole system, or your own version of one that ships | served at `/r/<name>/`, the API through `/tower.js` |
| [Shelf pages](#shelf-pages) | a page beside a floor's sessions, with the board and the API | `/tower.js`, relayed by the renderer that frames it |
| [The API](#the-api) | anything a renderer, a script or a cron job does | verbs, reads and streams, versioned `major.minor`, `/schema` |
| [Served modules](#served-modules) | what the tower's own renderers draw alike, for yours to import | the API's version: removing an export is a major |
| [Collections](#collections) | your own kinds of files, kept per floor | files; what they mean is yours |
| [Extensions](#extensions) | code the tower starts and stops beside its own pieces | `extension.json`, versioned with the API, `extension` at `/schema` |
| [Claude plugins](#claude-plugins) | your commands and skills in every session the tower starts | config `plugins` |
| [The `tower` command](#the-tower-command) | the system from a shell, for you and your workers | `tower` with no verb lists them |
| [The logs](#the-logs) | everything that happened, to read | JSONL, written only by the host |

## The config

`~/.tower/config.json` says what you want: the floors and their directories, each floor's shelf and collections,
your editor, the callsigns workers are called by, how far hires go, how worktrees are cut, and the command and
environment every session starts with. [config.md](config.md) documents every key. The tower reads the file again
on every change, `port` aside.

```json
{ "editor": { "window": ["zed", "{dir}"], "open": ["zed", "{path}"], "goto": ["zed", "{path}:{line}"] } }
```

Check every edit with `tower config check`: it reads the config as the tower does and prints each problem at its
key path.

## Your own renderer

A renderer is a directory of built files. Declare it under `renderers` and the tower serves it at `/r/<name>/`, at
the tower's origin, so it calls the API directly. `renderer` names the one `/` opens.

```json
{
  "renderers": { "mine": { "root": "/Users/you/code/my-tower", "settings": { "badge": "mine" } } },
  "renderer": "mine"
}
```

- `root` is an absolute directory, outside the tower's checkout. `entry` is its page, `index.html` unless set.
  Anything below `root` is served with it, nothing above.
- `settings` is your renderer's own configuration. The tower passes it through unread; your page reads it with
  `await tower.renderer()`, which answers `{ name, root, entry, available, settings }`.
- A renderer is available while its entry exists. `GET /renderers` lists every one, and the tower page lists them at
  the foot of its sidebar.
- A name the core declares (`page`, `week`, `tower3d`) overrides that renderer's fields: `{ "tower3d": { "settings": … } }`
  keeps its root.

### A new one

Start from a page that includes `/tower.js`:

```html
<!doctype html>
<link rel="stylesheet" href="/design.css">
<ul id="floors"></ul>
<script src="/tower.js?v=1.3"></script>
<script type="module">
import { statusName } from '/cards.js'
tower.subscribe((board) => {
  document.getElementById('floors').innerHTML = board.floors
    .map((f) => `<li>${f.name}: ${f.cards.filter((c) => c.onDuty).map((c) => `${c.callsign} ${statusName(c)}`).join(', ')}</li>`)
    .join('')
})
</script>
```

`renderers/week/` in the checkout is a renderer of this kind grown up: The Week, two files and a stylesheet over
the board, `/stats` and the archives, with no build. Read it for a page that steps through windows of time and draws
the Stats numbers its own way.

The board is the whole system as one value, sent again whenever it changes: its type is `Board` in
`src/bridge/board.ts`, described as JSON Schema by `tower api board` (each event is `{v, board}`, not the board itself). Each card, conversation, floor, policy and offer carries `actions`, what can be done to it now, each a `verb`
with its `call` when it is a request of the API: `tower.run(card.actions.find((a) => a.verb === 'resume').call)`.
`verbs` and `calls` beside it say the same, apart (a policy and an offer carry `calls` only). `/tower.js` documents its every member in its header
(`curl http://127.0.0.1:4317/tower.js | head -60`).

**Pin the version you wrote against.** `/tower.js?v=1.3` refuses to load into a tower of another major or an older
minor: `window.tower` is never defined and the console says which versions met, in place of a page drawing a board
it misreads. A page that names no version
moves with the tower: right for the renderers in the checkout, wrong for yours. `tower.version` is the tower's full
version, for a feature check.

**Say when the board is stale.** `tower.onBoardError((err) => …)` is called whenever there is no live board, with
`err.code`: `config` or `internal` when the tower can't build it, `disconnected` (since 1.9) when the tower stopped
answering. `/tower.js` reconnects on its own, and the next board through `subscribe` means it recovered. Until then
the board you drew is how things stood: mark it so (`boardErrorTitle(code)` in `/cards.js` heads the message as the
shipped renderers do), and stop any clock you draw from it. A framed page gets the same error, relayed.

**Draw what can't run, and why.** The board leaves out `spawn`, `cut` and `shell` while the daemon they need is down;
`whyNot(board, verb)` in `/cards.js` says why in a sentence (`undefined` while it runs), for a control drawn inert
with that tip in place of one that vanishes. It answers `resume`, `carry-on`, `review` and `let-go` too, which the board still offers.

### A copy of one that ships

To change the tower page or Tower 3D, copy it out of the checkout and layer your changes on top of the copy. The
copy is disposable: you will throw it away and copy again for each release you take. What is yours lives beside it.

The tower page is two files, `renderers/page/index.html` and the module it loads beside it, `page.js`, and imports
everything else from the tower by absolute URL.

1. Make a directory of your own, outside the tower's checkout (`realpath $(which tower)` is
   `<checkout>/src/mod/bin/tower`), and keep it in git:

   ```sh
   mkdir ~/code/my-tower && cd ~/code/my-tower && git init
   cp <the tower's checkout>/renderers/page/index.html <the tower's checkout>/renderers/page/page.js .
   ```

2. Write your layer beside it, `mine.css` and `mine.js`:

   ```css
   .brand h1 { color: #e0115f; }
   .mine-badge { font: 700 var(--fs-xs)/1 var(--mono); padding: var(--sp-xs) var(--sp-s); border-radius: var(--radius); background: #e0115f; color: white; }
   ```

   ```js
   const { settings } = await tower.renderer()
   const badge = Object.assign(document.createElement('span'), { className: 'mine-badge', textContent: settings.badge ?? 'mine' })
   document.querySelector('.brand h1').after(badge)
   ```

3. Hook the layer into the copy, the only edit you make to it: a line before `</head>` and one before `</body>`.

   ```html
   <link rel="stylesheet" href="mine.css">
   <script type="module" src="mine.js"></script>
   ```

4. Declare it and make it the default, as in the config above, then `tower config check`. `/` now opens
   `/r/mine/`. No restart: the tower reads the config again.

Taking an update is then: copy both files again, add the two lines again. Keep that as a script in your repo:

```sh
cp <the tower's checkout>/renderers/page/index.html <the tower's checkout>/renderers/page/page.js . &&
perl -0pi -e 's#</head>#<link rel="stylesheet" href="mine.css">\n</head>#; s#</body>#<script type="module" src="mine.js"></script>\n</body>#' index.html
```

The layering advice that makes this work:

- **Override, don't edit.** Restyle through your own stylesheet, after the copy's: the design's tokens
  (`--ink`, `--panel`, `--accent`, `--radius`…) are custom properties you can redefine. Size text with the type
  scale (`--fs-xs` to `--fs-3xl`, in rem, so it follows the viewer's text size) and space it with the spacing scale
  (`--sp-2xs` to `--sp-3xl`); a small uppercase label is the `.eyebrow` class.
- **Touch what the copy leaves alone.** The copy redraws parts of the page as the board moves. Your module can add
  elements, listen to `tower.subscribe`, or call the API, but a value the copy sets (the page's title, a list it
  redraws) is overwritten on its next draw. A change there belongs in the copy itself: keep it small, and keep it as a
  patch you reapply.
- **Build on the API and the served modules,** not on the copy's internals. Its element ids and functions are not a
  contract; `/tower.js`, the board and the served modules are.

Outside the checkout, `tower update` never conflicts with your work, and your copy may move to any stack (a framework,
a bundler, another language) while still importing the served modules where they help.

Tower 3D is built from the checkout's sources: they import the core's TypeScript by relative path, and its build
runs the checkout's scripts. Copy it as a clone of the tower at the release you start from, kept apart from the
checkout that runs your tower: change `renderers/tower3d/` there in commits of your own, `npm ci`, `npm run tower3d`,
and declare `<the clone>/renderers/tower3d/out` as your renderer's root: it holds the pages, their bundles and the
models they fetch (`out/assets/`). Taking an update is checking out the new
tag and putting your commits on it.

## Shelf pages

A floor's shelf keeps pages beside its sessions ([config.md](config.md#shelf)). Three kinds are pages that can read
the board and drive the API:

| Entry | The page |
|---|---|
| `html` | a page in one of the floor's repos, a path relative to the hub, with the files beside and below it |
| `item` | a file kept in one of the floor's collections, `"<collection>/<id>"` |
| `renderer` | a declared renderer, by name, with its `settings` |

The tower page frames each one sandboxed, at an opaque origin, and relays the board and every API request over
`postMessage`: the page includes `/tower.js` and uses it as a renderer would. `tower.framed` is true there, and
`tower.ui('select', { id })`, `('home')` and `('shelf', { project, n })` move the tower page's own view. An `html` or
`item` page runs on its own at `/run/<project>/<n>`, a `renderer` at `/r/<name>/`, both at the tower's origin.
Framed, a `renderer` still reads every file below its root but the hidden ones (a path with a part starting with `.`, never served): the tower serves them with CORS, so it may `fetch` them
and import them as modules at its opaque origin. An `html` page framed reads the files beside it only as classic
scripts, stylesheets and images: shelf files are served without CORS, which would let any site read them, so a
`fetch` or a module import of them fails. A page that loads its own data or models is a `renderer`. The viewer's appearance follows the framing page: `tower.prefs.get()` and
`tower.prefs.on` read it, and `tower.prefs.set(patch)` asks the framing page to change it, for every page of the
viewer's. A `url` entry's frame gets the colour scheme alone, as `{t: 'scheme', scheme}`.

Relaying is `tower.relay`'s work, over the protocol in `src/shared/shelf-page.ts`. A renderer frames a page in an
iframe sandboxed without `allow-same-origin` and hands it to the relay with what is its own: the entry the page is, its
`select`, `home` and `shelf`, and what to do when the page sets a key in `tower.store`:

```js
const relay = tower.relay(frame, '/shelf/lab/0/index.html', {
  self: { project: 'lab', n: 0 },
  ui: { select: ({ id }) => openWorker(id), home: () => goHome(), shelf: ({ project, n }) => openShelf(project, n) },
  stored: (key) => reread(key),
})
relay.close() // when the frame goes
```

The tower page relays every page it frames; Tower 3D relays the `html` entries it frames, and opens a `renderer` entry
in the tower's own view when framed, else in a new tab.

## The API

Everything a renderer can do is an HTTP route on `http://127.0.0.1:<port>`:

- **Verbs**: `POST /<verb>` with a JSON body: `spawn`, `resume`, `submit`, `keys`, `kill`, `collection/create`,
  `review/append`, `tidy` and the rest. Every POST carries the header `origin: http://127.0.0.1:<port>`; without it
  the tower answers 403, its guard against other web pages.
- **Reads**: `GET /board` (SSE: `{v, board}`, again on every change), `/renderers`, `/stats`, `/changes/<id>` (`?scope=all`, the default, `uncommitted` or a commit),
  `/conversations/<id>`, `/archive/<project>`, `/reviews/<project>`, `/collection/<project>/<collection>/<item>`,
  `/probe/<name>` (`?last`: a probe's status as `board.probes` has it and its latest reads), `/runs/<project>`
  (`?policy&limit`: a policy's runs, newest first, each with its worker as it is now), `/landing?project&branch` (what
  landing changed on a branch: each commit landed as an edited copy, with `git range-diff`), `/origins`, `/patterns` (what users found doing with the tower, one story each, from the checkout's `docs/patterns/`), `/extensions` (the extensions the tower runs, none yet, and its resources as braided orders them: layers, start and halt order, dependents, and the graph as Mermaid text). `/stats?from&to&bucket&project` (epoch ms, `bucket` `hour` or `day`) answers `Stats` of
  `src/bridge/stats.ts`: a summary, a series per bucket and spend by hour of the day, for all and per project, each
  session's share of the window by its id (turns, spend, its longest turn and wait), the weekly budget, and the
  weekly limit as last read in the window (`weekly`), and the points of it used outside the tower in the window (`outside`: claude.ai, the desktop app, another machine, as the quota probe saw it climb while no session worked; the budget's `outside` is this week's, and what 1% buys leaves it out). `/archive/<project>` answers the floor's cards the board leaves out, the board's `Card` shape, so the
  workers of any past window are the board's cards and the archive's together.
- **Streams**: a session's screen, an interactive terminal, a shell (`screen/<id>`, `terminal/<id>`, `shell/<id>`),
  multiplexed on one connection, `GET /mux`.
- **Errors** are data: `{t: 'error', code, message}`. Branch on `code` (`invalid`, `not_found`, `refused`,
  `unavailable`…), never on `message`.

`GET /schema` serves every verb's input and reply, and the error, as JSON Schema, and every GET route as a read
(`reads`, keyed by name: its `path` with named params like `/screen/{id}`, its `kind`, `json`, `stream`, `page` or
`schema`, and its `query` as JSON Schema when it takes one): a renderer or a script in any
language learns the contract from the tower. `tower api` lists the verbs and the json reads, one line
each, and `tower api <name>` prints one's schema (a read's reply is typed in the module its route's line names). Every route is listed in the header of `src/tower/server.ts`.

The version is `major.minor`, the same on the board, `/schema` and `/tower.js`. An addition an older client reads past
moves the minor; a rename, a removal or a changed meaning moves the major, with a line in `CHANGELOG.md` saying what to
do. The tower makes a best effort to avoid majors.

**View state** (marks, a remembered tab, a viewer's preference) goes in `tower.store`: `tower.store.set(key, value)`,
`await tower.store.get(key)`. It lives in the viewer's browser under keys every page shares, the tower page
included, so the files you mark viewed in one renderer are viewed in the next. `tower.remember` and `tower.recall`
keep one value for the page alone.

**The viewer's appearance** is `tower.prefs`: the scheme, the text, heading and code faces (any face installed on the
viewer's computer, by name), the terminal's font size, motion, contrast and text size (`src/shared/prefs.ts`). `tower.js` keeps
it in the viewer's browser, shared by every tab and every page of theirs, and puts it on your page's root before it
paints: `data-scheme`, `data-motion`, `data-contrast`, the `--ui`, `--display` and `--mono` stacks, and `--scale`, the
root's font size as a factor of the browser's, which every rem size follows. A page that
links `/design.css` and draws with its variables follows it with no code. Read it with `tower.prefs.get()`, hear
changes with `tower.prefs.on(fn)`, change it with `tower.prefs.set({ mono: 'Fira Code' })`. A document you draw in a
frame without scripts takes it as `<html ${tower.prefs.attributes()}>`. A terminal draws in it through
`/terminal.js`. Offer its settings with `prefSections` and `wirePrefs` of `/settings.js`: a setting the tower adds
later reaches your popover with nothing to wire.

Which store, then: the **config** holds intent, the same in every browser (projects, the editor, the user's name); a
renderer's **`settings`** in the config hold that renderer's own art or behaviour (Tower 3D's cats); **`tower.prefs`**
holds how the viewer likes to read, across renderers; **`tower.store`** holds view state (marks, a remembered tab).

**Scripts and cron jobs are clients too.** Anything running as you may call every verb:

```sh
B=http://127.0.0.1:4317
curl -s -XPOST $B/spawn -H "origin: $B" -H 'content-type: application/json' \
  -d '{"project":"my-app","prompt":"Run the test suite and list the tests that fail."}'
curl -sN -m 2 $B/board | grep -m1 '^data:'      # the board, once: /board is a stream that never ends
```

## Served modules

The tower serves what its own renderers draw alike, for yours to import. Each is TypeScript from `src/shared`,
served as one ES module bundled with what it imports, readable from a framed page too:

| URL | What it holds |
|---|---|
| `/tower.js` | the client: the board, every verb and read, streams, `tower.store`, the viewer's appearance (`tower.prefs`) |
| `/design.css` | the design's tokens as custom properties (colours in both schemes, the type and spacing scales, corners), the faces, a few classes (`.needs`, `.pill`, `.eyebrow`…), and every button's pressed, held (`disabled`, `aria-disabled`) and busy (`aria-busy`) states |
| `/design.js` | the design module: palettes, type, the type and spacing scales (`size`, `space`), the terminal's theme, the sky by hour, a document's stylesheet |
| `/cards.js` | words about cards and floors, the spawn form, round-robin through waits, the ring and its sounds, why a verb can't run (`whyNot`) |
| `/panels.js` | the Changes, Reviews, Stats and Policies panels as pure views, their stylesheet, and the data attributes you wire; a read that failed (`failedHtml`, also each view's `failed`); the Stats panel's money, hours and durations as words (`usd`, `hours`, `duration`) |
| `/brief.js` | a worker's brief as a chat over `/conversations/<id>`: its stylesheet, what a viewer opened read back from the drawn html, copying a prompt or answer as written (`saidText`), and the viewer's rendered or raw choice in `tower.store` (`BRIEF_MARKDOWN_KEY`) |
| `/drafts.js` | editing a floor's `drafts` collection over the generic `collection/*` verbs, keeping a prompt the new-worker form closed on (`keepUnsent`), and putting a deleted draft back (`discard` answers what it deleted, `restore`) |
| `/items.js` | any collection's items as rows and trays (title, tag, who kept it, age), an item read by its type, and the question before deleting one |
| `/reviews.js` | the review threads' format: parse, append, anchors |
| `/icons.js` | the icons the tower's renderers draw |
| `/termkeys.js` | the editing keys every browser terminal sends, and the terminal's key handler over the keymap (`terminalKeymap`) |
| `/keymap.js` | every keyboard command as data with its name (`label`) and default chords; `commandOf` matches a keydown against `board.keys` (the config's `keys` over the defaults); chord labels, `aria-keyshortcuts` and the `?` sheet |
| `/terminal.js` | a browser terminal's face and size from the viewer's appearance, and the size a watched one fits its PTY at |
| `/prefs.js` | the viewer's appearance record, its defaults, and whether to move less (`reducedMotion`) |
| `/settings.js` | the settings popover as a pure view: the ring, its sounds, notifications, the brief rendered or raw, and the viewer's appearance drawn from data and wired by `wirePrefs` |
| `/tips.js` | the tooltip every renderer shows for `data-tip`, and the placing of popovers by their button |
| `/capabilities.js` | what the tower lets a user do as data (`CAPABILITIES`, each maybe naming a keymap command or a floor verb), the patterns' format (`parsePattern`, read at `/patterns`), and both laid out as tips (`tipsOf`, `tipAt`, dismissed by `tipKey`) |
| `/verb-words.js` | every verb the board offers in words, keyed `<subject>/<verb>` (`card/send-home`, `worktree/recut`): its `label`, `hint`, whether it asks first (`destructive`), the API verb its call makes (`api`, whose description and schema are at `/schema`) and the keymap command that does the same (`command`); `verbLabel(subject, verb)` |
| `/palette.js` | the command palette as data: `paletteEntries(ctx)` lists what a viewer can go to (workers on duty, floors, shelf entries, drafts), do (the keymap's global commands with their chords, what the selected worker, its conversations and processes and every floor offer) and learn (capabilities that name no command, and the patterns), each with a tagged `does` your renderer runs through its own handlers; `rankPalette(entries, query, rankingOf(ctx))` groups them for what was typed, by `matchScore` (a prefix over a word start over a substring over letters in order) and small boosts for the selected worker, its floor and recent picks (`WEIGHTS`) |
| `/press.js` | a control busy while what it asks is in flight (`pressing(control, request)`: `aria-busy` on it and on every control drawn with the same identity, a second press ignored), and a control's identity in html drawn anew (`identityOf`) |
| `/toasts.js` | toasts that stack, time out and may carry one action button (`toaster(element)` answers `toast(msg, { label, run })`), a polite live region, with their stylesheet (`toastsCss`) |
| `/markdown.js` | markdown as html: `markdownHtml` for words nobody vetted (raw HTML escaped, links in a tab of their own, fences highlighted with a copy button, safe in any element) drawn in an element of class `md` with `markdownCss`, `documentHtml` for a file in a frame without scripts, `safeHref`, and `fenceText` (a fence's code, to copy) |
| `/policies.js` | what renderers say and decide about policies: a rule and its slots in words (`ruleWords`, `slotWords`), where a policy stands (`standing`, `standingWords`), and the cron checks a policy file's header gets (`cronProblem`) |
| `/loop.js` | a machine as data: `loop` runs a map of handlers, `(state, event) -> effects`, the next state among them, through your executors of the rest; `timers()` executes timer effects, each carrying the event it fires |
| `/reads.js` | reads a viewer holds (`Held`): the last read held until the next lands, a read overtaken landing on nothing, a failure shown only while nothing is held; the steps, and `heldHandlers` and `reading` to run them on `loop`. `/panels.js` runs them for review threads (`threadWant`, `heldThread`, `readThread`) and a worker's Changes (`changesHandlers`, `readChanges`) |
| `/term-view.js` | a terminal a viewer has open on a PTY, as a machine on `loop`: `termHandlers` its steps (opening, watching, owning, exited), and `mountTermView(host, { Terminal, FitAddon }, io)` running it in xterm.js on a `terminal/<id>`, `screen/<id>` or `shell/<id>` stream. The PTY has one size: a terminal opened while nobody else views it takes the size (a shell's always), a resize from anyone else hands it back and the view follows at a font that fits, typing takes it again, and a pane or font change fits the PTY only while this viewer holds it |
| `/viewer.js` | what a viewer keeps in `tower.store` that every renderer reads alike, as one record (`Viewer`): dismissals, the ring, the brief rendered or raw, the diff layout, unfolded crews and the Stats range, read whole by `readViewer(tower.store.get)`, each under its key in `VIEWER_KEYS` |
| `/spawn.js` | the new-worker dialog as a machine on `loop`: `spawnHandlers` its steps (open, editing, starting, closed), and `wireSpawn(dialog, io)` running it in your `<dialog>` with the form of `/cards.js`, keeping a prompt it closes on as a draft (`keepUnsent`) and handing you the worker it started |
| `/attend.js` | what a viewer is told about the waits and offers asking for them, as a machine on `loop`: `attendHandlers` over the state `attending(eye)`, or `attendNext(state, event)` to run one event by hand. What the viewer looks at reaches it as events: the window's `focus` and `visible`, and `watch` with the worker their view is on (`watchedIn(state)` is the one they watch: the view's, while the window has their eye): what begins is said (`announce`), notified (`notify`, `unnotify` once over or dismissed) and rung (`sound`, a score of `SOUNDS` in `/cards.js`), a `remind` ring re-armed as a timer, dismissals and the ring setting kept (`keep`, a field of the viewer's record of `/viewer.js`, fed back as `stored` when read again); your executors play, notify and keep, or drop what you don't do |

Draw Claude's answers, prompts and anything a worker wrote with `markdownHtml`, never with a markdown library's own
`parse`: those words can carry what a web page Claude read put in them, and your renderer runs at the tower's origin,
which holds every verb. `documentHtml` keeps a file's raw HTML as written, its links and scripts included (only markdown links are checked), so
frame its html without `allow-scripts`.

A renderer that draws any shared view installs the shared tooltip once, `watchTips(document)` from `/tips.js`: the
views explain their controls with `data-tip` (the Stats bars their readouts), and the settings popover stays hidden
until it is placed.

They are part of the API's contract. Removing or renaming an export, a `tower` member, a token or a class is a
major, with a line in `CHANGELOG.md` saying what to use instead; adding one is a minor. They change, versioned and
announced, but are not frozen. A name on its way out stays, marked `@deprecated` in its source with what replaces it
(`RING_MARK` and `RING_NAME` in `/cards.js`), until a major removes it. `test/served-exports.json` lists every name they serve today, and `npm test` holds the
tower to it: any difference fails, and `npm run served:update` rewrites the list for a change you meant (commit it).

The tower also serves the libraries its own page uses (`/xterm.js`, `/xterm.css`, `/addon-fit.js`, `/marked.js`) at
the version it depends on. Those are the libraries' APIs, outside the contract: vendor your own copy when you need
one to stay put.

## Collections

A collection is a kind of file a floor keeps, declared in the config with a `label` and a `description` of what it is
for, every floor's at the top level, one floor's under its project:

```json
{ "collections": { "notes": { "label": "Notes", "description": "What we learned, one markdown file per topic." } } }
```

Items are plain files at `collections/<project>/<collection>/<item>` in the system root, in any format. The tower
lists them on the board (metadata only), reads them (`tower.text('collection/<p>/<c>/<item>')`), and creates, writes and
deletes them (`collection/create`, `collection/write`, `collection/delete`), and puts a deleted one back under its id
(`collection/restore`, an undo). What a file means is your renderer's
business: the tower page reads `drafts` as prompts and Tower 3D plays `games` in an arcade, over the same verbs.
`/items.js` lists and reads any collection without a meaning, as the tower page's trays do.
Workers add with `tower keep <collection>`. Two ids mean something to the core: `reviews`, written only through
`review/append`; and `policies`, standing work the tower runs at its slots: the board carries each floor's
`policies` (parsed, with where each stands) and `board.offers`, `/policies.js` says rules and slots in words and
where a policy stands (`standingWords`), and `policy/run`, `policy/pass` and `policy/approve` write its facts.
An [extension](#extensions) may declare collections of its own; one it owns carries `owner` and `doors` on the board,
and refuses the generic writes, naming the verb to use instead.

## Extensions

An extension is a folder holding `extension.json`, its manifest, and optionally the server module it names, whose
default export is `start(ctx)`. The config adds one by its absolute folder ([config.md](config.md#extensions)); the
tower reads every manifest before any code runs, refuses what can't load, and starts the rest beside its own pieces,
restarting one when its config entry changes. A restart imports the server module afresh, but not the modules it
imports: after editing one of those, restart the tower (`tower down tower`, then `tower up tower`). `tower extensions` and `GET /extensions` say how each stands.

```json
{
  "id": "pulse",
  "version": "1.0",
  "title": "Pulse",
  "requires": { "tower": "1.82", "chime": "1.0" },
  "server": "server.ts",
  "settings": { "type": "object", "properties": { "every": { "type": "integer", "default": 60000 } } },
  "verbs": {
    "ping": {
      "input": { "type": "object", "required": ["project"], "properties": { "project": { "type": "string" } } },
      "reply": { "type": "object" },
      "scope": "project",
      "words": { "label": "Ping", "hint": "rings chime for the floor" }
    }
  },
  "reads": {
    "beats/<project>": { "reply": { "type": "object" }, "scope": "project" }
  }
}
```

```ts
import type { Start } from '<tower>/src/shared/extensions.ts'

const start: Start = (ctx) => {
  const { every } = ctx.settings as { every: number }
  ctx.every(every, () => ctx.log('pulse'))
  return {
    verbs: { ping: async ({ project }, call) => ({ project, chimed: await call.deps.chime!.ring({}) }) },
    reads: { 'beats/<project>': ({ params }) => ({ project: params.project, every }) },
    halt: () => ctx.log('halted'),
  }
}
export default start
```

The manifest is strict: a key this tower doesn't know refuses the extension, so declare in `requires.tower` the API
version of the newest key you use. `start` returns a handler for every verb and read the manifest declares, and
nothing else, a `parse` per collection or a `reduce` per stream it declares, and `halt`. Its `ctx` holds who it is, its settings (and a floor's, `settingsOf`), whether it is on on a
floor (`on`), timers cleared at halt (`every`), the tower's log (`log`), a `signal` aborted at halt, the `board`, its
calls, and its stores. The manifest's keys, the ctx members and the problem codes are part of the contract, held like
the served modules: removing one is a major. Folds and triggers are not extension points yet; they arrive as minors.

**Verbs and reads.** Each verb's `input` and `reply`, and each read's `query` and `reply`, is a JSON Schema the tower
parses with, as it parses its own: a verb is `POST /<capability>/<verb>`, a read `GET /<capability>/<path>` (its
`<param>`s from the path, its query values strings), and both are listed at `/schema`. A `project`-scoped verb's input
requires `project`, a project-scoped read names it as a `<project>` param or in its query, and either is refused on a
floor where the capability is off. A handler that throws, or answers off its reply schema, fails that call as
`internal` and lists a problem on the extension; to refuse, it answers an error, `{t: 'error', code, message}`. A
verb or read can be `deprecated` (`since`, `use`, `why`): its HTTP answers carry `Deprecation` and a `Link` to `use`.
`tower x` lists every running extension's verbs, and `tower x <capability> <verb> '<json>'` calls one.

**Calls.** `ctx.call('tower/spawn', input)` and `ctx.read('tower/conversations/<id>', params, query)` take qualified
names, the core's under `tower/`, and reach the core, the extension itself, and what it `requires` or `wants`;
anything else is refused until declared. `ctx.deps.<capability>` holds the same calls as functions, one per verb and
`read[<path>]` per read, `undefined` while a wanted one doesn't run. Each answers the reply, or an error as a value.
A handler's second argument is its `ctx` with the `caller` (`{t, id?, via, within}`: the user, a worker, the tower, or
the extension itself from its `start` and timers), and the calls it makes carry that caller one step deeper, its verb
added to `within`; past 8 deep a call is refused.

**Stores** (API 1.83) are declared in the manifest and named by the capability. `collections` join the floors the
extension is on, each named `<cap>` or `<cap>.<name>`; one marked `owned` declares five `doors` (`list`, `read`,
`create`, `edit`, `delete`, each a verb or read of its own manifest, not deprecated, or a read of the core's such as
`tower/board`, or `{ "none": "<why the domain has no such act>" }`), and the generic writes (`collection/*`, `tower
keep`) are refused there, naming its create door. `streams` live at `streams/{system|projects/<p>}/<cap>.<name>/`,
each with a `scope` and its fact codes (one letter each, with a schema); only the extension appends to them. `facts`
are session facts logged as `tower.x.<cap>.<name>`. `ctx.streams.append`, `ctx.facts.append` and `ctx.collections`
write them, each checked by its schema; `ctx.streams.read` reads a stream over a window; `ctx.own` reads what the
tower folds of them: a stream's `reduce` state, a collection's items with their `parse`, and a session's facts over
its lineage, all read-only. A `reduce`'s `step` gets the state frozen and returns a new one; a step that throws stops
the fold before that fact, and an item whose `parse` throws is held with `parsed` undefined until it changes, each
said in the tower's log.

## Claude plugins

`plugins`, at the top level or under a project, lists absolute plugin directories every session the tower starts
loads, each passed to Claude as `--plugin-dir`. Your commands and skills live in one plugin outside your repos and
reach every worker as `/<plugin>:<command>`. A changed plugin reaches the next session started.

```json
{ "plugins": ["/Users/you/code/my-workflow"] }
```

## The `tower` command

`tower` is on the PATH of every session the tower runs (`npm link` puts it on yours). The user's verbs start and stop
the system and drive sessions (`up`, `down`, `spawn`, `submit`, `kill`, `ls`…); the workers' verbs read the board and
act on it (`whoami`, `agents`, `show`, `keep`, `hire`, `note`, `api`…), and `tower x` calls the extensions' verbs. It
is a client of the same API: what it does, a script does with curl, and it claims its caller in headers
(`tower-client: cli`, and a worker's `tower-session`), which a request without them is the user's. `tower` alone, or an unknown verb, lists every verb.

## The logs

`~/.tower/sessions/<id>.jsonl` is everything that happened in a session: a header line (the session, and its `runtime`,
`claude`, absent from the logs of older hosts), then `[t, code, data]` events, `t` in seconds since it started: `o`
output, `i` input, `r` resize, `h` a hook or mod event, `x` its exit (`exitCode`, and `signal` when a signal it
didn't catch ended it). An archived log is `<id>.jsonl.gz`, the same lines gzipped. Read them with anything:

```sh
tail -n +2 ~/.tower/sessions/<id>.jsonl | jq -c 'select(.[1] == "h") | .[2].hook_event_name'
```

Only the host writes them. Everything the tower shows is computed from them, the config and the collections.

## What is not an extension point

- **The host** (`src/host`). It owns every session's terminal, and changing it ends every running session. It stays
  small and knows no Claude flags; what sessions start with is the config's `argv`, `env` and `plugins`.
- **Writing to the logs.** A log holds facts the host observed. A line written by anyone else is a fact that never
  happened, and every view computed from it inherits the lie. Keep your own data in a collection.
- **Editing the checkout's renderers in place.** `tower update` moves the checkout to the next release, so your edits
  conflict with it, and the renderers there move with the tower, unpinned. Copy one out instead.

Going fully custom against the API is supported: a renderer in any stack, a script, a daemon of your own. The tower
keeps its contract (the API, `/tower.js` and the served modules, versioned as above); it takes no responsibility for
keeping every copy working across changes beyond it.
