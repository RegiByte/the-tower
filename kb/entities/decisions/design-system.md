---
{
  "type": "decision",
  "name": "One design system, served from one module",
  "summary": "Both renderers speak one visual language, Wayfinding on paper, whose tokens, faces, terminal theme and sky live in src/shared/design.ts; colour is attention, computed on the board.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/shared/design.ts", "hub/src/shared/design.ts#size", "hub/src/shared/design.ts#space", "hub/src/shared/design.ts#fonts", "hub/src/shared/design.ts#terminalTheme", "hub/src/shared/design.ts#designCss", "hub/src/shared/design.ts#skyAt", "hub/src/shared/design.ts#documentCss", "hub/src/bridge/board.ts", "hub/src/tower/server.ts#design", "hub/renderers/page/index.html", "hub/src/tower/tower.js", "hub/renderers/tower3d/src/outside.ts", "hub/renderers/tower3d/src/cards.ts#WORLD", "hub/renderers/tower3d/src/ui.ts", "hub/renderers/tower3d/src/toon.ts#loadFaces", "hub/src/shared/design.ts#projectTones", "hub/renderers/tower3d/src/sign.ts#paintSign", "hub/renderers/tower3d/src/palette.ts#floorPalette", "hub/scripts/contrast.ts"]
}
---
**Problem.** The tower page and Tower 3D looked generic and unlike each other: a warm toy world under
dark-navy dev-tool panels, all monospace, eight equally loud status colours. Colours were defined three times
(the page's CSS, Tower 3D's CSS, `palette.ts`), and the sky's keyframes lived only in Tower 3D.

**Why.** The tower is used all day: it should be calm to look at for hours, and one language for both
renderers grows as components are added.

**How.** Direction *Wayfinding* warmed with paper tones: paper and ink chrome, floors as signs with the
project as a transit-line band, Overpass for signage, Atkinson Hyperlegible for text, JetBrains Mono for
terminals, and a terminal that is a block of the ink colour. Overpass's faces leave out `·`, which it
draws with almost no advance, so the next face in the stack draws it.
- [`design.ts`](ref:hub/src/shared/design.ts) holds every token as plain data, plus the xterm theme, the faces
  and the sky through the day ([`skyAt`](ref:hub/src/shared/design.ts#skyAt)). It imports nothing, so it runs
  in Node, in the browser and in Tower 3D's bundle.
- The tower serves it three ways ([`design`](ref:hub/src/tower/server.ts#design)): `/design.css`
  ([`designCss`](ref:hub/src/shared/design.ts#designCss): faces, `--` variables and the shared components:
  lamp, pill, chip, meter, floor sign, the attention classes, and every button's pressed, held and busy states,
  [[press-feedback]]), `/design.js` (the module
  itself, types stripped by esbuild per request) and `/fonts/<file>` from the `@fontsource` packages. All three
  answer any origin: a framed shelf page has an opaque origin, and fonts and modules load only with CORS.
- **Colour is attention.** Each board card carries `attention` (`needs | ready | working | quiet | broken`),
  derived in the bridge from status and whether it holds something unread ([`board`](ref:hub/src/bridge/board.ts)):
  needs is a screen or a question, ready an answer nobody has read yet (whoever it waits on, [[waiting-on-you]]),
  working is booting or at work, broken is failed or lost. Red is kept for what needs a hand; an answer ready is a
  calm green (`ready`, enamel text on it), and a failure keeps its own colour (2026-10-07, [[attention-list]]). Renderers
  colour by it and never derive it; the status word keeps the exact state. Only needs blinks; a `watching` lamp breathes ([[watching-status]]); and with reduced motion (the viewer's `data-motion`, or the system's setting: `reduced`) every animation in
  `design.css` runs once. More contrast (the viewer's `data-contrast`, or the system's) moves muted and faint text
  toward ink and draws lines as strong as a field's edge ([[viewer-prefs]]).
- **Two schemes, one set of roles.** `palettes.light` is a soft parchment (bright white paper tired the eyes over
  long sessions), `palettes.dark` a deep green-grey; both fill the same roles, `ink` for text and `enamel` for dark
  surfaces (terminals, buildings), so components never name a scheme. `designCss` follows the system's
  appearance unless the root carries `data-scheme`; the settings popover offers system, light and dark ([[settings-and-tips]]), kept
  in localStorage by `tower.js` with the rest of the viewer's appearance ([[viewer-prefs]]: the faces of each stack, by name, ahead of the shipped ones), and re-themes open terminals ([`terminalTheme`](ref:hub/src/shared/design.ts#terminalTheme)).
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
- **Type, space and corners** (2026-10-08). Text came in eleven px sizes, the small uppercase label in six variants
  and two faces, spacing in some twenty values, and Overpass was nudged onto its line by hand (`padding-top` of 1 to
  3 px in eight rules); the browser's text size did nothing. Now:
  - *A type scale in rem* ([`size`](ref:hub/src/shared/design.ts#size), `--fs-xs` to `--fs-3xl`: 11, 12, 13, 14, 16,
    20 and 26 px at the browser's default). Every text size of the page, the shared modules and Tower 3D's HTML panels
    is a step; the root's font size is the browser's times the viewer's Text size (`--scale`, [[viewer-prefs]]), so
    both reach every panel. Terminals keep their own size (the Terminal pref) and Tower 3D's canvas its own, as art.
    Sizes moved to the nearest step: 10 px text (kbd, a draft's meta, a move's chord, a worktree's state) is 11, the
    floor; the brand and the bar's callsign 20 (were 19 and 18); glyph buttons 16 (were 15).
  - *A spacing scale in px* ([`space`](ref:hub/src/shared/design.ts#space), `--sp-2xs` to `--sp-3xl`: 2, 4, 6, 8,
    12, 16, 24, 32): text grows with the viewer's size, the space around it stays. Each padding, margin and gap went
    to its nearest step, a tie to the multiple of 4 and else up (10 is 12, 14 is 16), so the page is a little airier.
    Hairlines (1 px) and layout lengths (34 px and up) are not spacing and stay.
  - *One label*, `.eyebrow` (Overpass 800 at `--fs-xs`, .08em, uppercase, `muted`): the settings' sections, the spawn
    form's labels, trays, the side views, the keys sheet's groups, chart captions, a repo's name in Changes, the
    brief's sections and Tower 3D's panel sections.
  - *Overpass's line*: its own ascent and descent (88% and 38%) leave capitals 0.1 em above the middle of a line. Its
    `@font-face` overrides them (98% and 28%, the same total, so ascent less descent is the cap height) and every hand
    nudge is gone. Tower 3D's canvas text draws on the alphabetic line and didn't move (`tool:frames` identical).
  - *Corners* `radius`, `radiusS` (2 px, small marks) and `radiusPill`; *italics are real faces* (Atkinson 400 and 700
    italic, JetBrains Mono 400 italic) where the browser slanted the roman, and weights are the shipped 400 and 700.
  - *Reflow* (the tower page): the sidebar is `20rem` (at most 38% of the width) and under 900 px a rail, opened over
    the main pane by the sidebar key or its » until a worker is picked; when space is short the whole sidebar scrolls,
    its header with it. The worker bar wraps: the callsign and pill keep their row, the actions move below.

**Alternatives considered.** Paper & Ink alone (charming beside the 3D, noisy in dense lists, reads as
agent-office); Plant Floor, after Satisfactory (handsome but the most generic); a Sims skin (EA trade dress);
keeping the old dark theme warmer (doesn't fix generic). Following the clock for the scheme: the UI would change under you mid-session.
Spacing in rem: the whole page would grow with the Text size like a zoom, and a fixed-width sidebar would hold less;
zoom already does that. Steps named by their px value (`--sp-8`): clear to read, but they lie the day the scale
changes. Shrinking Overpass with `size-adjust`: centres it but changes every sign's size; `text-box: trim-both`
isn't in every browser the tower runs in.
Tower 3D's world following the scheme too: every canvas label would repaint on a toggle, and a sign in the
building would change with the viewer's OS appearance. Fonts committed as woff2 files: rejected for the
`@fontsource` packages, which pin versions and carry the OFL licences with no binaries in git.

**Impact.** A renderer or shelf page gets the look by linking `/design.css`, or importing `/design.js` for
data such as the terminal theme and the sky. Tower 3D bundles the same module for its sky, its panels' terminal
and its world palette. Tower 3D's floors follow it too: neutral warm planes, the project colour
only as accents (`floorPalette`), as the TS4 research found (large planes muted, colour on small countable things).
