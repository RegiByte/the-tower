# Floors

New floors from the tower: a folder that already holds a project, a git repository cloned from its URL, or a new
project started from scratch.

## What it adds

### The tower page

**A `+` beside Floors and Stats** in the sidebar (the page's `board.sign` region), and **New floor** in the palette,
open the form in the main pane. It picks where the hub comes from:

- **Existing folder**: browse the machine's folders (`git` marks a repository) or type an absolute path.
- **Clone a repository**: an https or ssh URL, cloned into `<root>/<id>` unless you name another folder.
- **New project**: a new folder, `git init` and a first commit holding a README, so worktrees can be cut from it.

The name and id are derived as you type (the id from the name, the name from the folder or the URL), and the line
above the button says what will happen. The floor is on the board as soon as the tower reads the config it added.

### The API

| Verb | Input | Does |
|---|---|---|
| `floors/add` | `id`, `name`, `hub` | a floor for a folder that exists |
| `floors/clone` | `id`, `name`, `url`, `into` | `git clone` into `into` (made with its parents, absent or empty), then the floor |
| `floors/start` | `id`, `name`, `into` | `git init`, a README and a first commit in `into`, then the floor |

`GET /floors/dirs?path=/abs` lists a folder's folders (the settings' `root` when left out). Each verb adds
`projects.<id>` with no repos through the core's `config/add`, which refuses an id the config has, and checks the
config with it as `tower config check` does. A clone runs without a terminal: a repository that asks for a password
fails, saying so. A folder made before a refusal stays, and the refusal says how to finish (add it as an existing
folder).

Workers: `tower x floors add '{"id": "my-app", "name": "my-app", "hub": "/abs/my-app"}'`.

## Settings

| Setting | Takes | Unset |
|---|---|---|
| `root` | The absolute folder the form starts in, and puts clones and new projects under. | the home folder |
