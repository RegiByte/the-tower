---
{
  "type": "library",
  "name": "Renderer shared modules",
  "summary": "The TypeScript modules every renderer imports for what they draw alike (cards, the Changes and Reviews panels, a worker's brief, drafts, review threads, icons, terminal keys), served by the tower bundled as /<name>.js.",
  "in": "web-tower",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/tower/served.ts#MODULES", "hub/src/shared/cards.ts", "hub/src/shared/panels.ts", "hub/src/shared/brief.ts", "hub/src/shared/highlight.ts", "hub/src/shared/drafts.ts", "hub/src/shared/items.ts", "hub/src/shared/reviews.ts", "hub/src/shared/icons.ts", "hub/src/shared/cards.ts#bubbleOf", "hub/src/shared/cards.ts#hireRefusal", "hub/src/shared/cards.ts#sendTargets", "hub/src/shared/panels.ts#changesHtml", "hub/src/shared/panels.ts#reviewsHtml", "hub/src/shared/drafts.ts#readDraft", "hub/src/shared/reviews.ts#parseThread", "hub/src/shared/icons.ts#ICON", "hub/src/shared/settings.ts", "hub/src/shared/tips.ts", "hub/src/shared/markdown.ts#markdownHtml", "hub/src/shared/markdown.ts#documentHtml", "hub/src/shared/termkeys.ts#NATURAL_KEYS", "hub/src/shared/termkeys.ts#terminalKeys", "hub/src/shared/termkeys.ts#terminalKeymap", "hub/src/shared/keymap.ts#COMMANDS", "hub/src/shared/terminal.ts", "hub/src/shared/prefs.ts"]
}
---
[`MODULES`](ref:hub/src/tower/served.ts#MODULES) maps each URL (`/cards.js`, `/panels.js`, `/brief.js`, `/drafts.js`,
`/reviews.js`, `/items.js`, `/icons.js`, `/termkeys.js`, `/keymap.js`, `/terminal.js`, `/prefs.js`, `/settings.js`, `/tips.js`, `/markdown.js`, and `/design.js`, [[design-system]]) to a file of `src/shared`; a GET bundles it
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
- `items.ts`: any collection's items as rows and trays (title, tag, keeper, age), how an item is read by its type,
  and what to ask before deleting one ([[collection-trays]]).
- `reviews.ts`: the thread format, its parse and append, anchors and their state against the current diff, the
  prompts that start a reviewer and send notes ([[review-round]], [[review-threads]]).
- `icons.ts`: the inline SVG every renderer draws for the same things, every icon a control or a row draws among them (close, info, help, the sidebar, resume, a caret, a branch, a thread, a shelf entry's kind, a gist's kind); `withIcons` draws the text marks shared words carry (`⎇`, `◇`, `▤`) as those icons ([[design-system]]).
- `settings.ts`: the settings popover (alerts, sound, and the viewer's appearance drawn from descriptors and wired by
  `wirePrefs`) as pure views, its stylesheet and the data attributes a renderer wires ([[settings-and-tips]], [[viewer-prefs]]).
- `prefs.ts`: the viewer's appearance record `tower.prefs` keeps, its defaults, and whether to move less (`reducedMotion`) ([[viewer-prefs]]).
- `terminal.ts`: a browser terminal's face and size from the record, and the size a watched one fits at, from cells
  measured in its face ([[viewer-prefs]]).
- `tips.ts`: the one tooltip every renderer shows for any `data-tip`, and the placement it shares with popovers
  ([[settings-and-tips]]).
- `markdown.ts`: markdown as html, the only way either renderer draws it ([[markdown-safe]]).
- `cards.ts` also holds what a renderer's live region says as waits begin (`waitsBeganLine`, `WAIT_SAID`), and the words of the status counts (`ATTENTION_NAME`, `ATTENTION_MEANS`, `WAITING_MEANS`,
  `statusLegendHtml`) and of the host's state (`hostState`, `HOST_NAME`, `HOST_MEANS`).
- `termkeys.ts`: the editing keys of a Mac text field in every browser terminal
  ([`NATURAL_KEYS`](ref:hub/src/shared/termkeys.ts#NATURAL_KEYS)): Shift+Enter sends `\n` (a newline in Claude's
  prompt, Enter in a shell), Ctrl+⌫ `^W`, ⌘⌫ `^U`, ⌘⌦ `^K`, ⌘← / ⌘→ `^A` / `^E`, the readline keys Claude's
  prompt and a shell both read. ⌥⌫ is xterm's own ESC DEL, already a word delete in both. Every xterm a renderer
  mounts (the tower page's session and shells, Tower 3D's desk and kiosks) takes
  [`terminalKeymap`](ref:hub/src/shared/termkeys.ts#terminalKeymap) as its key handler: each natural key is a
  command of the keymap, so the config can rebind it, and any other command a terminal reaches goes to the renderer
  first. [`terminalKeys`](ref:hub/src/shared/termkeys.ts#terminalKeys) stays for renderers on the default keys.
- `keymap.ts`: every command a renderer runs from the keyboard, as data ([`COMMANDS`](ref:hub/src/shared/keymap.ts#COMMANDS)),
  matched against `board.keys` (the config's `keys` over the defaults), with the words for chords, the `?` sheet and
  `aria-keyshortcuts` ([[keymap]]).

The bridge's board imports `cards.ts` and `reviews.ts`, and so does the `tower` command; `drafts.ts`, `items.ts`, `panels.ts`,
`brief.ts`, `icons.ts`, `settings.ts`, `tips.ts`, `markdown.ts`, `termkeys.ts`, `terminal.ts` and `prefs.ts` are served and imported only by renderers; `keymap.ts` is also read by the config's check and the board. A module here holds no renderer's state: each renderer keeps its
own and hands it in. `panels.ts` keeps only a cache of highlighted files, by their diff's hash.

Their exports are part of the renderer API's contract ([[renderer-api-contract]]): a renderer kept apart from the
checkout imports them, so removing or renaming one is an API major. `test/served-exports.json` lists every name served,
and `test/served.test.ts` holds the modules to it: any difference fails, and `npm run served:update` rewrites the list.
