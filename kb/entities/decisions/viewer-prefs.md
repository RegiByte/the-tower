---
{
  "type": "decision",
  "name": "A viewer's appearance is one record, kept per browser",
  "summary": "Scheme, the text, heading and code faces (any installed face, by name), the terminal's size, motion, contrast and text size are one record, tower.prefs, that tower.js keeps in the viewer's browser, puts on every page's root before it paints, syncs across tabs and relays to framed pages; the settings popover draws it from data, and terminals draw in its face and size, measured in place.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/src/shared/prefs.ts",
    "hub/src/shared/prefs.ts#PREFS_DEFAULT",
    "hub/src/shared/prefs.ts#reducedMotion",
    "hub/src/tower/tower.js",
    "hub/src/tower/served.ts#towerClient",
    "hub/src/shared/settings.ts#PREF_SECTIONS",
    "hub/src/shared/settings.ts#prefSections",
    "hub/src/shared/settings.ts#wirePrefs",
    "hub/src/shared/settings.ts#faceInstalled",
    "hub/src/shared/terminal.ts",
    "hub/src/shared/terminal.ts#fitSize",
    "hub/src/shared/terminal.ts#cellOf",
    "hub/src/shared/design.ts#reduced",
    "hub/src/shared/design.ts#designCss",
    "hub/src/shared/shelf-page.ts",
    "hub/renderers/page/index.html",
    "hub/renderers/tower3d/src/term.ts",
    "hub/renderers/tower3d/src/main.ts#paintSettings"
  ],
  "links": [
    { "to": "settings-and-tips", "verb": "extends", "carries": "the popover's appearance sections, drawn from descriptors and wired once" },
    { "to": "design-system", "verb": "uses", "carries": "the shipped faces each stack ends in, the contrast and motion rules of /design.css" },
    { "to": "renderer-api", "verb": "extends", "carries": "tower.prefs, the prefs message and verb of a framed page" },
    { "to": "renderer-is-disposable", "verb": "follows", "carries": "no appearance lives in a renderer: tower.js applies it, shared modules draw and wire it" }
  ]
}
---
**Problem.** The scheme was the one appearance setting, with its own key (`tower.scheme`), attribute, `storage`
listener and postMessage verb. Every further setting (a font, the terminal's size, motion, contrast) would have
needed another copy of that plumbing in `tower.js` and new wiring in each renderer's popover. The terminal's face
and size were constants in each renderer (`type.mono`, a drive font of 13 px in the page and 14 in Tower 3D), and
the size a watched terminal fits at assumed JetBrains Mono's proportions (0.6 × 1.2 of the font size), which is off
for any other face and for JetBrains Mono's own line height (1.29).

**Why.** Appearance is how one person likes to read, not what the tower is: the user's decision is that it is per
viewer, never the config. A per-browser record also needs nothing new stored by the system: it lives where
`tower.store` lives ([[logs-are-facts]] keeps its three stores). Every renderer and every framed page must follow it
with no work of its own ([[renderer-is-disposable]]).

**How.**
- *The record* ([`prefs.ts`](ref:hub/src/shared/prefs.ts), served as `/prefs.js`): `scheme`, `ui`, `display`,
  `mono`, `termSize`, `motion` (`''`, `reduce`, `full`), `contrast` (`''`, `more`), `scale` (the text size in percent
  of the browser's: 90, 100, 125 or 150, 100 by default; API 1.17). An empty field follows the
  default: the system's scheme, motion and contrast, the shipped face.
- *`tower.prefs`* ([`tower.js`](ref:hub/src/tower/tower.js)): `get()`, `set(patch)`, `on(fn)` and `attributes()`.
  Whoever writes it (storage, a framed page, `set`), the record is taken in normalized: each choice one of
  `PREF_CHOICES`, each face a name, the size a whole number within `TERM_SIZES`, anything else the default; and
  `attributes()` escapes every value it writes. At the tower's origin it is kept in localStorage `tower.prefs` and synced across tabs by the `storage` event;
  a viewer's earlier `tower.scheme` carries over as the record's scheme. Framed, `set` sends
  `{t: 'tower', verb: 'prefs', prefs}` and the framing page keeps it and answers with `{t: 'prefs', prefs}`, as the
  scheme went before. `tower.js` applies it on the root: `data-scheme`, `data-motion` and `data-contrast`, and each
  picked face at the head of its stack (`--ui`, `--display`, `--mono`), ending in the shipped faces, and the text size
  as `--scale`, a factor `/design.css` multiplies the root's font size by, so every size of the type scale follows it
  ([[design-system]]); terminals keep `termSize`. Both renderers
  load `tower.js` in their head, so the root is set before the first paint. `attributes()` writes the same as html
  for a document drawn in a frame without scripts (a brief, a shown markdown file). The defaults, the generic family
  names and the shipped stacks are filled into the script from `prefs.ts` and `design.ts` as it is served
  ([`towerClient`](ref:hub/src/tower/served.ts#towerClient)), so they are written once.
- *Faces by name.* The tower runs on loopback in the viewer's own browser, so any face installed on the computer
  works by name, with no file served. A browser lists no installed faces:
  [`faceInstalled`](ref:hub/src/shared/settings.ts#faceInstalled) measures text in the face against each generic
  family; the popover suggests only installed faces and says when a typed one is missing (the shipped face shows).
- *The popover from data*: [`PREF_SECTIONS`](ref:hub/src/shared/settings.ts#PREF_SECTIONS) describes each setting by
  kind (a segmented choice, a face, a size), [`prefSections`](ref:hub/src/shared/settings.ts#prefSections) draws
  Theme, Type and Accessibility, and [`wirePrefs`](ref:hub/src/shared/settings.ts#wirePrefs) wires every one: a
  next setting is a descriptor, with no renderer to touch. Each face field is drawn in its own face. A field left by
  pressing another control of the popover changes as that press ends, together with the control's choice, so the
  popover isn't redrawn under the pointer.
- *Terminals* ([`terminal.ts`](ref:hub/src/shared/terminal.ts), `/terminal.js`): a terminal draws in the root's
  `--mono` at `termSize` while its viewer drives it, so a bigger font gives the session fewer columns and rows (the
  PTY has one size); a watched one fits the PTY at a size up to `termSize`
  ([`fitSize`](ref:hub/src/shared/terminal.ts#fitSize)), from cells measured in the face itself as xterm measures them
  ([`cellOf`](ref:hub/src/shared/terminal.ts#cellOf)), each row in whole device pixels as xterm draws it. On a change, each renderer loads the face, sets it on its open
  terminals, and fits them again: a driving one resizes the PTY. The tower page's session and shells and Tower 3D's
  desk and kiosk terminals do.
- *Motion and contrast* in `/design.css`: [`reduced`](ref:hub/src/shared/design.ts#reduced) writes a rule for
  `data-motion=reduce`, or for the system's reduce setting unless the root says `full`; the tooltip's fade uses it,
  and Tower 3D's camera reads [`reducedMotion`](ref:hub/src/shared/prefs.ts#reducedMotion). More contrast, asked on the
  root or by the system, moves muted and faint text toward ink, gives what is never read faint's tone and draws lines
  as strong as a field's edge, in either scheme.
- *Tower 3D*: its HTML panels follow the record (the same root and stylesheet); the text it paints on canvas in the
  world keeps the shipped faces, as art.
- *The old names stay* until a major: `tower.schemeChoice()` and `tower.chooseScheme(c)` read and set the record's
  scheme, the framed `scheme` verb is kept, and `themeSection` still draws with `data-scheme-choice`; all are marked
  `@deprecated`. A `url` shelf entry still gets only `{t: 'scheme'}`.

**Alternatives considered.**
- *Appearance in the config*: follows the user to another browser and is checked by `tower config check`, but it is
  a viewer's preference, and the user decided per viewer. Config defaults under viewer overrides would add a
  precedence rule to explain; left until asked for.
- *Renderer `settings` in the config*: per renderer and system-wide, where fonts are per viewer and across renderers.
  They stay a renderer's own art or behaviour (Tower 3D's cats).
- *A `tower.store` key*: no change event, and asynchronous framed, where the root must be set before painting and
  terminals read the face synchronously.
- *A face picker listing installed faces* (Local Font Access): Chrome only, behind a permission prompt; a name with
  suggestions works everywhere.
- *Keeping the PTY's columns and scaling a bigger font* for the driver: blurry, and a terminal whose text and cells
  disagree. The honest cost is said in the setting's tip and the terminal's mode line (`cols×rows`).
- *An accent colour*: the user decided none for now; the attention colours carry meaning.
- *Text size as a free number or a slider*: four steps cover the need, and every step is a layout checked to hold;
  past 150% the browser's zoom does the rest.

**Impact.** API 1.13: `tower.prefs`, `/prefs.js`, `/terminal.js`, `PREF_SECTIONS`, `prefSections`, `wirePrefs`,
`faceInstalled` in `/settings.js`, `reduced` in `/design.js`, the `prefs` message and verb. Every page that links
`/design.css` and `/tower.js` gets the viewer's faces, motion and contrast for free; a framed renderer gets them
through the relay. Tower 3D's driving terminal font moves from 14 to the record's 13 px by default.
