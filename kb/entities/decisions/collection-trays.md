---
{
  "type": "decision",
  "name": "Every collection has a tray; an unsent prompt is kept as a draft",
  "summary": "Every collection a floor declares is browsable in a renderer: one tray per collection listing its items by title, tag, keeper and age, and an item read as its type (markdown as unvetted words, html framed with no API, an image shown, text as written), with delete asked first. Drafts, review threads and policies keep their own places on the same rows, threads Tidy filed are reachable under the threads tray, and a prompt typed into the new-worker form that closes without starting is kept as a draft.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-31",
  "refs": ["hub/src/shared/items.ts", "hub/src/shared/items.ts#collectionTrayHtml", "hub/src/shared/items.ts#collectionPeekHtml", "hub/src/shared/items.ts#itemKind", "hub/src/shared/items.ts#keptTitles", "hub/src/shared/items.ts#deleteAsk", "hub/extensions/reviews/client/reviews.ts#landedThreads", "hub/extensions/drafts/client/drafts.ts#keepUnsent", "hub/renderers/tower3d/src/kept.ts#keptText", "hub/renderers/tower3d/src/main.ts#openKept", "hub/src/shared/spawn.ts#spawnHandlers", "hub/src/views/tray.ts#mount", "hub/src/shared/items.ts#mountKeptTray", "hub/src/views/item.ts#typeView"]
}
---
**Problem.** A renderer that draws trays only for the collections it gives a meaning to hides the rest: what a worker
kept with `tower keep notes` would be reachable only by a hand-written shelf `item` entry, and threads Tidy filed once
their work landed would vanish though the board still lists their files. And a prompt typed into New worker was lost
when the form closed without starting.

**Why.** [[collections]] promise that the core keeps files and renderers decide what they mean. Seeing and reading a
kept file needs no meaning: its type says how to draw it. That part belongs in shared code so every renderer lists
and reads items alike ([[renderer-is-disposable]]).

**How.**
- `/items.js` ([`src/shared/items.ts`](ref:hub/src/shared/items.ts)): a collection's items newest first as rows
  ([`collectionTrayHtml`](ref:hub/src/shared/items.ts#collectionTrayHtml)), titled where their type names itself
  ([`keptTitles`](ref:hub/src/shared/items.ts#keptTitles), else the tag), with the keeper
  ([[workers-edit-kept-items]]) and age. [`itemKind`](ref:hub/src/shared/items.ts#itemKind) reads an item by its
  extension (Tower 3D draws by it; the tower page by its views by type, [[ui-model]]): markdown as a document in a
  frame where nothing runs (`documentHtml` in the tower page, [[markdown-safe]]), html
  framed at the opaque origin `/collection/…` serves it at, scripts on and no API relay, an image shown, text as
  written, a video played (the tower page), anything else left to Finder and the editor. [`deleteAsk`](ref:hub/src/shared/items.ts#deleteAsk) is what a
  renderer asks first: deleting is the user's.
- A collection's tray is a view at `row` scale ([[ui-model]], since 1.125): [`tower/tray`](ref:hub/src/views/tray.ts#mount)
  for any collection ([`mountKeptTray`](ref:hub/src/shared/items.ts#mountKeptTray)), an extension's own for its
  collection. A row displays its item: a draft opens in the drafts extension's editor, its owner's view, and
  any other item in the core's view for its type ([`typeView`](ref:hub/src/views/item.ts#typeView)), which follows the
  board: a changed item is read again, a deleted one closes.
- A sidebar tray is bounded ([`collectionPeekHtml`](ref:hub/src/shared/items.ts#collectionPeekHtml)) and lists the
  rest in the main pane, so a floor keeping many drafts doesn't push its workers out of sight.
- Drafts keep their own tray on the shared rows (`drafts/tray`), with a way to make one, where the floor's `drafts`
  collection is the drafts extension's (a plain one of that name is drawn by `tower/tray`); review threads keep theirs
  (`reviews/tray`), with the threads Tidy filed in a fold below
  ([`landedThreads`](ref:hub/extensions/reviews/client/reviews.ts#landedThreads), read off the board's `reviews`
  items), each opened in its view by type; policies keep a count that opens their own panel (`policies/tray`).
- A prompt in the new-worker form that closes without starting is kept
  ([`keepUnsent`](ref:hub/extensions/drafts/client/drafts.ts#keepUnsent), run by the shared new-worker dialog's machine,
  [`spawnHandlers`](ref:hub/src/shared/spawn.ts#spawnHandlers)): a new draft, or the draft the form was opened on, with
  its edits. A blank prompt is never kept.
- A tray shows only while its collection holds items. An empty tray would sit under every floor for each collection
  declared at the top level; what a collection is for is said where items are made (`tower whoami`, `tower keep`).

**Alternatives considered.**
- Restoring an unsent prompt the next time the form opens (view state in `tower.store`): per browser, invisible to
  workers and other renderers, and lost to a second floor's form. A draft is the collections model's own place for
  "a prompt kept for later", seen everywhere; an unwanted one costs a delete.
- Asking "Keep as draft / Discard" on Cancel: a question on every cancel, to save one delete in the rare case.
- Framing html items with the API relay, as a shelf `item` entry is: any kept page would drive every verb. Putting an
  item on the shelf is the user's deliberate grant; a tray only shows it.
- One tray for every collection, drafts and threads included, with no special rows: drafts need making and the
  editor, threads the worker's Reviews pane; the shared rows serve both, their actions stay the renderer's.

**Impact.** The core is untouched: the trays are shared exports a renderer composes over the board, verbs and reads.
Tower 3D lists each collection that holds items in its floor panel, titled through
[`keptText`](ref:hub/renderers/tower3d/src/kept.ts#keptText): a draft opens its editor, a game its cabinet
([[arcade]]), any other item the reader ([`openKept`](ref:hub/renderers/tower3d/src/main.ts#openKept)); its spawn
dialog runs the same machine, so it keeps an unsent prompt too.
