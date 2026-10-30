---
{
  "type": "container",
  "name": "Tower page",
  "summary": "The tower page, the renderer / opens by default: projects as floors, sessions as terminals, shells docked as tabs, and each project's shelf.",
  "in": "tower-core",
  "reviewed": "2026-10-30",
  "refs": ["hub/renderers/page/index.html", "hub/renderers/page/page.js", "hub/renderers/page/page.js#pageHandlers", "hub/renderers/page/kit.js", "hub/renderers/page/board.js#boardKit", "hub/renderers/page/sidebar.js#sidebar", "hub/renderers/page/regions.js#regions", "hub/renderers/page/stats.js#stats", "hub/renderers/page/view.js#hashOf", "hub/renderers/page/view.js#viewOf", "hub/renderers/page/page.js#go", "hub/tsconfig.page.json", "hub/scripts/page-boot.ts", "hub/src/shared/items.ts#collectionTrayHtml", "hub/src/shared/panel-kit.ts#keepingFocus", "hub/src/shared/waits.ts#waitsBeganLine", "hub/src/shared/policies-panel.ts#policiesHtml", "hub/src/shared/press.ts#pressing", "hub/src/shared/toasts.ts#toaster"]
}
---
Built to learn from and throw away ([[renderer-is-disposable]]): it draws the board the [[tower-server]] serves and
drives the system through `/tower.js`; no capability lives in it. It is `index.html` and the modules beside it, served as
written and checked by `npm run typecheck` through JSDoc ([`tsconfig.page.json`](ref:hub/tsconfig.page.json)); CI
boots it in headless Chrome over a tower alone ([`page-boot.ts`](ref:hub/scripts/page-boot.ts)): its first board
drawn as a floor and the skyline, a click unfolding the floor, with no page error on the way.
`page.js` composes them: its machine ([`pageHandlers`](ref:hub/renderers/page/page.js#pageHandlers)) with the
executors, the draw, and the clicks, keys and board wired to them. Each pane is a module exporting a factory that
takes what it reads and calls as plain functions and returns what the page composes, its own state closed inside it:
the [`sidebar`](ref:hub/renderers/page/sidebar.js#sidebar), what its terminals share (`screen.js`: the face, the mode,
leaving one), the
[`stats`](ref:hub/renderers/page/stats.js#stats), the settings, alerts, shells, the archives read for a worker the
board left out, the drafts' titles and new-worker form, a kept item and the dialogs. What they draw with alike is
`kit.js`, what they read off the board alike [`boardKit`](ref:hub/renderers/page/board.js#boardKit). The rest of the
main pane is views the page hosts ([[ui-model]]): the skyline home ([`tower/skyline`](ref:hub/src/views/skyline.ts#mount))
shows projects as buildings and sessions as lit windows, one row of buildings narrowing to fit any number of floors,
and until any worker has run (no card on any floor, none archived) welcomes the user instead: a floor and a worker in
a line each, a button per floor to start the first worker, and the tour to ask it for. A floor's archive, a
collection and a shelf entry are the core's views too, the drafts editor and the Policies panel their extensions'.

Each project directory in the sidebar links the web page of its origin remote, read once from `GET /origins`
([`sidebar`](ref:hub/renderers/page/sidebar.js#sidebar)). The sidebar lists each floor's workers by crew ([[crews]]), each card with its lamp, callsign, status word
([`statusWord`](ref:hub/src/shared/status-words.ts#statusWord)) and time in state, and a worker's running subagents as
satellites under it ([`satellitesOf`](ref:hub/src/shared/subagents.ts#satellitesOf)). The rate limits fold into one chip
naming the tightest limit, whose popover holds the meters and the probes ([[probes]]). A floor folds to its sign, which
then carries its waits on you, its offers and its workers on duty lamped by their loudest attention
([`loudest`](ref:hub/src/shared/status-words.ts#loudest)); which floors a viewer opened or folded is view state in
`tower.store`, and a floor never chosen is open while a worker on it needs you.

Every collection a floor declares has a tray under its workers ([[collection-trays]]), an item opened in the main
pane read as its type. Drafts are the drafts extension's over the `drafts` collection ([[collections]]): its editor, a
view in the main pane that saves as you type, built on `/x/drafts/drafts.js` as Tower 3D's is ([[corkboard]]); a draft
starts a worker through the page's new-worker dialog (the keymap's `spawn` on the draft) or is submitted to a running
one, then is deleted. A floor that keeps policies has a
tray that opens the policies extension's panel at `#policies/<floor>` ([[policies]]); its open offers sit above its
workers and N goes to them after the waits ([[attention-list]]); a worker a run started says so under its callsign,
from the policies extension's `card.x.policies.run` ([[policies]]). The shell dock starts a shell in any directory of a floor. Under the worker bar sits
one tab row: the shared panels, then the worker's showings ([[agent-show]]).

Frames that run a floor's own page (a shelf `html` or `renderer` entry, an `html` item, a shown file) are sandboxed at
an opaque origin and granted `clipboard-write`, so a copy button inside works framed; a `url` frame may also read the
clipboard. Keys pressed in any frame but a `url` one reach the page's keymap, its global commands alone ([[keymap]]).

What the main pane shows is one value, a `MainView` ([`view.js`](ref:hub/renderers/page/view.js), beside the page):
a worker on one of its panes, a worker the page started until the board carries it (drawn as the skyline), or a view
mounted at a location, the core's or an extension's, the skyline and kept items among them ([[ui-model]]). Its hash
(a worker's `#<id>`, or `#<id>/<pane>` once the viewer picks one, `shown:<target>` encoded; a view's short form where
it has one, `#archive/<p>`, `#shelf/<p>/<n>`, `#draft/<p>`…, else `#v/<cap>/<name>/<key>`) is
[`hashOf`](ref:hub/renderers/page/view.js#hashOf) and the hash is read back by
[`viewOf`](ref:hub/renderers/page/view.js#viewOf), which reads a `#v/` hash naming the worker as its route
([`mainViewOf`](ref:hub/renderers/page/view.js#mainViewOf)); every way into a view goes through
[`go`](ref:hub/renderers/page/page.js#go), which leaves the view open (its terminal, its mounted view) unless the next
is the same place, and enters the next. The page's machine holds that view beside the board, the viewer's record and the attention state
([[machines]]), and every handler that sets the view tells attention through
[`viewed`](ref:hub/renderers/page/page.js#viewed), so the worker whose waits ring for nobody is the one on screen while
the window has the viewer's eye. Every view of the main pane, a worker's among them, is
mounted in `#view-host` by [`regions`](ref:hub/renderers/page/regions.js#regions) with the page's kit (its terminal,
regions, keymap runner, display, toasts and confirm), updated on each board and closed as the location leaves, but for
the last four workers left, kept drawn and hidden; a worker's tabs are a tabs region it fills the same way ([[ui-model]]); [`display`](ref:hub/renderers/page/page.js#display)
places a subject through `/views.js` onto a view or one of the page's routes, a floor's section and the palette offer
"Open <label>" for the views offered there, and extensions' chords run on the subject in focus.

The page is the tower's accessible renderer: Tower 3D's pointer-lock walk can't be. Every worker is a link to
`#<id>`, opened at load and on `hashchange`, the selected one `aria-current`. The pane tabs are an ARIA tablist, the
terminal is `inert` while another pane lies over it, and redraws give focus back to the control that had it
([`keepingFocus`](ref:hub/src/shared/panel-kit.ts#keepingFocus)). Presses that ask the tower something stay busy until
the reply, and toasts stack, some with an action ([[press-feedback]]); the toast stack is a polite live region, and
another says a line for each wait that begins ([`waitsBeganLine`](ref:hub/src/shared/waits.ts#waitsBeganLine)).
Landmarks, headings, named dialogs and an `aria-label` on every glyph button carry the rest. It holds at 200% zoom
and at the largest text size: narrow, the sidebar becomes a rail ([[design-system]]).
