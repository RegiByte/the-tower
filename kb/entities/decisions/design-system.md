---
{
  "type": "decision",
  "name": "One design system, served from one module",
  "summary": "Every renderer speaks one visual language, Wayfinding on paper, whose tokens, faces, terminal theme and sky live in src/shared/design.ts; colour is attention, computed on the board.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-26",
  "refs": ["hub/src/shared/design.ts", "hub/src/shared/design.ts#size", "hub/src/shared/design.ts#space", "hub/src/shared/design.ts#controls", "hub/src/shared/design.ts#iconSize", "hub/src/shared/icons.ts#ICON", "hub/src/shared/icons.ts#withIcons", "hub/src/shared/design.ts#fonts", "hub/src/shared/design.ts#terminalTheme", "hub/src/shared/design.ts#designCss", "hub/src/shared/design.ts#skyAt", "hub/src/shared/design.ts#documentCss", "hub/src/bridge/board.ts", "hub/src/tower/http.ts#design", "hub/renderers/page/index.html", "hub/renderers/page/page.js", "hub/src/tower/tower.js", "hub/renderers/tower3d/src/outside.ts", "hub/renderers/tower3d/src/cards.ts#WORLD", "hub/renderers/tower3d/src/ui.ts", "hub/renderers/tower3d/src/toon.ts#loadFaces", "hub/src/shared/design.ts#projectTones", "hub/renderers/tower3d/src/sign.ts#paintSign", "hub/renderers/tower3d/src/palette.ts#floorPalette", "hub/scripts/contrast.ts"]
}
---
**Problem.** The tower page and Tower 3D looked generic and unlike each other, every status colour equally loud,
and each renderer defined its colours on its own.

**Why.** The tower is used all day: it should be calm to look at for hours, and one language for every renderer
grows as components are added.

**How.** Direction *Wayfinding* warmed with paper tones: paper and ink chrome, floors as signs with the project as
a transit-line band, Overpass for signage, Atkinson Hyperlegible for text, JetBrains Mono for terminals, and a
terminal that is a block of the ink colour.
- [`design.ts`](ref:hub/src/shared/design.ts) holds every token as plain data, plus the xterm theme
  ([`terminalTheme`](ref:hub/src/shared/design.ts#terminalTheme)), the faces and the sky through the day
  ([`skyAt`](ref:hub/src/shared/design.ts#skyAt)). It imports nothing, so it runs in Node, in the browser and in
  Tower 3D's bundle.
- The tower serves it three ways ([`design`](ref:hub/src/tower/http.ts#design)): `/design.css`
  ([`designCss`](ref:hub/src/shared/design.ts#designCss): faces, `--` variables and the shared components, among
  them the attention classes and every button's pressed, held and busy states, [[press-feedback]]), `/design.js`
  and `/fonts/<file>` from the `@fontsource` packages. All three answer any origin: a framed shelf page has an
  opaque origin, and fonts and modules load only with CORS.
- **Colour is attention.** Each board card carries `attention` (`needs | ready | working | quiet | broken`),
  derived in the bridge ([`board`](ref:hub/src/bridge/board.ts)): needs is a screen or a question, ready an answer
  nobody has read yet ([[waiting-on-you]]), working is booting or at work, broken is failed or lost. Renderers colour
  by it and never derive it; the status word keeps the exact state, its words in `STATUS_NAME` and `ATTENTION_NAME`
  of `/cards.js`. Red is kept for what needs a hand: only a card that needs you washes, an answer ready is a calm
  green, something new is `accent`, a problem that waits on no one is `brokenText`. Only needs blinks; a `watching`
  lamp breathes ([[watching-status]]). Reduced motion and more contrast (the viewer's or the system's) are honoured
  by `design.css` ([[viewer-prefs]]).
- **Two schemes, one set of roles.** `palettes.light` (a soft parchment) and `palettes.dark` fill the same roles,
  `ink` for text and `enamel` for dark surfaces, so components never name a scheme. How the viewer's choice reaches
  pages, terminals and framed shelf pages is [[viewer-prefs]].
- **Panels follow the scheme; the world doesn't.** Tower 3D's DOM chrome uses the shared components in the viewer's
  scheme. Everything drawn into the scene is a thing in the building and keeps one palette,
  [`WORLD`](ref:hub/renderers/tower3d/src/cards.ts#WORLD) = `palettes.light`: the world has its own light (the sky
  by the clock), and a lamp's colour means one thing whatever the panels show. Canvas text waits for the faces
  ([`loadFaces`](ref:hub/renderers/tower3d/src/toon.ts#loadFaces)). Text on an attention colour is a token too
  (`on*`), read by CSS and canvas alike; a rendered markdown document's style is
  [`documentCss`](ref:hub/src/shared/design.ts#documentCss), shared by every renderer's readers.
- **Project tones are mixed, never stored**: from the config colour in CSS (`color-mix` in oklab with ink or panel),
  and for canvas and WebGL by [`projectTones`](ref:hub/src/shared/design.ts#projectTones), the same mix in JS, so
  Tower 3D's signs ([`paintSign`](ref:hub/renderers/tower3d/src/sign.ts#paintSign)) are the page's sign in `WORLD`.
  A floor sign is a plate tinted by its project, following the scheme like any panel.
- **Diffs and code**: `added` and `removed` are text colours, with per-scheme washes behind a changed line, gutters
  behind its numbers and a deeper shade behind the words it changed ([[changes-view]]); code's syntax has its own
  `syn*` colours per scheme, which [[shared-panels]] maps highlight.js onto.
- **Contrast**: every pair the renderers draw reaches WCAG AA in both schemes (4.5:1 for text, 3:1 for a field's edge
  and a focus ring). The attention colours are fills, each with a text tone of its hue and a text on it; `deco` is
  for what is never read. Every pair is data in [`contrast.ts`](ref:hub/scripts/contrast.ts): `npm run tool:contrast`
  fails on one under AA, so a token change is re-measured before it lands. Shifts are made in oklab, which keeps
  each hue.
- **Type, space and corners**: a type scale in rem ([`size`](ref:hub/src/shared/design.ts#size), `--fs-*`), so every
  panel follows the browser's text size times the viewer's Text size (terminals and Tower 3D's canvas keep their
  own); a spacing scale in px ([`space`](ref:hub/src/shared/design.ts#space), `--sp-*`), so text grows and the space
  around it stays; one label style, `.eyebrow`; Overpass's ascent and descent overridden in its `@font-face` so
  capitals sit on the middle of a line; corner radii as tokens; italics as real faces.
- **Icons, controls and selection**: one SVG icon set ([`ICON`](ref:hub/src/shared/icons.ts#ICON)) in
  `currentColor`, hidden from assistive tech, the control naming itself; shared words keep their text marks
  (`⎇`, `❯`) for tooltips, notifications and the CLI, and a DOM renderer draws them as icons
  ([`withIcons`](ref:hub/src/shared/icons.ts#withIcons)). Two icon sizes in rem
  ([`iconSize`](ref:hub/src/shared/design.ts#iconSize)); one least control size
  ([`controls`](ref:hub/src/shared/design.ts#controls), `--control`, WCAG 2.5.8's target), `.icon-btn` for every
  close; one selected look for cards and tabs (`--selected`, an inset ink ring that keeps the attention edge). Tower
  3D's HTML panels draw the same icons ([`ui.ts`](ref:hub/renderers/tower3d/src/ui.ts)); what it paints into
  textures keeps its own text.

**Alternatives considered.**
- Other directions: Paper & Ink alone (noisy in dense lists), a game skin (trade dress), a warmer dark theme
  (still generic).
- Following the clock for the scheme: the UI would change under the user mid-session.
- Tower 3D's world following the scheme: every canvas label would repaint on a toggle, and a sign in the building
  would change with the viewer's OS appearance.
- Spacing in rem: the page would grow with the Text size like a zoom, which zoom already does.
- Fonts committed as woff2 files: the `@fontsource` packages pin versions and carry the OFL licences with no binaries
  in git.

**Impact.** A renderer or shelf page gets the look by linking `/design.css`, or importing `/design.js` for data such
as the terminal theme and the sky. Tower 3D bundles the same module; its floors keep large planes neutral and the
project colour on small things ([`floorPalette`](ref:hub/renderers/tower3d/src/palette.ts#floorPalette)).
