---
{
  "type": "decision",
  "name": "The sidebar's entries: board.nav opens views in the main pane",
  "summary": "The row above the tower page's floors is board.nav, a region of arity all that opens in board.main: Floors first, the way home to the skyline, then an entry per view on the board the main pane draws, each displayed there on a press and marked while it is open. Stats is one, the core view tower/stats; an extension's board pane view is one when it asks for the row (optsInto), since the region is opt-in; past a budget of four the rest are behind More…, and pins choose.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-25",
  "reviewed": "2026-11-27",
  "refs": [
    "hub/src/shared/regions.ts#Region",
    "hub/src/renderers.ts#DeclaredFile",
    "hub/src/shared/views.ts#sectionViews",
    "hub/src/shared/views.ts#offeredIn",
    "hub/src/shared/views.ts#placedEntries",
    "hub/src/shared/extensions.ts#ExtensionViewEntry",
    "hub/src/shared/views.ts#CORE_VIEWS",
    "hub/src/views/stats.ts#mount",
    "hub/renderers/page/renderer.json",
    "hub/renderers/page/regions.js#regions",
    "hub/renderers/page/page.js#paintNav",
    "hub/docs/extending.md"
  ]
}
---
**Problem.** The row above the floors switched the sidebar between the floors and Stats, a mode of the page's own
(`side.view` in `tower.store`). Nothing in the sidebar opened the main pane, so an extension with a place of its own on
the board (a gallery, a queue) reached it only from the palette, or by inserting a button into the page's DOM, which
broke other renderers built on the page.

**Why.** A view on the board at `pane` is already what the main pane draws and what the palette offers as "Open
<label>". The row needed only to draw those same views as entries: no new kind of contribution, and no renderer DOM for
an extension to reach into ([[sidebar-regions]], [[renderer-is-disposable]]).

**How.**
- *`Region.opens`* ([`Region`](ref:hub/src/shared/regions.ts#Region)): a region of arity `all` that holds views and
  names the region its views open in draws each as an entry there, and mounts none. The renderer's regions are
  checked so `opens` names one of its own that holds views one at a time or as tabs.
- *Opt-in* ([`offeredIn`](ref:hub/src/shared/views.ts#offeredIn)): a region with `optIn: true` offers only the
  views that name it in their `optsInto` ([`ExtensionViewEntry`](ref:hub/src/shared/extensions.ts#ExtensionViewEntry)).
  It is general, any renderer's region or an extension's may be opt-in, and the rule sits in the one filter every
  region's offer goes through, so the palette, which offers in `board.main`, still lists every view.
- *`board.nav`* (`renderer.json`): on the board at `pane`, opening in `board.main`, opt-in. Its entries are
  [`sectionViews`](ref:hub/src/shared/views.ts#sectionViews), the layout's `order` then the rest, less its `hidden`,
  through all three layers, placed by [`placedEntries`](ref:hub/src/shared/views.ts#placedEntries) ([[region-overflow]]). Each entry is a button with the view's label, its `tab` export on the board as the tally,
  and its hint as the tip; a press displays the view on the board, and the entry is marked `aria-current` while the
  main pane's location names it ([`regions`](ref:hub/renderers/page/regions.js#regions),
  [`paintNav`](ref:hub/renderers/page/page.js#paintNav)). The mark is derived from the location, so nothing is stored.
- *Floors* comes first and is fixed, the page's own: it opens the skyline and is marked while home.
- *Who is on the row.* The views that ask: `tower/stats` and the Learning center (`guides/center`) by default, then any
  extension view with `optsInto: ["board.nav"]`. Skyline, Extensions, New floor and Clones don't ask, so nothing has to
  hide them. The user trims the row with `hidden`, in the config's or the viewer's layer; the palette still offers
  every view.
- *When it is full* ([[region-overflow]]): `overflows: ["menu", "wrap"]`, and the page's layout gives `views: 4`. The
  pinned and four of the rest are in place, the rest behind More…, which opens any of them and pins any entry to the
  row ("Pin to the row", the viewer's layer). More… is marked while the view open in the main pane is behind it.
- *Stats* is the core view [`tower/stats`](ref:hub/src/views/stats.ts#mount), on the board and on a floor ([[stats]]).
  From the row it opens on every floor; a floor's opens from that floor's menu or the palette. The sidebar mode and its
  machine are gone.
- `board.sign`'s icons stay at the row's end; a sidebar too narrow for the entries in place wraps them.

**Alternatives considered.**
- *Every board pane view an entry, trimmed with `hidden`* (the first version): with thirty or forty extensions the
  row would be crowded by default, and the renderer had to hide bundled views by name. Asking is one line in a
  manifest.
- *A region field listing the views it takes*: the renderer would have to name extensions it has never seen.
- *A labelled command in `board.sign`*: it has no open state to mark.
- *An `entries` manifest key*: it would repeat a view's words and its "opens in the main pane" meaning.
- *A view at an `entry` scale drawing its own button*: extension code would draw the row's DOM again.
- *Stats kept as a sidebar mode, with a second row for entries*: the row would then mean two things.
- *The nav entry opening Stats on the floor in view*: the page would special-case one entry; the location now says
  the scope instead.
- *Without `opens`, only a description*: a reader of `GET /renderers` couldn't tell entries from mounted views.

**Impact.** Every board-level place an extension asks for is one press from the sidebar (or two, through More…), laid
out like any region, and any renderer can mount Stats. The view key `optsInto` and the region field `optIn` are API
additions (2.35). The page's `[data-side-view]` buttons and `#stats` are gone, which Lobby and Artifacts
read; Tower 3D can drop its own Stats panel for the view.
