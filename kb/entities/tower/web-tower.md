---
{
  "type": "container",
  "name": "Tower page",
  "summary": "The tower page, the renderer / opens by default: projects as floors, sessions as terminals, shells docked as tabs, and each project's shelf.",
  "in": "tower-core",
  "reviewed": "2026-11-04",
  "refs": ["hub/renderers/page/index.html", "hub/renderers/page/page.js", "hub/renderers/page/page.js#pageHandlers", "hub/renderers/page/kit.js", "hub/renderers/page/board.js#boardKit", "hub/renderers/page/sidebar.js#sidebar", "hub/renderers/page/added.js#drawCount", "hub/renderers/page/regions.js#regions", "hub/renderers/page/stats.js#stats", "hub/renderers/page/view.js#hashOf", "hub/renderers/page/view.js#viewOf", "hub/renderers/page/page.js#go", "hub/tsconfig.page.json", "hub/scripts/page-boot.ts", "hub/src/shared/items.ts#collectionTrayHtml", "hub/src/shared/panel-kit.ts#keepingFocus", "hub/src/shared/waits.ts#waitsBeganLine", "hub/src/shared/policies-panel.ts#policiesHtml", "hub/src/shared/press.ts#pressing", "hub/src/shared/toasts.ts#toaster", "hub/src/views/card.ts#mount", "hub/src/shared/icons.ts#ICON", "hub/renderers/page/page.js#kitRegion", "hub/renderers/page/page.js#markSeen", "hub/renderers/page/menu.js#menu", "hub/renderers/page/fit.js#lineWidth", "hub/renderers/page/page.js#pinIn", "hub/src/shared/adds.ts#rankedActions", "hub/src/shared/viewer.ts#seenOf"]
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
([`statusWord`](ref:hub/src/shared/status-words.ts#statusWord)) and time in state, the lines extensions add to it above its
live status line and set apart from it as a quiet note, and the badges below it. A card's row (`card.row`) draws these
in the form the layout picks ([[region-overflow]]): by default `count`, which keeps the row to one line and one row of
badges: the card's exemptions, then the first ranked line and the first two ranked badges (or what the layout's
`lines` and `badges` say, less what it pins and hides), and a "+n" in plain text for the rest. The rest are listed in
the "+n"'s tip and in the description the card's link names (`aria-describedby`), and the worker's head draws all of
them once it is open; `wrap` draws every one, as it always did
([`drawCount`](ref:hub/renderers/page/added.js#drawCount), shared with the item rows). A worker's running subagents are drawn as
satellites under it ([`satellitesOf`](ref:hub/src/shared/subagents.ts#satellitesOf)). The rate limits fold into one chip
naming the tightest limit, whose popover holds the meters and the probes ([[probes]]). A floor folds to its sign, which
then carries its waits on you, its offers and its workers on duty lamped by their loudest attention
([`loudest`](ref:hub/src/shared/status-words.ts#loudest)); which floors a viewer opened or folded is view state in
`tower.store`, and a floor never chosen is open while a worker on it needs you.

Every collection a floor declares has a tray under its workers ([[collection-trays]]), each a view in the page's
`floor.trays` region, `tower/tray` or its extension's own (since 1.125, [[ui-model]]), an item opened in the main
pane read as its type. Drafts are the drafts extension's over the `drafts` collection ([[collections]]): its editor, a
view in the main pane that saves as you type, built on `/x/drafts/drafts.js` as Tower 3D's is ([[corkboard]]); a draft
starts a worker through the page's new-worker dialog (the keymap's `spawn` on the draft) or is submitted to a running
one, then is deleted. A floor that keeps policies has a
tray that opens the policies extension's panel at `#policies/<floor>` ([[policies]]); its open offers, drawn as the
floor's other asks are, sit above its workers and N goes to them after the waits ([[attention-list]]); a worker a run
started says so in its badges, the policies extension's ([[policies]]). The shell dock starts a shell in any directory of a floor. Under the worker bar sits
one tab row: the shared panels, then the worker's showings ([[agent-show]]), in the form the layout picks among
`card.panes`' `overflows` ([[region-overflow]]). In `scroll`, its default
([`tabsScroll`](ref:hub/renderers/page/regions.js#tabsScroll)), the tabs a pane chord opens stay put and every other
tab, extension views and showings alike, scrolls past them a gap above a thin scrollbar that keeps its room and shows its thumb under the pointer, faded at an edge past which more
hide, the open tab brought clear of the fades as it opens and as the row resizes; the layout's `order` arranges the
two apart. In `wrap` ([`tabsWrap`](ref:hub/renderers/page/regions.js#tabsWrap)), every tab is drawn, the views in
the layout's order and the showings after them, on as many rows as they take. In `menu`
([`tabsMenu`](ref:hub/renderers/page/regions.js#tabsMenu)), the tabs that fit are drawn on one row in that order and
the rest are listed behind "+n ▾" after the tablist, the page's menu ([[region-overflow]]): the tabs a pane chord opens
and the open tab are always drawn, their labels cut short when even they don't fit, and a tab picked from the menu is drawn last among the drawn until another is.

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

A worker's head ([`tower/card`](ref:hub/src/views/card.ts#mount)) never crops what identifies the worker. Its main
line holds the callsign, the status pill with its time in state, then context and cost, then what extensions add, then
the worker's own verbs; a line under it holds where it works and the extensions' lines. Its density follows the head's
own width, a container query on the head, so a grid cell and a narrow window look alike: compact below 760px, where
Resume, Let go and Send home draw as icon buttons ([`ICON`](ref:hub/src/shared/icons.ts#ICON)) with their names as
`aria-label` and tip, Send home in the danger tone, and the context as its number alone; regular to 1100px and wide
above, words beside the icons and the meter drawn. Below 480px the pill shows its lamp and time, its words kept for
assistive tech and in its tip. The head never clips: what its region doesn't tuck behind ⋯ (below) wraps, the actions
first, then context and cost go under the status. The pill's time has a reserved width, so its tick never moves the head. In a grid cell the head ends Send
home │ Open ✕, its verbs, then the grid's acts in the order they are read by keyboard. The head marks its own controls
`data-tuck` with a rank (details, Let go, Resume, Send home) and its place line `data-tuck-text`, for a region that
tucks what doesn't fit.

What extensions add to a region the page fills ([`kitRegion`](ref:hub/renderers/page/page.js#kitRegion)), a worker's
head among them, comes in the ranked order every renderer shares ([[region-overflow]]): badges by severity, a worker's
exemptions and a heeded wait's Dismiss first and marked `data-keep`, actions and lines in the layout's order, its pins
first, less what it hides and what the holding view omits. An action new to the viewer, one an extension offers that
their `seen` in `tower.store` doesn't hold, carries a dot. The first board of a viewer who never kept one seeds `seen`
with everything offered, so a fresh tower shows nothing as new. An action is seen once the viewer runs it from its
button, the palette or a chord, or once it is drawn in place in a focused window
([`markSeen`](ref:hub/renderers/page/page.js#markSeen)): every region drawn is read once a frame, and every region
mounted on the window's focus. A region keeps the dot of what it saw in place until its view is hidden or it closes,
so the viewer sees the dot once. The page reads its own layout (`layout.page` in `tower.store`, over the config's and
its `renderer.json`'s) again on every board and every store event, so a choice another window makes isn't lost. A
region whose layout in the config fails its check (`layoutProblems` on `GET /renderers`) is drawn by its default, by
the rule every renderer shares ([[region-overflow]]), and the sidebar's notes say so, each problem in the tip.

A region is drawn in the form its layout picks among those it offers: `wrap` draws everything, and a worker's head
offers `menu` first. Under `menu` the region draws on one row the prefix of its ranked items that fits and tucks the
rest behind ⋯ (`data-tucked`, drawn `display: none`). Its fill order is the head's own controls marked `data-tuck`,
highest rank first so they leave last, then `headRanked`'s badges and actions. The fit reads every region drawn in one
frame, untucking them all first when they must be measured afresh, then reading them, then writing. It measures each
item while it is drawn and remembers its width while tucked ([`lineWidth`](ref:hub/renderers/page/fit.js#lineWidth)).
Everything else on the row is protected, and `fill` decides with hysteresis. The layout's `badges` and `actions`
budgets cap how many of each are drawn in place, the pinned actions and the view's controls aside. It forgets its widths when the row's
inline size changes (a `ResizeObserver` that ignores the row's own height), when fonts load and when the viewer's text
size changes. It never fits on the clock's tick: the pill's time has a reserved width. A region not drawn (a kept
worker, a hidden tab) is neither measured nor fitted.

⋯ ([`menu`](ref:hub/renderers/page/menu.js#menu)) is drawn whenever the head holds an action or a line to pin, tucked
or not, so its menu's footer is always reachable and it keeps its place, and whenever something is tucked, its width
taken from the room before the fill.
It is a button with `aria-haspopup="menu"`, labelled with what it hides
("More on HOLMES-42: 7 actions, 3 badges, 1 needs attention"), its count beside it, and a dot: the broken tone for a
tucked severe badge, else the new one for a tucked new action. It is busy while something tucked, or an entry of its
menu, is. Its popover holds a header of the tucked badges and of the text the view lets go when it is cut
(`data-tuck-text`), the menu's description, then a `role="menu"`: the view's tucked controls under the subject's name,
the dangerous after a separator, each a proxy that presses the original (Send home asks first, Details opens its
popover), then the tucked actions in rank order, run as their buttons run. The popover sits in the region's slot, so a
pick finds the subject the region was drawn on. ↑ ↓ Home End move, a letter jumps by label, Esc and Tab close it with
focus back on ⋯, and a board drawn while it is open keeps focus on the same entry by its key. ⋯ sits between the
contributions and the head's own verbs, so a cell still ends Send home │ Open ✕.

The first opening of the menu after new actions were tucked lists them first, under New, with a line in the header
saying they are listed there this once; opening marks them seen for the viewer, and the section stays as captured while
the menu is open. The menu's footer, "Pin to the head…", turns its list into checkboxes in two labelled groups: Actions, one
for each action drawn (one per id), and Lines, each extension's lines (one per capability), a line named by its text
with its extension beside it, quieter, so it never reads as that extension's action; in board order so nothing moves
as it is checked. A check pins
for the viewer ([`pinIn`](ref:hub/renderers/page/page.js#pinIn)): a read-modify-write of that region's entry in
`layout.page`, so a choice another window made for another region stays. A pin the config makes is listed checked,
"pinned by your config"; unchecking it writes the viewer's `unpinned` and leaves it listed, "pinned by your config,
unpinned here", and checking it again only drops the unpin. Under `menu` the head's row of lines shows `lines` of them
(the renderer's default is 1), pinned ones aside, the rest in the menu's header; at compact room the top-ranked line
takes the place line's slot, the place line's text going to the header (the head reads the region's `data-overflow`).

The page is the tower's accessible renderer: Tower 3D's pointer-lock walk can't be. Every worker is a link to
`#<id>`, opened at load and on `hashchange`, the selected one `aria-current`. The pane tabs are an ARIA tablist, the
terminal is `inert` while another pane lies over it, and redraws give focus back to the control that had it
([`keepingFocus`](ref:hub/src/shared/panel-kit.ts#keepingFocus)). Presses that ask the tower something stay busy until
the reply, and toasts stack, some with an action ([[press-feedback]]); the toast stack is a polite live region, and
another says a line for each wait that begins ([`waitsBeganLine`](ref:hub/src/shared/waits.ts#waitsBeganLine)).
Landmarks, headings, named dialogs and an `aria-label` on every glyph button carry the rest. It holds at 200% zoom
and at the largest text size: narrow, the sidebar becomes a rail ([[design-system]]).
