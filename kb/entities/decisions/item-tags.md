---
{
  "type": "decision",
  "name": "A kept item is called by a tag of two words, derived from its id",
  "summary": "Every collection item carries a tag hashed from its id (ivory-otter), on the board and beside its title wherever a renderer shows it; workers and the user name items by tag and title, never by file name.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-05",
  "reviewed": "2026-10-27",
  "refs": ["hub/src/shared/tags.ts#tagOf", "hub/src/shared/hash.ts", "hub/src/bridge/board.ts#FloorItem", "hub/src/bridge/board.ts#FloorCollection", "hub/src/directory.ts#itemNamed", "hub/renderers/page/index.html", "hub/renderers/page/page.js", "hub/renderers/tower3d/src/cork.ts#noteTexture", "hub/renderers/tower3d/src/ui.ts#draftHeadHtml"]
}
---
**Problem.** Workers name kept items in their answers and pages, while the user sees titles on screen: a reference
by file name can't be matched to anything there. Ids won't do: workers keep items in batches, so ids on one floor
often differ only in their time's last digits, and a cork note is read from across a room.

**Decision.**
- [`tagOf`](ref:hub/src/shared/tags.ts#tagOf) hashes an id (the hash callsigns share, `hash.ts`) into an adjective and a noun from two word lists: `ivory-otter`. Lowercase and hyphenated, so
  it never reads as a worker's `HOLMES-42`. Ids never change, so neither does a tag.
- The board carries it on every item ([`FloorItem`](ref:hub/src/bridge/board.ts#FloorItem)), and each collection its
  `dir`, so a renderer that imports no TypeScript and the `tower` CLI read both.
- Every renderer shows it beside the item's title.
- `tower keep` prints the tag, title and path; `tower kept` leads each line with the tag and gives the file;
  `tower read` takes a tag or an id, as `tower hire` does for the item it starts a worker on ([[hiring-limits]]). The brief and the skill tell workers to name items by tag and title.
- Two items can share a tag, rarely: both show it, and `tower read` refuses a shared tag and lists both ids.

**Alternatives considered.**
- *Show the id, or its time part.* Unreadable at a distance and indistinguishable within a batch.
- *Titles alone.* Long, not unique, and changed by an edit to the first line, which silently breaks references.
- *Readable names as ids (`night-shift.md`).* Ids sort in creation order and the corkboard is that order; a name
  would also drift from the title after edits.
- *A number per floor.* Derived from order, so a delete renumbers every later item and old references point at the
  wrong one.
- *A pronounceable made-up word.* Rejected by the user: letters with no picture behind them.

**Impact.** One more derived field on the board and one on each collection; no stored state. An id carries a slug of
the item's name after its moment ([[collections]]), so it reads better in a file listing; the tag stays the short,
fixed name, since a slug is cut long and follows a name, not the title. A reference by id still resolves with
`tower read`.
