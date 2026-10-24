---
{
  "type": "library",
  "name": "Renderer shared modules",
  "summary": "The TypeScript modules every renderer imports for what they draw alike (cards, the Changes, Reviews, Stats and Policies panels, a worker's brief, drafts, review threads, icons, terminal keys), served by the tower bundled as /<name>.js.",
  "in": "tower-core",
  "reviewed": "2026-10-24",
  "refs": ["hub/src/tower/served.ts#MODULES", "hub/src/shared/cards.ts", "hub/src/shared/panels.ts", "hub/src/shared/brief.ts", "hub/src/shared/highlight.ts", "hub/src/shared/drafts.ts", "hub/src/shared/items.ts", "hub/src/shared/reviews.ts", "hub/src/shared/icons.ts", "hub/src/shared/status-words.ts#bubbleOf", "hub/src/shared/crews.ts#hireRefusal", "hub/src/shared/checkouts.ts#sendTargets", "hub/src/shared/changes-panel.ts#changesHtml", "hub/src/shared/reviews-panel.ts#reviewsHtml", "hub/src/shared/drafts.ts#readDraft", "hub/src/shared/reviews.ts#parseThread", "hub/src/shared/icons.ts#ICON", "hub/src/shared/settings.ts", "hub/src/shared/tips.ts", "hub/src/shared/capabilities.ts#CAPABILITIES", "hub/src/shared/capabilities.ts#parsePattern", "hub/src/shared/capabilities.ts#tipAt", "hub/src/shared/verb-words.ts#VERB_WORDS", "hub/src/shared/palette.ts#paletteEntries", "hub/src/shared/palette.ts#rankPalette", "hub/src/shared/markdown.ts#markdownHtml", "hub/src/shared/markdown.ts#documentHtml", "hub/src/shared/termkeys.ts#NATURAL_KEYS", "hub/src/shared/termkeys.ts#terminalKeys", "hub/src/shared/termkeys.ts#terminalKeymap", "hub/src/shared/keymap.ts#COMMANDS", "hub/src/shared/terminal.ts", "hub/src/shared/prefs.ts", "hub/src/shared/policies.ts", "hub/src/shared/loop.ts#loop", "hub/src/shared/reads.ts#heldHandlers", "hub/src/shared/changes-reads.ts#changesHandlers", "hub/src/shared/reviews-panel.ts#heldThread", "hub/src/shared/attend.ts#attendStep", "hub/src/shared/viewer.ts#readViewer", "hub/src/shared/spawn.ts#wireSpawn", "hub/src/shared/term-view.ts#termHandlers", "hub/src/shared/term-view.ts#mountTermView"]
}
---
[`MODULES`](ref:hub/src/tower/served.ts#MODULES) maps each URL (`/cards.js`, `/panels.js`, `/brief.js`, `/drafts.js`,
`/reviews.js`, `/items.js`, `/icons.js`, `/termkeys.js`, `/keymap.js`, `/terminal.js`, `/prefs.js`, `/settings.js`, `/tips.js`, `/capabilities.js`, `/verb-words.js`, `/palette.js`, `/markdown.js`, `/press.js`, `/toasts.js`, `/policies.js`, `/loop.js`, `/reads.js`, `/term-view.js`, `/attend.js`, `/viewer.js`, `/spawn.js` and `/design.js`, [[design-system]]) to a file of `src/shared`; a GET bundles it
on request, with CORS open so a shelf page framed at an opaque origin can import it. They hold what
a renderer would otherwise write twice, so a sibling renderer written from scratch reaches the same behavior
([[renderer-is-disposable]]):

- `cards.ts`, gathering a module per concern (`status-words.ts`, `waits.ts`, `rings.ts`, `crews.ts`, `past.ts`,
  `tidy.ts`, `duty.ts`, `limits.ts`, `health.ts`, `shelf-words.ts`, `worktree-words.ts`, `checkouts.ts`, …), served as one:
  words about cards (status words and glyphs, the status counts' and the host lamp's words, what a live
  region says as waits begin), the spawn form and its request (an empty model or effort said as what the board's
  `claudeDefaults` observed, `opus 5.5 (default)`, or as Claude's default until one is seen), round-robin through waits, dismissals and the ring
  setting kept in `tower.store`, the sounds as scores, who a review's notes can be sent to, the hiring limits
  ([[hire]]), crews ([[crews]]) and the past by crew.
- `panels.ts`: the Changes, Reviews, Stats and Policies panels as pure views (view model in, html out), the line-picking logic,
  one stylesheet and the data attributes each renderer wires ([[shared-panels]]), with code highlighted by
  `highlight.ts` (highlight.js, bundled). It gathers a module per concern (`changes-reads.ts`, `changes-lines.ts`,
  `changes-panel.ts`, `reviews-panel.ts`, `stats-panel.ts`, `policies-panel.ts`, `file-acts.ts`, `panel-kit.ts`,
  `panels-css.ts`), bundled into `/panels.js` and not served apart.
- `brief.ts`: a worker's brief by session, the current one in full and the earlier ones folded, as a pure view
  over the `/conversations/<id>` read, and the label of the session a showing came from ([[brief-turns]]).
- `drafts.ts`: editing a project's `drafts` collection through generic `collection/*` verbs ([[collections]]).
- `items.ts`: any collection's items as rows and trays (title, tag, keeper, age), whole or bounded to the newest, how an item is read by its type,
  and what to ask before deleting one ([[collection-trays]]).
- `reviews.ts`: the thread format, its parse and append, anchors and their state against the current diff, the
  prompts that start a reviewer and send notes ([[review-round]], [[review-threads]]).
- `icons.ts`: the inline SVG every renderer draws for the same things, and `withIcons`, which draws the text marks
  shared words carry as those icons ([[design-system]]).
- `settings.ts`: the settings popover (alerts, sound, and the viewer's appearance drawn from descriptors and wired by
  `wirePrefs`) as pure views, its stylesheet and the data attributes a renderer wires ([[viewer-prefs]]).
- `prefs.ts`: the viewer's appearance record `tower.prefs` keeps, its defaults, and whether to move less (`reducedMotion`) ([[viewer-prefs]]).
- `terminal.ts`: a browser terminal's face and size from the record, and the size a watched one fits at, from cells
  measured in its face ([[viewer-prefs]]).
- `term-view.ts`: a terminal a viewer has open on a PTY, as a machine on `loop`
  ([`termHandlers`](ref:hub/src/shared/term-view.ts#termHandlers): opening, watching, owning, exited): the PTY has
  one size and whoever types holds it (a focus report, xterm's as its window gains or loses focus, is sent without
  taking it), a resize from anyone else hands it back, and a pane or font change fits the
  PTY only while this viewer holds it. [`mountTermView`](ref:hub/src/shared/term-view.ts#mountTermView) runs it in
  xterm.js, whose constructors the renderer passes in; every terminal of the tower page and Tower 3D is one
  ([[machines]], [[tower3d-desk]]).
- `tips.ts`: the one tooltip every renderer shows for any `data-tip`, and the placement it shares with popovers
  ([[viewer-prefs]]).
- `capabilities.ts`: what the tower lets a user do, as data: [`CAPABILITIES`](ref:hub/src/shared/capabilities.ts#CAPABILITIES),
  one line each, some naming a keymap command (typed by `CommandId`) or a floor verb that tries it, and patterns,
  stories of what users found doing with the tower, kept as markdown in the checkout's `docs/patterns/`, parsed by
  [`parsePattern`](ref:hub/src/shared/capabilities.ts#parsePattern) and read at `GET /patterns`. Both are laid out as
  tips, the one showing picked from the clock and a seed by [`tipAt`](ref:hub/src/shared/capabilities.ts#tipAt), so a
  renderer's own redraws move it on with no timer of its own; the tower page shows one in its shells strip.
- `verb-words.ts`: the human facet of every verb the board offers ([`VERB_WORDS`](ref:hub/src/shared/verb-words.ts#VERB_WORDS)),
  keyed `<subject>/<verb>` (`card/send-home`, `worktree/recut`): the label a button says, a hint of what it does and
  when, whether it asks first, the API verb whose description and schema in `VERBS` are its agent facet, and the
  keymap command that does the same; typed over every subject's verbs, so the table is complete ([[board-verbs]]).
- `palette.ts`: the command palette as data ([`paletteEntries`](ref:hub/src/shared/palette.ts#paletteEntries)): what a
  viewer can go to, do and learn from where they stand, each entry's `does` a tagged message the renderer runs through
  its own handlers, and [`rankPalette`](ref:hub/src/shared/palette.ts#rankPalette), which groups them for what was
  typed by one table of weights ([[command-palette]]).
- `markdown.ts`: markdown as html, the only way a renderer draws it ([[markdown-safe]]).
- `press.ts`: a control that asks the tower something stays `aria-busy` while its request is in flight, found again
  by its identity in html drawn anew ([`pressing`](ref:hub/src/shared/press.ts#pressing), [[press-feedback]]).
- `toasts.ts`: a few words about what just happened, stacked at the bottom of the page, each with at most one action
  (Resume after a kill, Undo after a delete), in a polite live region ([`toaster`](ref:hub/src/shared/toasts.ts#toaster)).
- `termkeys.ts`: the editing keys of a Mac text field in every browser terminal
  ([`NATURAL_KEYS`](ref:hub/src/shared/termkeys.ts#NATURAL_KEYS)), the readline keys Claude's prompt and a shell both
  read; every xterm a renderer mounts takes [`terminalKeymap`](ref:hub/src/shared/termkeys.ts#terminalKeymap) as its
  key handler, each natural key a command of the keymap the config can rebind
  ([`terminalKeys`](ref:hub/src/shared/termkeys.ts#terminalKeys) stays for renderers on the default keys).
- `policies.ts`: a policy's rule and slots in words, and where it stands ([[policies]]).
- `loop.ts`: a machine as data ([`loop`](ref:hub/src/shared/loop.ts#loop)): a handler per event type returns effects,
  the next state among them, and the renderer's executors run the rest (a fetch, a draw, `tower.store`); a timer is an
  effect carrying the event it fires, so a poll's life is in what the handlers return.
- `reads.ts`: reads a viewer holds ([`heldHandlers`](ref:hub/src/shared/reads.ts#heldHandlers)): the last read held
  until the next lands, a read overtaken landing on nothing, a failure shown only while nothing is held. The panels
  run them for review threads ([`heldThread`](ref:hub/src/shared/reviews-panel.ts#heldThread), read once per version of the
  file the board names) and a worker's Changes ([`changesHandlers`](ref:hub/src/shared/changes-reads.ts#changesHandlers),
  [[changes-view]]), so every renderer reads both the same way.
- `viewer.ts`: what a viewer keeps in `tower.store` that every renderer reads alike, one record (`Viewer`: dismissals,
  the ring, the brief rendered or raw, the diff layout, the file tree shown, unfolded crews, the Stats range, whether tips show and those dismissed) under the
  keys it has always had, read whole by [`readViewer`](ref:hub/src/shared/viewer.ts#readViewer) on every board and when
  a framed page writes to the store, since `tower.store` has no change event ([[viewer-prefs]]). A framed page can write
  any value there, so one not of its field's kind (the default's) reads as the default.
- `attend.ts`: what a viewer is told about what asks for them
  ([[attention-list]]): a wait or an offer that begins
  said, notified and rung, a reminder while it waits, a dismissal kept and its notification closed; its steps run inside
  a renderer's own machine ([`attendHandlers`](ref:hub/src/shared/attend.ts#attendHandlers), run by [`attendNext`](ref:hub/src/shared/attend.ts#attendNext)). Each renderer runs
  it with its own executors of sound, notifications, its live region and the viewer's record, so they ring alike.
- `keymap.ts`: every command a renderer runs from the keyboard, as data ([`COMMANDS`](ref:hub/src/shared/keymap.ts#COMMANDS)),
  matched against `board.keys` (the config's `keys` over the defaults), with the words for chords, the `?` sheet and
  `aria-keyshortcuts` ([[keymap]]).

A module here holds no renderer's state: each renderer keeps its own and hands it in (a machine's state lives in the
renderer's `loop`). `changes-panel.ts` keeps only a cache
of highlighted files, by their diff's hash.

Their exports are part of the renderer API's contract ([[renderer-api-contract]]): a renderer kept apart from the
checkout imports them, so removing or renaming one is an API major, held by `test/served.test.ts`.
