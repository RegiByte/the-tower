---
{
  "type": "term",
  "name": "Shelf",
  "summary": "A project's pages kept beside its sessions in the config: a built html page, a markdown glob, a url shown in place by the tower page, a link opened in a new tab, a declared renderer, or an item of one of its collections.",
  "in": "tower",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/shared/model.ts#ShelfEntry", "hub/src/shelf.ts#shelfProblem", "hub/docs/config.md"]
}
---
An `html` entry can be a renderer of its own: framed by the tower, it reads the live board through
`/tower.js` ([[renderer-api]]). `renderers/tower3d` ([[tower3d]]) is one. An `item` entry names a file kept in one of
the project's collections, so a page a worker made lives in no checkout ([[shelf-items]]).

The shelf is not a [[collection]], though an `item` entry shows one of a collection's files. Workers learn it from
the handbook (the user's word "shelf" means this), see the floor's entries in `tower whoami`, and check an edit with
`tower config check`, which names an entry that can't show ([`shelfProblem`](ref:hub/src/shelf.ts#shelfProblem): no
label, not exactly one kind, a missing `html` file, a `url` or `link` that isn't http(s), an undeclared `renderer`, an
`item` naming no collection of the floor).
