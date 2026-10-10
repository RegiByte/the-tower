---
{
  "type": "decision",
  "name": "A shelf entry can name a kept item",
  "summary": "A shelf entry { label, item: \"<collection>/<id>\" } names an item of one of the project's collections by its id, its file name. The tower serves it through the shelf's own routes from the collection's directory: a markdown item is read like an md entry's file, any other is framed like an html entry's page, alone. The item stays in its collection; nothing new is stored.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/shared/model.ts#ShelfEntry", "hub/src/shared/model.ts#shelfItem", "hub/src/shared/cards.ts#shelfKind", "hub/src/shared/cards.ts#shelfPage", "hub/src/shared/cards.ts#shelfSource", "hub/src/shelf.ts#shelfFiles", "hub/src/shelf.ts#shelfServes", "hub/src/tower/server.ts#shelfFile", "hub/src/tower/server.ts#run"]
}
---
**Problem.** A page a worker made for the shelf had two homes, both wrong. An `html` entry's path is relative to the
hub, so the page lived either in the user's main checkout (an untracked file there) or in the worker's worktree (the
entry broke when the worktree was tidied). A page also kept in a collection, such as a game in `games`, was a second
copy of the one on the shelf.

**Why.** Collections are where workers already put what they make for the user ([[collections]], [[agent-keep]]):
the system root, owned by the tower, outliving every worktree, written with `tower keep` and edited in place. The
shelf only needs to point at one.

**How.**
- *The entry.* `{ "label": "Life Garden", "item": "games/20261008T130025Z-life-garden.html" }`
  ([`ShelfEntry`](ref:hub/src/shared/model.ts#ShelfEntry)): the collection, a slash, the item's id
  ([`shelfItem`](ref:hub/src/shared/model.ts#shelfItem)). `tower keep` and `tower kept` print the item's file, whose
  name is the id.
- *Serving.* The shelf's routes serve it unchanged in shape: `GET /shelf/<project>/<n>` lists the id, and
  `/shelf/<project>/<n>/<id>` serves the file from `collections/<project>/<collection>/`
  ([`shelfFile`](ref:hub/src/tower/server.ts#shelfFile)), sandboxed like every shelf file. The item is served
  alone: nothing beside it. `/run/<project>/<n>` runs an HTML item on its own as it does an `html` entry's page
  ([`run`](ref:hub/src/tower/server.ts#run)). A collection the project doesn't keep, an item it doesn't hold, or a
  name that isn't `<collection>/<id>` answers `not_found` saying which.
- *Kinds, shared.* Renderers draw an entry by [`shelfKind`](ref:hub/src/shared/cards.ts#shelfKind): an item ending
  in `.md` is `md` (the tower page's reader, a bookcase in Tower 3D), any other `html` (framed with the relay, a TV).
  A framed page shows whatever the browser shows for the file's type, so an image or a video item needs nothing
  more. [`shelfPage`](ref:hub/src/shared/cards.ts#shelfPage) names the file a framed entry opens and
  [`shelfSource`](ref:hub/src/shared/cards.ts#shelfSource) where an entry comes from, for both renderers.
- *Live.* The file is read on every request, so an item edited in place shows on the next load.

**Alternatives considered.**
- Naming the item by its tag as well: a tag is a hash of the id, for people to say; resolving one means listing the
  collection on every read, and two ids can share a tag. The id is the file name, stable and printed by `tower
  keep`.
- A tower-owned shelf directory (`~/.tower/shelf/<project>/`): a fourth kind of stored state beside the config, the
  logs and the collections, holding what a collection already holds.
- Copying the page into the hub: an untracked file in a repo that belongs to the user.
- Serving files beside an item: a collection holds flat files, so a page with several files stays in a repo as an
  `html` entry.

**Impact.** A worker puts a page on the shelf by keeping it and naming it in the config: no file in any checkout,
and one copy, edited in place. The shelf and collections meet here for single files, as [[collections]] foresaw.
