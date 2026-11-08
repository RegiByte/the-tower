---
{
  "type": "decision",
  "name": "New floors and a floor's repos from the tower: the bundled floors extension over the config verbs and jobs",
  "summary": "The bundled floors extension adds a floor for a folder on the machine, with its repos, for a git repository cloned from its URL, or for a new project (git init, a README, a first commit), and adds or removes a floor's repos, each through the core's config verbs. A clone is a job of the jobs daemon; floors records what it did about each clone in its own stream, and a level-triggered board trigger adopts each clone that ended with exit 0 once, so a restart changes nothing and a floor removed by hand is never added back. Its form opens from the page's board.sign; a floor offers its Repos view; asks follow each clone.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-04",
  "reviewed": "2026-11-08",
  "refs": [
    "hub/extensions/floors/extension.json",
    "hub/extensions/floors/server.ts",
    "hub/extensions/floors/client/floor-form.ts#derived",
    "hub/extensions/floors/client/floor-form.ts#missing",
    "hub/extensions/floors/client/floor-form.ts#callOf",
    "hub/extensions/floors/client/dirs.ts#browser",
    "hub/extensions/floors/client/form.ts#mount",
    "hub/extensions/floors/client/repos.ts#mount",
    "hub/extensions/floors/client/new-floor.svg",
    "hub/src/shared/extensions.ts#BUNDLED",
    "hub/renderers/page/renderer.json",
    "hub/docs/config.md",
    "hub/extensions/floors/clones.ts#clonesOf",
    "hub/extensions/floors/clones.ts#adoptCalls",
    "hub/extensions/floors/clones.ts#holding",
    "hub/extensions/floors/clones.ts#asksOf",
    "hub/extensions/floors/clones.ts#carriesCredentials",
    "hub/extensions/floors/client/clones.ts#mount",
    "hub/renderers/page/regions.js",
    "hub/test/floors-clones.test.ts"
  ],
  "links": [
    {
      "to": "config-writes",
      "verb": "uses",
      "carries": "config/add, config/append, config/remove and GET /config"
    },
    {
      "to": "extensions",
      "verb": "uses",
      "carries": "verbs, a read, a command on the board and views on the board and a floor"
    },
    {
      "to": "renderer-is-disposable",
      "verb": "follows",
      "carries": "a want built as an extension over generic core verbs"
    },
    {
      "to": "jobs",
      "verb": "uses",
      "carries": "a clone as a job, its end read from board.jobs, its screen through the kit's terminal"
    }
  ]
}
---
**Problem.** A floor is a key of the config, and its repos a list under it. Only a hand edit, or a worker asked in
words, could add a floor or change its repos. The config verbs ([[config-writes]]) made the write a checked core
call; nothing in the page used them.

**Why.** The core keeps the write; what a floor means, where its hub comes from and how a folder is picked is one want
among many that write intent, so it is an extension ([[extensions]], [[renderer-is-disposable]]), bundled so a new
tower can add its first floors from the page. The config stays intent ([[logs-are-facts]]): nothing is logged, and the
board shows a change once the tower reads the file again.

**How.**

- [`server.ts`](ref:hub/extensions/floors/server.ts): `add {id, name, hub, repos?}` checks that the hub and every repo
  are folders, that no repo is the hub and none is named twice, then calls `tower/config/add` with `projects.<id>`.
  `start {id, name, into}` makes the folder, runs `git init`, writes a README and commits it, since worktrees are cut
  from a commit ([[tower-cuts-worktrees]]), then adds the floor; a folder made before a refusal stays, and the
  refusal says how to finish. `add-repo` calls `config/append`, so a repo already there answers `unchanged`.
  `remove-repo` reads `tower/config`, finds the repo's index and calls `config/remove` with the repo as `was`: two
  calls, the second refused (`changed`) when a hand edit moved the list in between. `dirs` lists a folder's folders,
  since a browser's folder picker gives no absolute path. Git runs through `ctx.run` ([[env-scrub]]) and every run is
  short-lived.
- The form ([`form.ts`](ref:hub/extensions/floors/client/form.ts)) derives what isn't typed
  ([`derived`](ref:hub/extensions/floors/client/floor-form.ts#derived)), says what the hub is (where sessions start by
  default; the new-worker form can start one elsewhere), and picks the hub and each repo with one folder browser
  ([`browser`](ref:hub/extensions/floors/client/dirs.ts#browser)). Its command sits in the page's `board.sign`
  ([`renderer.json`](ref:hub/renderers/page/renderer.json)) with a glyph of its own, since a `+` on a floor's row
  starts a worker.
- The Repos view ([`repos.ts`](ref:hub/extensions/floors/client/repos.ts#mount)) is on the floor kind, so the page
  offers it as Open Repos under the floor's folders and in the palette; it draws the floor as the board has it.
- **Clone** runs `git clone` as a job ([[jobs]]) with `GIT_TERMINAL_PROMPT=0` and `ssh -o BatchMode=yes`, since nothing
  types into a job, so a restart of the tower doesn't stop it. Its argv is kept in the jobs log, so a URL carrying
  credentials is refused ([`carriesCredentials`](ref:hub/extensions/floors/clones.ts#carriesCredentials)). Floors
  records what it did in its own stream: the clone it started and the floor it is for (`s`), the floor added (`a`),
  why adding was refused (`r`), a clone dismissed or retried (`d`). What the clone came to is its job's, never logged
  by floors ([`clonesOf`](ref:hub/extensions/floors/clones.ts#clonesOf)). A board trigger reading only the next board
  calls `adopt` for each clone that ended with exit 0 and has none of those facts
  ([`adoptCalls`](ref:hub/extensions/floors/clones.ts#adoptCalls)): level-triggered, so a restart that fires it again
  adds nothing twice, and a floor removed by hand is never added back. `exists` with the same hub counts as added.
- A clone holds its floor's id and folder while running, while its floor is still to add, and before the board
  carries its job, which it learns of a moment after it starts
  ([`holding`](ref:hub/extensions/floors/clones.ts#holding)); an in-process hold covers the call that is starting it.
- Each clone is an ask on the board ([`asksOf`](ref:hub/extensions/floors/clones.ts#asksOf)): running, Stop and
  Watch; cloned but refused, Add as floor and Dismiss; failed, stopped or lost, Remove (only its folder, only with no
  running job in it and no floor holding it, only when it holds a `.git`, asking first), Retry and Dismiss. Watch
  shows the clones' screens through the kit's terminal on `job/<id>`, read only
  ([`clones.ts`](ref:hub/extensions/floors/client/clones.ts#mount)).

**Alternatives considered.**

- *Clone run by `ctx.run`, as #391 first did.* A clone can take minutes as a hidden child of the tower, with no
  cancel and nothing recorded if the tower stops. A job outlives the tower, and its end is a fact.
- *Adopt when the floor isn't in the config yet, with no fact of floors' own.* A floor removed by hand would be added
  back on the next board, and two boards before the config is read again would both add it.
- *Repo verbs as `repos/add` and `repos/remove`.* A verb's name takes no slash; `add-repo` and `remove-repo` say the
  same.
- *A sign command for Repos beside the view.* The page already offers a floor's views as Open Repos; a command would
  draw the same thing twice.
- *Removing a floor from the page.* Out of scope: it touches workers, worktrees and logs of that floor.
