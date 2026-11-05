# Floors

New floors from the tower, a folder that already holds a project or a new project started from scratch, and the
repos of a floor.

## What it adds

### The tower page

**A `+` beside Floors and Stats** in the sidebar (the page's `board.sign` region), and **New floor** in the palette,
open the form in the main pane. It picks where the hub comes from:

- **Existing folder**: browse the machine's folders (`git` marks a repository) or type an absolute path.
- **New project**: a new folder (`<root>/<id>` unless you name another), `git init` and a first commit holding a README, so worktrees can be cut from it.

The name and id are derived as you type (the id from the name, the name from the folder), and the line
above the button says what will happen. The floor is on the board as soon as the tower reads the config it added.

### The API

| Verb | Input | Does |
|---|---|---|
| `floors/add` | `id`, `name`, `hub`, `repos`? | a floor for a folder that exists, with the other folders its sessions work in |
| `floors/start` | `id`, `name`, `into` | `git init`, a README and a first commit in `into`, then the floor |
| `floors/add-repo` | `project`, `path` | adds a folder to a floor's repos; one already there answers `unchanged` |
| `floors/remove-repo` | `project`, `path` | removes a repo from a floor; the folder stays as it is |

`GET /floors/dirs?path=/abs` lists a folder's folders (the settings' `root` when left out). The hub is where a floor's
sessions start by default (the new-worker form can start one elsewhere); its repos are other folders they also work
in, none for a project in one repository. Every repo must exist and not be the hub.

`add` and `start` add `projects.<id>` through the core's `config/add`, which refuses an id the config has, and checks
the config with it as `tower config check` does. A folder made before a refusal stays, and the refusal says how to
finish (add it as an existing folder). `add-repo` appends to the floor's `repos` through `config/append`;
`remove-repo` reads the config (`GET /config`), finds the repo's index and removes it through `config/remove` with
the repo as read, so a hand edit of the repos in between is refused (`changed`), not overwritten.

Workers: `tower x floors add '{"id": "my-app", "name": "my-app", "hub": "/abs/my-app", "repos": ["/abs/my-app-api"]}'`,
`tower x floors add-repo '{"project": "my-app", "path": "/abs/my-app-web"}'`.

## Settings

| Setting | Takes | Unset |
|---|---|---|
| `root` | The absolute folder the form starts in, and puts new projects under. | the home folder |
