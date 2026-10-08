# Extending the tower

The tower keeps its whole state outside its code: the config (what you want), the session logs (what happened) and
the collections (files kept for later). Its API does the work, and the modules it serves are a convenience on top.
So there is no plugin API. You extend the tower by editing the config, by writing clients of the API (a renderer, a
shelf page, a script), and by reading its files.

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
- A name the core declares (`page`, `tower3d`) overrides that renderer's fields: `{ "tower3d": { "settings": … } }`
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

The board is the whole system as one value, sent again whenever it changes: its type is `Board` in
`src/bridge/board.ts`. Each card, conversation and floor carries `verbs`, what can be done to it now, and `calls`,
those verbs as ready requests: `tower.run(card.calls.resume)`. `/tower.js` documents its every member in its header
(`curl http://127.0.0.1:4317/tower.js | head -60`).

**Pin the version you wrote against.** `/tower.js?v=1.3` refuses to load into a tower of another major or an older
minor: `window.tower` is never defined and the console says which versions met, in place of a page drawing a board
it misreads. A page that names no version
moves with the tower: right for the renderers in the checkout, wrong for yours. `tower.version` is the tower's full
version, for a feature check.

### A copy of one that ships

To change the tower page or Tower 3D, copy it out of the checkout and layer your changes on top of the copy. The
copy is disposable: you will throw it away and copy again for each release you take. What is yours lives beside it.

The tower page is one file, `renderers/page/index.html`, and imports everything else from the tower by absolute URL.

1. Make a directory of your own, outside the tower's checkout (`realpath $(which tower)` is
   `<checkout>/src/mod/bin/tower`), and keep it in git:

   ```sh
   mkdir ~/code/my-tower && cd ~/code/my-tower && git init
   cp <the tower's checkout>/renderers/page/index.html .
   ```

2. Write your layer beside it, `mine.css` and `mine.js`:

   ```css
   .brand h1 { color: #e0115f; }
   .mine-badge { font: 700 11px/1 var(--mono); padding: 3px 6px; border-radius: var(--radius); background: #e0115f; color: white; }
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

Taking an update is then: copy `index.html` again, add the two lines again. Keep that as a script in your repo:

```sh
cp <the tower's checkout>/renderers/page/index.html . &&
perl -0pi -e 's#</head>#<link rel="stylesheet" href="mine.css">\n</head>#; s#</body>#<script type="module" src="mine.js"></script>\n</body>#' index.html
```

The layering advice that makes this work:

- **Override, don't edit.** Restyle through your own stylesheet, after the copy's: the design's tokens
  (`--ink`, `--panel`, `--accent`, `--radius`…) are custom properties you can redefine.
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
and declare `<the clone>/renderers/tower3d/out` as your renderer's root. Taking an update is checking out the new
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
`item` page runs on its own at `/run/<project>/<n>`, a `renderer` at `/r/<name>/`, both at the tower's origin. The colour scheme follows the framing page:
`tower.scheme()` and `tower.onScheme` read it, and `tower.chooseScheme(choice)` asks the framing page to change it, for
every page of the viewer's.

Relaying is the framing renderer's work, over the protocol in `src/shared/shelf-page.ts`. The tower page relays;
Tower 3D relays nothing to the pages it frames. A renderer of yours frames shelf pages with the API by relaying the
same messages, or opens them on their own.

## The API

Everything a renderer can do is an HTTP route on `http://127.0.0.1:<port>`:

- **Verbs**: `POST /<verb>` with a JSON body: `spawn`, `resume`, `submit`, `keys`, `kill`, `collection/create`,
  `review/append`, `tidy` and the rest. Every POST carries the header `origin: http://127.0.0.1:<port>`; without it
  the tower answers 403, its guard against other web pages.
- **Reads**: `GET /board` (SSE: `{v, board}`, again on every change), `/renderers`, `/stats`, `/changes/<id>`,
  `/conversations/<id>`, `/archive/<project>`, `/reviews/<project>`, `/collection/<project>/<collection>/<item>`,
  `/origins`.
- **Streams**: a session's screen, an interactive terminal, a shell (`screen/<id>`, `terminal/<id>`, `shell/<id>`),
  multiplexed on one connection, `GET /mux`.
- **Errors** are data: `{t: 'error', code, message}`. Branch on `code` (`invalid`, `not_found`, `refused`,
  `unavailable`…), never on `message`.

`GET /schema` serves every verb's input and reply, and the error, as JSON Schema: a renderer or a script in any
language learns the contract from the tower. `tower api` lists the verbs and reads, one line each, and
`tower api <name>` prints one's schema. Every route is listed in the header of `src/tower/server.ts`.

The version is `major.minor`, the same on the board, `/schema` and `/tower.js`. An addition an older client reads past
moves the minor; a rename, a removal or a changed meaning moves the major, with a line in `CHANGELOG.md` saying what to
do. The tower makes a best effort to avoid majors.

**View state** (marks, a remembered tab, a viewer's preference) goes in `tower.store`: `tower.store.set(key, value)`,
`await tower.store.get(key)`. It lives in the viewer's browser under keys every page shares, the tower page
included, so the files you mark viewed in one renderer are viewed in the next. `tower.remember` and `tower.recall`
keep one value for the page alone.

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
| `/tower.js` | the client: the board, every verb and read, streams, `tower.store` |
| `/design.css` | the design's tokens as custom properties, both colour schemes, the faces, and a few classes (`.needs`, `.pill`…) |
| `/design.js` | the design module: palettes, type, the terminal's theme, the sky by hour, a document's stylesheet |
| `/cards.js` | words about cards and floors, the spawn form, round-robin through waits, the ring and its sounds |
| `/panels.js` | the Changes, Reviews and Stats panels as pure views, their stylesheet, and the data attributes you wire |
| `/brief.js` | a worker's brief as a view over `/conversations/<id>` |
| `/drafts.js` | editing a floor's `drafts` collection over the generic `collection/*` verbs |
| `/reviews.js` | the review threads' format: parse, append, anchors |
| `/icons.js` | the icons the tower's renderers draw |
| `/termkeys.js` | the editing keys every browser terminal sends |
| `/settings.js` | the settings popover as a pure view: the ring, its sounds, the colour scheme, notifications |
| `/tips.js` | the tooltip every renderer shows for `data-tip`, and the placing of popovers by their button |

A renderer that draws the Stats panel or the settings popover installs the shared tooltip once, `watchTips(document)`
from `/tips.js`: the Stats bars show their readouts through it, and the popover stays hidden until it is placed.

They are part of the API's contract. Removing or renaming an export, a `tower` member, a token or a class is a
major, with a line in `CHANGELOG.md` saying what to use instead; adding one is a minor. They change, versioned and
announced, but are not frozen. A name on its way out stays, marked `@deprecated` in its source with what replaces it
(`RING_MARK` and `RING_NAME` in `/cards.js`), until a major removes it. `test/served-exports.json` lists every name they serve today, and `npm test` holds the
tower to it.

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
deletes them (`collection/create`, `collection/write`, `collection/delete`). What a file means is your renderer's
business: the tower page reads `drafts` as prompts and Tower 3D plays `games` in an arcade, over the same verbs.
Workers add with `tower keep <collection>`. One id means something to the core: `reviews`, written only through
`review/append`.

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
act on it (`whoami`, `agents`, `show`, `keep`, `hire`, `note`, `api`…). It is a client of the same API: what it does,
a script does with curl. `tower` alone, or an unknown verb, lists every verb.

## The logs

`~/.tower/sessions/<id>.jsonl` is everything that happened in a session: a header line (the session), then
`[t, code, data]` events, `t` in seconds since it started: `o` output, `i` input, `r` resize, `h` a hook or mod event,
`x` its exit. An archived log is `<id>.jsonl.gz`, the same lines gzipped. Read them with anything:

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
