---
{
  "type": "decision",
  "name": "New floors and a floor's repos from the tower: the bundled floors extension over the config verbs",
  "summary": "The bundled floors extension adds a floor for a folder on the machine, with its repos, or for a new project (git init, a README, a first commit), and adds or removes a floor's repos, each through the core's config verbs: config/add for a floor, config/append for a repo, and config/remove with the repo as read, after finding its index in GET /config. Its form opens from the page's board.sign; a floor offers its Repos view. Every git step is short-lived; clone waits on a jobs primitive.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-04",
  "reviewed": "2026-11-04",
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
    "hub/docs/config.md"
  ],
  "links": [
    { "to": "config-writes", "verb": "uses", "carries": "config/add, config/append, config/remove and GET /config" },
    { "to": "extensions", "verb": "uses", "carries": "verbs, a read, a command on the board and views on the board and a floor" },
    { "to": "renderer-is-disposable", "verb": "follows", "carries": "a want built as an extension over generic core verbs" }
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

**Alternatives considered.**

- *Clone in this extension, run by `ctx.run`.* A clone can take minutes as a hidden child of the tower, with no
  cancel and nothing recorded if the tower stops. It waits on a jobs primitive, and will record what it adopted in
  the extension's own stream, so a floor the user removed by hand isn't added back.
- *Repo verbs as `repos/add` and `repos/remove`.* A verb's name takes no slash; `add-repo` and `remove-repo` say the
  same.
- *A sign command for Repos beside the view.* The page already offers a floor's views as Open Repos; a command would
  draw the same thing twice.
- *Removing a floor from the page.* Out of scope: it touches workers, worktrees and logs of that floor.
