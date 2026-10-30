---
{
  "type": "doc",
  "name": "Third-party notices",
  "summary": "THIRD_PARTY.md lists every work the tower ships that is not its own, in the repo or bundled and served from node_modules, with its licence; vendoring a pack or adding a served dependency re-checks it.",
  "in": "tower",
  "reviewed": "2026-10-30",
  "refs": ["hub/THIRD_PARTY.md", "hub/renderers/tower3d/kaykit/", "hub/package.json", "hub/src/tower/served.ts#MODULES", "hub/src/tower/http.ts#STATIC"]
}
---
Two tables: what is *in the repo* (the CC0 model and character packs vendored under
[`renderers/tower3d/`](ref:hub/renderers/tower3d/kaykit/), each with its licence beside its files, [[kaykit-workers]]),
and what is *bundled or served from `node_modules`*: three.js in Tower 3D's bundle, xterm.js as
[files of its own](ref:hub/src/tower/http.ts#STATIC), the libraries inside the
[served modules](ref:hub/src/tower/served.ts#MODULES) that import them, and the `@fontsource` faces under `/fonts/`.

A new vendored pack under `renderers/tower3d/` or a new runtime dependency in
[`package.json`](ref:hub/package.json) that ships to a page gets a row, with where it lives and its licence.
