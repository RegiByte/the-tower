---
{
  "type": "doc",
  "name": "docs/extending.md",
  "summary": "How a user extends or copies a renderer and what the core promises it: the renderer API's verbs, reads and errors, the library and what the tower serves beside it, shelf pages, collections, extensions (a manifest and a start, this lane), plugins, what is deprecated until 2.0 and what is not an extension point.",
  "in": "tower",
  "reviewed": "2026-11-09",
  "refs": ["hub/src/tower/served.ts#MODULES", "hub/src/shared/extensions.ts#StartCtx", "hub/src/tower/http.ts#STATIC", "hub/src/tower/tower.js", "hub/src/shared/api.ts#QUERIES", "hub/src/shared/api.ts#ERROR_CODES", "hub/src/shared/shelf-page.ts", "hub/src/renderers.ts#BUILT_INS", "hub/src/shared/health.ts#whyNot", "hub/scripts/extension-shots.ts", "hub/src/shared/extensions.ts#LEGACY"]
}
---
`docs/extending.md` is the contract written for people: a new renderer or a copy of one that ships
([[renderers-in-config]]), shelf pages ([[shelf]]), the API ([[renderer-api]], [[renderer-api-contract]]: reads
from [`QUERIES`](ref:hub/src/shared/api.ts#QUERIES), errors from
[`ERROR_CODES`](ref:hub/src/shared/api.ts#ERROR_CODES), verbs left to `/schema`), the library ([[library]]) and what
the tower serves beside it (`tower.js`, `/design.css`, extensions' clients, the vendored files in
[`STATIC`](ref:hub/src/tower/http.ts#STATIC)), collections, plugins, the `tower` command and the logs. Every recipe
and import in it uses the library.

What is deprecated until 2.0 is told once, in one section near its end: each served module
([`MODULES`](ref:hub/src/tower/served.ts#MODULES)) with the library modules its names are in, and the verbs, reads
and board fields that moved into bundled extensions ([`LEGACY`](ref:hub/src/shared/extensions.ts#LEGACY)). Nothing
else in the document names one.

It names an API version only where a sample needs one (`/tower.js?v=`, `requires`), in that section, and beside a
thing no older than the library (1.151, the floor of anything that imports it) whose version the tower says nowhere
else. For the rest it says once, under Extensions, where to ask: a manifest
key's and a core hook's `x-since` at `/schema`, the `under-declared` warning of `tower extensions check`, and the
`@since` in the declarations `tower types` writes.

It also holds the standard every extension's `README.md` keeps (a title line and what it adds, a picture per surface
it reaches, and the other headings only where they say something true and recommended), whose pictures [`tool:extension-shots`](ref:hub/scripts/extension-shots.ts) takes from a throwaway sandbox
by the scenes in the extension's own `shots.json`, into its own `shots/`.

Its table of which renderer draws which subject kind is generated from the shipped renderers' `renderer.json` and
the CLI's regions ([`landing`](ref:hub/src/shared/regions.ts#landing)'s inputs), between `<!-- regions -->` markers,
by `npm run served:update`; `test/served.test.ts` fails while it is stale.

It names library modules and their names, so a library name added or renamed (`npm run served:update`) re-checks it,
as does a read or an error code.
