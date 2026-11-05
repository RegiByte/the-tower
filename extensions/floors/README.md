# Floors

New floors from the tower, a folder that already holds a project, a git repository cloned from its URL, or a new
project started from scratch, and the repos of a floor.

## What it adds

### The tower page

**New floor beside Floors and Stats** in the sidebar (the page's `board.sign` region, drawn as stacked floors under
a small plus, since a `+` on a floor's row is a new worker), and in the palette, opens the form in the main pane. It
picks where the hub comes from:

- **Existing folder**: browse the machine's folders (`git` marks a repository) or type an absolute path. **Repos**,
  optional, are the other folders its sessions also work in, each picked with the same browser; a project in one
  repository leaves them empty.
- **Clone a repository**: an https or ssh URL, cloned into `<parent>/<id>`, the parent picked with the same browser
  (the settings' `root` at first), unless you type another folder.
- **New project**: a new folder (`<parent>/<id>` the same way), `git init` and a first commit holding a README, so
  worktrees can be cut from it.

The name and id are derived as you type (the id from the name, the name from the folder or the URL), and the line
above the button says what will happen.

**A clone is a job** of the jobs daemon, so restarting the tower doesn't stop it (restarting the jobs daemon does). A
note at the top of the sidebar follows it: *Cloning …* with Stop and Watch while it runs; once it ends with exit 0 the
floor is added and the note goes. A clone that failed, was stopped or was lost keeps a note with Remove (deletes its
folder, only if git started it, asking first), Retry and Dismiss. **Watch clones**, in the palette, shows each running
clone's screen, and a failed one's for a few minutes. The floor is on the board as soon as the tower reads the config it added.

**Open Repos** under a floor's folders (and in the palette on a floor) shows its hub and repos in the main pane:
remove a repo, or browse to a folder and add it.

### The API

| Verb | Input | Does |
|---|---|---|
| `floors/add` | `id`, `name`, `hub`, `repos`? | a floor for a folder that exists, with the other folders its sessions work in |
| `floors/clone` | `id`, `name`, `url`, `into` | `git clone` into `into` as a job, answering `{t: 'started', job}`; the floor is added when it ends with exit 0 |
| `floors/start` | `id`, `name`, `into` | `git init`, a README and a first commit in `into`, then the floor |
| `floors/adopt` | `job` | adds a cloned clone's floor: the board trigger calls it once per clone |
| `floors/cancel`, `floors/remove`, `floors/retry`, `floors/dismiss` | `job` | stop a clone; delete what a failed one left; clone it again; forget it |
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

### Clones as facts

`clone` reserves its id and folder against floors' clones in flight, refuses a URL carrying credentials (the jobs log
keeps a job's argv, never its env), and runs `git clone` with `GIT_TERMINAL_PROMPT=0` and `ssh -o BatchMode=yes`, since
nothing types into a job. Floors records what it did in its own stream, `clones`: the clone it started (`s`), the floor
it added (`a`), why adding was refused (`r`), a clone dismissed or retried (`d`). What a clone came to is its job's, on
`board.jobs`. A board trigger reading only the latest board calls `adopt` for each clone that ended with exit 0 and has
no `a`, `r` or `d`: a restart that fires it again adds nothing twice, and a floor removed by hand is never added back.
A floor of the same id and hub already there counts as added. `board.x.floors.clones` carries each clone.

## Settings

| Setting | Takes | Unset |
|---|---|---|
| `root` | The absolute folder the form starts in, and puts new projects under. | the home folder |
