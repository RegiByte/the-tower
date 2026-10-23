---
{
  "type": "decision",
  "name": "Shared panels: one Changes, one Reviews, one Stats and one Policies for every renderer",
  "summary": "The Changes, Reviews, Stats and Policies panels are pure views in one shared module (view model in, html out), with the logic of picking lines and finding an anchor's, one stylesheet and a data-attribute protocol each renderer wires; renderers keep their own state and wiring.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-23",
  "refs": [
    "hub/src/shared/panels.ts",
    "hub/src/shared/panels.ts#changesHtml",
    "hub/src/shared/panels.ts#reviewsHtml",
    "hub/src/shared/panels.ts#threadViewOf",
    "hub/src/shared/panels.ts#statsHtml",
    "hub/src/shared/panels.ts#statsQuery",
    "hub/src/shared/panels.ts#policiesHtml",
    "hub/src/shared/panels.ts#drawPanel",
    "hub/src/shared/panels.ts#watchPickDrag",
    "hub/src/shared/panels.ts#keepingFocus",
    "hub/src/shared/panels.ts#keepingFileTop",
    "hub/src/shared/panels.ts#fileCall",
    "hub/src/shared/panels.ts#panelsCss",
    "hub/src/shared/panels.ts#rowCode",
    "hub/src/shared/panels.ts#failedHtml",
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
- *One module of pure views* ([`panels.ts`](ref:hub/src/shared/panels.ts), served as `/panels.js`) holds four panels:
  Changes ([`changesHtml`](ref:hub/src/shared/panels.ts#changesHtml), [[changes-view]]), Reviews
  ([`reviewsHtml`](ref:hub/src/shared/panels.ts#reviewsHtml), [[review-threads]], whose view model
  [`threadViewOf`](ref:hub/src/shared/panels.ts#threadViewOf) builds), Stats
  ([`statsHtml`](ref:hub/src/shared/panels.ts#statsHtml) over a `/stats` read, ranges asked by
  [`statsQuery`](ref:hub/src/shared/panels.ts#statsQuery), [[stats]]) and Policies
  ([`policiesHtml`](ref:hub/src/shared/panels.ts#policiesHtml) over `floor.policies` and `board.offers`,
  [[policies]]). Each takes a view model and reads nothing global. The logic of rows, picks, anchors and marks lives
  beside them as pure functions. The tower page draws all four; Tower 3D draws Changes, Reviews and Stats.
- *A protocol of data attributes*, listed once in the module's header, which each renderer wires to its own state.
  File buttons (`data-reveal`, `data-edit`) are calls already: `fileCall` gives the request ([[open-files]]); a
  policy's presses are calls the board offered (`data-policy-call`). Text boxes are named by attribute, not id, so
  one panel can be drawn in two places.
- *Redraws keep what is being typed.* [`drawPanel`](ref:hub/src/shared/panels.ts#drawPanel) replaces the element's
  html only when it changed, sets each text box from the renderer's text, and gives focus and caret back
  ([`keepingFocus`](ref:hub/src/shared/panels.ts#keepingFocus), which a renderer also wraps around its own redraws).
  A time is an empty `data-since` span each renderer fills on its own clock, so the clock never forces a redraw that
  would drop a text selection.
- *A fold keeps the reader's place.* Folding or marking viewed a file the reader is inside redraws through
  [`keepingFileTop`](ref:hub/src/shared/panels.ts#keepingFileTop), which scrolls the file back to its header so the
  next file follows it.
- *Line picks* stop at the edge of the first line's hunk (`picked`, `spanned`): an anchor is a span of the file's
  lines, and a range over a gap would claim lines its quote doesn't hold. The drag is DOM wiring, shared as
  [`watchPickDrag`](ref:hub/src/shared/panels.ts#watchPickDrag); the renderer keeps the pick and a `picking` flag,
  and the note box waits for the drop.
- *One stylesheet* ([`panelsCss`](ref:hub/src/shared/panels.ts#panelsCss)), scoped under the views' own roots. Each
  renderer adds it as a `<style>` and sizes the element the panel is drawn in. It also lays out a worker's tab row,
  its showings kept in place across redraws by [`keepShownTabs`](ref:hub/src/shared/panels.ts#keepShownTabs).
- *A read that failed says so.* Each view takes `failed`, drawn while nothing is read:
  [`failedHtml`](ref:hub/src/shared/panels.ts#failedHtml) names what couldn't be read and why, with Read again. A
  failure over a read already held leaves it drawn and toasts (`Held`, `/reads.js`).
- *Syntax* ([`highlightLines`](ref:hub/src/shared/highlight.ts#highlightLines)): code in Changes and quotes in
  Reviews are highlighted with highlight.js, bundled into the served modules and Tower 3D's bundle (local-first:
  nothing comes from a CDN). [`rowCode`](ref:hub/src/shared/panels.ts#rowCode) highlights each hunk as two texts, its
  old side and its new, so a removed line reads in the code it was removed from; a hunk carries no state from the lines
  before it, so one starting inside a block comment or string is highlighted as code. An edited line's changed words
  ([[changes-view]]) are laid over the highlighted html by [`markRanges`](ref:hub/src/shared/words.ts#markRanges),
  diffed as code tokens. The colours are the design's tokens ([[design-system]]).
- *What stays per renderer is wiring, not html.* Copying, scrolling to a note and toasts are each renderer's handlers
  on the same attributes. Reading is shared: a renderer runs [`changesHandlers`](ref:hub/src/shared/panels.ts#changesHandlers)
  and the held thread reads on `/loop.js` with its own executors, and tells them, as it draws, whose Changes are open
  and which thread it shows ([[changes-view]]). A Stats bar's readout (`data-tip`) shows through the renderer's one
  tooltip ([[viewer-prefs]]). Picking lines for a note stays a pointer gesture; a file's fold and Viewed are
  real buttons.

**Alternatives considered.**
- *Optional flags on the views* (copyable tag or not, a hint line per renderer): one view doing two things; every
  renderer wires every attribute instead.
- *A DOM morph (idiomorph or morphdom) or a framework* for redraws: `drawPanel` covers today's needs; a morph is the
  next step only if hand-patching grows.
- *Panel CSS inside `/design.css`*: every shelf page would load it, and the design module would import the panels.
- *Shiki or Prism*: Shiki's TextMate grammars need a WASM regex engine and load asynchronously, too heavy for a pure,
  synchronous view; Prism highlights through globals. Highlighting each line alone loses multi-line strings and
  comments.
- *Character diffs (diff-match-patch, fast-diff) or jsdiff's prose words*: they mark fragments of code tokens.
