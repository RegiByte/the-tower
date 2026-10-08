---
{
  "type": "decision",
  "name": "One design system, served from one module",
  "summary": "Both renderers speak one visual language, Wayfinding on paper, whose tokens, faces, terminal theme and sky live in src/shared/design.ts; colour is attention, computed on the board.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/shared/design.ts", "hub/src/shared/design.ts#terminalTheme", "hub/src/shared/design.ts#designCss", "hub/src/shared/design.ts#skyAt", "hub/src/shared/design.ts#documentCss", "hub/src/bridge/board.ts", "hub/src/tower/server.ts#design", "hub/renderers/page/index.html", "hub/src/tower/tower.js", "hub/renderers/tower3d/src/outside.ts", "hub/renderers/tower3d/src/cards.ts#WORLD", "hub/renderers/tower3d/src/ui.ts", "hub/renderers/tower3d/src/toon.ts#loadFaces", "hub/src/shared/design.ts#projectTones", "hub/renderers/tower3d/src/sign.ts#paintSign", "hub/renderers/tower3d/src/palette.ts#floorPalette", "hub/scripts/contrast.ts"]
}
---
**Problem.** The tower page and Tower 3D looked generic and unlike each other: a warm toy world under
dark-navy dev-tool panels, all monospace, eight equally loud status colours. Colours were defined three times
(the page's CSS, Tower 3D's CSS, `palette.ts`), and the sky's keyframes lived only in Tower 3D.

**Why.** The tower is used all day: it should be calm to look at for hours, and one language for both
renderers grows as components are added.

**How.** Direction *Wayfinding* warmed with paper tones: paper and ink chrome, floors as signs with the
project as a transit-line band, Overpass for signage, Atkinson Hyperlegible for text, JetBrains Mono for
terminals, and a terminal that is a block of the ink colour.
- [`design.ts`](ref:hub/src/shared/design.ts) holds every token as plain data, plus the xterm theme, the faces
  and the sky through the day ([`skyAt`](ref:hub/src/shared/design.ts#skyAt)). It imports nothing, so it runs
  in Node, in the browser and in Tower 3D's bundle.
- The tower serves it three ways ([`design`](ref:hub/src/tower/server.ts#design)): `/design.css`
  ([`designCss`](ref:hub/src/shared/design.ts#designCss): faces, `--` variables and the shared components:
  lamp, pill, chip, meter, floor sign and the attention classes), `/design.js` (the module
  itself, types stripped by esbuild per request) and `/fonts/<file>` from the `@fontsource` packages. All three
  answer any origin: a framed shelf page has an opaque origin, and fonts and modules load only with CORS.
- **Colour is attention.** Each board card carries `attention` (`needs | ready | working | quiet | broken`),
  derived in the bridge from status and whether it holds something unread ([`board`](ref:hub/src/bridge/board.ts)):
  needs is a screen or a question, ready an answer nobody has read yet (whoever it waits on, [[waiting-on-you]]),
  working is booting or at work, broken is failed or lost. Red is kept for what needs a hand; an answer ready is a
  calm green (`ready`, enamel text on it), and a failure keeps its own colour (2026-10-07, [[attention-list]]). Renderers
  colour by it and never derive it; the status word keeps the exact state. Only needs blinks; a `watching` lamp breathes ([[watching-status]]); and with `prefers-reduced-motion` every animation in
  `design.css` runs once.
- **Two schemes, one set of roles.** `palettes.light` is a soft parchment (bright white paper tired the eyes over
  long sessions), `palettes.dark` a deep green-grey; both fill the same roles, `ink` for text and `enamel` for dark
  surfaces (terminals, buildings), so components never name a scheme. `designCss` follows the system's
  appearance unless the root carries `data-scheme`; the settings popover offers system, light and dark ([[settings-and-tips]]), kept
  in localStorage by `tower.js`, and re-themes open terminals ([`terminalTheme`](ref:hub/src/shared/design.ts#terminalTheme)).
  The choice reaches framed shelf pages as a `scheme` message ([[renderer-api]]), so Tower 3D's panels follow it;
  `url` entries get it too, so an app the tower frames can follow it with a copy of the palette.
- **Panels follow the scheme; the world doesn't.** Tower 3D's DOM chrome (HUD, prompt card, panels, elevator
  list, directory, toasts) uses the shared components in the viewer's scheme. Everything drawn into the scene
  (tags, bubbles, video-wall labels, lamps, monitors, signs) is a thing in the building and keeps one palette,
  [`WORLD`](ref:hub/renderers/tower3d/src/cards.ts#WORLD) = `palettes.light`, painted once: the world has its
  own light (the sky by the clock), and a lamp's colour means one thing whatever the panels show. Canvas text
  waits for the faces ([`loadFaces`](ref:hub/renderers/tower3d/src/toon.ts#loadFaces)). Text on an attention
  colour is a token too (`onNeeds`, `onReady`… per scheme, `--on-needs` in CSS), read by the CSS and the canvas alike; a rendered markdown document's
  style is [`documentCss`](ref:hub/src/shared/design.ts#documentCss), shared by both renderers' readers.
- Project tones are mixed from the config colour in CSS (`color-mix` in oklab with ink or panel), never stored.
  A floor sign is a plate tinted by its project (a wash of the colour on panel, edged in it, the name in it
  darkened by ink), so it follows the scheme like any panel; an enamel sign was the one dark block left on
  parchment and read as an unfinished light theme. The skyline home's buildings keep enamel signs, plates on
  an ink facade. Surfaces without CSS (canvas, WebGL) get the same mixes from
  [`projectTones`](ref:hub/src/shared/design.ts#projectTones), an oklab mix in JS, so Tower 3D's signs in the
  building ([`paintSign`](ref:hub/renderers/tower3d/src/sign.ts#paintSign)) are the page's sign in `WORLD`.
  "The Tower" in the building is display caps on an enamel plate.
- **Diffs and code** (2026-10-07). `added` and `removed` stay the text and mark colours; behind a changed line's
  code each scheme has its own `addedWash` and `removedWash`, and deeper `addedGutter` and `removedGutter` behind
  its numbers. The first version mixed 16% of `added` into panel, and on parchment a mid-tone mixed into a mid-tone
  read as mud. Code's syntax has eight `syn*` colours per scheme (keyword, string, number, comment, title, type,
  attribute, regexp), each chosen to keep 4.5:1 on panel and on both washes (comments in light 4.6:1 at worst), ink
  staying the default; [[shared-panels]] maps highlight.js classes onto them.
- **Contrast** (2026-10-08). Every pair the renderers draw reaches WCAG AA in both schemes: 4.5:1 for text, 3:1 for a
  form field's edge and a focus ring. `faint`, a text tier that measured 2.1 to 2.8:1, was two roles: it is now text
  at 4.5:1 or more on wall, panel and panel-2, with `muted` darkened (light) or brightened (dark) to about 7:1 on panel
  so the three tiers stay apart (light 10.2 / 7.1 / 5.2), and `deco`, faint's old tone, for what is never read (carets,
  dividers, a missing project colour). The five attention colours stay fills; each has a text tone of the same hue
  (`needsText`, `readyText`, `workingText`, `brokenText`, the fill itself where it already passes, set as `--c-text` by
  the attention classes) and a per-scheme text on it (`on*`: dark `needs` takes enamel, white measured 3.36). The fills
  moved only where text on them failed: light `needs` 4% darker, dark `broken` 4.5%. `accent`, `added` and `removed`
  darkened in light, their uses being text. `lineStrong` edges form fields at 3:1 (`line` divides, 1.4:1). A project's
  focus ring and selected edge mix the colour with ink by the scheme's `pEdgeMix` (light 50%, dark the colour itself),
  since config colours are picked for dark. Shifts are toward black (light) or white (dark) in oklab, which keeps each
  hue. Every pair is data in [`contrast.ts`](ref:hub/scripts/contrast.ts): `npm run tool:contrast` measures them
  all and fails on one under AA, so a token change is re-measured before it lands.

**Alternatives considered.** Paper & Ink alone (charming beside the 3D, noisy in dense lists, reads as
agent-office); Plant Floor, after Satisfactory (handsome but the most generic); a Sims skin (EA trade dress);
keeping the old dark theme warmer (doesn't fix generic). Following the clock for the scheme: the UI would change under you mid-session.
Tower 3D's world following the scheme too: every canvas label would repaint on a toggle, and a sign in the
building would change with the viewer's OS appearance. Fonts committed as woff2 files: rejected for the
`@fontsource` packages, which pin versions and carry the OFL licences with no binaries in git.

**Impact.** A renderer or shelf page gets the look by linking `/design.css`, or importing `/design.js` for
data such as the terminal theme and the sky. Tower 3D bundles the same module for its sky, its panels' terminal
and its world palette. Tower 3D's floors follow it too: neutral warm planes, the project colour
only as accents (`floorPalette`), as the TS4 research found (large planes muted, colour on small countable things).
