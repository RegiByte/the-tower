---
{
  "type": "decision",
  "name": "Shared panels: one Changes, one Reviews, one Stats and one Policies for every renderer",
  "summary": "The Changes, Reviews, Stats and Policies panels are pure views in one served module, `/panels.js`, gathered from a module per concern (view model in, html out), with the logic of picking lines and finding an anchor's, one stylesheet and a data-attribute protocol each renderer wires; renderers keep their own state and wiring.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-30",
  "refs": [
    "hub/src/shared/panels.ts",
    "hub/src/shared/changes-panel.ts#markedChangesHtml",
    "hub/src/shared/changes-panel.ts#changesPanelHtml",
    "hub/src/shared/anchors-legacy.ts#changesHtml",
    "hub/extensions/reviews/client/panel.ts#reviewsHtml",
    "hub/extensions/reviews/client/panel.ts#threadViewOf",
    "hub/src/shared/stats-panel.ts#statsHtml",
    "hub/src/shared/stats-panel.ts#statsQuery",
    "hub/src/shared/policies-panel.ts#policiesHtml",
    "hub/src/shared/panel-kit.ts#drawPanel",
    "hub/src/shared/changes-lines.ts#watchPickDrag",
    "hub/src/shared/panel-kit.ts#keepingFocus",
    "hub/src/shared/changes-panel.ts#keepingFileTop",
    "hub/src/shared/changes-panel.ts#keepingViewedFileTop",
    "hub/src/shared/file-acts.ts#fileCall",
    "hub/src/shared/panels-css.ts#panelsCss",
    "hub/src/shared/changes-panel.ts#rowCode",
    "hub/src/shared/panel-kit.ts#failedHtml",
    "hub/src/shared/highlight.ts#highlightLines",
    "hub/src/shared/words.ts#markRanges",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/renderers/tower3d/src/main.ts#drawChanges",
    "hub/renderers/tower3d/src/main.ts#drawThread"
  ],
  "links": [
    { "to": "changes-view", "verb": "uses", "carries": "a worker's Changes read, its viewed marks and the viewer's folds" },
    { "to": "review-threads", "verb": "uses", "carries": "a checkout's thread: its notes, anchors and what a worker hasn't seen" },
    { "to": "renderer-is-disposable", "verb": "follows", "carries": "what a next renderer would port lives in shared" },
    { "to": "stats", "verb": "uses", "carries": "a /stats read: summaries, series, hours of the day, the weekly budget" }
  ]
}
---
**Problem.** Two renderers drawing their own Changes and Reviews port every feature by hand, keep the CSS twice and
drift apart.

**Why.** A capability a next renderer would need belongs in shared code ([[renderer-is-disposable]]). The panels
are the same view in every renderer; only where they sit, their state and a few gestures differ.

**How.**
- *One served module of pure views* ([`panels.ts`](ref:hub/src/shared/panels.ts), served as `/panels.js`) holds four panels,
  each in a module of its own that it gathers and bundles:
  Changes ([`markedChangesHtml`](ref:hub/src/shared/changes-panel.ts#markedChangesHtml), [[changes-view]]), Reviews
  ([`reviewsHtml`](ref:hub/src/shared/reviews-panel.ts#reviewsHtml) over the board's old fields, deprecated since 1.93
  for the reviews extension's own panel, `/x/reviews/panel.js`
  ([`reviewsHtml`](ref:hub/extensions/reviews/client/panel.ts#reviewsHtml) over `x.reviews`, [[review-threads]], whose
  view model [`threadViewOf`](ref:hub/extensions/reviews/client/panel.ts#threadViewOf) builds), which both renderers
  draw), Stats
  ([`statsHtml`](ref:hub/src/shared/stats-panel.ts#statsHtml) over a `/stats` read, ranges asked by
  [`statsQuery`](ref:hub/src/shared/stats-panel.ts#statsQuery), [[stats]]) and Policies
  ([`policiesHtml`](ref:hub/src/shared/policies-panel.ts#policiesHtml) over `floor.policies` and `board.offers`,
  [[policies]]; deprecated since 1.91 for the policies extension's own panel, `/x/policies/panel.js`, which the tower
  page draws). Each takes a view model and reads nothing global. The logic of rows, picks, anchors and marks lives
  beside them as pure functions. The tower page draws all four; Tower 3D draws Changes, Reviews and Stats. The Changes
  panel knows nothing of review threads (since 1.114): it draws the card's `marks` on their lines, picks lines where a
  renderer says something acts on them, and leaves an element under the pick (`data-pick-acts`) the renderer fills
  with the `lines.acts` region ([[ui-model]]). Both draw through one core,
  [`changesPanelHtml`](ref:hub/src/shared/changes-panel.ts#changesPanelHtml), which takes what each line says it is
  marked with and the row drawn under a pick. The panel as it stood at 1.113, over a thread and with the note box
  under the pick ([`changesHtml`](ref:hub/src/shared/anchors-legacy.ts#changesHtml)), and its anchor helpers stay
  exported from `/panels.js` as deprecated copies until 2.0, for Tower 3D's desk and any renderer written against
  them; the reviews extension's client holds its own (`/x/reviews/anchors.js`).
- *A protocol of data attributes*, listed once in the module's header, which each renderer wires to its own state.
  File buttons (`data-reveal`, `data-edit`) are calls already: `fileCall` gives the request ([[open-files]]); a
  policy's presses are calls the board offered (`data-policy-call`). Text boxes are named by attribute, not id, so
  one panel can be drawn in two places.
- *Redraws keep what is being typed.* [`drawPanel`](ref:hub/src/shared/panel-kit.ts#drawPanel) replaces the element's
  html only when it changed, keeps the element's scroll and that of each `data-keep-scroll` inside it (WebKit drops
  the element's when the swap flips a `:has` rule it matches, as the Changes' file tree does), sets each text box from
  the renderer's text, and gives focus and caret back
  ([`keepingFocus`](ref:hub/src/shared/panel-kit.ts#keepingFocus), which a renderer also wraps around its own redraws).
  A time is an empty `data-since` span each renderer fills on its own clock, so the clock never forces a redraw that
  would drop a text selection.
- *A fold keeps the reader's place.* Folding or marking viewed a file the reader is inside redraws through
  [`keepingFileTop`](ref:hub/src/shared/changes-panel.ts#keepingFileTop), which scrolls the file back to its header so the
  next file follows it; marking a file viewed redraws through
  [`keepingViewedFileTop`](ref:hub/src/shared/changes-panel.ts#keepingViewedFileTop), which with the file tree drawn
  always brings the file to the top.
- *Line picks* stop at the edge of the first line's hunk (`picked`, `spanned`): an anchor is a span of the file's
  lines, and a range over a gap would claim lines its quote doesn't hold. The drag is DOM wiring, shared as
  [`watchPickDrag`](ref:hub/src/shared/changes-lines.ts#watchPickDrag); the renderer keeps the pick and a `picking` flag,
  and what acts on the lines (the note box) waits for the drop.
- *One stylesheet* ([`panelsCss`](ref:hub/src/shared/panels-css.ts#panelsCss)), scoped under the views' own roots. Each
  renderer adds it as a `<style>` and sizes the element the panel is drawn in. It also lays out a worker's tab row,
  its showings kept in place across redraws by [`keepShownTabs`](ref:hub/src/shared/panel-kit.ts#keepShownTabs).
- *A read that failed says so.* Each view takes `failed`, drawn while nothing is read:
  [`failedHtml`](ref:hub/src/shared/panel-kit.ts#failedHtml) names what couldn't be read and why, with Read again. A
  failure over a read already held leaves it drawn and toasts (`Held`, `/reads.js`).
- *Syntax* ([`highlightLines`](ref:hub/src/shared/highlight.ts#highlightLines)): code in Changes and quotes in
  Reviews are highlighted with highlight.js, bundled into the served modules and Tower 3D's bundle (local-first:
  nothing comes from a CDN). [`rowCode`](ref:hub/src/shared/changes-panel.ts#rowCode) highlights each hunk as two texts, its
  old side and its new, so a removed line reads in the code it was removed from; a hunk carries no state from the lines
  before it, so one starting inside a block comment or string is highlighted as code. An edited line's changed words
  ([[changes-view]]) are laid over the highlighted html by [`markRanges`](ref:hub/src/shared/words.ts#markRanges),
  diffed as code tokens. The colours are the design's tokens ([[design-system]]).
- *What stays per renderer is wiring, not html.* Copying, scrolling to a note and toasts are each renderer's handlers
  on the same attributes. Reading is shared: a renderer runs [`changesHandlers`](ref:hub/src/shared/changes-reads.ts#changesHandlers)
  and the held thread reads on `/loop.js` with its own executors, and tells them, as it draws, whose Changes are open
  and which thread it shows ([[changes-view]]). A Stats bar's readout (`data-tip`) shows through the renderer's one
  tooltip ([[viewer-prefs]]). Picking lines for a note stays a pointer gesture; a file's fold and Viewed are
  real buttons.

**Alternatives considered.**
- *Optional flags on the views* (copyable tag or not, a hint line per renderer): one view doing two things; every
  renderer wires every attribute instead.
- *A DOM morph (idiomorph or morphdom) or a framework* for redraws: `drawPanel` covers today's needs; a morph is the
  next step only if hand-patching grows.
- *Serving each panel's module apart* (`/changes-panel.js` and the rest): every module served is a URL renderers may
  import and so part of the contract for good; `/panels.js` already serves every name, and its modules stay free to be
  cut again.
- *Panel CSS inside `/design.css`*: every shelf page would load it, and the design module would import the panels.
- *Shiki or Prism*: Shiki's TextMate grammars need a WASM regex engine and load asynchronously, too heavy for a pure,
  synchronous view; Prism highlights through globals. Highlighting each line alone loses multi-line strings and
  comments.
- *Character diffs (diff-match-patch, fast-diff) or jsdiff's prose words*: they mark fragments of code tokens.
