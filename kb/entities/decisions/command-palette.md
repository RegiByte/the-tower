---
{
  "type": "decision",
  "name": "The command palette: a new way in to what exists, its entries and ranking shared",
  "summary": "⌘K opens a palette that goes to any worker, floor, shelf entry or draft, runs any global command or any verb the selected worker and the floors offer, and finds what the tower can teach. Entries and their ranking are pure shared code (/palette.js), a verb's words come from /verb-words.js, and a pick runs the same handler as the button or key it stands for: the palette takes no arguments and opens no form of its own.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-21",
  "reviewed": "2026-10-21",
  "refs": ["hub/src/shared/palette.ts#paletteEntries", "hub/src/shared/palette.ts#rankPalette", "hub/src/shared/palette.ts#WEIGHTS", "hub/src/shared/palette.ts#matchScore", "hub/src/shared/cards.ts#heededWaits", "hub/src/shared/verb-words.ts#VERB_WORDS", "hub/src/shared/keymap.ts#COMMANDS", "hub/src/shared/capabilities.ts#CAPABILITIES", "hub/renderers/page/palette.js#palette", "hub/renderers/page/page.js#doPick", "hub/test/palette.test.ts"]
}
---
**Problem.** The tower's capabilities were reachable only by the mouse, by chords nobody had learned yet, or by tips
that rotate past. With ten or more workers on duty, getting to one meant scanning the sidebar or cycling ⌥↓. Users
learn from what crosses their screen, and a palette is a surface they open on purpose to find something.

**Why.** Do or go to anything without the mouse; teaching is a side effect, since every entry that has a chord shows
it. [[renderer-is-disposable]]: what the palette lists and in what order is shared, so a sibling renderer (Tower 3D
later) draws the same palette, and only the drawing is a renderer's.

**How.**
- Three kinds of entries ([`paletteEntries`](ref:hub/src/shared/palette.ts#paletteEntries)): **go to** (every worker
  on duty by callsign, task and floor; floors; shelf entries; drafts), **do** (the global keymap commands by their
  `label` with their chords; what the selected worker, its earlier conversations and its processes offer; every
  floor's verbs) and **learn** (capabilities that name no command; one entry, "Patterns users are discovering").
  Each entry's `does` is a tagged message (`command`, `action`, `go`, `patterns`, `learn`) the renderer runs.
- No arguments, no forms: an entry runs something ready or opens the UI that exists for it (the new-worker form, a
  draft, a confirm). A pick goes through the same handler as its button or key, so destructive verbs ask through the
  same confirm and the palette can't drift from the buttons. A verb a keymap command does (`card/drive`,
  `card/brief`, `card/note`) runs as that command and shows its chords, and the command isn't listed twice; `submit`,
  `kill` and `cut` are left out (typed in the terminal, ended by `send-home` per [[crews]], chosen in the new-worker
  form). A floor's `shell` and `editor` act on its hub.
- No word soup: a capability that names a command is that command's hint, not a row; Learn entries show only when the
  query matches them (never on an empty query) and at most two; patterns are one entry that opens a sheet of
  `GET /patterns`.
- Ranking ([`rankPalette`](ref:hub/src/shared/palette.ts#rankPalette)), small and explainable, its weights one table
  ([`WEIGHTS`](ref:hub/src/shared/palette.ts#WEIGHTS)): with nothing typed, the selected worker's verbs (primary
  first), who waits on you in `board.waiting`'s order, and recent picks, five each. With a query, each entry is scored
  on its label and keywords ([`matchScore`](ref:hub/src/shared/palette.ts#matchScore)): a prefix over a word start
  over a substring over letters in order, the last on a label only and never on a Learn sentence; a keyword counts
  less than the label (its prefix with every boost stays below a label's word start). A query that matches nothing as
  typed is tried without a trailing "s" (`shells` finds Shell here), at a factor of its tier; a Learn entry's match
  counts for half, so what can be gone to or done comes first. Small fixed boosts favour the selected worker, then its
  floor, then recent picks, each tier wider than every boost; groups go by their best entry. "Waiting on you" is the
  viewer's waits, dismissals left out (`heededWaits`, the same list ⌥J walks), and Recent never brings back a Learn
  entry. [Unit tests](ref:hub/test/palette.test.ts) pin the tiers,
  each boost and each cap.
- A verb's words (label, hint, whether it asks first) are its human facet in
  [`VERB_WORDS`](ref:hub/src/shared/verb-words.ts#VERB_WORDS), keyed `<subject>/<verb>`, linked by `api` to its agent
  facet in `VERBS` ([[board-verbs]]); the page's buttons read the same table.
- The tower page ([`palette`](ref:hub/renderers/page/palette.js#palette)) draws it as a `<dialog>`: one input,
  groups with headings, a hint line, the chords at the right; ↑↓ move, Enter picks, Esc closes. It opens on the
  keymap command `palette` (⌘K, global, rebound by the config's `keys`, [[keymap]]), dispatches picks through
  [`doPick`](ref:hub/renderers/page/page.js#doPick), keeps recent picks in `tower.store` as view state, and a
  capability teaches ⌘K in the tips.

**Alternatives considered.**
- Patterns as entries: stories don't fit a one-line list, and they turn the palette into reading matter.
- Every capability as a row: most name a command, and as that command's hint they teach without adding rows.
- Configurable ranking: deferred until someone needs it; the weights are one table, which a config key or a
  `tower.store` setting would override.
- Arguments in the palette (type a prompt, pick a model): the forms already exist, and the palette opens them.
- cmdk itself (shadcn's Command): React-only, and the page is plain modules; its ideas are borrowed (groups with
  headings, a hint, the chord at the right, one input, arrows and Enter).
- The palette's code in the page alone: no capability lives in a renderer.

**Impact.** The first consumer of the board's `actions` outside the cards: verbs added later show up in it for free.
The `?` sheet and the tips can later become views over the same entries. `/palette.js` and `/verb-words.js` are new
served modules (an API minor); the board doesn't change.
