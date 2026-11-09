---
{
  "type": "decision",
  "name": "A renderer that outgrows a file is bundled",
  "summary": "A renderer too big for one html file is TypeScript modules bundled by esbuild into one ES module per page, with Three.js and xterm inside and the library (/lib/) and extension clients (/x/) left out, imported at run time; its models are built beside it as files it fetches as it starts: a renderer's files are served with CORS, so it reads them framed too.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-11-09",
  "refs": ["hub/package.json", "hub/renderers/tower3d/tsconfig.json", "hub/renderers/tower3d/src/api.ts", "hub/renderers/tower3d/src/cards.ts", "hub/renderers/tower3d/src/clients.ts", "hub/renderers/tower3d/src/files.ts#bytesOf", "hub/src/tower/http.ts#ANY_ORIGIN", "hub/src/tower/served.ts#importMap", "hub/src/tower/served.ts#withImportMap", "hub/scripts/served-modules.ts#answerModule", "hub/scripts/tower3d-boot.ts"]
}
---
**Context.** A first-person tower is too large for one html file. Framed in the tower, a page runs at an opaque
origin: an `html` shelf page fetches nothing beside it and imports no module there, while a declared renderer's
files carry CORS ([`ANY_ORIGIN`](ref:hub/src/tower/http.ts#ANY_ORIGIN), the rule and its cost in
[[renderers-in-config]]), so framed as a `renderer` shelf entry it loads what is below its root as it does at
`/r/<name>/`. A renderer draws what the core and the extensions mean, so it must run the same code they serve
([[library]]): one instance of each library module, shared with the extension clients it draws.

**Decision.** [[tower3d]]'s source is TypeScript modules, bundled by esbuild into one minified ES module per page
(`out/tower3d.js`, the lab's, the dresser's, the editor's), each loaded as `<script type="module">`, the renderer's own page after the classic `/tower.js`. Three.js and `@xterm/xterm` come from npm and are bundled in. The library and the
extension clients are not: the build passes `--external:/lib/*` and `--external:/x/*`, so each `/lib/<module>.js`
and `/x/<cap>/<file>.js` import stays a URL the browser resolves at run time. esbuild honours the tsconfig's `/lib/*`
path, so without the flag it would quietly bundle a copy instead; `npm run test:tower3d-boot` fails when a built page
imports nothing from `/lib/`. The renderer's [`cards.ts`](ref:hub/renderers/tower3d/src/cards.ts) and
[`api.ts`](ref:hub/renderers/tower3d/src/api.ts) re-export the library modules its files read. Extension clients come
through [`clients.ts`](ref:hub/renderers/tower3d/src/clients.ts), which loads each with `clientOf`: a user extension
that takes over a capability may serve no such file, and the renderer goes on without what it drew. The tower serves
the four pages through its module-page path: an import map naming every served module at its hashed URL
([`importMap`](ref:hub/src/tower/served.ts#importMap), [`withImportMap`](ref:hub/src/tower/served.ts#withImportMap)),
with preloads, and the hashed files cached as immutable. The dresser and editor tool servers answer the same module
URLs from the same source ([`answerModule`](ref:hub/scripts/served-modules.ts#answerModule)). Its binary files (the
`.glb` models, the kit, the fixture boards' test video) are built with esbuild's `file` loader into `out/assets/`,
named by a hash of their bytes; each import is the file's URL relative to the page, and
[`bytesOf`](ref:hub/renderers/tower3d/src/files.ts#bytesOf) fetches each once per page.

**Alternatives considered.**
- *One IIFE per page with the library bundled in* (the shape until 2026-11-08): it ran its own copy of the core's
  code, apart from the one the extension clients and the tower serve, so it could not draw what a client draws, and a
  renamed library module broke it only at build time in the checkout.
- *Plain ES modules beside an `html` shelf page*: these work only at `/run` and break on the shelf.
- *`Access-Control-Allow-Origin` on shelf files*: this would let any site in the browser read them. Shelf pages
  stay as they are: they fetch nothing beside them.
- *Models embedded in the bundle (esbuild's `binary` loader)*: base64 in the script, larger than the files, decoded
  and parsed as JavaScript on every load, and copied into each page.
- *esbuild's `splitting`, the pages sharing chunks*: a lazily imported chunk is a dynamic import, and the tower's
  module-page path maps and preloads only the static imports of a page's script, so the library graph behind the
  chunk would be neither hashed nor preloaded. Without splitting, esbuild hoists every `/lib/` import to the top of
  each page's module. What the four pages share besides the library is three.js and the loaders, and the lab,
  dresser and editor are seldom open together.
- *Browser caching of the renderer's own hashed files*: the tower serves every renderer file `no-store`
  ([`serveFile`](ref:hub/src/tower/http.ts#serveFile)), so `out/tower3d.js` is fetched on each load. An immutable
  header for hashed renderer names is a server change to make only if a measurement asks for it.
- *Staying in one file*: rejected for size, even with no build step.

**Consequences.** The renderer has a build step, and its output is git-ignored; `npm run tower3d` measures the
KayKit kit into one file (`out/kaykit/kit.kaykit`, [[office-kaykit]]), then clears `out/assets/` so old hashes don't
pile up: a kit that fails leaves the last build whole. A first load fetches the library as separate modules (about
135 on a busy board, 1.6 MB), which a later load takes from the browser's cache; the page's own module is fetched
each time. Tower 3D's fixture boards are data (`renderers/tower3d/fixtures/*.json`, [[tower3d-door]]), copied to
`out/fixtures/` by `npm run tower3d` and fetched only on a fixture page. No file of the core is bundled: what Tower 3D draws
alike with the page comes from the library or is the page's own view, mounted ([[ui-model]]). Tower 3D sees code change under it as the page does, and
standalone says so with a reload (framed, the page's own notice does). Models are files beside the pages or come
from a CORS-enabled CDN, never shelf files; Tower 3D's own are Blender scripts (`renderers/tower3d/models/*.py`,
`npm run tower3d:models`) exported to committed `.glb` files. The build copies the four pages into `out/` beside
their modules, so `out/` is the built renderer ([[renderers-in-config]]); a page of it on a shelf is a `renderer`
entry, never an `html` one, which can't fetch its models. Fixture frames stay byte for byte the same across loads
because every model file is fetched before any is parsed: materials are made in parse order, and that order breaks
ties in the draw order ([`loadModels`](ref:hub/renderers/tower3d/src/models.ts#loadModels)). A next renderer that
grows past a file follows the same pattern.
