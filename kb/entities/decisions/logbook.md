---
{
  "type": "decision",
  "name": "Tower 3D's logbook: a binder on every desk, a replay on its monitor, and the floor's filing cabinet",
  "summary": "Every desk has a binder as thick as its worker's lineage; it opens the desk panel's Logbook tab (the lineage brief under a chip per session), where a past session's last screen replays, sepia and stamped, in the panel and on the desk's monitor. Each floor's filing cabinet, beside its Running board, files the floor's archive read in drawers by day, a folder per worker whose logbook opens in the reader. A renderer change only: the board, the archive read and the screen stream already carry it.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-20",
  "refs": [
    "hub/renderers/tower3d/src/desk.ts#dressBinder",
    "hub/renderers/tower3d/src/desk.ts#monitorOf",
    "hub/renderers/tower3d/src/ui.ts#logbookHtml",
    "hub/renderers/tower3d/src/ui.ts#sessionsHtml",
    "hub/renderers/tower3d/src/ui.ts#logbookTabsHtml",
    "hub/renderers/tower3d/src/main.ts#logbookTab",
    "hub/renderers/tower3d/src/ui.ts#stampHtml",
    "hub/renderers/tower3d/src/ui.ts#drawerSideHtml",
    "hub/renderers/tower3d/src/main.ts#replay",
    "hub/renderers/tower3d/src/main.ts#mountDeskScreen",
    "hub/renderers/tower3d/src/main.ts#dressReplays",
    "hub/renderers/tower3d/src/main.ts#openLogbook",
    "hub/renderers/tower3d/src/screens.ts#replayTexture",
    "hub/renderers/tower3d/src/archive.ts#readArchives",
    "hub/renderers/tower3d/src/archive.ts#drawersOf",
    "hub/renderers/tower3d/src/filing.ts#buildFiling",
    "hub/renderers/tower3d/src/filing.ts#poseFiling",
    "hub/renderers/tower3d/src/layout.ts#filingSpot",
    "hub/renderers/tower3d/src/layers.ts#FILINGS",
    "hub/src/bridge/screen.ts#lastFrame"
  ],
  "links": [
    { "to": "brief-turns", "verb": "uses", "carries": "the lineage brief (briefHtml) under the session chips" },
    { "to": "board-archive", "verb": "uses", "carries": "GET /archive/<project>, read for every floor when its archiveKey moves" }
  ]
}
---
**Problem.** A worker's past was reachable only as text: the brief lists every session's conversations, but what
each session's terminal ended on, and who worked on a floor last week, had no place in the building.

**Why.** Tower 3D is lived in. A worker's history should be a thing on its desk, and a floor's past workers a thing
in its corner; both from data the system already derives (`card.lineage`, the archive read, the screen stream), so
nothing is stored or added to the core ([[renderer-is-disposable]]).

**How.**
- **The binder** ([`dressBinder`](ref:hub/renderers/tower3d/src/desk.ts#dressBinder)) on every worker's desk (a
  reviewer beside its author has none) grows with the worker's lineage, a tab per session, where the desk dressing's
  `logbook` slot stands it ([[desk-dressing]]). Its act opens the desk panel's Logbook tab where you stand.
- **The Logbook tab** is the desk panel's brief tab (the tower page keeps "Brief"): a chip per session of the lineage,
  oldest first, the running one live, over the lineage brief ([`logbookHtml`](ref:hub/renderers/tower3d/src/ui.ts#logbookHtml)),
  which reads as the tower page's does ([[brief-turns]]). A resume given no prompt of its own shows the same last
  screen as the session it resumed (Claude reprints the conversation), so its chip says "resumed, no new turns"
  ([`sessionsHtml`](ref:hub/renderers/tower3d/src/ui.ts#sessionsHtml), from the shared `resumedIdle`).
- **Replay** ([`replay`](ref:hub/renderers/tower3d/src/main.ts#replay)): a past session's chip puts that session's
  last screen in the panel, read-only (`screen/<session>`, which the tower rebuilds from its log), sepia and stamped
  with its time ([`mountDeskScreen`](ref:hub/renderers/tower3d/src/main.ts#mountDeskScreen)), and on the desk's
  monitor in the world ([`replayTexture`](ref:hub/renderers/tower3d/src/screens.ts#replayTexture),
  [`dressReplays`](ref:hub/renderers/tower3d/src/main.ts#dressReplays)), where it stays after the panel closes until
  live is chosen again or the worker leaves. A replay is the session's last screen, not a playback over time: the API
  serves a screen rebuilt from the whole log and has no read of the screen at a time. Since Claude runs in the
  alternate screen ([[fullscreen-tui]]), the last screen is its final frame before it left to exit
  ([`lastFrame`](ref:hub/src/bridge/screen.ts#lastFrame)).
- **The filing cabinet** ([`buildFiling`](ref:hub/renderers/tower3d/src/filing.ts#buildFiling)) stands on every floor
  by the Running board, in the nook under the loft's deck against the archive's outer wall
  ([`filingSpot`](ref:hub/renderers/tower3d/src/layout.ts#filingSpot), [[floor-plan]]). Every floor's archive is
  read when its `archiveKey` moves ([`readArchives`](ref:hub/renderers/tower3d/src/archive.ts#readArchives); the
  archive panel lists the same read) and filed by [`drawersOf`](ref:hub/renderers/tower3d/src/archive.ts#drawersOf):
  a worker is its latest session nobody continued, filed by the day it started, the latest day in the top drawer, the
  last drawer holding every older day too. A drawer pulled out
  ([`poseFiling`](ref:hub/renderers/tower3d/src/filing.ts#poseFiling)) lists its folders beside the world
  ([`drawerSideHtml`](ref:hub/renderers/tower3d/src/ui.ts#drawerSideHtml)); a folder opens the worker's logbook in the
  reader ([`openLogbook`](ref:hub/renderers/tower3d/src/main.ts#openLogbook)) on two tabs
  ([`logbookTabsHtml`](ref:hub/renderers/tower3d/src/ui.ts#logbookTabsHtml), [`logbookTab`](ref:hub/renderers/tower3d/src/main.ts#logbookTab)):
  Logbook, the brief, which it opens on, and Screen, the session chips over a session's last screen, mounted only while
  it shows. The archive panel's rows open the same reader, and the keymap's `pane-*` commands switch its tabs
  ([[keymap]]).

**Alternatives considered.**
- *A separate Logbook tab beside Brief*: the same lineage brief twice.
- *Timed playback of a session*: needs a read of the screen at a time, which the core doesn't offer.
- *The logbook in the side panel*: too narrow for a terminal; the reader holds a screen and the brief.
- *The screen over the brief in one grid*: a long answer squeezed the screen to a strip.

**Consequences.** No board, API or host change. The screen keeps no checkpoint, so the replay of a long session waits
for its whole log to be rebuilt. Every floor's archive is read in the background: `board.archiveAt` is one value for
the whole board, so any worker archived anywhere moves every floor's `archiveKey`, and the page reads
`GET /archive/<project>` once per floor; if that shows up in the tower's CPU, read only the floors in view.
