---
{
  "type": "decision",
  "name": "Every collection has a tray; an unsent prompt is kept as a draft",
  "summary": "Every collection a floor declares is browsable in a renderer: one tray per collection listing its items by title, tag, keeper and age, and an item read as its type (markdown as unvetted words, html framed with no API, an image shown, text as written), with delete asked first. Drafts and review threads keep their own trays on the same rows, threads Tidy filed are reachable under the threads tray, and a prompt typed into the new-worker form that closes without starting is kept as a draft.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/items.ts", "hub/src/shared/items.ts#collectionTrayHtml", "hub/src/shared/items.ts#itemKind", "hub/src/shared/items.ts#keptTitles", "hub/src/shared/items.ts#deleteAsk", "hub/src/shared/reviews.ts#landedThreads", "hub/src/shared/drafts.ts#keepUnsent", "hub/renderers/tower3d/src/kept.ts#keptText", "hub/renderers/tower3d/src/main.ts#openKept", "hub/src/shared/cards.ts#shellPlaces", "hub/renderers/page/index.html"]
}
---
**Problem.** The tower page drew trays only for `drafts` and the review threads. Any other collection a floor
declared (`notes`, `games`, …) was invisible there: what a worker kept with `tower keep notes` was reachable only by a
hand-written shelf `item` entry. Threads Tidy filed once their work landed were gone from the page, though the board
still listed their files. A prompt typed into New worker was lost on Cancel or Esc. A new draft was two clicks deep,
and the shell dock had no way to start a shell.

**Why.** [[collections]] promise that the core keeps files and renderers decide what they mean; a renderer that shows
only the collections it gives a meaning to hides the rest. Seeing and reading a kept file needs no meaning: its type
says how to draw it. That part belongs in shared code so Tower 3D or any other renderer lists and reads items alike
([[renderer-is-disposable]]).

**How.**
- `/items.js` ([`src/shared/items.ts`](ref:hub/src/shared/items.ts)): a collection's items newest first as rows
  (`collectionTrayHtml`, each a button carrying `data-kept`), titled where their type names itself
  ([`keptTitles`](ref:hub/src/shared/items.ts#keptTitles) over `titles.ts`, else the tag), with the tag, the keeper
  ([[agent-keep]]) and how long ago it changed. [`itemKind`](ref:hub/src/shared/items.ts#itemKind) reads an item by
  its extension: markdown through `markdownHtml` ([[markdown-safe]]: anything a worker kept is unvetted words), html
  framed at the opaque origin `/collection/…` serves it at, scripts on and no API relay, an image shown, text as
  written, anything else left to Finder and the editor. [`deleteAsk`](ref:hub/src/shared/items.ts#deleteAsk) is what a
  renderer asks first: deleting is the user's ([[workers-edit-kept-items]]).
- What opening a row means stays the renderer's. The tower page opens a drafts row in its editor, any other row in an
  item view in the main pane (`#kept/<project>/<collection>/<id>`), which follows the board: a changed item is read
  again, a deleted one closes.
- Drafts keep their own tray, on the shared rows, with `+`; review threads keep theirs, and below the live ones a
  fold lists the threads Tidy filed ([`landedThreads`](ref:hub/src/shared/reviews.ts#landedThreads), read off the
  board's `reviews` items, no read needed), each opened in the item view. A live thread no worker has been in opens
  there too.
- A prompt in the new-worker form that closes without starting is kept
  ([`keepUnsent`](ref:hub/src/shared/drafts.ts#keepUnsent)): a new draft, or the draft the form was opened on, with
  the edits made in the form. A toast names it. A blank prompt is never kept.
- A floor keeping drafts has ✎ beside its `+`, a new draft in one click. The shell dock starts with `+`, a picker of
  every directory a shell can start in ([`shellPlaces`](ref:hub/src/shared/cards.ts#shellPlaces): hubs, repos and
  worktrees), the floor in view first.
- A tray shows only while its collection holds items; drafts too, now that ✎ makes one. An empty tray would sit
  under every floor for each collection declared at the top level; what a collection is for is said where items are
  made (`tower whoami`, `tower keep`), and its tray appears with its first item.

**Alternatives considered.**
- Restoring an unsent prompt the next time the form opens (view state in `tower.store`): per browser, invisible to
  workers and other renderers, and lost to a second floor's form. A draft is the collections model's own place for
  "a prompt kept for later", seen everywhere; an unwanted one costs a delete.
- Asking "Keep as draft / Discard" on Cancel: a question on every cancel, to save one delete in the rare case.
- Framing html items with the API relay, as a shelf `item` entry is: any kept page would drive every verb. Putting an
  item on the shelf is the user's deliberate grant; a tray only shows it.
- Reading landed threads from `GET /reviews/<project>`: the board already lists their files, and the item view reads
  the one opened.
- One tray for every collection, drafts and threads included, with no special rows: drafts need `+` and the editor,
  threads the worker's Reviews pane; the shared rows serve both, their actions stay the renderer's.

**Impact.** API 1.10: `/items.js` is served; `keepUnsent` in `/drafts.js`, `shellPlaces` in `/cards.js` and
`landedThreads` in `/reviews.js` are new exports. Nothing in the core changed: the board, verbs and reads are as they
were. Tower 3D lists every collection that holds items as a tray in its floor panel (`collectionTrayHtml`, titled by
`keptTitles` through [`keptText`](ref:hub/renderers/tower3d/src/kept.ts#keptText), a fixture board's own drafts and
games on a fixture): a draft's row opens its editor, a game's its cabinet, any other item the reader, drawn by its
`itemKind` (text through `itemTextHtml` in a frame where nothing runs, html framed with no API, an image shown), with
Delete on a second press. Its spawn dialog keeps a prompt closed without starting with `keepUnsent`, in the draft it was
opened on when there is one. It doesn't use `shellPlaces`: its shells start from the floor panel's own dir and
worktree rows and at the console, one floor at a time, with no picker across floors.
