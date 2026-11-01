---
{
  "type": "decision",
  "name": "When a region is full: overflow forms the user picks, pins, and ranking in shared code",
  "summary": "A region says which overflow forms it can be drawn in (menu, count, wrap, scroll) and the user picks one per region through the layout's layers; what is drawn in place is a prefix of one ranked list, computed by pure shared code from the layout's pins and hides, never from a priority an extension declares; an extension lays out only the regions it declares; the user pins through a union over the layers with an unpinned list; and what is new to the viewer is kept as a seen set in tower.store, marked with a dot, and never reorders anything.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-01",
  "reviewed": "2026-11-01",
  "refs": [
    "hub/src/shared/regions.ts#Region",
    "hub/src/shared/regions.ts#Layout",
    "hub/src/shared/views.ts#layoutOf",
    "hub/src/shared/views.ts#declaredLayout",
    "hub/src/shared/adds.ts#addedActions",
    "hub/src/shared/viewer.ts",
    "hub/renderers/page/renderer.json",
    "hub/src/shared/regions.ts#OVERFLOWS",
    "hub/src/shared/regions.ts#LayoutEntry",
    "hub/src/shared/regions.ts#overflowOf",
    "hub/src/shared/adds.ts#actionId",
    "hub/src/shared/adds.ts#rankedActions",
    "hub/src/shared/adds.ts#rankedBadges",
    "hub/src/shared/adds.ts#rankedLines",
    "hub/src/shared/adds.ts#headRanked",
    "hub/src/shared/adds.ts#isFresh",
    "hub/src/shared/fill.ts#fill",
    "hub/src/shared/viewer.ts#seenOf",
    "hub/src/shared/viewer.ts#sawAll",
    "hub/src/renderers.ts#layoutProblems",
    "hub/src/bridge/extensions.ts#rendererLayoutProblems",
    "hub/test/ranking.test.ts"
  ]
}
---
**Problem.** Every region that holds extensions' contributions draws all of them, in fold order, however many there
are. With a handful of extensions a worker's head in a grid cell clips its own callsign, status and cost; the tab
strip scrolls with no visible edge, so a tab past it is unfindable; the sidebar's rows grow a line per contribution.
Nothing says what is kept in place when there is no room, who decides, or how the user reaches the rest.

**Why.** The tower is open to extensions it has never seen ([[extensions]]), so a region can't be sized for the
contributions it knows. The user decides how dense their surface is, and an agent can set it for them through the
config ([[agents-have-every-capability]]). Every renderer must draw a region's order alike, so ranking can't live in
one renderer ([[renderer-is-disposable]]). And the tower stores only intent, facts and kept files
([[logs-are-facts]]), which rules out an install log to say what is new.

**How.**
- *The rule.* A region draws a prefix of one ranked list in place and reaches the rest through its overflow form.
  Each region keeps a protected core that is never tucked:
  - a worker's head (`card.head`, in a pane and in a grid cell): the callsign, the status with its timer, context
    and cost beside it at every room, the card's exemptions, a heeded wait's Dismiss, the close ✕ in a pane or the
    holding view's acts in a cell, and the core verbs (Resume, Let go, Send home), which turn to icons when there is
    little room and leave for the menu only when even icons don't fit, after every contribution has. In a grid cell,
    Open sits between the grid's ✕ and Send home;
  - a worker's tabs (`card.panes`): the tabs a pane chord opens, and the open tab;
  - a worker's row in the sidebar (`card.row`): the lamp, callsign, status, since and gist;
  - a floor's section (`floor.section`): its asks, which are attention, so it offers `wrap` alone.

  A view and the renderer that measures its region share one head, so the view marks what the region may take
  into account: `data-tuck` on a control it lets the region tuck as a last resort, ranked, `data-keep` on what the
  region draws in its own slots but must never tuck, and `data-tuck-text` on text the menu's header shows once it is
  tucked ([[ui-model]]). A renderer that ignores the marks never tucks those controls: they stay drawn.
- *Reachable when tucked.* Nothing tucked stays focusable or in the accessibility tree. Every tucked item is reached
  by keyboard through the region's ⋯ menu, and the palette is the complete path: it lists every action on the
  subject in focus, hidden and tucked ones included ([[command-palette]]). A region offers `count` only where the
  rest is reached elsewhere, in the subject's own head or in the palette; a showing, a said and a section are not
  the palette's subjects yet, so `shown.tab`, `said.acts` and `section.acts` don't offer `count`.
- *Forms, the user's choice per region.* `menu` (measured: what doesn't fit goes behind a ⋯), `count` (exactly k
  in place, "+n" for the rest, reachable where the subject opens), `wrap` (everything, the region grows) and `scroll`
  (a strip with a visible edge that keeps the open item in view). A renderer declares, per region in its
  `renderer.json`, the forms it draws (`overflows`, its default first); the user picks one with the layout's
  `overflow`, and budgets (`lines`, `badges`, `actions`) set how many of each a `menu` or `count` region draws:
  - pins don't count against a budget, and are drawn while there is room;
  - the protected core never counts;
  - `0` under `menu` draws the pinned alone;
  - `count` draws min(k, n) and shows no "+0";
  - under `wrap` and `scroll` a budget is unused, and the check warns;
  - on a worker's head, `lines` is read by the head's row of lines (how many lines it shows), not by the fill.
  Forms are per region, not per scale: a choice for `card.head` applies in grid cells too, and a holding view may
  later pass its own as an option. A form a region doesn't offer, a budget for something it doesn't hold and a pin
  where nothing pins are said by `tower config check` and on the board, and the region is drawn in its default.
  Each form is its own drawing function, not one function with a mode.
- *Ranking in shared code.* Actions: the pinned first in their order, then the rest in board order, less what is
  hidden. Badges rank by severity, board order within a tone. A head interleaves them: the severe badges (broken,
  needs), then the pinned actions, then the other badges, then the other actions, with the `data-tuck` controls
  ahead of all of them, so they leave last. An extension's lines rank and pin together by its capability; without a
  pin they come in the order extensions resolve (bundled first, then by id), so at a narrow head a policy run's line
  can outrank a worker's own tab line. That is chosen, not accidental: a default pin would have the core name an
  extension. The fill, how many of the ranked widths fit in the room with hysteresis so a region doesn't flicker, is
  pure and shared too.
- *No extension priority.* A manifest declares no priority, budget or pin. An extension's layout is the bottom
  layer, and it lays out only the regions it declares itself: a renderer's region (`card.head`, `card.panes`) takes
  nothing from it, and both checks warn when a manifest tries. Before this, a manifest could declare a renderer's
  region and hide another extension's tab there. Removing that is a deliberate change under a minor: the manifest is
  not the renderer API, no bundled or example manifest did it, and the behaviour was the priority field by the back
  door.
- *Pins are a union.* `pinned` merges over the renderer's, the config's and the viewer's layers: the viewer's pins
  first, then the config's, then the renderer's, each id once, less every id a higher layer lists in `unpinned`. So
  an agent can pin for the user through the config and see it take effect, and the user can drop that pin from the
  page. Pinning un-hides what a lower layer hid, as ordering does. Pins stay per renderer and, in the viewer's layer,
  per browser; the config is the path across renderers and machines. A viewer's `unpinned` id that no lower layer
  pins any more is dropped when the layout is read, and the viewer's next write of that region omits it, so it is
  derived, not kept. Until that write, a config pin added again for that id stays unpinned, and the ⋯ footer lists it
  as "pinned by your config, unpinned here", so it is never silently lost.
- *One id space.* Pins, hides and "seen" name an action by its verb or `<cap>/<command>` and lines by capability,
  in the same space as view ids, so a manifest that names a verb, a command or a view alike is a problem.
- *"New" without a stored fact.* The viewer keeps a seen set in `tower.store`, per action id across every head and
  every renderer of theirs. The first load with nothing kept marks everything offered as seen, so a fresh tower
  highlights nothing. An action stops being new when the viewer runs it, pins it, hides it, opens a menu that lists
  it, or once it has been drawn in place in a focused window. New never reorders: it is a dot on the action, a dot on
  the ⋯ while a tucked action is new, and on the first opening after an action became new, a "New" section at the
  top of the menu listing it, with a line saying it appears there this once.

**Alternatives considered.**
- *Tucked until pinned (Chrome's extensions menu).* Nothing an extension adds is drawn in place until the user pins
  it. Installing does nothing visible, and the user's room is wasted at full width. Kept only as a choice: a budget
  of 0 under `menu` is pins only, opted into per region.
- *Declared budgets.* A renderer fixing how many contributions each region draws ignores the room and the user.
  Budgets are the user's, through the layout.
- *A manifest priority field.* Every extension claims the top; the ranking becomes a contest the user didn't ask
  for. The same goes for `pinned` in a manifest's layout, which is refused.
- *"New" ranks right after the pins.* An install reshuffles every head, a region moves at the moment the user acts
  on it, and the order would depend on renderer state frozen into a served contract.
- *Viewer pins replace the config's, with a Reset.* An agent's pin in the config would be silently overridden by any
  pin made on the page.
- *Refusing an extension that lays out a renderer's region.* It would lose the extension's views and verbs over one
  layout key that the rule already makes inert; a warning says it. Allowing it is the back door above.

**Impact.** Every region gets a defined behaviour when full, the same in every renderer, chosen by the user. The
layout gains `pinned`, `unpinned`, `overflow` and budgets, a region gains `overflows`, and the shared modules gain
the ranking, the fill and the viewer's seen set: additions under a minor of the API. Renderers draw the forms region
by region, each adding the form to its `renderer.json` as it is built, so the checks never accept a form that isn't
drawn.
