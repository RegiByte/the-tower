---
{
  "type": "library",
  "name": "Renderer shared modules",
  "summary": "The TypeScript modules every renderer imports for what they draw alike (cards, the Changes, Reviews, Stats and Policies panels, a worker's brief, drafts, review threads, icons, terminal keys), served by the tower bundled as /<name>.js.",
  "in": "tower-core",
  "reviewed": "2026-10-21",
  "refs": ["hub/src/tower/served.ts#MODULES", "hub/src/shared/cards.ts", "hub/src/shared/panels.ts", "hub/src/shared/brief.ts", "hub/src/shared/highlight.ts", "hub/src/shared/drafts.ts", "hub/src/shared/items.ts", "hub/src/shared/reviews.ts", "hub/src/shared/icons.ts", "hub/src/shared/cards.ts#bubbleOf", "hub/src/shared/cards.ts#hireRefusal", "hub/src/shared/cards.ts#sendTargets", "hub/src/shared/panels.ts#changesHtml", "hub/src/shared/panels.ts#reviewsHtml", "hub/src/shared/drafts.ts#readDraft", "hub/src/shared/reviews.ts#parseThread", "hub/src/shared/icons.ts#ICON", "hub/src/shared/settings.ts", "hub/src/shared/tips.ts", "hub/src/shared/markdown.ts#markdownHtml", "hub/src/shared/markdown.ts#documentHtml", "hub/src/shared/termkeys.ts#NATURAL_KEYS", "hub/src/shared/termkeys.ts#terminalKeys", "hub/src/shared/termkeys.ts#terminalKeymap", "hub/src/shared/keymap.ts#COMMANDS", "hub/src/shared/terminal.ts", "hub/src/shared/prefs.ts", "hub/src/shared/policies.ts", "hub/src/shared/loop.ts#loop", "hub/src/shared/reads.ts#heldHandlers", "hub/src/shared/panels.ts#changesHandlers", "hub/src/shared/panels.ts#heldThread", "hub/src/shared/attend.ts#attendStep", "hub/src/shared/viewer.ts#readViewer", "hub/src/shared/spawn.ts#wireSpawn", "hub/src/shared/term-view.ts#termHandlers", "hub/src/shared/term-view.ts#mountTermView"]
}
---
[`MODULES`](ref:hub/src/tower/served.ts#MODULES) maps each URL (`/cards.js`, `/panels.js`, `/brief.js`, `/drafts.js`,
`/reviews.js`, `/items.js`, `/icons.js`, `/termkeys.js`, `/keymap.js`, `/terminal.js`, `/prefs.js`, `/settings.js`, `/tips.js`, `/markdown.js`, `/press.js`, `/toasts.js`, `/policies.js`, `/loop.js`, `/reads.js`, `/term-view.js`, `/attend.js`, `/viewer.js`, `/spawn.js` and `/design.js`, [[design-system]]) to a file of `src/shared`; a GET bundles it
on request, with CORS open so a shelf page framed at an opaque origin can import it. They hold what
a renderer would otherwise write twice, so a sibling renderer written from scratch reaches the same behavior
([[renderer-is-disposable]]):

- `cards.ts`: words about cards (status words and glyphs, the status counts' and the host lamp's words, what a live
  region says as waits begin), the spawn form and its request, round-robin through waits, dismissals and the ring
  setting kept in `tower.store`, the sounds as scores, who a review's notes can be sent to, the hiring limits
  ([[hire]]), crews ([[crews]]) and the past by crew.
- `panels.ts`: the Changes, Reviews, Stats and Policies panels as pure views (view model in, html out), the line-picking logic,
  one stylesheet and the data attributes each renderer wires ([[shared-panels]]), with code highlighted by
  `highlight.ts` (highlight.js, bundled).
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
  one size and whoever types holds it, a resize from anyone else hands it back, and a pane or font change fits the
  PTY only while this viewer holds it. [`mountTermView`](ref:hub/src/shared/term-view.ts#mountTermView) runs it in
  xterm.js, whose constructors the renderer passes in; every terminal of the tower page and Tower 3D is one
  ([[machines]], [[tower3d-desk]]).
- `tips.ts`: the one tooltip every renderer shows for any `data-tip`, and the placement it shares with popovers
  ([[viewer-prefs]]).
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
  until the next lands, a read overtaken landing on nothing, a failure shown only while nothing is held. `panels.ts`
  runs them for review threads ([`heldThread`](ref:hub/src/shared/panels.ts#heldThread), read once per version of the
  file the board names) and a worker's Changes ([`changesHandlers`](ref:hub/src/shared/panels.ts#changesHandlers),
  [[changes-view]]), so every renderer reads both the same way.
- `viewer.ts`: what a viewer keeps in `tower.store` that every renderer reads alike, one record (`Viewer`: dismissals,
  the ring, the brief rendered or raw, the diff layout, the file tree shown, unfolded crews, the Stats range) under the
  keys it has always had, read whole by [`readViewer`](ref:hub/src/shared/viewer.ts#readViewer) on every board and when
  a framed page writes to the store, since `tower.store` has no change event ([[viewer-prefs]]). A framed page can write
  any value there, so one not of its field's kind (the default's) reads as the default.
- `attend.ts`: what a viewer is told about what asks for them
  ([[attention-list]]): a wait or an offer that begins
  said, notified and rung, a reminder while it waits, a dismissal kept and its notification closed; its steps run inside
  a renderer's own machine through [`attendStep`](ref:hub/src/shared/attend.ts#attendStep). Each renderer runs
  it with its own executors of sound, notifications, its live region and the viewer's record, so they ring alike.
- `keymap.ts`: every command a renderer runs from the keyboard, as data ([`COMMANDS`](ref:hub/src/shared/keymap.ts#COMMANDS)),
  matched against `board.keys` (the config's `keys` over the defaults), with the words for chords, the `?` sheet and
  `aria-keyshortcuts` ([[keymap]]).

A module here holds no renderer's state: each renderer keeps its own and hands it in (a machine's state lives in the
renderer's `loop`). `panels.ts` keeps only a cache
of highlighted files, by their diff's hash.

Their exports are part of the renderer API's contract ([[renderer-api-contract]]): a renderer kept apart from the
checkout imports them, so removing or renaming one is an API major, held by `test/served.test.ts`.
