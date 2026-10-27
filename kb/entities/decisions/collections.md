---
{
  "type": "decision",
  "name": "Collections: files a project keeps, meaning left to renderers",
  "summary": "A collection is a kind of files declared in the config, for every project or for one, kept under collections/<project>/<collection>/ in the system root; the core lists, reads, writes and deletes them and offers submit on workers, and what the files mean is decided by the renderers that use them.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-27",
  "refs": [
    "hub/src/shared/model.ts#CollectionType",
    "hub/src/shared/model.ts#projectCollections",
    "hub/src/collections.ts",
    "hub/src/collections.ts#slugOf",
    "hub/src/collections.ts#restoreItem",
    "hub/src/system.ts#watchSystem",
    "hub/src/bridge/board.ts#FloorCollection",
    "hub/src/bridge/verbs.ts#cardVerbs",
    "hub/src/shared/protocol.ts#promptPastes",
    "hub/src/machine.ts#submitText",
    "hub/src/shared/shelf-page.ts",
    "hub/src/shared/titles.ts",
    "hub/src/bridge/stores.ts#floorCollections",
    "hub/src/bridge/stores.ts#ownedRefusal"
  ]
}
---
**Problem.** The user keeps the next prompts for a session in their head while it works. A drafts
feature would be one more special-purpose store, and the shelf's `md` entries are already a read-only "set of
files a project keeps".

**Why.** A store that only knows files, with renderers deciding what they mean, serves drafts today and kinds of
files nobody has named yet (notes, templates, `.edn` or `.html` items, views a page builds over them). Renderers are
disposable and may not share verbs (a renderer in a game engine may not act like this one), so behaviour belongs in them, over
primitives every renderer can reach.

**How.**
- [`CollectionType`](ref:hub/src/shared/model.ts#CollectionType) is `{ label, description? }`, declared under
  `collections` in the config for every project, or under a project for that one only. `description` says what the
  collection is for: the board carries it, and `tower keep` (alone), `tower kept` and the renderers show it, so a
  worker knows where an item belongs. Declaring one in both places is a config error
  ([`projectCollections`](ref:hub/src/shared/model.ts#projectCollections)). Items always belong to a project.
- An item is any file at `collections/<project>/<collection>/<id>` in [[system-root]]. The id is the file name,
  extension included. Created items are named by the moment they were made, to the second in UTC, and by a slug of
  the `name` `collection/create` was given ([`slugOf`](ref:hub/src/collections.ts#slugOf)), with `-2`, `-3`… for a
  second item of the same second and name: names sort in creation order, a person browsing the directory reads what
  each holds, and an edit never renames one. Nothing parses an id, so older ids without a slug read alike, and tags
  derive from either ([[item-tags]]).
- [`src/collections.ts`](ref:hub/src/collections.ts) is the only writer the tower has. Writes are staged in a dot
  file and renamed into place, so a reader never sees half a file; a create first claims its name with an exclusive
  empty write; items always arrive by rename (macOS raises no watch event when a hard-linked file is deleted). Dot
  files are ignored, so an editor's swap files never become items.
- [[live-system]] watches the directory and rescans it once changes settle, whoever made them: the tower, a session,
  an editor. The board carries each floor's declared collections, each with its `dir`, and item metadata only (`id`,
  `tag`, `size`, `modifiedAt`, and `keptBy` for an item a worker kept, [[workers-edit-kept-items]]), never content: the
  format is a view's business. A view fetches content (`collection/<project>/<collection>/<item>`, as text with
  `tower.text` whatever its type) and fetches again when `modifiedAt` changes. Undeclared directories stay off the
  board.
- [[renderer-api]] verbs: `collection/create`, `collection/write` (names the version it edited and is `refused` once
  the file moved on, [[renderer-api-contract]]; an item that no longer exists is `not_found`, never recreated),
  `collection/delete`, `collection/restore` (an undo of a delete, claimed as a create claims a name, so it never
  overwrites, [[press-feedback]]), and `submit`.
- `submit` is a card verb ([[board-verbs]]) on a worker at its composer (idle, working, watching, done or failed): a
  booting worker may be on a startup dialog, and one needing input on a question, so keys there would answer them.
  [`submitText`](ref:hub/src/machine.ts#submitText) types the text as the user would, over one host connection:
  bracketed pastes small enough to land as typed text ([`promptPastes`](ref:hub/src/shared/protocol.ts#promptPastes),
  whose comment says why), then Enter as its own write once the host has written the last paste.
- An extension may declare collections too, named by its capability ([[extensions]]): they join the floors it is on
  ([`floorCollections`](ref:hub/src/bridge/stores.ts#floorCollections)). A config entry of the same name is no
  conflict: its `label` and `description` win, since they are what workers read. One the extension declares `owned`
  is written only through its owner's verbs: `collection/create`, `write`, `restore` and `delete` (and so `tower
  keep`) answer `refused`, naming its create door ([`ownedRefusal`](ref:hub/src/bridge/stores.ts#ownedRefusal)),
  while its reads stay open, since a read breaks no invariant. The board carries the declaring capability as `by`,
  and its `owner` and `doors`. On a floor
  where the extension is off, a collection the config also declares is a plain open one, and one only the extension
  declares is gone.
- Two collections are bundled extensions' with a meaning of their own: `reviews`, the review threads, owned by the
  reviews extension and written only by appending through `reviews/append` ([[review-threads]]), and `policies`, standing work the tower starts at its slots, whose facts live
  in the project's streams, never beside the file ([[policies]]).
- Drafts are the bundled drafts extension's ([[extensions]]): an open collection, so its doors are the generic
  verbs, declared by `extensions/drafts` and on every floor where the capability is on, with no server code. A
  config's `collections.drafts` line overrides its label and description; on a floor with
  `capabilities.drafts.off` that line stays a plain collection, which the board marks by no `by` and renderers draw
  as any kept one. Sending is a renderer's: send is read, then `spawn` with the text as `Launch.prompt`, then delete;
  transfer is read, then `submit`, then delete. Its editing is the extension's client module renderers import,
  `/x/drafts/drafts.js` ([[corkboard]]); the tower's server never imports it. Games are Tower 3D's
  ([[arcade]]). Any collection, given a meaning or not, is listed and read alike through `/items.js`
  ([[collection-trays]]), and an item's title is derived where it is shown
  ([`src/shared/titles.ts`](ref:hub/src/shared/titles.ts): a text item's first line, an html item's `<title>`).

**Alternatives considered.**
- Drafts as a feature of their own (a markdown file per unsent prompt under `drafts/<project>/`, sent and then
  deleted): a store for one use, beside the shelf's own set of files, and a meaning the core would hold.
- A folder in the project's hub: versioned, but writes into repos the tower does not own.
- Collections declaring their purpose in data a consumer acts on (`prompt: true`, or a list of supported renderers):
  data describing its consumers. The dependency points from the consumer to the data; `description` is prose for
  people and workers, read by nobody's code.
- Slugs only, no moment: ids would collide and stop sorting by creation.
- Server-side `send` and `transfer` verbs: draft knowledge in the core. As two requests from the renderer, a
  failed second request leaves the draft in place, the right failure for a deliberately sent prompt.
- Merging the shelf's `md` entries into collections: shelf files live in the hub and belong to the repo, and
  collections live in the system root and belong to the tower. They meet for single files: a shelf `item` entry
  names an item ([[shelf-items]]).

**Impact.** The collections are the third kind of stored state ([[logs-are-facts]]). Board floors carry
`collections`, cards may offer `submit`, and `tower submit` submits through the same `submitText`. The tower page's
drafts and Tower 3D's corkboard ([[corkboard]]) are each a renderer's own feature over one shared editor.
