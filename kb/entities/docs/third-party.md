---
{
  "type": "doc",
  "name": "Third-party notices",
  "summary": "THIRD_PARTY.md lists every work the tower ships that is not its own, in the repo or bundled and served from node_modules, with its licence; vendoring a pack or adding a served dependency re-checks it.",
  "in": "tower",
  "reviewed": "2026-10-21",
  "refs": ["hub/renderers/tower3d/kaykit/", "hub/package.json", "hub/src/tower/served.ts#MODULES", "hub/src/tower/server.ts#STATIC"]
}
---
Two tables. *In the repo*: the KayKit Bits models under `renderers/tower3d/kaykit/` and the KayKit character packs
under `renderers/tower3d/kaykit/Characters/` (each pack's licence beside its files, [[kaykit-workers]]), all CC0.
*Bundled or served from `node_modules`*: three.js in Tower 3D's bundle, and the packages the tower serves to the
pages it draws, from `package.json`'s dependencies: xterm.js as [files of its own](ref:hub/src/tower/server.ts#STATIC),
highlight.js, marked, croner (`/policies.js`) and diff (`/panels.js`) inside the
[served modules](ref:hub/src/tower/served.ts#MODULES) that import them, and the
`@fontsource` faces under `/fonts/`.

A new vendored pack under [`kaykit/`](ref:hub/renderers/tower3d/kaykit/) or a new runtime dependency in
[`package.json`](ref:hub/package.json) that ships to a page gets a row, with where it lives and its licence.
