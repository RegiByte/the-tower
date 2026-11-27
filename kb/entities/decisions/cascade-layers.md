---
{
  "type": "decision",
  "name": "A tower page's CSS in one order of cascade layers",
  "summary": "/design.css declares one order of cascade layers before any CSS: the UI SDK's, vendored sheets, the design, the tower's elements, the renderer's own sheet, views' styles, then themes. Every sheet of the tower sits in its layer, so which rule wins between them is the order, not selector weight or where a sheet loads; the tower's !important rules hold against any theme, and the layer names stay internal.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-23",
  "reviewed": "2026-11-27",
  "refs": ["hub/src/shared/design.ts#designCss", "hub/src/shared/view-parts.ts#viewLayer", "hub/src/shared/view-parts.ts#componentsLayer", "hub/src/shared/view-parts.ts#rendererLayer", "hub/src/shared/view-parts.ts#viewCss", "hub/src/lib-ui/look.css", "hub/renderers/page/index.html", "hub/renderers/page/page.js", "hub/renderers/page/calls.js#watchCalls", "hub/src/shared/tips.ts#watchTips", "hub/src/shared/ask.ts", "hub/renderers/tower3d/index.html", "hub/renderers/week/index.html"],
  "links": [
    { "to": "themes", "verb": "orders", "carries": "each renderer's themes in the theme layer, last" },
    { "to": "design-system", "verb": "orders", "carries": "/design.css's tokens and shared components in tower.design" },
    { "to": "tower-elements", "verb": "orders", "carries": "look.css's parts in tower.elements, its --ui-* mapping in tower.design" },
    { "to": "shared-panels", "verb": "orders", "carries": "the shared component sheets in tower.design, wherever they are inserted" }
  ]
}
---
**Problem.** A tower page's CSS comes from five places: `/design.css`, the renderer's own sheet, the shared component
sheets a renderer or a view inserts (`panelsCss`, `itemsCss`, `markdownCss`), each view's `<style>` in the body, and
`look.css`, adopted last by the elements. With none of it in a layer, which rule won between them was a matter of
selector weight and of where each sheet happened to load. A stylesheet loaded after the renderer's (a theme) could not
predict whether its rule won: the dark palette's `:root[data-scheme='dark']` outweighs a theme's `:root`, a view's
nested rules outweigh a plain class, and the adopted `look.css` comes after every link.

**Why.** Themes are stylesheets loaded after the renderer's (pass 3c). For a theme to be a promise, precedence has to
be something the tower chooses once, not weights nobody chose on purpose. The UI SDK already puts its CSS in
`@layer ui-sdk` and asks the page to declare it first.

**How.** [`designCss`](ref:hub/src/shared/design.ts#designCss) starts with
`@layer ui-sdk, tower.vendor, tower.design, tower.elements, tower.page, tower.views, theme;`, and every page links
`/design.css` first among its sheets. A later layer wins over an earlier one whatever its selectors weigh; within one,
weight and order decide as before. CSS in no layer wins over every layer, and an `!important` in an earlier layer over
one in a later layer, so `[data-tucked]` and reduced motion, `!important` in the tower's sheets, hold against any
theme. So does `[hidden]`: `tower.design` sets `display: none !important` on every hidden element but one
`until-found`, so no theme or view can show what the tower hides. An element that must stay drawn while unseen (the
sidebar's edge arrows, which keep blinking in step) is marked otherwise, never `hidden`.
- `tower.vendor`: xterm's sheet, imported by the page and Tower 3D as `@import url(/xterm.css) layer(tower.vendor)`.
- `tower.design`: the tokens and shared components of `/design.css`; the shared component sheets, through
  [`componentsLayer`](ref:hub/src/shared/view-parts.ts#componentsLayer), wherever a renderer or a view inserts them;
  the tooltips' sheet ([`watchTips`](ref:hub/src/shared/tips.ts#watchTips)); `look.css`'s `--ui-*` mapping, so a
  component of the design re-points a variable on an element it holds (the new-worker form's comboboxes take its
  project-coloured ring and faint placeholder that way); and the page's element defaults (`button`, `a`, `kbd`,
  `dialog`), which a shared component's class outweighs, as the components were written for.
- `tower.elements`: [`look.css`](ref:hub/src/lib-ui/look.css)'s rules for the SDK's parts. The ⋯ trigger draws its
  hover edge there; it used to borrow it from the page's `button:hover`.
- `tower.page`: the renderer's own sheet: the page's, Tower 3D's and The Week's, written in the layer by name in their
  static `<style>`, and any other renderer's through
  [`rendererLayer`](ref:hub/src/shared/view-parts.ts#rendererLayer), so a renderer written from scratch reaches the
  same place without naming it. Its element defaults go through `componentsLayer`.
- `tower.views`: what [`viewCss`](ref:hub/src/shared/view-parts.ts#viewCss) emits, and
  [`viewLayer`](ref:hub/src/shared/view-parts.ts#viewLayer) for a view's rules written whole, among them the shared
  ask dialog's, which must outweigh a renderer's `button` rules.
- `theme`: the renderer's themes, each in a layer of its own inside it, in order ([[themes]]).

The names are not part of the API: a renderer and an extension's view reach their layers through the three helpers
of `/lib/view.js`, and a theme names no layer, its loader wraps it. Framed documents (a shelf page, a showing) keep
their own `<style>` in no layer over `/design.css`, which keeps the order they had, and so do the pages no theme
reaches: KayKit's, Tower 3D's lab, editor and dresser, and the tower's problem page.

The move was checked as a refactor: computed styles of every element (and `::before`, `::after`, `::placeholder`) and
screenshots, in Chrome and WebKit, light and dark, before and after, on the floors, a worker's terminal, Brief,
Changes, a card's menu, the new-worker form's combobox and the settings popover.

**Alternatives considered.**
- *Specificity alone*, a documented weight a theme must beat: every new palette or view selector stays under it
  forever, and the dark palette alone needs (0,3,0) to beat.
- *Themes in no layer, the tower layered*: simpler to say, but themes would then fight extensions' raw CSS and each
  other on order and weight, and leave nothing above them for the user's own last word.
- *The renderer's element defaults in `tower.page`*: with the shared components below them, the page's `button` would
  outweigh `.icon-btn`, `.chip` and `.eyebrow`; a `tower.base` layer under the design would do the same as placing
  them in `tower.design` but adds a name to the order.
- *`light-dark()` palettes instead of layers*: removes the dark-mode fight only.

**Impact.** A theme in the `theme` layer outweighs the tower with any selector and can't undo what the tower sets `!important`,
`[hidden]` among it. A
view that writes a raw `<style>` with neither helper outweighs every layer, themes included. Inside a layer, selector
weight still matters, so new rules keep it flat. `/lib/view.js` gained `viewLayer`, `componentsLayer` and `rendererLayer`.
