---
{
  "type": "library",
  "name": "Renderer shared modules",
  "summary": "The TypeScript modules every renderer imports for what they draw alike (cards, the Changes and Reviews panels, a worker's brief, drafts, review threads, icons, terminal keys), served by the tower bundled as /<name>.js.",
  "in": "web-tower",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/tower/server.ts#MODULES", "hub/src/shared/cards.ts", "hub/src/shared/panels.ts", "hub/src/shared/brief.ts", "hub/src/shared/highlight.ts", "hub/src/shared/drafts.ts", "hub/src/shared/reviews.ts", "hub/src/shared/icons.ts", "hub/src/shared/cards.ts#bubbleOf", "hub/src/shared/cards.ts#hireRefusal", "hub/src/shared/cards.ts#sendTargets", "hub/src/shared/panels.ts#changesHtml", "hub/src/shared/panels.ts#reviewsHtml", "hub/src/shared/drafts.ts#readDraft", "hub/src/shared/reviews.ts#parseThread", "hub/src/shared/icons.ts#ICON", "hub/src/shared/termkeys.ts#NATURAL_KEYS", "hub/src/shared/termkeys.ts#terminalKeys"]
}
---
[`MODULES`](ref:hub/src/tower/server.ts#MODULES) maps each URL (`/cards.js`, `/panels.js`, `/brief.js`, `/drafts.js`,
`/reviews.js`, `/icons.js`, `/termkeys.js`, and `/design.js`, [[design-system]]) to a file of `src/shared`; a GET bundles it
with esbuild on request, with CORS open so a shelf page framed at an opaque origin can import it. They hold what
a renderer would otherwise write twice, so a sibling renderer written from scratch reaches the same behavior
([[renderer-is-disposable]]):

- `cards.ts`: words about cards (a status as a word and as a bubble's glyph, `bubbleOf`), the spawn form and its request, round-robin through waits, dismissals and the
  ring setting kept in `tower.store`, the sounds as scores, who a review's notes can be sent to, and the hiring
  limits ([[hire]]).
- `panels.ts`: the Changes and Reviews panels as pure views (view model in, html out), the line-picking logic,
  one stylesheet and the data attributes each renderer wires ([[shared-panels]]), with code highlighted by
  `highlight.ts` (highlight.js, bundled).
- `brief.ts`: a worker's brief by session, the current one in full and the earlier ones folded, as a pure view
  over the `/conversations/<id>` read, and the label of the session a showing came from ([[brief-turns]]).
- `drafts.ts`: editing a project's `drafts` collection through generic `collection/*` verbs ([[collections]]).
- `reviews.ts`: the thread format, its parse and append, anchors and their state against the current diff, the
  prompts that start a reviewer and send notes ([[review-round]], [[review-threads]]).
- `icons.ts`: the inline SVG every renderer draws for the same things.
- `termkeys.ts`: the editing keys of a Mac text field in every browser terminal
  ([`NATURAL_KEYS`](ref:hub/src/shared/termkeys.ts#NATURAL_KEYS)): Shift+Enter sends `\n` (a newline in Claude's
  prompt, Enter in a shell), Ctrl+⌫ `^W`, ⌘⌫ `^U`, ⌘⌦ `^K`, ⌘← / ⌘→ `^A` / `^E`, the readline keys Claude's
  prompt and a shell both read. ⌥⌫ is xterm's own ESC DEL, already a word delete in both. Every xterm a renderer
  mounts (the tower page's session and shells, Tower 3D's desk and kiosks) takes
  [`terminalKeys`](ref:hub/src/shared/termkeys.ts#terminalKeys) as its key handler, the renderer's shortcuts first.

The bridge's board imports `cards.ts` and `reviews.ts`, and so does the `tower` command; `drafts.ts`, `panels.ts`,
`brief.ts`, `icons.ts` and `termkeys.ts` are served and imported only by renderers. A module here holds no renderer's state: each renderer keeps its
own and hands it in. `panels.ts` keeps only a cache of highlighted files, by their diff's hash.
