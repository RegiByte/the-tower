---
{
  "type": "decision",
  "name": "Shared panels: one Changes, one Reviews and one Stats for every renderer",
  "summary": "The Changes, Reviews and Stats panels are pure views in one shared module (view model in, html out), with the logic of picking lines and finding an anchor's, one stylesheet and a data-attribute protocol each renderer wires; renderers keep their own state and wiring.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/src/shared/panels.ts",
    "hub/src/shared/panels.ts#changesHtml",
    "hub/src/shared/panels.ts#reviewsHtml",
    "hub/src/shared/panels.ts#statsHtml",
    "hub/src/shared/panels.ts#statsQuery",
    "hub/src/shared/panels.ts#drawPanel",
    "hub/src/shared/panels.ts#keepingFocus",
    "hub/src/shared/panels.ts#fileCall",
    "hub/src/shared/panels.ts#panelsCss",
    "hub/src/shared/panels.ts#rowCode",
    "hub/src/shared/highlight.ts#highlightLines",
    "hub/src/tower/server.ts#design",
    "hub/renderers/page/index.html",
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
**Problem.** The tower page (plain JS) and Tower 3D each drew their own Changes and Reviews. Tower 3D's Reviews
was a near line-for-line port of the page's, its CSS lived twice, and its Changes was a file list with no hunks,
folds, viewed toggle or line picking. Every feature was ported by hand and drifted.

**Why.** A capability a next renderer would need belongs in shared code ([[renderer-is-disposable]]). The two
panels are the same view in both renderers. Only where they sit, their state and a few gestures differ.

**How.**
- *One module of pure views* ([`panels.ts`](ref:hub/src/shared/panels.ts), served as `/panels.js`):
  [`changesHtml`](ref:hub/src/shared/panels.ts#changesHtml) (head, repos, files, folds, hunks, picked rows, the note
  box under them, noted line marks) and [`reviewsHtml`](ref:hub/src/shared/panels.ts#reviewsHtml) (head, Send,
  notes, anchors with their state, composer) take a view model and read nothing global. The logic only the page had
  lives beside them as pure functions: `fileRows`, `picked` (the pick after a click), `pickAnchor`, `notedLines`,
  `anchorSpot` (where an anchor's line is), `marksToggled` (a repo's viewed marks after a toggle).
- *A protocol of data attributes*, listed once in the module's header: `data-fold`, `data-viewed`, `data-pick`,
  `data-pick-text`, `data-anchor`, `data-reply`, `data-note-text`, `data-send`, `data-copy`, `data-since`, …
  Each renderer wires them to its own state. `data-reveal` and `data-edit` (a file's Finder and editor buttons,
  [`fileButtonsHtml`](ref:hub/src/shared/panels.ts#fileButtonsHtml)) are calls already: `fileCall` gives the request,
  and a renderer wires it once for the whole page ([[open-files]]). Text boxes are named by attribute, not id, so one panel can be drawn
  in two places.
- *Redraws keep what is being typed.* [`drawPanel`](ref:hub/src/shared/panels.ts#drawPanel) replaces the element's
  html only when it changed (or something else wrote the element), sets each text box from the renderer's text,
  and gives focus and caret back to the box that had them, and focus to a control that had it
  ([`keepingFocus`](ref:hub/src/shared/panels.ts#keepingFocus): the one element of the same tag and the same attributes
  naming what it does, none when two match, which a renderer also wraps around its own redraws). A time is an empty `data-since` span that each
  renderer fills on its own clock, so the clock never forces a redraw that would drop a text selection in the diff.
- *One stylesheet* ([`panelsCss`](ref:hub/src/shared/panels.ts#panelsCss)), scoped under the views' own roots
  (`.changes-panel`, `.reviews-panel`). Each renderer adds it as a `<style>`, as `documentCss` is used, and sizes
  the element the panel is drawn in.
- *Served modules are bundled.* The tower serves every shared module bundled with what it imports at runtime
  (esbuild, [`design`](ref:hub/src/tower/server.ts#design)), the same way Tower 3D's bundle does. `./x.ts` imports
  then work in served modules with no rewriting.
- *What stays per renderer is wiring, not html.* Copying a tag, scrolling to `re n…` and toasts are each
  renderer's handlers on the same attributes. The page re-reads Changes while its pane is open and when a turn
  ends; Tower 3D every 30 s while either tab is open. A note picked in Tower 3D goes to the thread its Reviews tab
  shows (the author's, for a reviewer); the page writes on the selected worker's own checkout.

**Alternatives considered.**
- *Rewriting relative specifiers in served code* (`./x.ts` → `/x.js`), keeping one browser instance per module: a
  regex over generated code, and it fails on `../`. Bundling duplicates a few pure functions per module, which
  costs nothing.
- *Optional flags on the views* (copyable tag or not, a hint line per renderer): one view doing two things.
  Both renderers now wire every attribute.
- *A DOM morph (idiomorph or morphdom) or a framework* for redraws: `drawPanel` covers today's needs, so the
  morph is the next step only if hand-patching grows.
- *Panel CSS inside `/design.css`*: every shelf page would load it, and the design module would import the panels.

*Syntax* (2026-10-07). Code in Changes and quotes in Reviews are highlighted with highlight.js, an npm dependency
bundled into `/panels.js` and into Tower 3D's bundle like everything else the panels import
([`highlightLines`](ref:hub/src/shared/highlight.ts#highlightLines)): core plus the grammars of the fence
languages `langOf` names, picked by extension, plain escaped text for any other. It highlights a run of lines in
one pass and cuts the html at its newlines, closing and reopening the spans a line break falls inside.
[`rowCode`](ref:hub/src/shared/panels.ts#rowCode) highlights each hunk as two texts, its old side and its new, so
a removed line reads in the code it was removed from, and keeps the result by file and diff hash (the last 500), so
redraws (a pick, a keystroke in the note box, a re-read that changed nothing) never highlight again. A `diff` quote
is highlighted in its file's language, each line on its mark's wash. The colours are the design's `syn*` tokens
([[design-system]]), so both schemes and both renderers read them from `/design.css`. About 25 µs a line: a
2000-line file, the most a diff shows, highlights in some 40 ms, once per version. A hunk that starts inside a
block comment or a template string is highlighted as code, since a hunk carries no state from the lines before it.
- *A CDN* (the user's first idea): the tower is local-first and Tower 3D's framed page fetches nothing beside it,
  so the library would be missing offline and in Tower 3D. Bundled, it adds some 85 kB to Tower 3D's minified bundle and 180 kB to `/panels.js`, served unminified.
- *Shiki or Prism*: Shiki's TextMate grammars need a WASM regex engine and load asynchronously, too heavy for a
  pure, synchronous view; Prism highlights through globals and is between majors. highlight.js is synchronous,
  dependency-free and returns html the views already speak.
- *Highlighting each line alone*: a line out of its file loses multi-line strings and comments, and costs a call
  per line.

*Stats* ([`statsHtml`](ref:hub/src/shared/panels.ts#statsHtml), [[stats]]) came later on the same terms. The view
model is the last `/stats` read over a range (`today` by hour, `week` or `month` by day, as
[`statsQuery`](ref:hub/src/shared/panels.ts#statsQuery) asks for it), every project as a series with its config colour (a project in the read that the config no longer lists stacks in a
neutral colour under its id, so the bars add up to the tiles),
and the scope tabs the renderer offers (`STATS_ALL` is every project's). It draws tiles (spent, agent-hours, waiting
on you, sessions, prompts, asks, commits landed, lines changed, and "left this week" on the All tab), bar charts of
spend, agent-hours and commits per bucket, lines added above an axis and removed below it, and spend by hour of day, stacked by project on the All tab with a legend, and the spreads of waits, turns and active
time, tokens by model and lines by file kind. Bars are html, so a column's readout (`data-tip`) shows on hover and focus through the renderer's one tooltip
([[settings-and-tips]]), with nothing to wire; text stays in ink (lines added and removed wear the diff's colours, as in Changes), and a bar wears its project's colour mixed a quarter toward ink. `data-stats-scope`,
`data-stats-range` and `data-stats-read` are the attributes a renderer wires. The tower page puts it on the sidebar
(the floor in view and All floors), Tower 3D on the roof (every project and the overview).

*Keyboard* (2026-10-08). A file's fold is a real button, the header's caret (`data-fold` on it too, with
`aria-expanded` and the file's path as its name), so a keyboard folds a file the way a click on its header does;
Viewed was already a button. Picking lines for a note stays a pointer gesture: which keys pick and extend lines is
open. The file's Finder and editor buttons are spans with a name, out of the Tab order, since they also sit inside a
showing's tab. The Stats scopes and ranges say which is on with `aria-pressed`.

**Impact.** The tower page and Tower 3D draw Changes, Reviews and Stats through one module. Tower 3D's desk has the full
Changes: hunks, folds, Viewed (written to `tower.store`), mouse line picking with ⇧ to extend, the note box,
noted-line marks, and anchors that scroll to their line. A third renderer gets both panels by importing
`/panels.js` and wiring the attributes.
