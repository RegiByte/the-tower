---
{
  "type": "decision",
  "name": "Renderers are declared in the config, served at /r/<name>/",
  "summary": "A renderer is a directory of built files the tower serves at /r/<name>/ at its origin. The core declares page (the tower page), week (The Week) and tower3d; the config's renderers add to them or override their fields, renderer picks what / opens, and each renderer's settings pass through unread. Available is derived: the entry exists. Each renderer declares in a renderer.json at its root the regions it draws contributions in, its kit, the chords it keeps and its default layout, served with it, and landing says where an extension's contributions land. A shelf entry { renderer: <name> } frames a declared renderer in the tower page, settings and all.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-29",
  "refs": ["hub/src/shared/model.ts#ShelfEntry", "hub/src/renderers.ts#BUILT_INS", "hub/src/renderers.ts#renderersOf", "hub/src/renderers.ts#defaultRenderer", "hub/src/renderers.ts#rendererFile", "hub/src/shelf.ts#hiddenBelow", "hub/src/shared/model.ts#RendererConfig", "hub/src/tower/http.ts#rendered", "hub/src/tower/http.ts#home", "hub/src/tower/http.ts#renderersRead", "hub/src/tower/tower.js", "hub/src/shared/shelf-words.ts#renderersHtml", "hub/renderers/tower3d/src/acts.ts#catName", "hub/src/renderers.ts#declaredAt", "hub/src/shared/regions.ts#Region", "hub/src/shared/regions.ts#landing", "hub/src/shared/regions.ts#CLI_REGIONS", "hub/renderers/page/renderer.json", "hub/renderers/tower3d/renderer.json", "hub/renderers/week/renderer.json"]
}
---
**Problem.** A renderer living only on a project's shelf reaches the user only if their config puts a path into
this repo on one project's shelf, `/` opens one fixed page, and a renderer of the user's own has nowhere to live but
inside a project.

**Why.** The tower is several renderers over the same data and an invitation to write another. A renderer belongs to
the system, not to a project: the user declares it, makes it the default, and keeps it outside the repo, where an
update of the core never touches it.

**How.**
- *The config.* `renderers: { <name>: { root, entry?, settings? } }` and `renderer: <name>`. `root` is the absolute
  directory of the renderer's built files, `entry` its page in it. The core declares `page`, `week` and `tower3d`
  ([`BUILT_INS`](ref:hub/src/renderers.ts#BUILT_INS)); a config entry under a built-in's name overrides its fields,
  so `{ "tower3d": { "settings": … } }` keeps the root ([`renderersOf`](ref:hub/src/renderers.ts#renderersOf)).
  `renderer` defaults to `page`; naming a renderer that isn't declared is a config error ([`defaultRenderer`](ref:hub/src/renderers.ts#defaultRenderer)).
- *Serving.* [`/r/<name>/`](ref:hub/src/tower/http.ts#rendered) serves the entry, and `/r/<name>/<file>` anything
  below the root but a path with a part starting with `.` ([`rendererFile`](ref:hub/src/renderers.ts#rendererFile),
  [`hiddenBelow`](ref:hub/src/shelf.ts#hiddenBelow)), at the tower's origin, unsandboxed: a declared renderer is
  trusted like the tower page and calls the routes directly. Its files carry CORS so a framed renderer loads them,
  which lets any site read them too: a root that is a repo or a project folder would otherwise give the web its
  `.git` and `.env`. `/` redirects to the configured renderer ([`home`](ref:hub/src/tower/http.ts#home)), keeping
  the query, and the browser keeps the fragment (`/#<id>`).
- *Available, derived.* A renderer is available while its entry exists. The core never builds a renderer: `npm run
  tower3d` copies Tower 3D's pages into `out/` beside its bundle, so its root is built output and exists only once
  built. An unbuilt renderer's URL shows a page naming the missing entry and linking those that are built; an
  undeclared name's lists the declared ones.
- *Discovery.* `GET /renderers` ([`renderersRead`](ref:hub/src/tower/http.ts#renderersRead)), computed per request:
  the default and each renderer with its root, entry, `available` and `settings`. The tower page and Tower 3D list
  them with [`renderersHtml`](ref:hub/src/shared/shelf-words.ts#renderersHtml).
- *Declared regions.* A renderer's `renderer.json` at its root ([`declaredAt`](ref:hub/src/renderers.ts#declaredAt))
  holds its `regions` ([`Region`](ref:hub/src/shared/regions.ts#Region): an id `<kind>.<place>`, the subject kind,
  what it holds, for views their scale and arity, and words for where it is), its `kit`, the chords it `keeps` and its
  default `layout`, all served in `GET /renderers` beside its fields; a renderer with no file declares nothing. The
  file declares for its `entry` (`index.html` unless set), so a second renderer on one root (Tower 3D's Lab) declares
  nothing from it. Tower 3D's build copies its file into `out/`. The `tower` command's regions are `cli.regions` in
  `/schema` ([`CLI_REGIONS`](ref:hub/src/shared/regions.ts#CLI_REGIONS)). An ask lands in the board's regions only
  when folded on the board, since one folded on another kind is about a floor's things. [`landing`](ref:hub/src/shared/regions.ts#landing)
  (`/cards.js`) answers which regions of each draw an extension's commands and fold contributions; `tower extensions
  check` prints it, and `docs/extending.md`'s table is generated from the shipped declarations by `npm run
  served:update`, its staleness failing `npm test`. A file that doesn't parse declares nothing and carries its `problem`, which `tower config check` warns of; the renderer, and every other, serves all the same. Kit, keeps
  and layout are served and not yet read.
- *Settings* are the renderer's own configuration, passed through unread. A renderer reads its own with
  `await tower.renderer()` ([`tower.js`](ref:hub/src/tower/tower.js)), which takes its name from its `/r/<name>/` path,
  framed or not; null for any other page. Tower 3D reads `settings.cats`, its cats' names
  ([`catName`](ref:hub/renderers/tower3d/src/acts.ts#catName)).
- *Shelves stay* for a project's own pages, framed and sandboxed, and `/run/<project>/<n>` runs one on its own.
- *A renderer on a shelf.* A shelf entry `{ "label": …, "renderer": "<name>" }`
  ([`ShelfEntry`](ref:hub/src/shared/model.ts#ShelfEntry)) names a declared renderer: the tower page frames
  `/r/<name>/` sandboxed and relays the API over `postMessage` as for an `html` entry, so a renderer runs inside
  another with its `settings`, and the shelf names no path inside a hub or a build.

**Alternatives considered.**
- *Renderers on the board.* They don't change with the system's sessions, and a read computed per request says
  whether one is built now.
- *A stored availability flag, or the core building renderers.* Availability is a fact on disk, and a renderer's
  build is its own business.
- *Tower 3D's root at its source directory, available when its bundle exists*: a second rule for one renderer.
  Copying the pages into `out/` makes the root the built output, one rule for every renderer.
- *A renderer's other pages on a shelf (`{ renderer, entry }`).* A second page is a renderer of its own, declared
  with its `entry` (Tower 3D's Lab: `root` its `out/`, `entry` `lab.html`). An `html` entry can't be one that
  fetches its files, as Lab fetches its models ([[bundled-renderer]]).

**Impact.** A user writes a renderer anywhere, declares it, and makes it the default without touching the repo.
