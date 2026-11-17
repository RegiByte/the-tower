---
{
  "type": "term",
  "name": "Shelf",
  "summary": "A project's pages kept beside its sessions in the config: a built html page, a markdown glob, a url shown in place by the tower page, a link opened in a new tab, a declared renderer, or an item of one of its collections.",
  "in": "tower",
  "reviewed": "2026-11-17",
  "refs": ["hub/src/shared/model.ts#ShelfEntry", "hub/src/views/shelf.ts#mount", "hub/src/shelf.ts#shelfProblem", "hub/docs/config.md"]
}
---
An `html` entry framed by the tower reads the live board through `/tower.js` ([[renderer-api]]). Its files beside it
load as scripts, stylesheets and images but can't be fetched, so a page that fetches its own (as [[tower3d]] fetches
its models) is a declared renderer, shelved as a `renderer` entry ([[bundled-renderer]]). An `item` entry names a file
kept in one of the project's collections, so a page a worker made lives in no checkout ([[shelf-items]]).

A markdown entry's file, open in the tower page ([`tower/shelf`](ref:hub/src/views/shelf.ts#mount)) or Tower 3D's
reader, follows its versions while it is open (`tower.versions('shelf/<project>/<n>/<file>')`, [[tower-server]]): a
worker's edit draws it again where it was scrolled to, and a file deleted stays drawn as it was until it is written
again. The list of files is read as the entry opens, so a file newly
matching the glob shows once it is opened again.

The shelf is not a [[collection]]. Workers learn it from the handbook (the user's word "shelf" means this), see the
floor's entries in `tower whoami`, and check an edit with `tower config check`, which names an entry that can't show
([`shelfProblem`](ref:hub/src/shelf.ts#shelfProblem)). Sessions may edit their floor's shelf in the config: renderers
re-read the config, so an edit shows without a restart ([[system-root]]).
