---
{
  "type": "decision",
  "name": "Renderers are declared in the config, served at /r/<name>/",
  "summary": "A renderer is a directory of built files the tower serves at /r/<name>/ at its origin. The core declares page (the tower page) and tower3d; the config's renderers add to them or override their fields, renderer picks what / opens, and each renderer's settings pass through unread. Available is derived: the entry exists. A shelf entry { renderer: <name> } frames a declared renderer in the tower page, settings and all.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/model.ts#ShelfEntry", "hub/src/renderers.ts#renderersOf", "hub/src/renderers.ts#defaultRenderer", "hub/src/renderers.ts#rendererFile", "hub/src/shared/model.ts#RendererConfig", "hub/src/tower/server.ts#rendered", "hub/src/tower/server.ts#home", "hub/src/tower/server.ts#renderersRead", "hub/src/tower/tower.js", "hub/src/shared/cards.ts#renderersHtml", "hub/renderers/tower3d/src/acts.ts#catName"]
}
---
**Problem.** Renderers could only live on a project's shelf. Tower 3D reached the user because their config put a
path relative to this repo's hub on one project's shelf, and `/` was wired to the tower page. A user who doesn't add
the repo as a project never saw Tower 3D, and a renderer of their own had nowhere to live but inside a project.

**Why.** The tower is two renderers over the same data and an invitation to write another. A renderer belongs to
the system, not to a project: the user declares it, makes it the default, and keeps it outside the repo, where an
update of the core never touches it.

**How.**
- *The config.* `renderers: { <name>: { root, entry?, settings? } }` and `renderer: <name>`. `root` is the absolute
  directory of the renderer's built files, `entry` its page in it (`index.html`). The core declares `page`
  (`renderers/page/`, the tower page) and `tower3d` (`renderers/tower3d/out/`); a config entry under a built-in's name
  overrides its fields, so `{ "tower3d": { "settings": … } }` keeps the root
  ([`renderersOf`](ref:hub/src/renderers.ts#renderersOf)). `renderer` defaults to `page`; naming none is a config
  error ([`defaultRenderer`](ref:hub/src/renderers.ts#defaultRenderer)).
- *Serving.* [`/r/<name>/`](ref:hub/src/tower/server.ts#rendered) serves the entry, and `/r/<name>/<file>` anything
  below the root ([`rendererFile`](ref:hub/src/renderers.ts#rendererFile)), at the tower's origin, unsandboxed: a
  declared renderer is trusted like the tower page and calls the routes directly. `/` redirects to the configured one
  ([`home`](ref:hub/src/tower/server.ts#home)), keeping the query, and the browser keeps the fragment (`/#<id>`).
- *Available, derived.* A renderer is available while its entry exists. The core never builds a renderer: `npm run
  tower3d` copies Tower 3D's pages into `out/` beside its bundle, so its root holds built output and exists only once
  built. An unbuilt renderer's URL shows a page naming the missing entry and linking the renderers that are built,
  and an undeclared name's URL a page listing the declared ones.
- *Discovery.* `GET /renderers` ([`renderersRead`](ref:hub/src/tower/server.ts#renderersRead)), computed per request:
  `{ default, renderers }`, each with its name, root, entry, `available` and `settings`. Nothing about renderers goes
  on the board. The tower page lists them at the foot of its sidebar, Tower 3D on its pause card, both drawn by [`renderersHtml`](ref:hub/src/shared/cards.ts#renderersHtml).
- *Settings.* `settings` is the renderer's own configuration, passed through unread. A renderer reads its own with
  `await tower.renderer()` ([`tower.js`](ref:hub/src/tower/tower.js)), which takes its name from its `/r/<name>/` path,
  framed or not, and reads the rest from `GET /renderers` (relayed when framed); null for any other page. Tower 3D's first: `settings.cats`, its cats' names by coat (`tabby`, `calico`,
  `tuxedo`), generic names unless set ([`catName`](ref:hub/renderers/tower3d/src/acts.ts#catName)).
- *Shelves stay* for a project's own pages, framed and sandboxed, and `/run/<project>/<n>` still runs one on its own.
- *A renderer on a shelf.* A shelf entry `{ "label": …, "renderer": "<name>" }`
  ([`ShelfEntry`](ref:hub/src/shared/model.ts#ShelfEntry)) names a declared renderer: the tower page frames
  `/r/<name>/` sandboxed, at an opaque origin, and relays the API over `postMessage` as for an `html` entry, so a
  renderer runs inside another with its `settings`, and the shelf names no path inside a hub or a build. Its new tab
  is `/r/<name>/`. Tower 3D stands one as a TV; framed it hands the entry to the tower's own view, on its own it opens
  a new tab (it relays nothing to the pages it frames). An unbuilt or undeclared renderer frames the page that says so.

**Alternatives considered.**
- *Renderers on the board.* Rejected: they don't change with the system's sessions, and a read computed per request
  says whether one is built now.
- *A stored availability flag, or the core building renderers.* Rejected: availability is a fact on disk, and a
  renderer's build is its own business.
- *Tower 3D's root at its source directory, available when `out/tower3d.js` exists.* Rejected: it needs a second
  file per renderer to test. Copying the pages into `out/` makes the root the built output, one rule for every
  renderer.
- *A renderer's other pages on a shelf (`{ renderer, entry }`).* Not built: a second page is a renderer of its own,
  declared with its `entry` (Tower 3D's Lab: `root` its `out/`, `entry` `lab.html`), or stays an `html` entry.
- *Splitting renderers into packages.* Out of scope: the HTTP seam (`/tower.js`, `/schema`, the served modules) is the
  boundary.

**Impact.** A user writes a renderer anywhere, declares it, and makes it the default without touching the repo.
Tower 3D runs at `/r/tower3d/` (its Lab at `/r/tower3d/lab.html`), and the recipes (`drive`, `tool:frames`, the
sandbox) use that URL. Configs drop their Tower 3D shelf entries, or swap them for `{ "renderer": "tower3d" }`, which
keeps its settings framed. API version 18; the shelf's `renderer` kind, 23.
