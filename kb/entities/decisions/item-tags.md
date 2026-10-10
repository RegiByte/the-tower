---
{
  "type": "decision",
  "name": "A kept item is called by a tag of two words, derived from its id",
  "summary": "Every collection item carries a tag hashed from its id (ivory-otter), on the board and beside its title wherever a renderer shows it; workers and the user name items by tag and title, never by file name.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-05",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/shared/tags.ts#tagOf", "hub/src/shared/hash.ts", "hub/src/bridge/board.ts#FloorItem", "hub/src/bridge/board.ts#FloorCollection", "hub/src/directory.ts#itemNamed", "hub/renderers/page/index.html", "hub/renderers/tower3d/src/cork.ts#noteTexture", "hub/renderers/tower3d/src/ui.ts#draftHeadHtml"]
}
---
**Problem.** Workers named kept drafts by file name (`20261005T192947.971Z.md`) in answers, NEXT_STEPS and research
pages, and the user saw only titles, in the tower page and on Tower 3D's corkboard: a reference could not be matched
to anything on screen. Showing the id would not do: workers keep drafts in batches, so ids on one floor often differ
only in milliseconds (`185518.537Z`, `185518.740Z`), and a cork note is read from across a room.

**Decision.**
- [`tagOf`](ref:hub/src/shared/tags.ts#tagOf) hashes an id (FNV-1a and murmur3's finalizer, shared with callsigns in
  `hash.ts`) into an adjective and a noun from two lists of about 140 words: `ivory-otter`. Lowercase and hyphenated, so
  it never reads as a worker's `HOLMES-42`. Ids never change, so neither does a tag, and items kept before tags existed
  have one too.
- The board carries it on every item ([`FloorItem`](ref:hub/src/bridge/board.ts#FloorItem)), and each collection its
  `dir`, so a renderer that imports no TypeScript and the `tower` CLI read both.
- Renderers show it beside the title: the tower page's sidebar rows (with the keeper) and the editor head (click copies
  it; its title is the file's path); Tower 3D on the note's face under the title, on the note in your hands, the aimed
  note's card and the draft panel.
- `tower keep` prints the tag, title and path; `tower kept` leads each line with the tag and gives the file;
  `tower read` takes a tag or an id, as `tower hire` does for the item it starts a worker on ([[hiring-limits]]). The brief and the skill tell workers to name items by tag and title.
- About 20,000 tags: two items on a 20-item floor share one about 1% of the time. Both show it; `tower read` refuses
  a shared tag and lists both ids.

**Alternatives considered.**
- *Show the id, or its time part.* Unreadable at a distance and indistinguishable within a batch.
- *Titles alone.* Long, not unique, and changed by an edit to the first line, which silently breaks references.
- *Readable names as ids (`night-shift.md`).* Ids sort in creation order and the corkboard is that order; a name
  would also drift from the title after edits.
- *A number per floor.* Derived from order, so a delete renumbers every later item and old references point at the
  wrong one.
- *A pronounceable made-up word (`kobemi`).* Rejected by the user: letters with no picture behind them.

**Impact.** One more derived field on the board and one on each collection; no stored state. Old references by id
still resolve with `tower read`.
