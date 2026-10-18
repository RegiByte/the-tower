---
{
  "type": "decision",
  "name": "A viewer's settings: one appearance record, one popover, one tooltip",
  "summary": "Scheme, the text, heading and code faces (any installed face, by name), the terminal's size, motion, contrast and text size are one record, tower.prefs, that tower.js keeps in the viewer's browser, puts on every page's root before it paints, syncs across tabs and relays to framed pages; one settings popover draws it, the ring and the alerts from shared pure views, and one shared tooltip shows any data-tip's text on focus and on a resting hover, through which every renderer explains its controls.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/src/shared/prefs.ts",
    "hub/src/shared/prefs.ts#PREFS_DEFAULT",
    "hub/src/shared/prefs.ts#reducedMotion",
    "hub/src/tower/tower.js",
    "hub/src/tower/served.ts#towerClient",
    "hub/src/shared/settings.ts",
    "hub/src/shared/settings.ts#settingsHtml",
    "hub/src/shared/settings.ts#soundSection",
    "hub/src/shared/settings.ts#PREF_SECTIONS",
    "hub/src/shared/settings.ts#prefSections",
    "hub/src/shared/settings.ts#wirePrefs",
    "hub/src/shared/settings.ts#faceInstalled",
    "hub/src/shared/tips.ts",
    "hub/src/shared/tips.ts#watchTips",
    "hub/src/shared/tips.ts#placeNear",
    "hub/src/shared/tips.ts#placeOnOpen",
    "hub/src/shared/cards.ts#ATTENTION_MEANS",
    "hub/src/shared/cards.ts#statusLegendHtml",
    "hub/src/shared/cards.ts#hostState",
    "hub/src/shared/cards.ts#HOST_MEANS",
    "hub/src/shared/terminal.ts",
    "hub/src/shared/terminal.ts#fitSize",
    "hub/src/shared/terminal.ts#cellOf",
    "hub/src/shared/design.ts#reduced",
    "hub/src/shared/design.ts#designCss",
    "hub/src/shared/shelf-page.ts",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/renderers/tower3d/src/term.ts",
    "hub/renderers/tower3d/src/ui.ts#hudHtml",
    "hub/renderers/tower3d/src/main.ts#paintSettings"
  ],
  "links": [
    { "to": "shared-panels", "verb": "follows", "carries": "pure views, one stylesheet, data attributes each renderer wires" },
    { "to": "attention-list", "verb": "uses", "carries": "the ring setting in tower.store and the sounds as scores" },
    { "to": "design-system", "verb": "uses", "carries": "the shipped faces each stack ends in, the contrast and motion rules of /design.css" },
    { "to": "renderer-api", "verb": "extends", "carries": "tower.prefs, the prefs message and verb of a framed page" },
    { "to": "renderer-is-disposable", "verb": "follows", "carries": "no setting lives in a renderer: tower.js applies it, shared modules draw and wire it" }
  ]
}
---
**Problem.** Every renderer needs the same settings (how a wait rings, notifications, the colour scheme, faces,
the terminal's size, motion, contrast, text size) and the same way to explain a control. Written per renderer,
each new setting is a copy of its storage, its attribute, its frame message and its popover wiring in every
renderer, and each explanation a `title` that shows late, never on keyboard focus, and differently on every OS.

**Why.** Appearance is how one person likes to read, not what the tower is: the user's decision is that it is per
viewer, never the config. A per-browser record needs nothing new stored by the system: it lives where
`tower.store` lives ([[logs-are-facts]] keeps its three stores). Settings and explanations are drawn alike in every
renderer, so they are written once in shared code and a next renderer gets them by importing and wiring
([[renderer-is-disposable]], [[shared-panels]]).

**How.**
- *The record* ([`prefs.ts`](ref:hub/src/shared/prefs.ts), served as `/prefs.js`): `scheme`, `ui`, `display`,
  `mono`, `termSize`, `motion`, `contrast`, `scale`; an empty field follows the default (the system's scheme, motion
  and contrast, the shipped face).
- *`tower.prefs`* ([`tower.js`](ref:hub/src/tower/tower.js)): `get()`, `set(patch)`, `on(fn)` and `attributes()`.
  Whoever writes it (storage, a framed page, `set`), the record is taken in normalized to `PREF_CHOICES` and
  `TERM_SIZES`, and `attributes()` escapes what it writes. At the tower's origin it is kept in localStorage
  `tower.prefs` and synced across tabs by the `storage` event; a viewer's earlier `tower.scheme` key carries over as
  the record's scheme. Framed, `set` sends `{t: 'tower', verb: 'prefs', prefs}`, and the framing page keeps it and
  answers with `{t: 'prefs', prefs}` ([[renderer-api]]). `tower.js` applies it on the root (`data-scheme`,
  `data-motion`, `data-contrast`, each picked face at the head of its stack `--ui`, `--display`, `--mono`, ending in
  the shipped faces, and the text size as `--scale`, which `/design.css` multiplies every size of the type scale by,
  [[design-system]]). Renderers load `tower.js` in their head, so the root is set before the first paint;
  `attributes()` writes the same for a document drawn in a frame without scripts (a brief, a shown markdown file).
  The defaults and shipped stacks are filled into the script from `prefs.ts` and `design.ts` as it is served
  ([`towerClient`](ref:hub/src/tower/served.ts#towerClient)).
- *The colour scheme* is the record's `scheme`: `tower.scheme()` is the scheme drawn (`light` or `dark`, the system's
  when the viewer chose none) and `onScheme` follows it, so a page linking `/design.css` follows the viewer's choice
  as well as the system. A `url` shelf entry's frame is sent `{t: 'scheme', scheme}` on each load and change, its only
  message (the choice is not private), so a separately served app can set its own `data-scheme`.
  `tower.schemeChoice()`, `tower.chooseScheme(c)`, the framed `scheme` verb and `themeSection` (with
  `data-scheme-choice`) stay `@deprecated` until a major.
- *Faces by name.* The tower runs in the viewer's own browser on loopback, so any face installed on the computer
  works by name, with no file served. A browser lists no installed faces:
  [`faceInstalled`](ref:hub/src/shared/settings.ts#faceInstalled) measures text in the face against each generic
  family; the popover suggests only installed faces and says when a typed one is missing.
- *The settings popover* ([`settings.ts`](ref:hub/src/shared/settings.ts), `/settings.js`): sections as pure views
  composed by [`settingsHtml`](ref:hub/src/shared/settings.ts#settingsHtml) from those a renderer offers:
  `alertsSection` (the browser's notification permission in words), [`soundSection`](ref:hub/src/shared/settings.ts#soundSection)
  (the ring, kept in `tower.store`, [[attention-list]]), the appearance ([`PREF_SECTIONS`](ref:hub/src/shared/settings.ts#PREF_SECTIONS)
  describes each setting by kind; [`prefSections`](ref:hub/src/shared/settings.ts#prefSections) draws Theme, Type and
  Accessibility; [`wirePrefs`](ref:hub/src/shared/settings.ts#wirePrefs) wires them all, so a next setting is a
  descriptor with no renderer to touch) and `markdownSection`. It is a native `popover` (light dismiss, top layer,
  not a modal) behind `ICON.settings`, an inline SVG from `/icons.js`. Tower 3D adds its own Lighting section and
  offers no Alerts: it sends no notifications (the page framing it does).
- *Terminals* ([`terminal.ts`](ref:hub/src/shared/terminal.ts), `/terminal.js`) draw in the root's `--mono` at
  `termSize` while their viewer drives them, so a bigger font gives the session fewer columns and rows (the PTY has
  one size); a watched one fits the PTY at a size up to `termSize` ([`fitSize`](ref:hub/src/shared/terminal.ts#fitSize)),
  from cells measured in the face itself as xterm measures them ([`cellOf`](ref:hub/src/shared/terminal.ts#cellOf)).
  On a change, each renderer sets the face on its open terminals and fits them again: a driving one resizes the PTY.
- *Motion and contrast* in `/design.css`: [`reduced`](ref:hub/src/shared/design.ts#reduced) writes a rule for
  `data-motion=reduce`, or for the system's setting unless the root says `full`; Tower 3D's camera reads
  [`reducedMotion`](ref:hub/src/shared/prefs.ts#reducedMotion). More contrast, asked on the root or by the system,
  moves muted and faint text toward ink and strengthens lines, in either scheme. Tower 3D's HTML panels follow the
  record; the text it paints on canvas in the world keeps the shipped faces, as art.
- *One tooltip* ([`tips.ts`](ref:hub/src/shared/tips.ts), `/tips.js`): [`watchTips`](ref:hub/src/shared/tips.ts#watchTips)
  puts one element in the top layer (a manual popover, so it shows above an open popover or a modal) and shows any
  `data-tip`'s text at once on keyboard focus and on hover once the pointer rests with no button held (at once
  within a warm window after one hides, so running along a row of controls doesn't wait at each), until the pointer
  or focus leaves, Esc, a press, a scroll or a redraw; it sets `aria-describedby` while shown, and fades unless
  motion is reduced. [`placeNear`](ref:hub/src/shared/tips.ts#placeNear) stands it beside its element inside the
  viewport, and [`placeOnOpen`](ref:hub/src/shared/tips.ts#placeOnOpen) stands the settings popover by its button
  the same way.
- *Every explanation through it*: the renderers and the shared views say what a control does with `data-tip`, a
  control with no visible name carries an `aria-label`, and a tip that repeats a visible name has none. `title` stays
  only where no tip can show: an `<iframe>`'s accessible name and a markdown link's title, drawn also into framed
  documents that run no `watchTips`.
- *Words* in `/cards.js`: [`ATTENTION_MEANS`](ref:hub/src/shared/cards.ts#ATTENTION_MEANS), `WAITING_MEANS` and
  `ON_DUTY_MEANS` say what the status counts count, read by their tooltips and the `?` sheet's legend
  ([`statusLegendHtml`](ref:hub/src/shared/cards.ts#statusLegendHtml)). The host lamp,
  [`hostState`](ref:hub/src/shared/cards.ts#hostState), is up, outdated or down, with its word and
  [`HOST_MEANS`](ref:hub/src/shared/cards.ts#HOST_MEANS) as its tooltip.

**Alternatives considered.**
- *Appearance in the config*: follows the user to another browser, but it is a viewer's preference, and the user
  decided per viewer. Config defaults under viewer overrides would add a precedence rule; left until asked for.
- *A `tower.store` key for the record*: no change event, and asynchronous framed, where the root must be set before
  painting and terminals read the face synchronously.
- *Keeping the PTY's columns and scaling a bigger font* for the driver: blurry, and a terminal whose text and cells
  disagree. The cost is said in the setting's tip and the terminal's mode line.
- *Keeping `title`s, worded better*: shown after a long delay, never on focus, styled by the OS. A tooltip in CSS
  alone is clipped by a scrolling parent and can't stay inside the viewport.
- *A face picker listing installed faces* (Local Font Access): Chrome only, behind a permission prompt.

**Impact.** Every page that links `/design.css` and `/tower.js` gets the viewer's scheme, faces, motion and
contrast for free, a framed renderer through the relay; a third renderer gets the popover and the tooltips by
importing `/settings.js` and `/tips.js`. A renderer that draws the shared views without `watchTips` shows none of
their explanations, only their labels.
