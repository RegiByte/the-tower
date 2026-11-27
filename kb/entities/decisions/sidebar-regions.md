---
{
  "type": "decision",
  "name": "The sidebar's sections: a region of arity all at list scale",
  "summary": "The tower page's sidebar draws board.sections between the limits and the floors: a region of arity all at the new list scale, every view on the board it offers drawn as a section of its own under a heading with its tab's tally, in the layout's order, less its hidden, folded per screen through the layout's folded key. Who waits on you is the core view tower/waiting, the list N walks, on by default.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-25",
  "reviewed": "2026-11-27",
  "refs": [
    "hub/src/shared/regions.ts#SCALES",
    "hub/src/shared/regions.ts#Region",
    "hub/src/shared/regions.ts#LayoutEntry",
    "hub/src/shared/regions.ts#USER_LAYOUT_KEYS",
    "hub/src/shared/views.ts#sectionViews",
    "hub/src/shared/views.ts#layoutOf",
    "hub/src/shared/views.ts#CORE_VIEWS",
    "hub/src/shared/view-host.ts#viewHost",
    "hub/src/renderers.ts#LayoutReach",
    "hub/src/renderers.ts#layoutProblems",
    "hub/src/views/waiting.ts#mount",
    "hub/src/views/waiting.ts#tab",
    "hub/src/shared/waits.ts#attentionOrder",
    "hub/src/shared/settings.ts#sidebarSection",
    "hub/src/tower/tower.js",
    "hub/renderers/page/renderer.json",
    "hub/renderers/page/regions.js#regions",
    "hub/renderers/page/page.js#paintSections",
    "hub/renderers/page/page.js#foldIn",
    "hub/renderers/page/page.js#showIn",
    "hub/renderers/page/settings-pane.js#settingsPane",
    "hub/docs/extending.md",
    "hub/docs/config.md"
  ]
}
---
**Problem.** The page's sidebar was hand-written DOM. An extension could put one view in `board.strip`, asks in
`board.notes` and icons in `board.sign`, but not an ordered section of its own. Renderers built on the page (an inbox
of who waits, a queue) inserted theirs by DOM surgery, and broke each other's anchors doing it.

**Why.** Every builder asked for the same thing: a section in the sidebar, in an order the user sets, that folds.
That is a region and a layout, which the UI model already has ([[ui-model]], [[renderers-in-config]]): what was
missing was a region that draws every view it offers, not one of them.

**How.**
- *Arity `all`.* A region of arity `all` draws every view it offers on its subject, each on its own, in the layout's
  `order`, less its `hidden` ([`sectionViews`](ref:hub/src/shared/views.ts#sectionViews)). The page's is
  `board.sections`, on the board, between the limits and the floors (`renderer.json`). A view never asks the kit for
  such a region: the view host refuses it, naming it ([`viewHost`](ref:hub/src/shared/view-host.ts#viewHost)).
  An extension's own regions stay `one` or `tabs`.
- *Scale `list`* ([`SCALES`](ref:hub/src/shared/regions.ts#SCALES)): a block in a stack of blocks, the region's width,
  a few rows high and scrolling past that. Sections at `row` would also be offered in `board.strip`, a `row` region of
  arity `one` that picks the first view offered; at `list` the strip never offers them.
- *A section.* A heading (a button, `aria-expanded`) with the view's label, its hint the tip, and its tally: the
  view's `tab` words, the module's export from the board until the view has mounted, then the mounted view's `tab()` if it has one,
  drawn again on its `tab` event. A `tab` answering `undefined` leaves the section undrawn for now, its view still
  mounted; a view with no `tab` is always drawn. Each view is mounted once and kept while offered, folded or not, so
  its tally stays current; folded, it is told `visible(false)` ([`regions`](ref:hub/renderers/page/regions.js#regions)).
- *Folding is layout* ([`LayoutEntry`](ref:hub/src/shared/regions.ts#LayoutEntry)'s `folded`): the highest layer's
  list, taken whole as `order` is ([`layoutOf`](ref:hub/src/shared/views.ts#layoutOf)), and one of the user's keys
  a manifest never gives. The heading writes the viewer's layer
  ([`foldIn`](ref:hub/renderers/page/page.js#foldIn)), so a fold is per screen; the config's `folded` is the default
  for every screen. Settings' Sidebar part sets each section Open, Folded or Off
  ([`sidebarSection`](ref:hub/src/shared/settings.ts#sidebarSection)); Off is the viewer's `hidden`, and On again names
  a view a lower layer hides in their `order` ([`showIn`](ref:hub/renderers/page/page.js#showIn)). The config check
  fails a `folded` on a region of another arity and an `onScreen` on one of arity `all` (its sections fold, never
  leave the screen for a menu), and warns of a `folded` id no view has
  ([`layoutProblems`](ref:hub/src/renderers.ts#layoutProblems)).
- *Waiting* ([`tower/waiting`](ref:hub/src/views/waiting.ts#mount)), a core view on the board at `list`, first in the
  page's order: [`attentionOrder`](ref:hub/src/shared/waits.ts#attentionOrder), the workers' waits then the extensions'
  asks, less the viewer's dismissals, which it reads from `tower.store` and hears change there. A wait's row opens its
  worker; an ask's goes where it opens, else to its subject; × dismisses for every renderer of the viewer's. Its ages
  are rewritten on a timer while it is seen; the row of the worker open in the main pane is marked, and scrolled into
  view only as it becomes the open one. Its tally is the count, `unseen`, and nothing when nobody waits.
- *Another window.* `tower.store.on` hears the keys another window of the viewer's sets too, through the browser's
  `storage` event ([`tower.js`](ref:hub/src/tower/tower.js)), so a dismissal in one window clears the row in the next.

**Alternatives considered.**
- *`board.strip` at arity `all`*: changes what an existing region means (a major), and the strip sits above the notes.
- *Sections at scale `row`*: every section view would also be offered in the strip, Waiting first.
- *The fold in the viewer's record or each view's `state`*: per screen too, but neither layers with the config, so no
  agent could set a default fold.
- *Waiting as workers' waits only*: the section and `N` would then disagree; an ask is one row going where `N` goes.

**Impact.** Every "add to the sidebar" lands as a view at `list` scale, laid out by the layout's three layers, with no
DOM of the page's to reach into. A renderer of its own draws the same views from `sectionViews`. `board.strip` keeps its
meaning; whether it still has a user is a question for a later major.
