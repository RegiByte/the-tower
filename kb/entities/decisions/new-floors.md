---
{
  "type": "decision",
  "name": "New floors from the tower: config/add in the core, the floors extension on it",
  "summary": "The core's config/add adds a key the config doesn't hold yet, checked as tower config check checks it and refused on a fail it would bring, then writes the file whole: the one way the tower writes the config. The bundled floors extension readies a hub (a folder there, a clone, or a new repository with a first commit) and adds projects.<id> through it, from a form on the board that the page's board.sign region opens.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-04",
  "reviewed": "2026-11-04",
  "refs": ["hub/src/config-add.ts#withKey", "hub/src/config-add.ts#newFails", "hub/src/config-add.ts#addToConfig", "hub/src/shared/api.ts#VERBS", "hub/src/tower/dispatch.ts#dispatch", "hub/src/shared/extensions.ts#RESERVED", "hub/src/shared/extensions.ts#BUNDLED", "hub/extensions/floors/extension.json", "hub/extensions/floors/server.ts", "hub/extensions/floors/client/floor-form.ts", "hub/extensions/floors/client/form.ts", "hub/renderers/page/renderer.json", "hub/renderers/page/sidebar.js", "hub/docs/config.md"]
}
---
**Problem.** A floor is a key of the config, which only a hand edit or a worker asked in words could add. A renderer
had no way to make one: no verb wrote the config, and an extension's server code holds no path to it, so a New floor
button could only be a renderer reaching into a file the tower reads, unchecked and racing a hand edit.

**Why.** The capability lands in the order [[renderer-is-disposable]] gives: what can't be an extension enters the
core as a generic verb, and the want on top is an extension ([[extensions]]). Writing the config is the core's,
since the core reads it and knows what it can take; adding a floor from a folder, a URL or nothing is one want among
many that write intent (a shelf entry, a collection, an extension's entry). The config stays intent
([[logs-are-facts]]): nothing is logged, and the board shows the floor once the tower reads the file again.

**How.**

- [`withKey`](ref:hub/src/config-add.ts#withKey), pure, adds a value at a key path where none is, a new object at
  every step: `exists` when the key is there, so nothing the user wrote is overwritten, `refused` when a key on the way
  holds no object, `invalid` for a name that reaches a prototype.
- [`newFails`](ref:hub/src/config-add.ts#newFails) checks the config with it by `configProblems`: only fails it
  would bring refuse it, since a fail the user already has is theirs to fix.
- [`addToConfig`](ref:hub/src/config-add.ts#addToConfig) reads, checks and writes in one synchronous step, so two
  additions in the tower never interleave, beside the file's real path and with its mode, then renames into place. The
  file is rewritten as JSON indented by two spaces. `config` became a reserved first segment
  ([`RESERVED`](ref:hub/src/shared/extensions.ts#RESERVED)).
- The bundled `floors` extension ([`server.ts`](ref:hub/extensions/floors/server.ts)) offers `add`, `clone` and
  `start`, each readying the hub, then calling `tower/config/add` with `projects.<id>` and no repos. Git runs through
  `ctx.run` ([[env-scrub]]) with no terminal prompt, so a clone that needs a password fails, saying so; a new
  repository gets a README in a first commit, since worktrees are cut from a commit ([[tower-cuts-worktrees]]).
  `dirs` lists a folder's folders, since a browser's folder picker gives no absolute path.
- Its view, the form on the board ([`form.ts`](ref:hub/extensions/floors/client/form.ts)), derives what isn't typed
  ([`floor-form.ts`](ref:hub/extensions/floors/client/floor-form.ts)); its command opens it. The page holds commands
  about no one floor in a region of its own, `board.sign`, beside Floors and Stats
  ([`renderer.json`](ref:hub/renderers/page/renderer.json)).

**Alternatives considered.**

- *All in an extension, writing the file itself.* Reaches a file another piece owns, unchecked, and racing a hand edit.
- *A whole-file `config/write` with a version.* More general, but a client would read and rewrite keys it doesn't
  mean to touch; adding only where nothing is needs no version and overwrites nothing.
- *A worker asked to set the floor up.* Already possible in words; a form is quicker and gives the same verbs to every
  renderer and worker.
