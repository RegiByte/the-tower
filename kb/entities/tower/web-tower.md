---
{
  "type": "container",
  "name": "Tower page",
  "summary": "The tower page, the renderer / opens by default: projects as floors, sessions as terminals, shells docked as tabs, and each project's shelf.",
  "in": "tower-core",
  "reviewed": "2026-10-19",
  "refs": ["hub/renderers/page/index.html", "hub/renderers/page/page.js", "hub/renderers/page/page.js#pageHandlers", "hub/renderers/page/kit.js", "hub/renderers/page/board.js#boardKit", "hub/renderers/page/sidebar.js#sidebar", "hub/renderers/page/worker.js#worker", "hub/renderers/page/review.js#review", "hub/renderers/page/stats.js#stats", "hub/renderers/page/view.js#hashOf", "hub/renderers/page/view.js#viewOf", "hub/renderers/page/page.js#go", "hub/tsconfig.page.json", "hub/src/shared/items.ts#collectionTrayHtml", "hub/src/shared/panels.ts#keepingFocus", "hub/src/shared/cards.ts#waitsBeganLine", "hub/src/shared/panels.ts#policiesHtml", "hub/src/shared/press.ts#pressing", "hub/src/shared/toasts.ts#toaster"]
}
---
Built to learn from and throw away ([[renderer-is-disposable]]): it draws the board the [[tower-server]] serves and
drives the system through `/tower.js`; it holds no machinery. It is `index.html` and the modules beside it, served as
written and checked by `npm run typecheck` through JSDoc ([`tsconfig.page.json`](ref:hub/tsconfig.page.json)).
`page.js` composes them: its machine ([`pageHandlers`](ref:hub/renderers/page/page.js#pageHandlers)) with the
executors, the draw, and the clicks, keys and board wired to them. Each pane is a module exporting a factory that
takes what it reads and calls as plain functions and returns what the page composes, its own state closed inside it:
the [`sidebar`](ref:hub/renderers/page/sidebar.js#sidebar), the skyline, the selected
[`worker`](ref:hub/renderers/page/worker.js#worker) (its header, pane tabs and showings), its terminal (`screen.js`),
brief (`brief-pane.js`) and Changes and Reviews ([`review`](ref:hub/renderers/page/review.js#review)), the
[`stats`](ref:hub/renderers/page/stats.js#stats), the settings, alerts, shells, the shelf, the archive, a draft, what a
floor keeps and the dialogs. What they draw with alike is `kit.js`, what they read off the board alike
[`boardKit`](ref:hub/renderers/page/board.js#boardKit). The skyline home shows projects as buildings and sessions as lit
windows, one row of buildings narrowing to fit any number of floors.

The sidebar lists each floor's workers by crew ([[crews]]), each card with its lamp, callsign, status word
([`statusWord`](ref:hub/src/shared/cards.ts#statusWord)) and time in state, and a worker's running subagents as
satellites under it ([`satellitesOf`](ref:hub/src/shared/cards.ts#satellitesOf)). The rate limits fold into one chip
naming the tightest limit, whose popover holds the meters and the probes ([[probes]]). A floor folds to its sign, which
then carries its waits on you, its offers and its workers on duty lamped by their loudest attention
([`loudest`](ref:hub/src/shared/cards.ts#loudest)); which floors a viewer opened or folded is view state in
`tower.store`, and a floor never chosen is open while a worker on it needs you.

Every collection a floor declares has a tray under its workers ([[collection-trays]]), an item opened in the main
pane read as its type. Drafts are the page's own feature over the `drafts` collection ([[collections]]): an editor in
the main pane that saves as you type, shared with Tower 3D as `/drafts.js` ([[corkboard]]); a draft starts a worker
through the new-worker dialog or is submitted to a running one, then is deleted. A floor that keeps policies has a
tray that opens the shared Policies panel at `#policies/<floor>` ([[shared-panels]]); its open offers sit above its
workers and N goes to them after the waits ([[attention-list]]); a worker a run started says so under its callsign,
from `card.run` ([[policies]]). The shell dock starts a shell in any directory of a floor. Under the worker bar sits
one tab row: the shared panels, then the worker's showings ([[agent-show]]).

Frames that run a floor's own page (a shelf `html` or `renderer` entry, an `html` item, a shown file) are sandboxed at
an opaque origin and granted `clipboard-write`, so a copy button inside works framed; a `url` frame may also read the
clipboard.

What the main pane shows is one value, a `MainView` ([`view.js`](ref:hub/renderers/page/view.js), beside the page):
the skyline, a worker on one of its panes, a worker the page started until the board carries it, a shelf entry and its
file, a floor's archive, policies or collection, a draft or a kept item. Its hash is
[`hashOf`](ref:hub/renderers/page/view.js#hashOf) and the hash is read back by
[`viewOf`](ref:hub/renderers/page/view.js#viewOf); every way into a view goes through
[`go`](ref:hub/renderers/page/page.js#go), which leaves the view open (its terminal, relay, draft) unless the next is
the same place, and enters the next. The page's machine holds that view beside the board, the viewer's record, the window's focus and
visibility and the attention state ([[machines]]), each changed by its own event, so the worker whose waits ring for nobody is the one on screen while the window
has the viewer's eye.

The page is the tower's accessible renderer: Tower 3D's pointer-lock walk can't be. Every worker is a link to
`#<id>`, opened at load and on `hashchange`, the selected one `aria-current`. The pane tabs are an ARIA tablist, the
terminal is `inert` while another pane lies over it, and redraws give focus back to the control that had it
([`keepingFocus`](ref:hub/src/shared/panels.ts#keepingFocus)). Presses that ask the tower something stay busy until
the reply, and toasts stack, some with an action ([[press-feedback]]); the toast stack is a polite live region, and
another says a line for each wait that begins ([`waitsBeganLine`](ref:hub/src/shared/cards.ts#waitsBeganLine)).
Landmarks, headings, named dialogs and an `aria-label` on every glyph button carry the rest. It holds at 200% zoom
and at the largest text size: narrow, the sidebar becomes a rail ([[design-system]]).
