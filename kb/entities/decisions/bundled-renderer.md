---
{
  "type": "decision",
  "name": "A renderer that outgrows a file is bundled",
  "summary": "A renderer too big for one html file is TypeScript modules bundled by esbuild into one classic script beside its page, with Three.js and xterm inside, and its models built beside it as files it fetches as it starts: a renderer's files are served with CORS, so it reads them framed too.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-29",
  "refs": ["hub/package.json", "hub/renderers/tower3d/tsconfig.json", "hub/renderers/tower3d/src/api.ts", "hub/renderers/tower3d/src/files.ts#bytesOf", "hub/src/tower/http.ts#ANY_ORIGIN"]
}
---
**Context.** A first-person tower is too large for one html file. Framed in the tower, a page runs at an opaque
origin: an `html` shelf page fetches nothing beside it and imports no module there, while a declared renderer's
files carry CORS ([`ANY_ORIGIN`](ref:hub/src/tower/http.ts#ANY_ORIGIN), the rule and its cost in
[[renderers-in-config]]), so framed as a `renderer` shelf entry it loads what is below its root as it does at
`/r/<name>/`.

**Decision.** [[tower3d]]'s source is TypeScript modules, bundled by esbuild into one minified IIFE per page
(`out/tower3d.js`, the lab's, the dresser's, the editor's), each loaded as a classic script. Three.js,
`@xterm/xterm` and highlight.js (the shared panels' syntax colours) come from npm and are bundled in. The board and
API types are type-only imports from `src/bridge` and `src/shared`, so the renderer typechecks against the real
contract (`npm run typecheck` runs its tsconfig too) and ships none of that code. Its binary files (the `.glb`
models, the kit, the fixture boards' test video) are built with esbuild's `file` loader into `out/assets/`, named by
a hash of their bytes; each import is the file's URL relative to the page, and
[`bytesOf`](ref:hub/renderers/tower3d/src/files.ts#bytesOf) fetches each once per page.

**Alternatives considered.**
- *Plain ES modules beside an `html` shelf page*: these work only at `/run` and break on the shelf.
- *`Access-Control-Allow-Origin` on shelf files*: this would let any site in the browser read them. Shelf pages
  stay as they are: they fetch nothing beside them.
- *Models embedded in the bundle (esbuild's `binary` loader)*: base64 in the script, larger than the files, decoded
  and parsed as JavaScript on every load, and copied into each page.
- *ES modules with esbuild's `splitting`, the pages sharing chunks*: what the four pages share once the models are
  files is three.js and the loaders, and the lab, dresser and editor are seldom open together. Modules load framed
  (the renderer's files carry CORS), so it stays open if the shared code grows.
- *Browser caching of the hashed files*: the tower serves every renderer file `no-store`
  ([`serveFile`](ref:hub/src/tower/http.ts#serveFile)), and reading the files over loopback costs little against
  parsing them. An immutable header for hashed names is a server change to make only if a measurement asks for it.
- *Staying in one file*: rejected for size, even with no build step.

**Consequences.** The renderer has a build step, and its output is git-ignored; `npm run tower3d` measures the
KayKit kit into one file (`out/kaykit/kit.kaykit`, [[office-kaykit]]), then clears `out/assets/` so old hashes don't
pile up: a kit that fails leaves the last build whole. Models are files beside the pages or come from a CORS-enabled
CDN, never shelf files; Tower 3D's own are Blender scripts (`renderers/tower3d/models/*.py`, `npm run tower3d:models`)
exported to committed `.glb` files. The build copies the four pages into `out/` beside their bundles, so `out/` is the
built renderer ([[renderers-in-config]]); a page of it on a shelf is a `renderer` entry, never an `html` one, which
can't fetch its models. Fixture frames stay byte for byte the same across loads because every model file is fetched
before any is parsed: materials are made in parse order, and that order breaks ties in the draw order
([`loadModels`](ref:hub/renderers/tower3d/src/models.ts#loadModels)). A next renderer that grows past a file follows the same
pattern.
