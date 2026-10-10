---
{
  "type": "decision",
  "name": "A renderer that outgrows a file is bundled",
  "summary": "A shelf renderer too big for one html file is TypeScript modules bundled by esbuild into one classic script beside its page, with Three.js and xterm inside.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-10",
  "refs": ["hub/package.json", "hub/renderers/tower3d/tsconfig.json", "hub/renderers/tower3d/src/api.ts"]
}
---
**Context.** Office 3D was one html file importing Three.js from a CDN. A first-person tower is several
times its size. Framed in the tower, a shelf page runs at an opaque origin, where ES-module imports of
the tower's own files fail (modules always fetch with CORS) and so does fetching a model.

**Decision.** [[tower3d]]'s source is TypeScript modules, bundled by esbuild into one minified IIFE
(`out/tower3d.js`) that the page loads as a classic script. A classic script loads cross-origin with no
CORS, so the bundle works framed and at `/run` alike. Three.js, `@xterm/xterm` and highlight.js (the shared panels'
syntax colours) come from npm and are bundled in. The board and API types are type-only imports from `src/bridge` and `src/shared`, so the
renderer typechecks against the real contract (`npm run typecheck` runs its tsconfig too) and ships
none of that code.

**Alternatives considered.** Plain ES modules beside the page: these work only at `/run` and break on
the shelf. `Access-Control-Allow-Origin` on shelf files: this would let any site in the browser read
them. Staying in one file: this was rejected for size, even with no build step.

**Consequences.** The renderer has a build step, and its output is git-ignored. Models and other
assets go inside the bundle or come from a CORS-enabled CDN, never from fetching shelf files. Tower 3D's
models are Blender scripts (`renderers/tower3d/models/*.py`, `npm run tower3d:models`) exported to
`.glb` files that are committed and embedded with esbuild's `binary` loader (the fixture boards' test video, a `.webm`, the same way); the bundle grew to about
2.7 MB. The KayKit models the office uses are measured at build time into one file embedded the same way
(`out/kaykit/kit.kaykit`, [[office-kaykit]]): the bundle is about 8.9 MB. The build copies the pages (`index.html`,
`lab.html`) into `out/` beside the bundles with esbuild's `copy` loader, so `out/` is the built renderer the tower
serves at `/r/tower3d/` and exists only once built ([[renderers-in-config]]). A next
renderer that grows past a file follows the same pattern.
