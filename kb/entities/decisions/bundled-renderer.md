---
{
  "type": "decision",
  "name": "A renderer that outgrows a file is bundled",
  "summary": "A renderer too big for one html file is TypeScript modules bundled by esbuild into one classic script beside its page, with Three.js and xterm inside, and its models built beside it as files it fetches as it starts: a renderer's files are served with CORS, so it reads them framed too.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-17",
  "refs": ["hub/package.json", "hub/renderers/tower3d/tsconfig.json", "hub/renderers/tower3d/src/api.ts", "hub/renderers/tower3d/src/files.ts#bytesOf", "hub/src/tower/server.ts#ANY_ORIGIN"]
}
---
**Context.** A first-person tower is too large for one html file. Framed in the tower, a page runs at an opaque
origin. An `html` shelf page's files are served without CORS, so from there it can fetch nothing beside it and
import no module. A declared renderer's files are served with `Access-Control-Allow-Origin: *`
([`ANY_ORIGIN`](ref:hub/src/tower/server.ts#ANY_ORIGIN)), so framed as a `renderer` shelf entry it fetches and
imports what is below its root as it does at `/r/<name>/` (probed 2026-10-17 in every frame Tower 3D runs in).

**Decision.** [[tower3d]]'s source is TypeScript modules, bundled by esbuild into one minified IIFE per page
(`out/tower3d.js`, the lab's, the dresser's, the editor's), each loaded as a classic script. Three.js,
`@xterm/xterm` and highlight.js (the shared panels' syntax colours) come from npm and are bundled in. The board and
API types are type-only imports from `src/bridge` and `src/shared`, so the renderer typechecks against the real
contract (`npm run typecheck` runs its tsconfig too) and ships none of that code. Its binary files (the `.glb`
models, the kit, the fixture boards' test video) are built with esbuild's `file` loader into `out/assets/`, named by
a hash of their bytes; each import is the file's URL relative to the page, and
[`bytesOf`](ref:hub/renderers/tower3d/src/files.ts#bytesOf) fetches each once per page. A page fetches only the
files it loads, and the four pages share them.

**Alternatives considered.**
- *Plain ES modules beside an `html` shelf page*: these work only at `/run` and break on the shelf.
- *`Access-Control-Allow-Origin` on shelf files*: this would let any site in the browser read them. Shelf pages
  stay as they are: they fetch nothing beside them.
- *Models embedded in the bundle (esbuild's `binary` loader)*, as until 2026-10-17: base64 in the script, a third
  larger than the files, decoded and parsed as JavaScript on every load, and copied into each page. On
  2026-10-17 inlined assets were 17.2 of `tower3d.js`'s 19.3 MB and 13.5 of each other page's ~14.5 MB.
- *ES modules with esbuild's `splitting`, the pages sharing chunks*: with the models out, what the four pages
  share is about 1 MB (three.js and the loaders), and the lab, dresser and editor are seldom open together.
  Modules load framed (the renderer's files carry CORS), so it stays open if the shared code grows.
- *Browser caching of the hashed files*: the tower serves every renderer file `no-store`, and reading ~13 MB of
  files over loopback costs little against parsing them. An immutable header for hashed names is a server change
  to make only if a measurement asks for it.
- *Staying in one file*: rejected for size, even with no build step.

**Consequences.** The renderer has a build step, and its output is git-ignored; `npm run tower3d` clears
`out/assets/` first, so old hashes don't pile up. Models and other assets are files beside the pages or come from
a CORS-enabled CDN, never shelf files. Tower 3D's models are Blender scripts (`renderers/tower3d/models/*.py`,
`npm run tower3d:models`) exported to `.glb` files that are committed; the KayKit models the office uses are
measured at build time into one file (`out/kaykit/kit.kaykit`, [[office-kaykit]]). The build bundles four entries
(`src/boot.ts` as `tower3d.js`, the lab, the dresser and the editor) and copies their pages (`index.html`,
`lab.html`, `dresser.html`, `editor.html`) into `out/` beside the bundles with esbuild's `copy` loader, so `out/` is
the built renderer the tower serves at `/r/tower3d/` and exists only once built ([[renderers-in-config]]). A page of
it on a shelf is a `renderer` entry (the Lab declared with `entry` `lab.html`), never an `html` one, which can't
fetch its models. A next renderer that grows past a file follows the same pattern.

**Impact.** Measured 2026-10-17 on the sandbox, headless, a fresh profile per load. Bytes a page loads:
Tower 3D 19.5 → 15.2 MB (`tower3d.js` 18.4 → 2.2 MB), the lab 14.3 → 10.9, the dresser 14.9 → 11.5, the editor
14.8 → 11.5. Its scripts parse ~70 ms sooner (DOMContentLoaded ~330 → ~260 ms). The loading screen leaves at about
the same time (median of 8 interleaved runs ~1.21 → ~1.16 s, within the noise): the models stage ends near 0.4 s, and
the rest is the board, building the floors and compiling the shaders ([[tower3d-start]]). Fixture frames are byte
for byte the same once the models parse in a fixed order: they wait for every file before parsing, as materials are
made in parse order and that order breaks ties in the draw order.
