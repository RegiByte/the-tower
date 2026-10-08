---
{
  "type": "system",
  "name": "Web tower",
  "summary": "The disposable web renderer: projects as floors, sessions as terminals, shells docked as tabs, and each project's shelf, on 127.0.0.1:4317.",
  "in": "tower",
  "reviewed": "2026-10-08",
  "refs": ["hub/renderers/page/index.html", "hub/src/shared/items.ts#collectionTrayHtml", "hub/src/shared/panels.ts#keepingFocus", "hub/src/shared/cards.ts#waitsBeganLine"]
}
---
Built to learn from and throw away ([[renderer-is-disposable]]): the [[tower-server]] turns the
[[live-system]] into a board and relays requests to the daemons. It holds no machinery. The skyline home
(projects as buildings, sessions as lit windows) is the seed of a spatial renderer.
Spatial renderers live in `renderers/` on the same API: [[tower3d]] is the first-person one.

Every collection a floor declares has a tray under its workers ([[collection-trays]]): rows by title, tag, keeper and
age from `/items.js`, an item opened in the main pane read as its type, with its tag, Finder and editor buttons, a new
tab and a Delete asked first. Drafts and review threads keep their own trays on the same rows; threads Tidy filed are
a fold under the live ones. The shell dock's `+` starts a shell in any directory of a floor, the floor in view first.

Drafts are the page's own feature over the `drafts` collection ([[collections]]): each floor lists them under its
shelf, titled by their first line over their tag and keeper ([[item-tags]]), ✎ beside the floor's `+` starts one, and a draft opens in an editor in the main pane that saves as you type and takes
another writer's change unless it holds edits of its own; a save the tower refuses because the file moved on
becomes the same conflict. The editing is `/drafts.js`
([`src/shared/drafts.ts`](ref:hub/src/shared/drafts.ts)), shared with Tower 3D's draft panel ([[corkboard]]). A draft starts a session through the new-session dialog,
prefilled with its text (directory, model and effort picked there), or is submitted to a running worker, then is
deleted. A prompt typed into the dialog that closes without starting, or whose start fails, is kept as a draft, or in the draft it was
opened on. A session the page
starts opens once the board carries its card: the host answers before the tower has read the new log.

*Keyboard and screen readers* (2026-10-08). The page is the tower's accessible renderer: Tower 3D's pointer-lock walk
can't be. Every worker is a link to `#<id>`: a card's callsign, a lit or past window of the skyline, a lamp of the
collapsed rail and a past worker's callsign in the archive. The page opens what the hash names at load and again on
`hashchange` (a link, Back, the address bar); every view still writes its own hash in place. The selected worker's
link is `aria-current`. Its pane tabs are an ARIA tablist (←, →, Home and End move along them and show the pane), and
the terminal is `inert` while another pane lies over it, so Tab never falls into it unseen. Redraws give focus back to
the control that had it ([`keepingFocus`](ref:hub/src/shared/panels.ts#keepingFocus)), so a board arriving every few
seconds doesn't throw a keyboard back to the page's start. A polite live region says every toast, and a line for each
wait that begins and isn't dismissed ([`waitsBeganLine`](ref:hub/src/shared/cards.ts#waitsBeganLine): "ENKI-26 is
waiting on you: done."), the worker you are watching included. Landmarks: the sidebar's `aside`, the floors' `nav`,
`main`; floor signs and the selected callsign are level-2 headings; every dialog is named; buttons drawn as a glyph
carry an `aria-label` and glyphs beside words are hidden from screen readers. Still mouse-only: picking lines for a
note in Changes, a showing tab's ↗ and ×, a shell tab's ×, a file's Finder and editor buttons (spans, so they can sit
inside a tab), live threads and shelf files in their lists, and the dock's grip (drafts and kept items are buttons).
