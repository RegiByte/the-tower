# The config

`~/.tower/config.json` is the one file the user edits by hand (`TOWER_CONFIG` points elsewhere). The directory that
holds it is the system root: session logs, collections, sockets and the cache live next to it. The tower reads the
file again whenever it changes, so an edit needs no restart, but for `port`.

`tower config check` reads the config the way the tower does and prints each problem at its key path
(`projects.my-app.shelf[0]`), exiting 1 on any the tower can't take. A key the tower doesn't know, at any depth, is a warning: the tower ignores it, and
it is often a misspelled one. `tower doctor` runs the same check among its others.

```json
{
  "argv": ["claude"],
  "env": {},
  "user": { "name": "Your Name" },
  "collections": {
    "reviews": { "label": "Reviews", "description": "One review thread per checkout, written through tower note." },
    "policies": { "label": "Policies", "description": "Standing work the tower starts on a schedule: one markdown file each, a # Title, a json header, then the prompt." }
  },
  "projects": {
    "my-app": {
      "name": "my-app",
      "hub": "/abs/path/to/my-app",
      "repos": ["/abs/path/to/my-app-api"],
      "color": "#c792ea",
      "shelf": [
        { "label": "Notes", "md": "notes/*.md" },
        { "label": "Dashboard", "html": "shelf/dashboard/index.html" }
      ]
    }
  }
}
```

## Top level

| Key | Takes | Unset |
|---|---|---|
| `argv` | The command every session starts with, before the arguments the tower adds: `["claude"]`. | required |
| `env` | Variables added to every session's environment. They are scrubbed with the parent session's: a parent session's markers (`CLAUDECODE`, `CLAUDE_CODE_SESSION*`, `TOWER_SESSION_ID`, …) set here are dropped. | none |
| `projects` | The floors, by id (letters, digits, `_`, `-`): see [Projects](#projects). | required |
| `collections` | The collections every project has, by id: see [Collections](#collections). | none |
| `user.name` | The name the user's review notes are signed with: text with no `·`, no line break and no space at either end. | `user` |
| `editor` | How the tower opens things in the user's editor, three argv templates: `window` opens `{dir}` in a new window, `open` opens `{path}` (a file or folder), `goto` opens `{path}` at `{line}`. Set all three or none. | VS Code's `code` |
| `callsigns` | The names workers are called by, the same on every floor: each an upper case letter, then upper case letters and digits, none twice. Read when a worker starts: a change names new workers only. | the tower's list |
| `plugins` | Absolute plugin directories every session loads, each passed to Claude as `--plugin-dir`. | none |
| `renderers` | Renderers served at `/r/<name>/`, by name: `root`, the absolute directory of its built files; `entry`, its page in it (`index.html` unless set); `settings`, its own configuration, passed through unread; `layout`, the default arrangement of the views in its regions, by region id (`order`, `hidden`, `open`, `options`), over its own `renderer.json`'s and under the viewer's, each view's `options` checked against its manifest's (see [docs/extending.md](extending.md#your-own-renderer)). A new name adds a renderer; `page`, `week` or `tower3d` overrides that built-in's fields. | the built-ins |
| `renderer` | The renderer `/` opens, by name. | `page` |
| `worktrees` | How the tower cuts worktrees: see [Worktrees](#worktrees). A project's own win per key. | |
| `hiring` | How far `tower hire` goes: see [Hiring](#hiring). A project's own win per key. | |
| `brief.pairs` | How many of a conversation's last turns a worker's brief shows, each a prompt with Claude's latest answer to it. A project's own wins. | 2 |
| `port` | The loopback port the tower serves on, `http://127.0.0.1:<port>`: the user's page and the API. A whole number from 1 to 65535. The tower reads it when it starts: after a change, `tower down`, then `tower up`. | 4317 |
| `hosts` | Names the tower answers to beside `127.0.0.1` and `localhost`, such as `["mini.localhost"]`: the page opens at `http://<name>:<port>`, or at the bare name behind a proxy on port 80 or 443. Browsers send every `*.localhost` name to the machine itself, so those need nothing else; another name needs its own DNS record or `/etc/hosts` line. Lower case host names, no port or scheme. A POST must carry the Origin of the name it was sent to. Read on every request: an edit holds at once. | none |
| `probes` | Deprecated since 1.90, honoured until 2.0: `probes.quota.off` and `probes.quota.every`, the quota probe's old spelling, read as `extensions.quota.off` and `extensions.quota.settings.every` (see [The quota probe](#the-quota-probe)). Either set beside its new spelling is an error; any other probe or field is read by nothing. | none |
| `retention.days` | How long after its worker ended a session's log stays plain before Tidy offers to archive it (gzip it in place), and after its month closed a stream's month file (an extension's system stream, such as the quota probe's reads, or a floor's policy runs and approvals). | never |
| `keys` | Chords that replace the keymap's defaults, by command id: see [Keys](#keys). | the defaults |
| `extensions` | The extensions the tower runs beside the bundled ones, and the bundled ones' overrides, by id: see [Extensions](#extensions). | the bundled ones |

## Projects

Each project is a floor. Its sessions start in the hub; the repos are the other directories they work in.

| Key | Takes | Unset |
|---|---|---|
| `name` | The name the floor is shown by. | required |
| `hub` | The absolute directory sessions start in. | required |
| `repos` | Absolute directories the sessions also work in, granted as file access only (Claude's `permissions.additionalDirectories`): their `CLAUDE.md` and `.claude/` stay out. | required, `[]` for none |
| `color` | A CSS color renderers mark the floor's things with. | the tower's |
| `shelf` | Pages kept beside the floor's sessions: see [Shelf](#shelf). | none |
| `collections` | Collections only this floor has, beside every floor's. An id declared in both is an error. | none |
| `plugins` | Absolute plugin directories this floor's sessions load, beside every session's. | none |
| `worktrees`, `hiring`, `brief` | As at the top level, for this floor. | the top level's |
| `extensions` | Each extension's `settings` on this floor, by id, shallow-merged over the system's and parsed by its manifest's settings schema. Settings for an id that provides nothing running here are a warning. | none |
| `capabilities` | Capabilities turned off on this floor, by name: `{ "github": { "off": true } }`. Whichever extension provides one, it is off here, and so is every extension that requires it. `tower`, the core, is never off. | all on |

## Extensions

An extension is a folder holding `extension.json`, its manifest, and optionally the server module the manifest names,
which the tower starts beside its own pieces. Bundled ones live in the checkout's `extensions/<id>/` and are on unless
turned off; the config adds others by id. `tower extensions` lists each with its state and problems, `tower doctor`
says what keeps one from starting, and `GET /schema` serves the manifest's JSON Schema as `extension`. An edit here is
taken without a restart: an extension the edit leaves unchanged keeps running, and a changed one restarts with what
depends on it. A code edit is not an edit here: restart the tower for it (`tower down tower`, then `tower up tower`).

| Key | Takes | Unset |
|---|---|---|
| `path` | The absolute folder holding a new extension's `extension.json`, whose `id` must be the key. Read only for an id no bundled extension has. | required for a new id |
| `off` | `true` turns it off everywhere: what requires its capability doesn't start. | `false` |
| `settings` | Its settings, parsed by its manifest's `settings` schema, defaults filled in; an extension without one takes none. | its schema's defaults |

```json
"extensions": {
  "roles": { "path": "/abs/path/to/tower-roles", "settings": { "default": "builder" } }
}
```

### The quota probe

The bundled extension `quota` reads the account's rate limits from Claude (`/usage`'s data, the `get_usage` control
request to the `argv` sessions start with: no prompt, $0) while no session's turn has reported them within `every`, so
the board's limits and the weekly budget stay current while nobody works. Each read is appended to its stream,
`streams/system/probe.quota/YYYY-MM.jsonl` beside the config, the folder it kept from before it was an extension.

| Setting | Takes | Unset |
|---|---|---|
| `every` | How long after its last read it reads again, a whole number and `s`, `m` or `h`, at least a minute. After 3 failures in a row it waits 10 min, doubling to 1 h; an account with no rate limits to read (an API key) waits 6 h. | `10m` |

```json
"extensions": { "quota": { "settings": { "every": "30m" } } }
```

`"extensions": { "quota": { "off": true } }` turns it off: the limits then refresh only during sessions' turns. How it
stands (its last read, why it failed, when it reads next) is the board's `x.quota`, drawn under the limits in both
renderers, in `tower probes` and in `tower doctor` (its check, `quota/reading`); its latest reads are at
`GET /quota/reads`. A press of "read now" in either renderer, `tower probes run quota`, `tower x quota read-now` or
`POST /quota/read-now` reads at once, at most once a minute. The old spelling, `"probes": { "quota": { "off": true } }`,
is honoured until 2.0, and `tower config check` warns with the line to write instead.

### Autotidy

The bundled extension `autotidy` tidies what a worker leaves as it goes home (sent home, gone home by itself with `tower home`, or let go; a
worker that exited by itself or crashed has not, nor a stranded worker waiting to be resumed), without a press of Tidy.
Two cases count though nobody sent the worker home. One that exited by itself or crashed counts when it started before
today and left nothing running or waiting: its card leaves the board as it ends, and how it ended isn't read. And a
worker the tower ends just after starting it, because its hire or its policy run couldn't be recorded, counts: its
fresh worktree, holding nothing, is removed, and resuming it then starts with a recut. It does nothing until a setting turns a kind on, and
keeps nothing of its own: a worker's going home is read from the board, from its card or from its card leaving the
board as it goes. It acts only as a worker goes: on what the floor's Tidy lists of theirs in the two minutes after,
while the tower's reads of processes and git catch up with their going. Tidy's own conditions hold, and a worktree
goes only once its work has landed: one whose branch is pushed but not merged (an open pull request) stays, though Tidy
lists it. Anything else, such as a branch not merged yet or a process a worker still on duty in the same checkout may
use, stays for you to Tidy by hand.

| Setting | Takes | Unset |
|---|---|---|
| `reap` | End the processes the worker left, unless someone on duty works in its checkout, main's included: a process names no checkout, and may serve a worker sharing it (a dev server). A server the worker started for you ends too, though you may still have it open: leave `reap` off where workers start servers you keep using. | `false` |
| `worktrees` | Remove its worktree, if nobody is in it, it is clean and its branch is absorbed into its base (landed, not only pushed). | `false` |
| `branches` | Delete the kept branch its worktree held, if absorbed. | `false` |
| `extensions` | Apply the extensions' Tidy entries that name its checkout, unless someone on duty works in it: the reviews extension's landed thread, filed. | `false` |

```json
"extensions": { "autotidy": { "settings": { "reap": true, "worktrees": true, "branches": true, "extensions": true } } }
```

A floor's own settings win per key (`projects.<id>.extensions.autotidy.settings`), and
`"capabilities": { "autotidy": { "off": true } }` turns it off on one floor. The workers going home now are the
floor's `x.autotidy.going` on the board.

## Shelf

A project's shelf is a list of pages the user reads beside the floor's sessions, in the tower's sidebar and on Tower
3D's shelves. Each entry has a `label` and exactly one of:

| Key | Shows | Example |
|---|---|---|
| `html` | A page the project builds, a path relative to the hub. Its files beside or below it are served with it; nothing above it is. Framed, it loads them as scripts, stylesheets and images, but can't `fetch` them or import them as modules: a page that does is a `renderer`. | `"shelf/radar/index.html"` |
| `md` | A set of markdown files, a glob relative to the hub, in name order (`"order": "desc"` reverses it). Images beside them are served. | `"notes/*.md"` |
| `url` | A web page framed in place, such as a local server's UI. | `"http://127.0.0.1:5173"` |
| `link` | A page opened in a new tab, for pages that refuse to be framed. | `"https://claude.ai/artifact/…"` |
| `renderer` | A declared renderer framed as a page, by name; its `settings` go with it. | `"tower3d"` |
| `item` | A file kept in one of the project's collections, `"<collection>/<id>"`, the id its file name. A markdown item is read like an `md` entry; any other is framed alone. | `"games/20261008T130025Z-life-garden.html"` |

A page a worker made goes on the shelf as an `item`: kept with `tower keep`, it lives in no checkout. A page of
several files belongs in a repo as an `html` entry, in the hub's main checkout, not a worktree the tower will tidy
away. The shelf is not a collection, though an `item` entry shows one of a collection's files.

## Collections

A collection is a kind of file a floor keeps in the system root, `collections/<project>/<collection>/<item>`, declared
by id with a `label` (the name it is shown by) and an optional `description` (what it is for, in a sentence or two,
shown to the user and the workers wherever it is listed). Workers add items with `tower keep <collection>` and see their counts and latest items with `tower kept`, and every item of one with `tower kept <collection>`. The bundled
extensions declare three. `reviews`, one review thread per checkout, written only through `tower note`, is
declared by the bundled reviews extension, owned, on every floor where its capability is on: a `reviews` entry here
overrides its `label` and `description`, and stays a plain collection on a floor with `capabilities.reviews.off`.
`policies`, standing work started at its slots (`tower policies` lists them, the handbook's "Policies and runs" says
what a policy holds), is declared by the bundled policies extension, on every floor where its capability is on: a
`policies` entry here overrides its `label` and `description`, and stays a plain collection on a floor with
`capabilities.policies.off`, where nothing runs on a schedule. `drafts`, prompts
waiting to start a worker or be sent to one, is declared by the bundled drafts extension, on every floor where its
capability is on: a `drafts` entry here overrides its `label` and `description`, and stays a plain collection on a
floor with `capabilities.drafts.off`. A floor keeping `games` shows each item as an arcade cabinet in
Tower 3D.

## Worktrees

| Key | Takes | Unset |
|---|---|---|
| `worktrees.branchPrefix` | What every branch the tower cuts starts with. | `tower/` |
| `worktrees.links` | A path inside each worktree → its source, relative to that repo's main checkout or absolute: symlinked in every cut. The path must be ignored by git. | none |
| `worktrees.cutByDefault` | Whether a new worker starts in a worktree of its own unless told where; off, it starts in the hub's main checkout. | `true` |

## Hiring

A guard against a chain of hires running away by accident: the tower refuses a hire past them (`tower hire`, or any
`spawn` with `hire`), and never a review (`tower review`).

| Key | Takes | Unset |
|---|---|---|
| `hiring.depth` | How many hires deep a hired worker may stand; a worker started any other way stands at 0. | 2 |
| `hiring.live` | How many of one worker's hires may run at once. | 3 |

## Keys

The keys every renderer answers are commands with default chords, kept in `src/shared/keymap.ts` and listed on the
`?` sheet. `keys` replaces a command's chords by its id: a chord, a list of chords, or `null` to unbind it. Commands
it doesn't name keep their defaults. Renderers follow a change as soon as it is saved.

```json
"keys": {
  "next-waiting": ["Alt+J", "Alt+K"],
  "sidebar": "Ctrl+B",
  "help": null
}
```

A chord is any of the modifiers `Alt` (⌥), `Ctrl` (⌃), `Meta` (⌘) and `Shift`, each once, joined by `+`, then one key:

- a letter or digit, `J` or `1`: the key itself, whatever ⌥ makes it type on a Mac;
- a `KeyboardEvent.code`: `ArrowUp`, `Escape`, `Enter`, `Tab`, `Space`, `Backspace`, `Delete`, `Home`, `End`,
  `PageUp`, `PageDown`, `Slash`, `Comma`, `Period`, `F1`…`F12`, and the other punctuation keys by name;
- any other single character, `?`: matched by the character typed, Shift ignored. It can't take `Alt`, which changes
  the character on a Mac: name the key, `Alt+Slash`.

Modifiers match exactly: `Alt+J` doesn't fire on ⌥⇧J. Where a chord fires is its command's scope:

| Scope | Fires |
|---|---|
| global | anywhere, but a chord without `Alt`, `Ctrl` or `Meta` only outside a terminal or a text field, where it would type |
| terminal | with focus in a terminal |
| field | in a text field: the open draft, a note box, the new session dialog |

| Command | Scope | Default |
|---|---|---|
| `prev-worker`, `next-worker` | global | `Alt+ArrowUp`, `Alt+ArrowDown` |
| `next-waiting` | global | `Alt+J`, `N` |
| `home` (back to the skyline) | global | `Escape` |
| `sidebar` | global | `Meta+B` |
| `palette` (the command palette) | global | `Meta+K` |
| `help` (the `?` sheet) | global | `?` |
| `pane-terminal`, `pane-brief`, `pane-changes`, `pane-reviews` | global | `Ctrl+Shift+1` … `Ctrl+Shift+4` |
| `shell-here` (a shell in the selected worker's directory; from any shell, hides the dock and goes back) | global | `Ctrl+Backquote` |
| `leave-terminal` | terminal | `Alt+Escape` |
| `newline`, `delete-word`, `delete-to-start`, `delete-to-end`, `line-start`, `line-end`, `word-left`, `word-right` | terminal | `Shift+Enter`, `Ctrl+Backspace`, `Meta+Backspace`, `Meta+Delete`, `Meta+ArrowLeft`, `Meta+ArrowRight`, `Alt+ArrowLeft`, `Alt+ArrowRight` |
| `save-draft` | field | `Meta+S`, `Ctrl+S` |
| `submit` | field | `Meta+Enter`, `Ctrl+Enter` |
| `cancel-pick` (drop the lines picked for a note) | field | `Escape` |

`tower config check` fails a value that is no chord, at `keys.<id>` or `keys.<id>[n]`, and a chord bound to two
commands that can fire in the same place (a global chord with a modifier reaches terminals and fields too), at the
override, naming the other command: rebind that one too, or set it to `null`. An id no command has is a warning, and
ignored. An extension's commands and views take chords by `<cap>/<name>` (`"grid/grid": "Meta+Shift+G"`), replacing
the defaults their manifest gives; an id no running extension declares is a warning, and its chords collide with the
keymap's as a global command's would. A character chord and a key chord that are the same key on a US layout (`?` and `Shift+Slash`) are a warning:
the check can't know your layout, and on that key only the command listed first runs. A global chord with a modifier is kept from the terminal: `Ctrl` chords there are Claude's and the shell's
own keys, and the browser keeps some `Meta` chords (⌘W, ⌘T, ⌘Q) for itself. A default that fires in a terminal or a field types nothing worth keeping: ⌥ with a digit types `#` or `€`
on some layouts, so the panes are on ⌃⇧1–4, which a terminal gets no bytes for. macOS takes ⌃1, ⌃2… (one per desktop) for
"Switch to Desktop" while those shortcuts are on in its Keyboard settings, so the panes avoid them.
