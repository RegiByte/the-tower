---
{
  "type": "decision",
  "name": "Open any file the tower names: Finder and the user's editor",
  "summary": "Two generic verbs, `reveal` (Finder) and `edit` (the user's editor, at a line), take any path the system names: inside a project's dirs or the system root, or a file a worker showed. Quiet Finder and editor buttons sit wherever a renderer names a file, drawn once in the shared panels. The editor is the config's `editor`: argv templates, VS Code's `code` unless set.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/src/shared/api.ts#VERBS",
    "hub/src/tower/server.ts#onPath",
    "hub/src/tower/server.ts#unnamed",
    "hub/src/machine.ts#revealInFinder",
    "hub/src/machine.ts#runEditor",
    "hub/src/shared/model.ts#editorArgv",
    "hub/src/tower/server.ts#inEditor",
    "hub/src/shared/panels.ts#fileButtonsHtml",
    "hub/src/shared/panels.ts#fileCall",
    "hub/src/shared/panels.ts#threadFiles",
    "hub/src/bridge/board.ts#Board",
    "hub/src/directory.ts",
    "hub/renderers/page/index.html",
    "hub/renderers/tower3d/src/ui.ts#pictureHeadHtml",
    "hub/renderers/tower3d/src/ui.ts#draftHeadHtml"
  ],
  "links": [
    { "to": "tower-server", "verb": "serves", "carries": "POST /reveal {path}, POST /edit {path, line?}" }
  ]
}
---
**Problem.** The tower names many files: what workers show, review threads, the files a note quotes and a Changes
diff lists, kept items, the config. To grab one, the user asked a worker to open it or typed its folder by hand.
The only way out was `open {dir}`, which opens a project directory or worktree in a new editor window and nothing
else.

**Why.** The paths are already on the board or in the panels' data; what was missing was a verb and a button.
By [[agents-have-every-capability]], what a renderer can do a worker can too: a worker can reveal a file it made
for the user.

**How.**
- *Two verbs* in [`VERBS`](ref:hub/src/shared/api.ts#VERBS): `reveal {path}` shows the path selected in a Finder
  window (`open -R`); `edit {path, line?}` opens it in the user's editor. With VS Code's `code`, or Cursor, which shares its
  flags, the editor picks the window: a file opens in the window whose folder holds it, else the last active one; a
  folder in the window that has it open, else a new one. Checked live in Cursor: a file outside every open folder
  opened as a tab in the one open window. `open {dir}` keeps its new window.
- *The editor is data.* The config's `editor` holds an argv per thing the tower does: `window` (`{dir}`), `open`
  (`{path}`) and `goto` (`{path}`, `{line}`). [`editorArgv`](ref:hub/src/shared/model.ts#editorArgv) fills a
  template, each placeholder anywhere in an argument, and a placeholder the action doesn't take is a `config`
  error. With no `editor` the three are VS Code's (`code --new-window {dir}`, `code {path}`, `code --goto {path}:{line}`);
  a set `editor` needs all three, and one missing is a `config` error naming it, so one editor never mixes with another.
  [`inEditor`](ref:hub/src/tower/server.ts#inEditor) runs it with no shell
  ([`runEditor`](ref:hub/src/machine.ts#runEditor)); a command not on the tower's PATH is a `config` error naming
  the key, or saying the command is the default. The floor verb that offers `open` is `editor` (API version 17).
- *Paths the system names* ([`onPath`](ref:hub/src/tower/server.ts#onPath)): the path must be absolute (`invalid`
  otherwise), is resolved (`..` can't climb out) and compared with its links followed (`/tmp` is `/private/tmp`
  on macOS; a missing path through its nearest existing folder), and must be inside a project's dirs (their worktrees are below
  them), inside the system root (the config's directory: the config, logs and collections), or exactly a file a
  worker showed, in any session's facts. Otherwise `not_found` says so, as `open` does for a dir it doesn't know;
  a named path that isn't there is `lost`.
- *The board names the config* (`board.config`, its path): the system root is its directory, which no renderer
  could reach before.
- *Buttons drawn once.* [`fileButtonsHtml`](ref:hub/src/shared/panels.ts#fileButtonsHtml) draws a quiet Finder and
  editor pair as `data-reveal` / `data-edit` (`data-line`) spans, which may sit inside a tab button;
  [`fileCall`](ref:hub/src/shared/panels.ts#fileCall) turns a click into the call. Each renderer wires it once, as a
  capturing click listener on the document, so a button inside a file header or an anchor never also folds the
  file or jumps to Changes. The shared panels draw them on each changed file (not a deleted one), on the thread's
  own file once it has notes, and on each anchor (the editor at its first line), the anchor's repo found among the
  checkout's dirs ([`threadFiles`](ref:hub/src/shared/panels.ts#threadFiles)). The tower page adds them to the open
  showing's tab (files only), the open draft's head and a sidebar footer naming the config; Tower 3D to the open
  showing's tab, a gallery picture's head and the draft panel ([[shared-panels]], [[corkboard]]).
- *The CLI*: `tower reveal <path>` and `tower edit <path> [line]` ([[agent-directory]]).

**Alternatives considered.**
- One verb with a mode (`open {path, in: 'finder' | 'editor'}`): two things in one call, and a renderer
  branches on the mode anyway.
- Code paths per editor (a `cursor`, `code`, `zed` switch): every new editor is a change to the tower, where an
  argv template takes any command line, `$EDITOR` in a terminal among them.
- A default per action: a partial `editor` would run `code` for the actions it leaves out, and a missing `code`
  would be reported against a key the user never set.
- A full argv with no default: a fresh config would show buttons that fail; `code` is the most common editor and
  Cursor shares its flags.
- `cursor -r` / `code -r` (force reuse): on a folder it swaps the workspace of the user's last window out from under them.
- Any path at all: same-user processes are trusted, but a browser page reaching the tower shouldn't be able to make
  it open arbitrary files; the system's own paths cover every button.
- A file shown also allows its folder: the folder may hold anything; the file itself is what was shown.
- Moving the API version: the verbs and `board.config` are additions an older renderer reads past, as
  `review/append` was added without a move ([[renderer-api-contract]]).

**Impact.** Every file the tower names is one click from Finder or the user's editor, in both renderers, and the config is
reachable from the tower page. A renderer or worker gets both with `tower.call('reveal' | 'edit', …)`. `board()`
takes the system's paths (config and collections) in place of the collections root.
