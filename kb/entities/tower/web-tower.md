---
{
  "type": "container",
  "name": "Tower page",
  "summary": "The tower page, the renderer / opens by default: projects as floors, sessions as terminals, shells docked as tabs, and each project's shelf.",
  "in": "tower-core",
  "reviewed": "2026-11-18",
  "refs": ["hub/renderers/page/index.html", "hub/renderers/page/clients.js", "hub/renderers/page/page.js", "hub/renderers/page/page.js#pageHandlers", "hub/renderers/page/kit.js", "hub/renderers/page/board.js#boardKit", "hub/renderers/page/sidebar.js#sidebar", "hub/renderers/page/added.js#drawCount", "hub/renderers/page/regions.js#regions", "hub/renderers/page/stats.js#stats", "hub/renderers/page/extensions-entry.js#extensionsEntry", "hub/renderers/page/view.js#hashOf", "hub/renderers/page/view.js#viewOf", "hub/renderers/page/page.js#go", "hub/tsconfig.page.json", "hub/scripts/page-boot.ts", "hub/src/shared/items.ts#collectionTrayHtml", "hub/src/shared/panel-kit.ts#keepingFocus", "hub/src/shared/waits.ts#waitsBeganLine", "hub/src/shared/press.ts#pressing", "hub/src/shared/toasts.ts#toaster", "hub/src/views/card.ts#mount", "hub/renderers/page/page.js#kitRegion", "hub/renderers/page/page.js#markSeen", "hub/renderers/page/menu.js#menu", "hub/renderers/page/fit.js#lineWidth", "hub/renderers/page/page.js#pinIn", "hub/src/shared/adds.ts#rankedActions", "hub/src/shared/viewer.ts#seenOf", "hub/renderers/page/page.js#subjectLeft", "hub/renderers/page/subject-menus.js#subjectMenus", "hub/renderers/page/page.js#doMenuPick", "hub/renderers/page/page.js#MENU_PICKS", "hub/src/shared/subject-menu.ts#subjectMenu", "hub/src/shared/spawn-form.ts#spawnFormHtml"]
}
---
Built to learn from and throw away ([[renderer-is-disposable]]): it draws the board the [[tower-server]] serves and
drives the system through `/tower.js`; no capability lives in it. It is `index.html` and the modules beside it, served as
written and checked by `npm run typecheck` through JSDoc ([`tsconfig.page.json`](ref:hub/tsconfig.page.json)); CI
boots it in headless Chrome over a tower alone ([`page-boot.ts`](ref:hub/scripts/page-boot.ts)).

`page.js` composes them: its machine ([`pageHandlers`](ref:hub/renderers/page/page.js#pageHandlers)) with the
executors, the draw, and the clicks, keys and board wired to them. Each pane is a module exporting a factory that
takes what it reads and calls as plain functions and returns what the page composes, its own state closed inside it:
the [`sidebar`](ref:hub/renderers/page/sidebar.js#sidebar), what its terminals share (`screen.js`), the
[`stats`](ref:hub/renderers/page/stats.js#stats), the settings, alerts, shells, the archives read for a worker the
board left out, the drafts' titles and new-worker form, a kept item and the dialogs. What they draw with alike is
`kit.js`, what they read off the board alike [`boardKit`](ref:hub/renderers/page/board.js#boardKit). The rest of the
main pane is views the page hosts ([[ui-model]]): the skyline home ([`tower/skyline`](ref:hub/src/views/skyline.ts#mount))
shows projects as buildings and sessions as lit windows, and welcomes the user on a tower no worker has run on; a
floor's archive, a collection, a shelf entry and every extension's status (`tower/extensions`) are the core's views too, the drafts editor and the Policies panel
their extensions'.

**The sidebar.** Each project directory links the web page of its origin remote (`GET /origins`). Each floor lists
its workers by crew ([[crews]]), each row with its lamp, callsign, status word
([`statusWord`](ref:hub/src/shared/status-words.ts#statusWord)), time in state, and what extensions add, drawn in the
form the layout picks for `card.row` ([[region-overflow]], [`drawCount`](ref:hub/renderers/page/added.js#drawCount));
running subagents hang under it as satellites ([`satellitesOf`](ref:hub/src/shared/subagents.ts#satellitesOf)). The
rate limits fold into one chip naming the tightest limit, whose popover holds the limits and the probe that reads
them ([[probes]]). The foot's Extensions entry ([`extensionsEntry`](ref:hub/renderers/page/extensions-entry.js#extensionsEntry))
lamps as loud as the loudest extension: a pointer resting on it or a keyboard reaching it lists every extension with
its problems, and a click or a tap opens `tower/extensions` in the main pane, a row of the list opening it on that
extension ([[extensions]]). A floor folds to its sign, which then carries
its waits on you, its offers and its workers lamped by their loudest attention
([`loudest`](ref:hub/src/shared/status-words.ts#loudest)); which floors a viewer folded is view state in
`tower.store`, and a floor never chosen is open while a worker on it needs you. A viewer who has waits flash sees
what waits on them flash, with an arrow at the sidebar's edge to those scrolled out of sight ([[viewer-prefs]]). Every collection a floor declares has
a tray under its workers ([[collection-trays]]). Drafts are the drafts extension's ([[collections]], [[corkboard]]):
a draft starts a worker through the page's new-worker dialog or is submitted to a running one; a view starts a worker
through the same dialog with `kit.spawn` and stays where it is. The dialog draws a choice of runtime only when the
config runs more than one, Claude first and picked, and redraws its runtime part (commands, model, effort) from
`board.runtimes[id]` ([`providerHtml`](ref:hub/src/shared/spawn-form.ts#providerHtml)): a runtime whose list may miss
models it runs takes any model or effort typed and chosen by Enter (the combobox's `custom`), the list as suggestions,
with a note when the id isn't in it ([[opencode]]); the effort's options follow the model. Its
choices (from, runtime, command, model, effort, an extension's field with options) are `<tower-combobox>`es
([[tower-elements]], [`spawnFormHtml`](ref:hub/src/shared/spawn-form.ts#spawnFormHtml)), each named by its own label
through `labelledby`; a field left to its default is empty, its placeholder saying what the default is. Tower 3D draws
the same form. A
worker whose command never started its runtime says why in its gist, as every renderer draws it (`card.startFailure`). A floor's policy offers sit above its workers as its
other asks do ([[policies]], [[attention-list]]). The shell dock starts a shell in any directory of a floor.

**The main pane** shows one value, a `MainView` ([`view.js`](ref:hub/renderers/page/view.js)): a view mounted at a
location, a worker's (`tower/card`) among them, or a worker the page started until the board carries it, drawn as the
skyline. [`hashOf`](ref:hub/renderers/page/view.js#hashOf) names it in the URL hash and
[`viewOf`](ref:hub/renderers/page/view.js#viewOf) reads it back; every way into a view goes through
[`go`](ref:hub/renderers/page/page.js#go), which leaves the view open unless the next is the same place. The page's
machine holds that view beside the board, the viewer's record and the attention state ([[machines]]), and every
handler that sets the view tells attention through [`viewed`](ref:hub/renderers/page/page.js#viewed), so the worker
whose waits ring for nobody is the one on screen while the window has the viewer's eye, and says that worker to the
tower as the page's selection ([[active-viewer]]). Views are mounted in
`#view-host` by [`regions`](ref:hub/renderers/page/regions.js#regions), over the library's view host ([[ui-model]]), with the page's kit, updated on each board
and closed as the location leaves, but for the last four workers left, kept drawn and hidden;
[`display`](ref:hub/renderers/page/page.js#display) places a subject through `/lib/layout.js` onto a view or one of the
page's routes. A worker the page doesn't hold, opened by a link, a hash or a view, is looked up in the floors' archives
first: the machine holds it as `looking` until the reads land, at the location asked for last, and any way the viewer
goes meanwhile, the history's Back included, but to that worker, cancels it ([`viewed`](ref:hub/renderers/page/page.js#viewed), [`lookedUp`](ref:hub/renderers/page/page.js#lookedUp)),
so a slow read never takes the viewer back. Found, the page goes to it; not found, the page stays where it is and a
toast says the worker is gone. What the open view shows leaving what the page holds takes the page home, but for a
worker, the view on it stays while it is looked up the same way, after any worker the viewer asked for meanwhile
([`subjectLeft`](ref:hub/renderers/page/page.js#subjectLeft)):
one sent home that started before today, or whose day ended on screen, leaves the board for its archive with its
Resume, and goes home only when no archive holds it or the read fails, which a toast says.

**Two bundled clients the page draws from** are loaded by [`clients.js`](ref:hub/renderers/page/clients.js), through the library's `clientOf`: quota's words
and drafts'. A user's extension can replace either and serve no such file, and a `404` there leaves the page without
what that file drew. Any other failure of those imports fails as an import does.

**A worker's head** ([`tower/card`](ref:hub/src/views/card.ts#mount)) never crops what identifies the worker: its
density follows its own width through a container query, so a grid cell and a narrow window look alike. Under the
head sits one tab row, the shared panels then the worker's showings ([[agent-show]]), drawn in the form the layout
picks among `card.panes`' (`scroll`, `wrap`, `menu`: [`tabsScroll`](ref:hub/renderers/page/regions.js#tabsScroll),
[`tabsWrap`](ref:hub/renderers/page/regions.js#tabsWrap), [`tabsMenu`](ref:hub/renderers/page/regions.js#tabsMenu)).
A worker that runs opens on its terminal and a stopped one on its Brief; a terminal that ends while its tab is open,
picked or not, gives way to the Brief, and pressing Terminal then shows the last screen.

**Regions.** What extensions add to a region the page fills ([`kitRegion`](ref:hub/renderers/page/page.js#kitRegion))
comes in the ranked order every renderer shares, and a region too full for it overflows in the form the layout picks
([[region-overflow]] owns the rules: ranking, pins, budgets, what is new). The page's part is measuring and
remembering. The fit reads every region drawn in one frame: untucking them first when they must be measured afresh,
reading them, then writing. It remembers each item's width while tucked
([`lineWidth`](ref:hub/renderers/page/fit.js#lineWidth)) and forgets the widths when the row's inline size changes,
fonts load or the viewer's text size changes, never on the clock's tick (the pill's time has a reserved width). A
region not drawn is neither measured nor fitted. Tucked items are reached through ⋯
([`menu`](ref:hub/renderers/page/menu.js#menu)), whose footer pins for the viewer
([`pinIn`](ref:hub/renderers/page/page.js#pinIn)): a read-modify-write of that region's entry in `layout.page`, so a
choice another window made for another region stays. The page reads its layout (`layout.page` in `tower.store`, over
the config's and its `renderer.json`'s) again on every board and every store event. An action is seen once the
viewer runs it or it is drawn in place in a focused window ([`markSeen`](ref:hub/renderers/page/page.js#markSeen)).

**Subject menus.** Every floor's sign, worker row and shown tab is a `<tower-menu-area>` with a ⋯ button: a
right-click, the context-menu key, a long press or the ⋯ opens the page's one `<tower-menu>`
([`subjectMenus`](ref:hub/renderers/page/subject-menus.js#subjectMenus)), filled from `subjectMenu` of `/lib/palette.js`
as the board and the page's open views stand when it opens ([[command-palette]]). A line chosen runs by the runner of
its kind (`MenuPick`'s `t`), one typed table where a kind with no runner fails the typecheck
([`MENU_PICKS`](ref:hub/renderers/page/page.js#MENU_PICKS)), a palette pick's through the palette's handlers, and
presses as itself: keyed by the subject and the line's id, the subject's areas busy meanwhile ([[press-feedback]]). A
menu never offers what a click on its subject does already ([`subjectMenu`](ref:hub/src/shared/subject-menu.ts#subjectMenu)):
a shown tab's menu has no Open, and goes to its worker's terminal, or its brief once the worker went home, by name; a
collection's line opens every item it keeps (`tower/collection`), whatever view the collection's own kind prefers; a
worker's processes are one line, "End 3 processes…", which asks through the card's own reap confirm and is left out
while the worker works, when its processes are its tool commands in flight; its earlier conversations are a group of
their own, each by its first prompt on one line. A
menu's line ids are each its own, and `subjectMenu` throws on two alike. Their ids follow the id rule: `sign:floor:<p>`,
`row:card:<id>`, `tab:shown:<card>/<at>`, each ⋯ its place's `/menu`. While the menu is open the sidebar's floors and
the tab row are not painted, and are painted once as it closes: a ⋯-opened menu is anchored to its button, which the
SDK closes it on losing, and both are drawn by innerHTML until the morph reaches them.

**Frames** that run a floor's own page (a shelf `html` or `renderer` entry, an `html` item, a shown file) are
sandboxed at an opaque origin and granted `clipboard-write`, so a copy button inside works framed; a `url` frame may
also read the clipboard. Keys pressed in any frame but a `url` one reach the page's keymap, its global commands alone
([[keymap]]).

**Accessibility.** The page is the tower's accessible renderer: Tower 3D's pointer-lock walk can't be. Every worker is
a link to `#<id>`, the selected one `aria-current`. The pane tabs are an ARIA tablist, the terminal is `inert` while
another pane lies over it, and redraws give focus back to the control that had it
([`keepingFocus`](ref:hub/src/shared/panel-kit.ts#keepingFocus)), one inside a `tower-*` element by the element's id. Presses that ask the tower something stay busy until
the reply ([[press-feedback]]); the toast stack is a polite live region, and another says a line for each wait that
begins ([`waitsBeganLine`](ref:hub/src/shared/waits.ts#waitsBeganLine)). It holds at 200% zoom and at the largest
text size: narrow, the sidebar becomes a rail ([[design-system]]).
