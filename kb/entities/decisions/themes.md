---
{
  "type": "decision",
  "name": "A renderer's themes: stylesheets the tower loads after its own",
  "summary": "A theme is a stylesheet a renderer's pages load after the renderer's sheet and its views' styles, each imported into a layer of its own inside the last cascade layer. Extensions offer named themes per renderer (themes, by renderer and name, `<provides>/<name>` outside), listed on the board and loaded only when the config picks one (renderers.<name>.theme); the config's renderers.<name>.themes (absolute paths) stack after it. The tower links the stylesheet importing them into every renderer page it serves, and the board carries the list, so a page follows a change live and rereads what it computes from the tokens.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-23",
  "reviewed": "2026-11-25",
  "refs": ["hub/src/renderers.ts#themesOf", "hub/src/renderers.ts#themeSheet", "hub/src/renderers.ts#themeUrls", "hub/src/renderers.ts#themeFile", "hub/src/bridge/extensions.ts#offeredThemes", "hub/src/shared/model.ts#RendererConfig", "hub/src/tower/http.ts#preloaded", "hub/src/tower/http.ts#withThemes", "hub/test/server.test.ts", "hub/src/tower/http.ts#themesCss", "hub/src/tower/http.ts#themeServed", "hub/src/tower/publisher.ts", "hub/src/bridge/board.ts#Board", "hub/src/bridge/board.ts#BoardTheme", "hub/src/tower/tower.js", "hub/renderers/page/page.js#recolourTerminals", "hub/renderers/tower3d/src/term.ts", "hub/src/config-check.ts#themeProblems", "hub/examples/extensions/harbor/harbor.css", "hub/extensions/themes/extension.json"],
  "links": [
    { "to": "cascade-layers", "verb": "loads into", "carries": "each theme in a layer of its own inside theme" },
    { "to": "design-system", "verb": "sets", "carries": "the palette and the character tokens" },
    { "to": "renderers-in-config", "verb": "extends", "carries": "renderers.<name>.themes" },
    { "to": "extensions", "verb": "contributed by", "carries": "a manifest's themes, by renderer" }
  ]
}
---
**Problem.** Restyling the tower page meant copying `renderers/page/` out of the checkout, adding a stylesheet to
the copy, and copying again for every release. The copy carried every line of the page to change a colour.

**Why.** The design is tokens (the palette, the scales, the character tokens) and [[cascade-layers]] put the
tower's CSS in one order with a `theme` layer last, so a stylesheet loaded there outweighs the tower whatever its
selectors weigh and can't show what the tower hides. What was missing was a way to load one that no release
touches, the same for the user's config and for an extension that ships a look.

**How.**
- *Offered, then picked.* An extension's manifest offers themes by renderer and name, each with a title and a path
  inside it ([`offeredThemes`](ref:hub/src/bridge/extensions.ts#offeredThemes)), outside it as `<provides>/<name>`,
  the way views are named, so two extensions can't offer the same id. The board lists them (`offeredThemes`,
  [`BoardTheme`](ref:hub/src/bridge/board.ts#BoardTheme)) and none loads until the config's `renderers.<name>.theme`
  names one. [`themesOf`](ref:hub/src/renderers.ts#themesOf) resolves each renderer's list: that theme's stylesheet,
  then the config's `renderers.<name>.themes`, absolute paths, as the user's tweaks over it. A `theme` that is no
  string, or `themes` that are no list of absolute paths, is a config error. An id nothing accepted offers loads
  nothing, and `tower config check` names it with what is offered, as it warns of a theme that is no file
  ([`themeProblems`](ref:hub/src/config-check.ts#themeProblems)): an extension turned off must not take the board
  down.
- *One stylesheet.* `/renderers/<name>/themes.css` ([`themeSheet`](ref:hub/src/renderers.ts#themeSheet)) imports
  each theme into `layer(theme.t<n>)`, so a later theme outweighs an earlier one and no theme names a layer. Theme
  `n` is served at `/renderers/<name>/themes/<n>/<file>`, that one file alone and with no CORS header
  ([`themeFile`](ref:hub/src/renderers.ts#themeFile)): only the renderer's pages load it, at the tower's origin, so no
  page elsewhere reads it and nothing beside it (a home folder, an extension's script holding its key) is served.
- *Themed from the first frame.* The tower links that stylesheet into each renderer page it serves when the
  renderer has themes ([`preloaded`](ref:hub/src/tower/http.ts#preloaded), at the end of its head, or of the document
  without one: [`withThemes`](ref:hub/src/tower/http.ts#withThemes)), naming their URLs, which `/tower.js` compares the
  board's with: a parser-inserted sheet blocks the
  page's scripts until it has loaded, so a terminal opens in the theme's colours. A renderer of the user's own takes
  its themes with nothing to write.
- *Live.* The board carries each renderer's theme URLs (`themes`, derived in the publisher). `/tower.js` links the
  stylesheet again when the renderer's change, drops the old link once the new one has loaded, and calls
  `tower.onThemes`: the page and Tower 3D take their terminals' colours again
  ([`recolourTerminals`](ref:hub/renderers/page/page.js#recolourTerminals)), as on a change of scheme.

Only tokens are promised to a theme. The page's classes and state classes and the elements' `data-slot` parts are
reached at best effort and may change in any release (`docs/extending.md`, "Write a theme"). The example,
[`harbor.css`](ref:hub/examples/extensions/harbor/harbor.css), is a theme and an extension at once; the bundled
[`themes`](ref:hub/extensions/themes/extension.json) extension offers Aqua and Flamingo, loaded only when picked.

**Alternatives considered.**
- *Load themes from the board only, in `/tower.js`*: live, but every load draws unthemed until the board arrives,
  and a terminal opened before the theme loads flashes in the stock colours.
- *Inject only, reload on a change*: simpler, but a config edit the tower already reads live would need a reload.
- *Serving a theme's folder*, so it reaches fonts and pictures by relative URL: a theme kept in the home folder or
  beside an extension's script would serve everything around it. A theme is one file; a face goes in as a `data:` URL.
- *A served stylesheet the renderer links itself*: every renderer, the core's included, would have to know the URL.
- *Every accepted extension's themes loaded* (2.30 to 2.33): a bundled extension shipping several looks would load
  them all at once, and a look couldn't ship without becoming the look. Offering keeps "installed" apart from "in
  use", which is what a picker chooses between.
- *Bare theme names, a collision a config error*: one extension's new theme could break a board that never picked
  it. Names qualified by the capability can't collide.
- *An unknown `theme` as a board error*: turning an extension off would then take every renderer's board down.
- *The config's `themes` replacing the active theme*: a user adding one tweak would silently drop the look they
  picked.
- *Theme JSON (palettes as data)*: the stylesheet is the data, and the terminal reads the tokens it computes.

**Impact.** The copy-the-page recipe is gone from `docs/extending.md`; a restyle is a theme. API 2.30 adds the
config key, the manifest key, `board.themes`, `tower.onThemes` and the two routes. 2.34 names a manifest's themes,
adds `renderers.<name>.theme` and `board.offeredThemes`, and stops loading an extension's themes unpicked: a fix to
2.30's model rather than a major, two days after it shipped. An author moves its list into named entries; its users
set `renderers.<name>.theme`. A manifest still in the list form is refused, its problem
saying what to write. Every renderer page the tower
serves may carry a `link[data-tower-themes]`.
