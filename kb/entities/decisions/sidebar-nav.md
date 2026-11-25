---
{
  "type": "decision",
  "name": "The sidebar's entries: board.nav opens views in the main pane",
  "summary": "The row above the tower page's floors is board.nav, a region of arity all that opens in board.main: Floors first, the way home to the skyline, then an entry per view on the board the main pane draws, each displayed there on a press and marked while it is open. Stats is one, the core view tower/stats; an extension's board pane view is one with nothing more declared.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-25",
  "reviewed": "2026-11-25",
  "refs": [
    "hub/src/shared/regions.ts#Region",
    "hub/src/renderers.ts#DeclaredFile",
    "hub/src/shared/views.ts#sectionViews",
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
- *`board.nav`* (`renderer.json`): on the board at `pane`, opening in `board.main`. Its entries are
  [`sectionViews`](ref:hub/src/shared/views.ts#sectionViews), the layout's `order` then the rest, less its `hidden`,
  through all three layers. Each entry is a button with the view's label, its `tab` export on the board as the tally,
  and its hint as the tip; a press displays the view on the board, and the entry is marked `aria-current` while the
  main pane's location names it ([`regions`](ref:hub/renderers/page/regions.js#regions),
  [`paintNav`](ref:hub/renderers/page/page.js#paintNav)). The mark is derived from the location, so nothing is stored.
- *Floors* comes first and is fixed, the page's own: it opens the skyline and is marked while home. The page hides
  `tower/skyline` from the region for that reason, `tower/extensions` since the foot has its own entry, and the bundled
  views reached elsewhere: New floor and Clones (`floors`, beside the row in `board.sign`) and the Learning center
  (`guides`, in the skyline's greeting). An extension's own board pane view is shown by default; only the user, in the
  config's or the viewer's layer, trims the row, and the palette still offers what it hides.
- *Stats* is the core view [`tower/stats`](ref:hub/src/views/stats.ts#mount), on the board and on a floor ([[stats]]).
  From the row it opens on every floor; a floor's opens from that floor's menu or the palette. The sidebar mode and its
  machine are gone.
- The row wraps when full (`overflows: ["wrap"]`), `board.sign`'s icons at its end.

**Alternatives considered.**
- *A labelled command in `board.sign`*: it has no open state to mark.
- *An `entries` manifest key*: it would repeat a view's words and its "opens in the main pane" meaning.
- *A view at an `entry` scale drawing its own button*: extension code would draw the row's DOM again.
- *Stats kept as a sidebar mode, with a second row for entries*: the row would then mean two things.
- *The nav entry opening Stats on the floor in view*: the page would special-case one entry; the location now says
  the scope instead.
- *Without `opens`, only a description*: a reader of `GET /renderers` couldn't tell entries from mounted views.

**Impact.** Every board-level place an extension makes is one press from the sidebar, laid out like any region, and
any renderer can mount Stats. The page's `[data-side-view]` buttons and `#stats` are gone, which Lobby and Artifacts
read; Tower 3D can drop its own Stats panel for the view.
