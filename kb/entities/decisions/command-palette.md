---
{
  "type": "decision",
  "name": "The command palette: a new way in to what exists, its entries and ranking shared",
  "summary": "⌘K opens a palette that goes to any worker, floor, shelf entry or draft, runs any global command, any verb the selected worker and the floors offer and anything extensions add to them, and finds what the tower can teach. Entries and their ranking are pure shared code (/palette.js), a verb's words come from /verb-words.js, and a pick runs the same handler as the button or key it stands for: the palette takes no arguments and opens no form of its own.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-21",
  "reviewed": "2026-10-25",
  "refs": ["hub/src/shared/palette.ts#paletteEntries", "hub/src/shared/palette.ts#addedEntries", "hub/src/shared/adds.ts#unboundCommands", "hub/src/shared/palette.ts#rankPalette", "hub/src/shared/palette.ts#WEIGHTS", "hub/src/shared/palette.ts#matchScore", "hub/src/shared/waits.ts#heededWaits", "hub/src/shared/verb-words.ts#VERB_WORDS", "hub/src/shared/keymap.ts#COMMANDS", "hub/src/shared/capabilities.ts#CAPABILITIES", "hub/renderers/page/palette.js#palette", "hub/renderers/page/page.js#doPick", "hub/test/palette.test.ts"]
}
---
**Problem.** The tower's capabilities were reachable only by the mouse, by chords nobody had learned yet, or by tips
that rotate past. With many workers on duty, getting to one meant scanning the sidebar or cycling ⌥↓. A palette is a
surface the user opens on purpose to find something.

**Why.** Do or go to anything without the mouse; teaching is a side effect, since every entry that has a chord shows
it. [[renderer-is-disposable]]: what the palette lists and in what order is shared, so a sibling renderer draws the
same palette, and only the drawing is a renderer's.

**How.**
- Three kinds of entries ([`paletteEntries`](ref:hub/src/shared/palette.ts#paletteEntries)): **go to** (every worker
  on duty by callsign, task and floor; floors; shelf entries; drafts), **do** (the global keymap commands by their
  `label` with their chords; what the selected worker, its earlier conversations and its processes offer; every
  floor's verbs; what extensions add to the selected worker, the floors, the board and each floor's items, verbs and
  client commands alike, each in its words from `board.extensions` ([`addedEntries`](ref:hub/src/shared/palette.ts#addedEntries)),
  and the commands offered on no subject ([`unboundCommands`](ref:hub/src/shared/adds.ts#unboundCommands), [[extensions]]))
  and **learn** (capabilities that name no command; one entry for the patterns users are discovering).
  Each entry's `does` is a tagged message the renderer runs; an extension's is `added`, its subject's key and the
  action, which a renderer that can't import modules leaves out when it is a command.
- No arguments, no forms: an entry runs something ready or opens the UI that exists for it (the new-worker form, a
  draft, a confirm). A pick goes through the same handler as its button or key, so destructive verbs ask through the
  same confirm and the palette can't drift from the buttons. A verb a keymap command does runs as that command and
  shows its chords, listed once; `submit`, `kill` and `cut` are left out (typed in the terminal, ended by
  `send-home` per [[crews]], chosen in the new-worker form).
- No word soup: a capability that names a command is that command's hint, not a row; on a typed query Learn entries
  show only when it matches them, capped; patterns are one entry that opens a sheet of `GET /patterns`.
- The empty query is the whole catalog: a curious user wants to scroll through everything they can do before they
  know what to search for. Contextual groups come first (the selected worker's own verbs, who waits on you in
  `board.waiting`'s order with dismissals left out, as ⌥J walks them ([`heededWaits`](ref:hub/src/shared/waits.ts#heededWaits)),
  and recent picks), then every other entry once, in sections
  ([`rankPalette`](ref:hub/src/shared/palette.ts#rankPalette)): workers, commands, verbs, floors, shelf, drafts,
  Learn last. Going to a worker is what the palette is opened for most; places come after what can be done; Learn is
  reading matter, so it closes the list. A worker's earlier conversations and processes are a group of their own, so
  a worker `/clear`ed a dozen times doesn't push the waits below the fold. Within a section the viewer's floor comes
  first.
- With a query, ranking is small and explainable, its weights one table
  ([`WEIGHTS`](ref:hub/src/shared/palette.ts#WEIGHTS)): each entry scored on its label and keywords
  ([`matchScore`](ref:hub/src/shared/palette.ts#matchScore)), a prefix over a word start over a substring over
  letters in order, the last on a label only; a keyword counts less than the label, a query without its trailing "s"
  is tried at a factor, and a Learn match counts for half, so what can be gone to or done comes first. Fixed boosts
  for the selected worker (else its floor) and a recent pick, each tier wider than every boost; groups go by their
  best entry. [Unit tests](ref:hub/test/palette.test.ts) pin the tiers, each boost and each cap.
- A verb's words (label, hint, whether it asks first) are its human facet in
  [`VERB_WORDS`](ref:hub/src/shared/verb-words.ts#VERB_WORDS), keyed `<subject>/<verb>`, linked by `api` to its agent
  facet in `VERBS` ([[board-verbs]]); the page's buttons read the same table.
- The tower page ([`palette`](ref:hub/renderers/page/palette.js#palette)) draws it as a `<dialog>`, opens it on the
  keymap command `palette` (⌘K, rebound by the config's `keys`, [[keymap]]), dispatches picks through
  [`doPick`](ref:hub/renderers/page/page.js#doPick) and keeps recent picks in `tower.store` as view state.

**Alternatives considered.**
- Patterns as entries: stories don't fit a one-line list, and they turn the palette into reading matter.
- Every capability as a row: most name a command, and as that command's hint they teach without adding rows.
- Configurable ranking: until someone needs it; the weights are one table a config key or a `tower.store` setting
  could override.
- Arguments in the palette (type a prompt, pick a model): the forms already exist, and the palette opens them.
- cmdk (shadcn's Command): React-only, and the page is plain modules; its ideas are borrowed.
- The palette's code in the page alone: no capability lives in a renderer.

**Impact.** Verbs added to the board's `actions` show up in the palette for free. `/palette.js` and `/verb-words.js`
are served modules.
