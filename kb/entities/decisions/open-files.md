---
{
  "type": "decision",
  "name": "Open any file the tower names: Finder and the user's editor",
  "summary": "Two generic verbs, `reveal` (Finder) and `edit` (the user's editor, at a line), take any path the system names: inside a project's dirs or the system root, or a file a worker showed. Quiet Finder and editor buttons sit wherever a renderer names a file, drawn once in the shared panels. The editor is the config's `editor`: argv templates, VS Code's `code` unless set.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-23",
  "refs": [
    "hub/src/shared/api.ts#VERBS",
    "hub/src/tower/server.ts#onPath",
    "hub/src/tower/server.ts#unnamed",
    "hub/src/machine.ts#revealInFinder",
    "hub/src/machine.ts#runEditor",
    "hub/src/shared/model.ts#editorArgv",
    "hub/src/tower/server.ts#inEditor",
    "hub/src/shared/file-acts.ts#fileButtonsHtml",
    "hub/src/shared/file-acts.ts#fileSpansHtml",
    "hub/src/shared/file-acts.ts#fileCall",
    "hub/src/shared/reviews-panel.ts#threadFiles",
    "hub/src/bridge/board.ts#Board",
    "hub/src/cli-verbs.ts#CLI_VERBS",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/renderers/tower3d/src/ui.ts#pictureHeadHtml",
    "hub/renderers/tower3d/src/ui.ts#draftHeadHtml"
  ],
  "links": [
    { "to": "tower-server", "verb": "serves", "carries": "POST /reveal {path}, POST /edit {path, line?}" }
  ]
}
---
**Problem.** The tower names many files: what workers show, review threads, the files a note quotes and a Changes
diff lists, kept items, the config. To grab one, the user asked a worker to open it or typed its folder by hand:
`open {dir}` opens only a project directory or worktree, in a new editor window.

**Why.** The paths are already on the board or in the panels' data; what was missing was a verb and a button.
By [[agents-have-every-capability]], what a renderer can do a worker can too: a worker can reveal a file it made
for the user.

**How.**
- *Two verbs* in [`VERBS`](ref:hub/src/shared/api.ts#VERBS): `reveal {path}` shows the path selected in a Finder
  window (`open -R`); `edit {path, line?}` opens it in the user's editor. With VS Code's `code`, or Cursor, which shares its
  flags, the editor picks the window: a file opens in the window whose folder holds it, else the last active one; a
  folder in the window that has it open, else a new one. `open {dir}` keeps its new window.
- *The editor is data.* The config's `editor` holds an argv per thing the tower does: `window` (`{dir}`), `open`
  (`{path}`) and `goto` (`{path}`, `{line}`). [`editorArgv`](ref:hub/src/shared/model.ts#editorArgv) fills a
  template, each placeholder anywhere in an argument, and a placeholder the action doesn't take is a `config`
  error. With no `editor` the three are VS Code's (`code --new-window {dir}`, `code {path}`, `code --goto {path}:{line}`);
  a set `editor` needs all three, and one missing is a `config` error naming it, so one editor never mixes with another.
  [`inEditor`](ref:hub/src/tower/server.ts#inEditor) runs it with no shell
  ([`runEditor`](ref:hub/src/machine.ts#runEditor)); a command not on the tower's PATH is a `config` error naming
  the key, or saying the command is the default. The floor verb that offers `open` is `editor`.
- *Paths the system names* ([`onPath`](ref:hub/src/tower/server.ts#onPath)): the path must be absolute (`invalid`
  otherwise), is resolved (`..` can't climb out) and compared with its links followed (`/tmp` is `/private/tmp`
  on macOS; a missing path through its nearest existing folder), and must be inside a project's dirs (their worktrees are below
  them), inside the system root (the config's directory: the config, logs and collections), or exactly a file a
  worker showed, in any session's facts. Otherwise `not_found` says so, as `open` does for a dir it doesn't know;
  a named path that isn't there is `lost`.
- *The board names the config* (`board.config`, its path): the system root is its directory, which no renderer
  could reach before.
- *Buttons drawn once.* [`fileButtonsHtml`](ref:hub/src/shared/file-acts.ts#fileButtonsHtml) draws a quiet Finder and
  editor pair as `data-reveal` / `data-edit` (`data-line`) buttons, each named for its file ("reveal main.md in
  Finder"), in the Tab order; [`fileSpansHtml`](ref:hub/src/shared/file-acts.ts#fileSpansHtml) draws the same pair as
  `role=button` spans for the one place a button may not sit, inside another button;
  [`fileCall`](ref:hub/src/shared/file-acts.ts#fileCall) turns a click into the call. Each renderer wires it once, as a
  capturing click listener on the document, so a button inside a file header or an anchor never also folds the
  file or jumps to Changes. The shared panels draw them on changed files, a thread's file and each note's anchor (the
  editor at its first line, the anchor's repo found by [`threadFiles`](ref:hub/src/shared/reviews-panel.ts#threadFiles)), and
  each renderer wherever else it names a file: a showing, a draft, the config ([[shared-panels]], [[corkboard]]).
- *The CLI*: `tower reveal <path>` and `tower edit <path> [line]` ([[agent-directory]]).

**Alternatives considered.**
- One verb with a mode (`open {path, in: 'finder' | 'editor'}`): two things in one call, and a renderer
  branches on the mode anyway.
- Code paths per editor (a `cursor`, `code`, `zed` switch): every new editor is a change to the tower, where an
  argv template takes any command line, `$EDITOR` in a terminal among them.
- A default per action: a partial `editor` would run `code` for the actions it leaves out, and a missing `code`
  would be reported against a key the user never set.
- Any path at all: same-user processes are trusted, but a browser page reaching the tower shouldn't be able to make
  it open arbitrary files; the system's own paths cover every button.
- A file shown also allows its folder: the folder may hold anything; the file itself is what was shown.

**Impact.** Every file the tower names is one click from Finder or the user's editor, in every renderer. A renderer or
worker gets both with `tower.call('reveal' | 'edit', …)`.
