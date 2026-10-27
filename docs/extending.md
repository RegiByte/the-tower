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

Every page the tower frames forwards the tower's global keys (⌘K, Escape, the pane chords), with nothing to add:
`/tower.js` sends them, and the tower appends `/frame-keys.js`, which sends keys and nothing else, to every html file
it serves sandboxed. A key one of the page's handlers took stays in the page, as does typing in a field: a page that
handles a key (Escape closing its own dialog) calls `preventDefault` to keep it. A renderer that frames pages hears
them as `{ t: 'key' }` messages and runs a global command (`frameCommandOf`, `/keymap.js`) only for one from the frame
holding focus; a remote `url` page forwards nothing.

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
  `tidy` and the rest, and the extensions' verbs by their names (`reviews/append`). Every POST carries the header `origin: http://127.0.0.1:<port>`; without it
  the tower answers 403, its guard against other web pages.
- **Reads**: `GET /board` (SSE: `{v, board}`, again on every change), `/renderers`, `/stats`, `/changes/<id>` (`?scope=all`, the default, `uncommitted` or a commit),
  `/conversations/<id>`, `/archive/<project>`, `/collection/<project>/<collection>/<item>`, `/reviews/<project>`
  (deprecated since 1.93: the reviews extension's `/reviews/history/<project>`),
  `/probe/<name>` (deprecated since 1.90: the quota extension's `/quota/reads` and the board's `x.quota`), `/runs/<project>`
  (deprecated since 1.91: the policies extension's `/policies/runs/<project>?policy&limit`, a policy's runs, newest
  first, each with its worker as it is now), `/landing?project&branch` (what
  landing changed on a branch: each commit landed as an edited copy, with `git range-diff`), `/origins`, `/patterns` (what users found doing with the tower, one story each, from the checkout's `docs/patterns/`), `/extensions` (the extensions the tower runs, none yet, and its resources as braided orders them: layers, start and halt order, dependents, and the graph as Mermaid text; the chain around each verb or hook, each hook's answerers, and the verbs the core's composites call). `/stats?from&to&bucket&project` (epoch ms, `bucket` `hour` or `day`) answers `Stats` of
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
| `/x/drafts/drafts.js` | the bundled drafts extension's client: editing a floor's drafts over the generic `collection/*` verbs, the floor's drafts collection while the extension is on there (`draftsOf`), keeping a prompt the new-worker form closed on (`keepUnsent`), and putting a deleted draft back (`discard` answers what it deleted, `restore`). `/drafts.js` serves it too, deprecated, until 2.0 |
| `/items.js` | any collection's items as rows and trays (title, tag, who kept it, age), an item read by its type, and the question before deleting one |
| `/x/reviews/reviews.js` | the bundled reviews extension's client: the review threads' format (parse, append, anchors, what a reader hasn't seen). `/reviews.js` serves it too, deprecated, until 2.0 |
| `/x/reviews/panel.js` | the Reviews panel over the extension's part (`x.reviews` on a card and a floor): a card's thread and note call (`cardReviews`, `noteCallOf`), a floor's threads (`floorThreadsOf`), and the panel as a pure view. `/panels.js` keeps its 1.92 copy over the old fields, deprecated, until 2.0 |
| `/icons.js` | the icons the tower's renderers draw |
| `/termkeys.js` | the editing keys every browser terminal sends, and the terminal's key handler over the keymap (`terminalKeymap`) |
| `/keymap.js` | every keyboard command as data with its name (`label`) and default chords; `commandOf` matches a keydown against `board.keys` (the config's `keys` over the defaults), `frameCommandOf` a key from a framed page, global commands alone; chord labels, `aria-keyshortcuts` and the `?` sheet |
| `/terminal.js` | a browser terminal's face and size from the viewer's appearance, and the size a watched one fits its PTY at |
| `/prefs.js` | the viewer's appearance record, its defaults, and whether to move less (`reducedMotion`) |
| `/settings.js` | the settings popover as a pure view: the ring, its sounds, notifications, the brief rendered or raw, and the viewer's appearance drawn from data and wired by `wirePrefs` |
| `/tips.js` | the tooltip every renderer shows for `data-tip`, and the placing of popovers by their button |
| `/capabilities.js` | what the tower lets a user do as data (`CAPABILITIES`, each maybe naming a keymap command or a floor verb), the patterns' format (`parsePattern`, read at `/patterns`), and both laid out as tips (`tipsOf`, `tipAt`, dismissed by `tipKey`) |
| `/verb-words.js` | every verb the board offers in words, keyed `<subject>/<verb>` (`card/send-home`, `worktree/recut`): its `label`, `hint`, whether it asks first (`destructive`), the API verb its call makes (`api`, whose description and schema are at `/schema`) and the keymap command that does the same (`command`); `verbLabel(subject, verb)` |
| `/palette.js` | the command palette as data: `paletteEntries(ctx)` lists what a viewer can go to (workers on duty, floors, shelf entries, drafts, through the drafts client's `draftsOf` your renderer passes in `ctx`), do (the keymap's global commands with their chords, what the selected worker, its conversations and processes and every floor offer) and learn (capabilities that name no command, and the patterns), each with a tagged `does` your renderer runs through its own handlers; `rankPalette(entries, query, rankingOf(ctx))` groups them for what was typed, by `matchScore` (a prefix over a word start over a substring over letters in order) and small boosts for the selected worker, its floor and recent picks (`WEIGHTS`) |
| `/press.js` | a control busy while what it asks is in flight (`pressing(control, request)`: `aria-busy` on it and on every control drawn with the same identity, a second press ignored), and a control's identity in html drawn anew (`identityOf`) |
| `/toasts.js` | toasts that stack, time out and may carry one action button (`toaster(element)` answers `toast(msg, { label, run })`), a polite live region, with their stylesheet (`toastsCss`) |
| `/markdown.js` | markdown as html: `markdownHtml` for words nobody vetted (raw HTML escaped, links in a tab of their own, fences highlighted with a copy button, safe in any element) drawn in an element of class `md` with `markdownCss`, `documentHtml` for a file in a frame without scripts, `safeHref`, and `fenceText` (a fence's code, to copy) |
| `/x/policies/policies.js` | the bundled policies extension's client: a rule and its slots in words (`ruleWords`, `slotWords`), where a policy stands (`standing`, `standingWords`), the cron checks a policy file's header gets (`cronProblem`), and its parts of the board (`floorPolicies`, a floor's policies and offers; `runOf`, the run a card is; `offerAskKey`, an offer's ask). `/policies.js` serves it too, deprecated, until 2.0 |
| `/x/policies/panel.js` | the policies extension's Policies panel (`policiesHtml`, `offerWords`, `policyZone`, `policyDoneLine`) over its part of the floor; `/panels.js` keeps the old one over `floor.policies` and `board.offers`, deprecated, until 2.0 |
| `/slots.js` | the core's time trigger: a rule (`When`: crons, or `every`, a period aligned to the UTC clock) in words (`ruleWords`), its slots (`slotsBetween`, `nextSlot`, `onTimeSlot`, `dueSlot`), a slot in words (`slotWords`), and why a cron or a period is none (`cronProblem`, `periodProblem`) |
| `/loop.js` | a machine as data: `loop` runs a map of handlers, `(state, event) -> effects`, the next state among them, through your executors of the rest; `timers()` executes timer effects, each carrying the event it fires |
| `/reads.js` | reads a viewer holds (`Held`): the last read held until the next lands, a read overtaken landing on nothing, a failure shown only while nothing is held; the steps, and `heldHandlers` and `reading` to run them on `loop`. `/panels.js` runs them for review threads (`threadWant`, `heldThread`, `readThread`) and a worker's Changes (`changesHandlers`, `readChanges`) |
| `/term-view.js` | a terminal a viewer has open on a PTY, as a machine on `loop`: `termHandlers` its steps (opening, watching, owning, exited), and `mountTermView(host, { Terminal, FitAddon }, io)` running it in xterm.js on a `terminal/<id>`, `screen/<id>` or `shell/<id>` stream. The PTY has one size: a terminal opened while nobody else views it takes the size (a shell's always), a resize from anyone else hands it back and the view follows at a font that fits, typing takes it again, and a pane or font change fits the PTY only while this viewer holds it |
| `/viewer.js` | what a viewer keeps in `tower.store` that every renderer reads alike, as one record (`Viewer`): dismissals, the ring, the brief rendered or raw, the diff layout, unfolded crews and the Stats range, read whole by `readViewer(tower.store.get)`, each under its key in `VIEWER_KEYS` |
| `/spawn.js` | the new-worker dialog as a machine on `loop`: `spawnHandlers` its steps (open, editing, starting, closed), and `wireSpawn(dialog, io)` running it in your `<dialog>` with the form of `/cards.js`, keeping a prompt it closes on as a draft (`keepUnsent`, from the drafts client your renderer passes as `io.drafts`) and handing you the worker it started |
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
`drafts` itself is declared by the bundled drafts extension; a config line of that name overrides its label and
description.
`/items.js` lists and reads any collection without a meaning, as the tower page's trays do.
Workers add with `tower keep <collection>`. `reviews` is the bundled reviews extension's, owned: one markdown thread
per checkout, written only through `reviews/append`. Each card carries its thread as `x.reviews` (the checkout it is
about, where that work stands, the notes new to it, and its note call while the work is live) and each floor its
threads; until 2.0 the board copies them to `floor.threads`, `card.threadState`, `card.unseen`, the card's `note`
and `card.checkoutState.filed`, and `review/append` still answers, deprecated. `policies`, standing work run at its slots, is the bundled policies extension's: each floor carries
its policies (parsed, with where each stands) and open offers as `x.policies`, each offer also an ask in
`board.asks`, `/x/policies/policies.js` says rules and slots in words and where a policy stands (`standingWords`),
and `policies/run`, `policies/pass` and `policies/approve` write its facts. Until 2.0 the board copies them to
`floor.policies`, `card.run` and `board.offers`, and `policy/run`, `policy/pass` and `policy/approve` still answer,
deprecated.
An [extension](#extensions) may declare collections of its own, which carry its capability as `by` on the board; one
it owns carries `owner` and `doors` too, and refuses the generic writes, naming the verb to use instead.

## Extensions

An extension is a folder holding `extension.json`, its manifest, and optionally the server module it names, whose
default export is `start(ctx)`. The config adds one by its absolute folder ([config.md](config.md#extensions)); the
tower reads every manifest before any code runs, refuses what can't load, and starts the rest beside its own pieces,
restarting one when its config entry changes. Code edits wait for `tower extensions restart <id>` (`extension/restart`):
it reads the folder again and restarts the extension with what depends on it, importing its server module and every
module it imports inside the folder afresh (its `node_modules` aside); meanwhile its calls answer `unavailable` and its
state is `restarting`. `tower extensions` and `GET /extensions` say how each stands.

To start from a working one, copy a folder of [`examples/extensions/`](../examples/extensions/) (`narrate`: Listen on
every draft, its voice one function to swap) and add it to the config by its path. `npm test` loads every example as
`tower extensions check` does, so each works with the tower it ships with.

```json
{
  "id": "pulse",
  "version": "1.0",
  "title": "Pulse",
  "requires": { "tower": "1.84", "chime": "1.0" },
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
nothing else, a `parse` per collection or a `reduce` per stream it declares, a fold per subject kind it folds, a link
per `around` and an answer per `answers` entry, `launch` when it says `spawn.launch`, and `halt`. Its `ctx` holds who it is, its settings (and a floor's, `settingsOf`), whether it is on on a
floor (`on`), timers cleared at halt (`every`), the tower's log (`log`), a `signal` aborted at halt, the `board`, its
calls, its stores, `raise` and `run`. The manifest's keys, the ctx members and the problem codes are part of the contract, held like
the served modules: removing one is a major.

`requires` names the capabilities it can't run without, each at the version it is written for, the core's `tower`
among them: it is refused while one is missing, and off on a floor where one is off. `wants` takes the same form
(`"wants": { "drafts": "1.0" }`) and names those it uses when they run: it starts without one (`ctx.deps.drafts` is
then `undefined`), and stays on on a floor where one is off, where it simply finds none of that capability's subjects.

**Verbs and reads.** Each verb's `input` and `reply`, and each read's `query` and `reply`, is a JSON Schema the tower
parses with, as it parses its own: a verb is `POST /<capability>/<verb>`, a read `GET /<capability>/<path>` (its
`<param>`s from the path, its query values strings), and both are listed at `/schema`. Every verb and read declares
its `scope`, `system` or `project`: one without it is refused. A `project`-scoped verb's input
requires `project`, a project-scoped read names it as a `<project>` param or in its query, and either is refused on a
floor where the capability is off. A handler that throws, or answers off its reply schema, fails that call as
`internal` and lists a problem on the extension; to refuse, it answers an error, `{t: 'error', code, message}`. A
verb or read can be `deprecated` (`since`, `use`, `why`): its HTTP answers carry `Deprecation` and a `Link` to `use`.
`tower x` lists every running extension's verbs, and `tower x <capability> <verb> '<json>'` calls one. It calls verbs
only: a read is a `GET`, such as `curl http://127.0.0.1:4317/<capability>/<path>` (the tower's address is the config's
`port`, which `tower whoami` names).

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
are session facts logged as `tower.x.<cap>.<name>`, appended to any session whose log the tower holds: a running
worker's, or one that exited or that an earlier host ran. `ctx.streams.append`, `ctx.facts.append` and `ctx.collections`
write them, each checked by its schema; `ctx.streams.read` reads a stream over a window; `ctx.own` reads what the
tower folds of them: a stream's `reduce` state, a collection's items with their `parse`, and a session's facts over
its lineage, all read-only. A `reduce`'s `step` gets the state frozen and returns a new one; a step that throws stops
the fold before that fact, and an item whose `parse` throws is held with `parsed` undefined until it changes, each
said in the tower's log.

**Fact kinds** (API 1.90). A stream's fact code may declare a `kind` the core folds, its facts then holding to the
kind's schema as well as their own. The one kind is `tower/rate-limits`, a reading of the account's rate limits
(`{ limits: [{kind, percentUsed, resetsAt?}], extraUsage?, runtime? }`, Claude's when it names no `runtime`), in a
system stream: the core folds every started extension's readings beside the sessions' turns' into the board's
`rateLimits`, `extraUsage`, the weekly budget and `/stats`. The bundled quota probe (`extensions/quota`) is one: its
`u` facts are readings, read by its `tick` slot while `board.turnLimits`, the newest reading a session's turn took,
is older than its `every`. `ctx.runtime('claude')` says how the config starts a session (`argv`, `env`), and
`ctx.run(argv, { …, env })` runs a command with `env` set over the scrubbed one, so a reader runs Claude as the
sessions do.

**Moved names** (API 1.90). As a built-in moves into a bundled extension, its old names keep answering until 2.0
through `LEGACY` (`src/shared/extensions.ts`), each `{kind, old, now, since}`: an old verb or read is answered by the
new one with RFC 9745's `Deprecation` and a `Link` to it (`probe/run` by `quota/read-now`, `GET /probe/<name>` by
`quota/reads`); an old board field is copied from the part it moved to, as it stood at the move (`board.probes` from
`board.x.quota`), so new fields appear only under `x`; an old card verb is copied onto each card from the action an
extension's fold offers there now (the card verb `review`, its old `spawn` call, from reviews' `reviews/hire`); and a
stream keeps its old folder for good (the quota stream's facts stay in `probe.quota/`). A renderer that draws
extensions' actions draws the new one and leaves the copy out.

**Reviewers** (API 1.95). The reviews extension hires a reviewer with `reviews/hire {project, of, by?, tell?}`: a spawn
in a fork of the author's checkout whose `x.reviews.of` is logged before it starts, and whose launch contributor puts
it in the author's crew and out of the hiring limits (`tower.reports-to`, `tower.exempt`). A card reads it at
`x.reviews.of` (`reviewerOf` in `/x/reviews/reviews.js`, since 1.97; its copy in `/cards.js` goes at 2.0), its `crew` and its `exempt`; `card.reviews` is that copied back until
2.0. A reviewer spawned before 1.95, known only by its first prompt `/tower:review <CALLSIGN>`, reads the same.
`floor.git` says every dir of the floor is a git repo, so a checkout of it can be forked.

**Folds and contributions** (API 1.84) put an extension on the board. A subject is anything the board shows that
extensions add to, keyed `card:<id>`, `floor:<project>`, `board`, `conversation:<id>`,
`item.<collection>:<project>/<id>`, or `<cap>.<kind>:<key>` for an extension's own kinds, which it declares in
`subjects` (`"thread": { "in": "floor", "list": "threads" }`: the keyed entries of `floor.x.<cap>.threads`). `folds`
declares, per subject kind, the `x` schema of its own part and the `adds` it contributes (`actions`, `badges`, `tidy`
on a floor, `lines` on a card, `asks`), both optional: a fold that only contributes declares `adds` alone, with no
part of its own, and is the common case. `start` returns a fold for each, `(subject, ctx) => part`, pure and synchronous
over frozen inputs, `ctx` holding `now`, the floor's `settings`, the core's `board`, `callsignOf(session)` (the callsign of the worker any session the tower has known ran as, archived ones too, `undefined` for an id no log holds) and `own`, its stores as `ctx.own`
reads them (on a card, its facts over the worker's lineage). After the core's board is built, each running extension
folds in dependency order (card, conversations, items, floor, its own kinds, board), on floors where it is on, seeing
only the parts of what it `requires` or `wants`. Its part lands at `subject.x.<cap>` (a card, a floor, the board, or
an item of a collection it declares), checked by its schema; its actions (`{verb: '<cap>/<verb>', call}`, the verb
qualified, or `{command, args?}`, the command bare: its own, `"command": "speak"`), badges (`{label, tone?, hint?, href?}`), tidy entries and lines at `board.adds[<subject key>]`, each tagged
with its `cap`; its asks (`{key, subject, title, since, until?, sound: 'wait' | 'offer', actions}`, `subject` a core subject's key:
a card, a conversation, a floor, an item or the board) in `board.asks`,
keyed `<cap>:<key>`, which every renderer orders and rings beside the waits. A fold that throws or returns what its
manifest doesn't declare costs its part on that subject, and its dependents' there, as a `threw` or `shape` problem;
an extension whose folds take over 50 ms of one board is `slow`. Calling `ctx.board()` inside a fold throws: the fold
has its `ctx.board`.

`client` names a folder served at `/x/<cap>/`, with CORS; a `<name>.ts` there is served bundled as `<name>.js`. Each
of `commands` is one of its modules' exports, with `words`. Its `on` offers it on every subject of those kinds with
no fold needed (`"on": ["item.drafts"]`), whether the extension folds or not; one with no `on` is the palette's alone.
A renderer draws a subject's actions and badges with `/cards.js`: name the subject (`cardSubject(card)`,
`floorSubject(floor)`, `itemSubject(project, collection, item)`, `boardSubject(board)`), then `actionsOf(board,
subject)` (the core's, then `addedActions`), `badgesOf`, `actionWords` for a label, and `runAdded` to press one: a
verb is called with its call, a command's module imported from `/x/<cap>/` and its export called with `{ tower,
board, subject, args }` (`runCommand`). A renderer that can't import modules leaves commands out (`isCommand`).

That `subject` is the subject's value, not the record `cardSubject` returns: the card itself on a card (`subject.id`
its session), the floor on a floor, the board on the board, `{ ...item, project, collection }` on an item, and
`{ ...conversation, card, project }` on a conversation. A command reads what its subject holds through `tower`: an
item's text with `tower.text('collection/<project>/<collection>/<id>')`, and a file a worker showed (each of
`card.shown` whose `kind` is `file`, its `target` an absolute path) with `tower.text('shown/<session><target>')`.

Not every renderer draws every subject or every contribution. Before choosing `on` or what a fold adds, check where
it shows:

| Subject | The tower page | Tower 3D | The `tower` command |
|---|---|---|---|
| `card` | badges and `lines` on the worker's row in the sidebar and in its header; actions, commands among them, in the worker's header and the palette | badges, `lines` and verb actions on the worker's panel; no commands | `lines`, under the worker in `tower whoami` |
| `conversation` | badges and actions, commands among them, on the conversation's heading in the Brief | badges on the conversation's heading in the logbook; no actions | not drawn |
| `floor` | badges and actions under the floor in the sidebar, and in the palette; `tidy` entries in Tidy | `tidy` entries in Tidy | not drawn |
| `item.<collection>` | badges and actions on the item's row in the floor's trays, in the drafts editor for a draft, and in the palette | not drawn | not drawn |
| `board` | actions in the palette, with the commands that have no `on`; badges not drawn | not drawn | not drawn |
| an extension's own kind | not drawn | not drawn | not drawn |

An ask (`board.asks`) is listed with the waits by the tower page, under its floor or, for the board's, at the top,
and said, notified and rung there and in Tower 3D. The Week draws no contributions. A renderer of your own draws
whatever it reads.

A command is an action: no renderer gives an extension a place of its own on screen yet. Its module is imported once
per page and stays loaded between presses until the page reloads (`tower extensions restart` doesn't reach a page
already open), so it may keep state in the module. It runs in the renderer's document at the tower's origin: it may
add elements of its own, such as a dialog or an overlay, which the renderer doesn't know of, so it removes them when
done; it leaves the renderer's own elements alone. A pane of your own is a renderer the config declares (its folder
may sit in the extension's), framed on a floor's shelf as a `renderer` entry ([Shelf pages](#shelf-pages)): an
extension can't declare a renderer or a shelf entry, so the user adds both to the config.

To show a worker's terminal, `mountTermView(host, xterm, io)` from `/term-view.js` runs one on a
`terminal/<id>` stream. In the tower page, xterm.js is loaded as globals: pass `{ Terminal, FitAddon:
FitAddon.FitAddon }`. Elsewhere, load `/xterm.js`, `/addon-fit.js` and `/xterm.css` first, or a copy of your own. `io`
is `TermViewIo` in `src/shared/term-view.ts`, which the tower page's `renderers/page/screen.js` fills. Its `keymap`
and `run` are a renderer's keymap: a command that is not the renderer passes `keymap: () => board.keys` and `run: ()
=> false`, which sends every key to the PTY.

**Middleware and hooks** (API 1.85). `around` wraps verbs and hooks, by qualified name (`"tower/spawn": {}`,
`"chime/ring": { "after": ["audit"] }`), each one the core's, its own, or of a capability it `requires` or `wants`; its
code is `around[<name>](input, next, ctx)`, which calls `next` with the input to pass on or answers without calling
it. Every call runs through the chain around its verb, whoever makes it: outermost first, each declared `before`
(outside those capabilities' links) and `after` holding first, then a capability inside every capability that
depends on it, so the verb's owner is innermost, then by capability name. What a link passes on is parsed again by the
verb's schema, and what it answers is checked against the verb's reply; a link that throws, or passes on or answers
what the verb doesn't take, fails the call (`internal` or `invalid`, naming the link) and lists a problem on its
extension: a link may be a guard, so it is never passed over. Links in a cycle of `before` and `after` are left out,
each with a `cycle` problem. A link off on the input's floor is passed over. The core's verbs that do what other verbs
do (Tidy, `worktree/discard`) call those verbs through the same dispatch, for the same caller, so a link
on `tower/kill` sees Tidy's kills; Tidy skips and names an entry its verb refuses, a discard stops where it is refused.
`GET /extensions` lists each `chains` (outermost first), `answers` and `composites`.

`hooks` are points an extension raises inside its own verbs, each a `payload` and an `answer` schema and a `failure`
(`refuses` or `reported`): `ctx.raise('<name>', payload)` answers each answerer's answer in fold order, each on its
own, as `{cap, ok: true, answer}` or `{cap, ok: false, code, message}`, and the raising verb does what its `failure`
says with a failed one. An extension answers a hook by listing it in `answers` (`"tower/discard.record": {}`) with a
function `answers[<name>](payload, ctx)`; one that throws or answers off the schema is a failed answer and a `hook`
problem. The core raises `tower/discard.record` (`{project, name, author, tips}` → `{note?, item?}`, `refuses`) in
`worktree/discard` before anything is removed: the answers are the floor's recovery record (each tip with its `branch`,
`base`, `head`, `dirty` and `unpushed`; the reviews extension's note and filed thread among them, `item` naming where
a record is kept, API 1.94), no answer at all refuses the discard as a failed one does, and the answers come back in
the reply's `x`, by capability. Once the worktrees are removed and the branches deleted, it raises
`tower/discard.done` (`{project, name, author, tips, kept}` → `{note?, item?}`, `reported` in the reply's `done`;
API 1.94), where the reviews extension files the thread. It
raises `tower/tidy.apply` (`{project, keys}` → `{done, skipped}`, `reported`) in `tidy`, after the core's own parts, to
each capability in the plan's `x` alone, with the keys of the floor's tidy entries it contributed
(`board.adds['floor:<project>'].tidy`) that the plan carries: an entry no longer listed refuses the whole Tidy, and
each answer, or why there is none, is the reply's `x.<cap>`. An entry is `{key, label, hint?, does?, kind?}`: `does`
says what applying it does in a row's words, `kind` (`{one, many}`) what it is in Tidy's line (`1 landed thread`;
API 1.94); the reviews extension's landed threads are such entries. The floor's `tidy` call carries every entry as `plan.x`
(API 1.88), so a renderer offering Tidy all lists what it applies by passing the entries, `addedTidyOf(board, floor)` from
`/cards.js`, to `tidyLine`, `tidyRows` and `tidyAllAsk`: called without them, they word the core's rows alone. Each
hook's schemas are listed at `/schema`, under `hooks`.

**Slots, triggers and checks** (API 1.86). `slots.<name>: { "when": …, "scope"? }` fires `start`'s `slots.<name>({name,
at, project?}, ctx)` at each slot of its rule: `{ "cron": [...], "tz"? }`, crons in the subset the tower says in words,
or `{ "every": "5m" }`, a period aligned to the UTC clock (`30s`, `5m`, `2h`). The tower's 30 s loop fires a slot once,
the latest at or before now, while it is within 5 minutes; a `project`-scoped slot fires once per floor where the
capability is on. A floor's or the board's fold that declares `"adds": ["slots"]` gives slots of its own, `slots:
[{ key, when }]`, carried at `board.adds[<subject>].slots` and fired through `start`'s `slots['*']` with the slot's `key`
and the floor (an extension that adds slots requires tower 1.85). Fired is kept in memory only: a slot missed while the tower was down stays missed, and one fired just
before a restart may fire again, so an extension that needs exactly once keeps its own facts. `triggers.board: {}`
makes `start` return `board(prev, next)`, pure and synchronous, which answers the calls a board change asks for,
`[{ verb, input }]`, made as the tower (`{t: 'tower', id: 'board', via: 'loop'}`) to what its `ctx.call` reaches. It is
first called on the second board after it starts, and both boards hold only the floors where it is on, a floor that
appears taken as already there, so a restart or a floor turned on replays nothing. Past 30 calls a minute it pauses for
5 minutes. A throw, or a call that fails, is a problem of the extension's. `checks.<name>: { "words", "run" | "read",
"fix"? }` are lines of `tower doctor`: a command run from the folder (env scrubbed, killed at 10 s; exit 0 passes), or
one of its own reads taking no params, which says "tower down" while the tower is. `ctx.run(argv, { cwd, timeoutMs?,
stdin?, env? })` runs a command the same way, killed at its timeout (60 s) and at halt. `/slots.js` says a rule in words and
finds its next slot (`ruleWords`, `nextSlot`, `slotWords`); the board lists each extension's `slots`.

**The author's loop.** `tower extensions check <dir>` reads a folder as the tower would, resolves it against the
running tower's extensions, and starts it in a throwaway process whose ctx reaches nothing, to say whether `start`
returns what the manifest declares. `tower extensions freeze <dir>` writes its `contract.json`: its verbs, reads, facts,
stream codes, collections and client modules' exports (`client.<module>#<export>`) at its major. At load, a name listed there and gone from the manifest at the same major
is a `contract` warning (an error for a bundled extension), and an extension replacing a bundled capability must hold
every name of the bundled one's `contract.json` at the major it claims, or it is refused.

`tower` reads the system whose config `TOWER_CONFIG` names, `~/.tower/config.json` unless set. To try an extension
away from your own system, a checkout of the tower starts a throwaway one with `npm run sandbox -- up`, which prints
where it is: add the extension to the config there, and run `tower` against it with `npm run -s sandbox -- run tower
extensions` (header of `scripts/sandbox.ts`).

**Launch** (API 1.87) shapes the workers the tower starts. `spawn.fields` declares fields a spawn sets as `x.<cap>.<field>`
(`{ "role": { "schema": {"type": "string"}, "words": {"label": "Role"}, "options": { "from": "floor.x.roles.options" } } }`):
each value is parsed by its `schema` and logged in the new session's log as `tower.x.<cap>.<field>` before its PTY
starts, so a card fold reads it from `own.facts`. Every renderer's spawn form draws a field unless its `form` is
`false`, its choices (`{value, label, hint?}`) read from the path `options.from` names in the extension's own floor
part, which its floor fold's `x` declares as an array. A capability nobody provides, off on the floor, or a field it
doesn't declare is `invalid`.

`spawn.launch: true` means `start` returns `launch(request, ctx)`, called for every spawn, resume and fork on a floor
where the extension is on, in dependency order. `request` is `{kind: 'spawn' | 'resume' | 'fork', runtime, project,
cwd, model?, effort?, fields?, facts}`: `fields` its own field values on a spawn, `facts` its facts over the worker's
lineage (a fork carries copies of its source's). `ctx` reads only: the floor's `settings`, `read`, and its
collections' `list` and `read`. It returns parts the session's runtime places: `systemPrompt` (after the tower's
brief), `prompt` (after the first prompt), `env` (in Claude's settings, without a parent session's markers: those settings are part of the session's argv, which
its log's header keeps for good, so contributed env is no place for secrets),
`defaults` (`model`, `effort`, used only when the spawn leaves one out), `args.claude` (Claude's own flags, each
`--flag` or `--flag=value`, placed before the tower's), `exempt: ['hiring']` and `reportsTo` (a callsign); `prompt`,
`defaults`, `exempt` and `reportsTo` count on a spawn only. A flag the tower passes (`--name`, `--settings`,
`--add-dir`, `--plugin-dir`, `--append-system-prompt`, `--model`, `--effort`, `--resume`, `--`) or the config's `argv`
passes, an env key the config's `env` sets, and a flag, env key, `defaults` member or `reportsTo` two extensions both
give, refuses the launch, naming both. A contributor that throws, doesn't settle within 10 s, or returns what the runtime can't place refuses a spawn that
carries its fields, and otherwise is left out with a `launch` problem. `exempt` takes the worker out of its floor's hiring limits and
`reportsTo` puts it in that worker's crew: each is logged as a core fact (`tower.exempt`, `tower.reports-to`) before it
starts, shown on its card and by `tower whoami`, and listed at `GET /extensions`. `plugins.claude` names a Claude plugin
folder in the extension, loaded into every session on floors where it is on.

## Claude plugins

`plugins`, at the top level or under a project, lists absolute plugin directories every session the tower starts
loads, each passed to Claude as `--plugin-dir`. Your commands and skills live in one plugin outside your repos and
reach every worker as `/<plugin>:<command>`. A changed plugin reaches the next session started. An extension
brings its own with `plugins.claude`.

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
