---
{
  "type": "decision",
  "name": "Collections: files a project keeps, meaning left to renderers",
  "summary": "A collection is a kind of files declared in the config, for every project or for one, kept under collections/<project>/<collection>/ in the system root; the core lists, reads, writes and deletes them and offers submit on workers, and what the files mean is decided by the renderers that use them.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "supersedes": "drafts",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/src/shared/model.ts#CollectionType",
    "hub/src/shared/model.ts#projectCollections",
    "hub/src/collections.ts",
    "hub/src/collections.ts#slugOf",
    "hub/src/system.ts#watchSystem",
    "hub/src/bridge/board.ts#FloorCollection",
    "hub/src/bridge/verbs.ts#cardVerbs",
    "hub/src/shared/protocol.ts#promptPastes",
    "hub/src/machine.ts#submitText",
    "hub/src/shared/shelf-page.ts",
    "hub/src/shared/titles.ts"
  ]
}
---
**Problem.** The user keeps the next prompts for a session in their head while it works ([[drafts]]). A drafts
feature would be one more special-purpose store, and the shelf's `md` entries are already a read-only "set of
files a project keeps".

**Why.** A store that only knows files, with renderers deciding what they mean, serves drafts today and kinds of
files nobody has named yet (notes, templates, `.edn` or `.html` items, views a page builds over them). Renderers are
disposable and may not share verbs (a renderer in a game engine may not act like this one), so behaviour belongs in them, over
primitives every renderer can reach.

**How.**
- [`CollectionType`](ref:hub/src/shared/model.ts#CollectionType) is `{ label, description? }`, declared under
  `collections` in the config for every project, or under a project for that one only. `description` says what the
  collection is for in a sentence or two: the board carries it, `tower keep` (alone), `tower kept` and the renderers
  show it, so a worker knows where an item belongs (the cold-start test of 2026-10-08 found a worker unsure whether
  `reviews` took a write-up). Declaring one in both places is a config
  error ([`projectCollections`](ref:hub/src/shared/model.ts#projectCollections)). Items always belong to a project.
- An item is any file at `collections/<project>/<collection>/<id>` in [[system-root]]. The id is the file name,
  extension included. Created items are named by the moment they were made, to the second in UTC, and by a slug of
  the `name` `collection/create` was given ([`slugOf`](ref:hub/src/collections.ts#slugOf)):
  `20261008T130025Z-life-garden.html`, or `20261008T130025Z.md` with no name. `tower keep` names an item by its
  file's base name, the markdown's title on stdin, or `name <words>`. Another item made the same second under the
  same name takes `-2`, `-3`…. Names sort in creation order, a person browsing the directory reads what each holds,
  and an edit never renames one. Items made before names carried a slug (`20261004T150312.123Z.md`) keep their ids;
  nothing parses an id, so both read alike, and tags derive from either ([[item-tags]]).
- [`src/collections.ts`](ref:hub/src/collections.ts) is the only writer the tower has. Writes are staged in a dot
  file and renamed into place in one step, so a reader never sees half a file. A create first claims its name with
  an exclusive empty write, which fails if the name is taken. Items always arrive by rename: on macOS, deleting a
  file made by a hard link raises no watch event, so a linked item's delete never reached the board. Dot files are
  ignored, so an editor's swap files never become items.
- [[live-system]] watches the directory and rescans it once changes settle, whoever made them: the tower, a
  session, an editor. A burst of 400 creates and deletes raised 404 watch events and costs one rescan. The board carries each floor's declared collections, each with its `dir`, and item metadata only (`id`, `tag`
  ([[item-tags]]), `size`, `modifiedAt`), never content: the format is a view's business. An item a worker kept carries `keptBy` ([[agent-keep]]). A view fetches content
  (`collection/<project>/<collection>/<item>`) and fetches again when `modifiedAt` changes. Undeclared directories
  stay off the board.
- [[renderer-api]] verbs: `collection/create` (answers `created` with the id and its version), `collection/write`
  (names the version it edited, the `modifiedAt` the writer last saw, and answers `written` with the new one; a
  file that moved on since is `refused`, and an item that no longer exists is `not_found`, never recreated),
  `collection/delete`, and `submit`. A view reads an item as text with `tower.text`, whatever its type.
- `submit` is a card verb ([[board-verbs]]) on a worker at its composer: idle, working, done or failed. A booting
  worker may be on a startup dialog, and one needing input on a question, so keys there would answer them.
  [`submitText`](ref:hub/src/machine.ts#submitText) types the text as the user would, over one host connection:
  bracketed pastes from [`promptPastes`](ref:hub/src/shared/protocol.ts#promptPastes), then Enter as its own write
  once the host has written the last paste.
- Pastes are cut at 400 characters and two newlines. Claude shows a paste over 800 characters or 3 lines as a
  placeholder and submits it wrapped in `<pasted_content>`, which the model treats as material handed to it, not
  as the user's words: Haiku asked whether to follow the instruction inside one. Smaller pastes land in the
  composer as typed text. Claude expands tabs to spaces in pastes.
- One collection has meaning in the core: `reviews`, the review threads ([[review-threads]]), named once in
  `src/shared/reviews.ts`. Its items are named by checkout (`<checkout>.md`), parsed onto the board as
  `floor.threads`, and written only by appending, through `review/append` (`putItem` makes or replaces an item under a
  name of the caller's, by rename). Undeclared, it is not on the board and the verb refuses.
- A drafts feature is a fold in a renderer: send is read, then `spawn` with the text as `Launch.prompt`, then
  delete; transfer is read, then `submit`, then delete. Its editing is one module renderers import,
  `src/shared/drafts.ts` ([[corkboard]]); nothing in the core imports it. Which collection a feature works on is named once, in
  that feature.
- Any collection, given a meaning or not, is listed and read alike through `/items.js` ([[collection-trays]]): a
  renderer shows what a floor keeps without knowing what it is for.
- Games are a second renderer's meaning ([[arcade]]): Tower 3D draws a floor's `games` as arcade cabinets and plays
  each in a sandboxed frame, over the same reads. An item's title is derived where it is shown
  ([`src/shared/titles.ts`](ref:hub/src/shared/titles.ts): a text item's first line, an html item's `<title>`, read
  once per `modifiedAt`), for drafts, games and `tower kept` alike.

Checked with a real Claude (Haiku) on a throwaway system: a 9 KB, 146-line draft with markdown, emoji and code
fences arrived byte for byte as the user's prompt (written in 13 ms); a submit while Claude worked was queued and
answered in its own turn; text already in the composer stayed ahead of the submitted text. Typing raw keys with
Meta+Enter for newlines scrambled the order.

**Alternatives considered.**
- Drafts as a feature of their own ([[drafts]]): a store for one use, beside the shelf's own set of files.
- Collections declaring their purpose in data a consumer acts on (`prompt: true`, or a list of supported renderers):
  data describing its consumers. The dependency points from the consumer to the data, as a KB link is stored on the entity that acts. `description` is prose for people and workers, read by nobody's code.
- Slugs only, no moment: ids would collide and stop sorting by creation, and a renamed title would argue for
  renaming the file. Titles on the board stay derived; the slug is the name an item was born with.
- Markdown only: nothing in the store reads content, so restricting the format would buy nothing.
- Titles and excerpts on the board: they need the format; a view derives them.
- Server-side `send` and `transfer` verbs: draft knowledge in the core. As two requests from the renderer, a
  failed second request leaves the draft in place, the right failure for a deliberately sent prompt.
- Merging the shelf's `md` entries into collections: shelf files live in the hub and belong to the repo, and
  collections live in the system root and belong to the tower. They meet for single files: a shelf `item` entry
  names an item ([[shelf-items]]).
- One paste plus Enter in one write (the old `promptInput`): fine under 800 characters and 3 lines, wrapped as
  pasted content above.

**Impact.** The stored state is now three kinds: the config (intent), the logs (facts) and the collections (files
kept for later, such as unsent words). This amends [[logs-are-facts]]. Board floors carry `collections`, cards may
offer `submit`, and `tower submit` submits through the same `submitText`. The tower page's drafts and Tower 3D's
corkboard ([[corkboard]]) are each a renderer's own feature over one shared editor.
