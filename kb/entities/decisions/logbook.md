---
{
  "type": "decision",
  "name": "Tower 3D's logbook: a binder on every desk, a replay on its monitor, and the floor's filing cabinet",
  "summary": "Every desk has a binder as thick as its worker's lineage; it opens the desk panel's Logbook tab (the lineage brief under a chip per session), where a past session's last screen replays, sepia and stamped, in the panel and on the desk's monitor. Each floor's filing cabinet, beside its Running board, files the floor's archive read in drawers by day, a folder per worker whose logbook opens in the reader. A renderer change only: the board, the archive read and the screen stream already carry it.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-10",
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
    "hub/renderers/tower3d/src/fixtures.ts#readConversations",
    "hub/scripts/frames.scenario.js",
    "hub/src/bridge/screen.ts#lastFrame"
  ],
  "links": [
    { "to": "brief-turns", "verb": "uses", "carries": "the lineage brief (briefHtml) under the session chips" },
    { "to": "board-archive", "verb": "uses", "carries": "GET /archive/<project>, read for every floor when its archiveKey moves" }
  ]
}
---
**Problem.** A worker's past was reachable only as text: the brief lists every session's conversations, but what
each session's terminal ended on, and who worked on a floor last week, had no place in the building. The archive was
a filtered list in the console's panel.

**Why.** Tower 3D is lived in. A worker's history should be a thing on its desk, and a floor's past workers a thing
in its corner; both from data the system already derives (`card.lineage`, the archive read, the screen stream), so
nothing is stored or added to the core ([[renderer-is-disposable]]).

**How.**
- **The binder** ([`dressBinder`](ref:hub/renderers/tower3d/src/desk.ts#dressBinder)), right of every worker's
  keyboard (a reviewer beside its author has none): a thin notebook on a first session, a binder growing a page block
  and a coloured tab per session after, up to nine. Its act `binder` offers E: the desk panel opens on its Logbook
  tab where you stand, without walking to the chair.
- **The Logbook tab** is the desk panel's Brief tab renamed (the user's answer: one tab, not a second one showing the
  same thing; the tower page keeps "Brief"): a chip per session of the lineage, oldest first, the running one
  "● live", over the lineage brief ([`logbookHtml`](ref:hub/renderers/tower3d/src/ui.ts#logbookHtml)). Q on a worker
  opens it too, and the tab is always there. The brief reads as the tower page's does, a chat with its markdown
  rendered or raw ([[chat-brief]]), scrolled to its end when it opens.
- **Replay** ([`replay`](ref:hub/renderers/tower3d/src/main.ts#replay)): a past session's chip puts that session's
  last screen in the panel's terminal area, read-only (`screen/<session>`, which the tower rebuilds from its log),
  sepia under a "REPLAY · Oct 6, 21:40" stamp with a ● live button
  ([`mountDeskScreen`](ref:hub/renderers/tower3d/src/main.ts#mountDeskScreen)), and on the desk's monitor in the
  world, washed sepia and stamped ([`replayTexture`](ref:hub/renderers/tower3d/src/screens.ts#replayTexture),
  [`dressReplays`](ref:hub/renderers/tower3d/src/main.ts#dressReplays)). It stays on the monitor after the panel
  closes, so standing at the desk you see it; ● live or Esc in the panel ends it, and so does the worker leaving.
  A replay is the session's last screen, not a playback over time (the user's answer, 2026-10-07): the API serves a
  screen rebuilt from the whole log and has no read of the screen at a time. Since Claude runs in the alternate
  screen ([[fullscreen-tui]]), the last screen is its final frame as it stood before it left the alternate screen
  to exit ([`lastFrame`](ref:hub/src/bridge/screen.ts#lastFrame)), not the empty screen and resume line after it.
- **The filing cabinet** ([`buildFiling`](ref:hub/renderers/tower3d/src/filing.ts#buildFiling)), on every floor,
  against the control room's outer wall between the back glass and the Running board, facing the same way
  ([`filingSpot`](ref:hub/renderers/tower3d/src/layout.ts#filingSpot)), with its collider. Every floor's archive is
  read when its `archiveKey` moves ([`readArchives`](ref:hub/renderers/tower3d/src/archive.ts#readArchives); the
  archive panel lists the same read) and filed by [`drawersOf`](ref:hub/renderers/tower3d/src/archive.ts#drawersOf): a
  worker is its latest session nobody continued, by the day it started, the latest day in the top drawer, four
  drawers, the last holding every older day too. E on a drawer pulls it out
  ([`poseFiling`](ref:hub/renderers/tower3d/src/filing.ts#poseFiling)), its folders standing in it with callsign
  tabs, and lists them beside the world ([`drawerSideHtml`](ref:hub/renderers/tower3d/src/ui.ts#drawerSideHtml)); a
  folder opens the worker's logbook in the reader ([`openLogbook`](ref:hub/renderers/tower3d/src/main.ts#openLogbook))
  on two tabs, each the whole panel ([`logbookTabsHtml`](ref:hub/renderers/tower3d/src/ui.ts#logbookTabsHtml)):
  **Screen**, the session chips over a session's last screen, its own first, and **Logbook**, the brief, which it
  opens on. A guest's Q and the archive panel's rows open the same reader.
- **Checked by frames**: the `logbook` fixture board (binders of one to nine sessions, eight archived workers over
  five days, conversations read from the fixture cards by
  [`readConversations`](ref:hub/renderers/tower3d/src/fixtures.ts#readConversations)), and the walk's binder, logbook,
  replay, drawer and folder stages on every board that has them.

*The reader's tabs and empty resumes* (2026-10-08). The reader stacked the screen over the brief in one grid,
55% and the rest: a long answer shown in full squeezed the screen to a strip while the brief kept its half. It now
shows one at a time ([`logbookTab`](ref:hub/renderers/tower3d/src/main.ts#logbookTab)), the tabs drawn as the desk
panel's, and opens on the Logbook: what someone opening a past worker reads first is what it was asked and answered;
the screen is the evidence beside it. The Screen tab's terminal is mounted only while it shows. A resume given no
prompt of its own showed the same last screen as the session it resumed (Claude reprints the conversation on
resume), so the two chips read as duplicates: such a session's chip says "resumed, no new turns", with why in its
tip ([`sessionsHtml`](ref:hub/renderers/tower3d/src/ui.ts#sessionsHtml), from the shared
[`resumedIdle`](ref:hub/src/shared/brief.ts#resumedIdle), [[brief-turns]]), on the desk's Logbook tab too. The tabs
are not on the keymap: Tower 3D's desk tabs aren't either (the keymap's `pane-*` commands are the tower page's
alone), and the two should join it together.

**Measured** (synthetic logs of 120×40 redraws, sandbox tower, 2026-10-07): the first snapshot of `screen/<id>` takes
about 140 ms for a 5 MB log and 0.75–0.9 s for a 50 MB one, on every open; the real logs average 3.9 MB, the largest
53 MB. A replay of a long session waits that long until screen checkpoints (roadmap 7C) let the tower start from one.

**Alternatives considered.**
- *A separate Logbook tab beside Brief*: the same lineage brief twice.
- *Timed playback of a session*: needs a read of the screen at a time, or every `o` event with its time; left for when
  screen checkpoints give the core one.
- *The logbook in the 350 px side panel*: too narrow for a terminal; the reader holds a screen and the brief.
- *A folder per act in the drawer*: tabs a few centimetres wide are hard to aim at; the drawer is the act and its
  folders are listed beside it.
- *Moving the Running board to make room*: every floor's board would move; the strip between the back glass and the
  board holds the cabinet as is.

**Impact.** Tower 3D gains two act kinds (`binder`, `drawer`), a layer per floor, a reader panel and a replay state;
the Brief tab and Q's label read "Logbook"; the subagents on a desk stand a little further right. No board, API or
host change.
Every floor's archive is now read in the background, not only while its panel is open: `board.archiveAt` is one
value for the whole board, so any worker archived anywhere moves every floor's `archiveKey`, and the page reads
`GET /archive/<project>` once per floor, each building every card on the tower. Fine at today's scale; if it shows up in
the tower's CPU, read only the floors in view (yours, or all of them over the city).
