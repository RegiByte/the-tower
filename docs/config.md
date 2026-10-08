# The config

`~/.tower/config.json` is the one file the user edits by hand (`TOWER_CONFIG` points elsewhere). The directory that
holds it is the system root: session logs, collections, sockets and the cache live next to it. The tower reads the
file again whenever it changes, so an edit needs no restart, but for `port`.

`tower config check` reads the config the way the tower does and prints each problem at its key path
(`projects.my-app.shelf[0]`), exiting 1 on any. A key the tower doesn't know is a warning: the tower ignores it, and
it is often a misspelled one. `tower doctor` runs the same check among its others.

```json
{
  "argv": ["claude"],
  "env": {},
  "user": { "name": "Your Name" },
  "collections": {
    "drafts": { "label": "Drafts", "description": "Prompts waiting to start a worker or be sent to one." },
    "reviews": { "label": "Reviews", "description": "One review thread per checkout, written through tower note." }
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
| `env` | Variables added to every session's environment, after the parent session's are scrubbed. | none |
| `projects` | The floors, by id (letters, digits, `_`, `-`): see [Projects](#projects). | required |
| `collections` | The collections every project has, by id: see [Collections](#collections). | none |
| `user.name` | The name the user's review notes are signed with: text with no `·`, no line break and no space at either end. | `user` |
| `editor` | How the tower opens things in the user's editor, three argv templates: `window` opens `{dir}` in a new window, `open` opens `{path}` (a file or folder), `goto` opens `{path}` at `{line}`. Set all three or none. | VS Code's `code` |
| `callsigns` | The names workers are called by, the same on every floor: each an upper case letter, then upper case letters and digits, none twice. | the tower's list |
| `plugins` | Absolute plugin directories every session loads, each passed to Claude as `--plugin-dir`. | none |
| `renderers` | Renderers served at `/r/<name>/`, by name: `root`, the absolute directory of its built files; `entry`, its page in it (`index.html` unless set); `settings`, its own configuration, passed through unread. A new name adds a renderer; `page` or `tower3d` overrides that built-in's fields. | the built-ins |
| `renderer` | The renderer `/` opens, by name. | `page` |
| `worktrees` | How the tower cuts worktrees: see [Worktrees](#worktrees). A project's own win per key. | |
| `hiring` | How far `tower hire` goes: see [Hiring](#hiring). A project's own win per key. | |
| `brief.pairs` | How many of a conversation's last turns a worker's brief shows, each a prompt with Claude's latest answer to it. A project's own wins. | 2 |
| `port` | The loopback port the tower serves on, `http://127.0.0.1:<port>`: the user's page and the API. A whole number from 1 to 65535. The tower reads it when it starts: after a change, `tower down`, then `tower up`. | 4317 |
| `retention.days` | How long after its worker ended a session's log stays plain before Tidy offers to archive it (gzip it in place). | never |
| `keys` | Chords that replace the keymap's defaults, by command id: see [Keys](#keys). | the defaults |

## Projects

Each project is a floor. Its sessions start in the hub; the repos are the other directories they work in.

| Key | Takes | Unset |
|---|---|---|
| `name` | The name the floor is shown by. | required |
| `hub` | The absolute directory sessions start in. | required |
| `repos` | Absolute directories the sessions also work in, each passed as `--add-dir`. | required, `[]` for none |
| `color` | A CSS color renderers mark the floor's things with. | the tower's |
| `shelf` | Pages kept beside the floor's sessions: see [Shelf](#shelf). | none |
| `collections` | Collections only this floor has, beside every floor's. An id declared in both is an error. | none |
| `plugins` | Absolute plugin directories this floor's sessions load, beside every session's. | none |
| `worktrees`, `hiring`, `brief` | As at the top level, for this floor. | the top level's |

## Shelf

A project's shelf is a list of pages the user reads beside the floor's sessions, in the tower's sidebar and on Tower
3D's shelves. Each entry has a `label` and exactly one of:

| Key | Shows | Example |
|---|---|---|
| `html` | A page the project builds, a path relative to the hub. Its files beside or below it are served with it; nothing above it is. | `"shelf/radar/index.html"` |
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
shown to the user and the workers wherever it is listed). Workers add items with `tower keep <collection>` and list them with `tower kept`. Two ids mean
something to the tower: `drafts`, prompts waiting to start a worker or be sent to one, and `reviews`, one review
thread per checkout, written only through `tower note`. A floor keeping `games` shows each item as an arcade cabinet in
Tower 3D.

## Worktrees

| Key | Takes | Unset |
|---|---|---|
| `worktrees.branchPrefix` | What every branch the tower cuts starts with. | `tower/` |
| `worktrees.links` | A path inside each worktree → its source, relative to that repo's main checkout or absolute: symlinked in every cut. The path must be ignored by git. | none |
| `worktrees.cutByDefault` | Whether a new worker starts in a worktree of its own unless told where; off, it starts in the hub's main checkout. | `true` |

## Hiring

A guard against a chain of hires running away by accident; `tower review` is never limited.

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
| `help` (the `?` sheet) | global | `?` |
| `pane-terminal`, `pane-brief`, `pane-changes`, `pane-reviews` | global | `Alt+1` … `Alt+4` |
| `leave-terminal` | terminal | `Alt+Escape` |
| `newline`, `delete-word`, `delete-to-start`, `delete-to-end`, `line-start`, `line-end` | terminal | `Shift+Enter`, `Ctrl+Backspace`, `Meta+Backspace`, `Meta+Delete`, `Meta+ArrowLeft`, `Meta+ArrowRight` |
| `save-draft` | field | `Meta+S`, `Ctrl+S` |
| `submit` | field | `Meta+Enter`, `Ctrl+Enter` |
| `cancel-pick` (drop the lines picked for a note) | field | `Escape` |

`tower config check` fails a value that is no chord, at `keys.<id>` or `keys.<id>[n]`, and a chord bound to two
commands that can fire in the same place (a global chord with a modifier reaches terminals and fields too), at the
override, naming the other command: rebind that one too, or set it to `null`. An id no command has is a warning, and
ignored. A global chord with a modifier is kept from the terminal: `Ctrl` chords there are Claude's and the shell's
own keys, and the browser keeps some `Meta` chords (⌘W, ⌘T, ⌘Q) for itself.
