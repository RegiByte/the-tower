---
{
  "type": "doc",
  "name": "docs/extending.md",
  "summary": "How a user extends or copies a renderer and what the core promises it: the renderer API's verbs, reads and errors, the served modules and their exports, shelf pages, collections, plugins and what is not an extension point.",
  "in": "tower",
  "reviewed": "2026-10-22",
  "refs": ["hub/src/tower/served.ts#MODULES", "hub/src/tower/server.ts#STATIC", "hub/src/tower/tower.js", "hub/src/shared/api.ts#QUERIES", "hub/src/shared/api.ts#ERROR_CODES", "hub/src/shared/shelf-page.ts", "hub/src/renderers.ts#BUILT_INS", "hub/src/shared/cards.ts#whyNot"]
}
---
`docs/extending.md` is the contract written for people: a new renderer or a copy of one that ships
([[renderers-in-config]]), shelf pages ([[shelf]]), the API ([[renderer-api]], [[renderer-api-contract]]: reads
from [`QUERIES`](ref:hub/src/shared/api.ts#QUERIES), errors from
[`ERROR_CODES`](ref:hub/src/shared/api.ts#ERROR_CODES), verbs left to `/schema`), the served modules
([`MODULES`](ref:hub/src/tower/served.ts#MODULES), with the vendored files in
[`STATIC`](ref:hub/src/tower/server.ts#STATIC)) and their exports, `tower.js`'s members, collections, plugins, the
`tower` command and the logs.

It lists modules and exports by name, so a served module added or renamed (`npm run served:update`) re-checks it,
as does a read or an error code.
