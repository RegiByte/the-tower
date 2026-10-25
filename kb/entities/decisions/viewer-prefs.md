---
{
  "type": "decision",
  "name": "A viewer's settings: one appearance record, one popover, one tooltip",
  "summary": "Scheme, the text, heading and code faces (any installed face, by name), the terminal's size, motion, contrast and text size are one record, tower.prefs, that tower.js keeps in the viewer's browser, puts on every page's root before it paints, syncs across tabs and relays to framed pages; one settings popover draws it, the ring and the alerts from shared pure views, and one shared tooltip shows any data-tip's text on focus and on a resting hover, through which every renderer explains its controls.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-25",
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
    "hub/src/shared/status-words.ts#ATTENTION_MEANS",
    "hub/src/shared/status-words.ts#statusLegendHtml",
    "hub/src/shared/health.ts#hostState",
    "hub/src/shared/health.ts#HOST_MEANS",
    "hub/src/shared/terminal.ts",
    "hub/src/shared/terminal.ts#fitSize",
    "hub/src/shared/terminal.ts#cellOf",
    "hub/src/shared/design.ts#reduced",
    "hub/src/shared/design.ts#designCss",
    "hub/src/shared/shelf-page.ts",
    "hub/src/shared/changes-panel.ts#scopeHtml",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/src/shared/term-view.ts",
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
the terminal's size, motion, contrast, text size) and the same way to explain a control. Written per renderer, each
new setting is a copy of its storage, its attribute, its frame message and its popover wiring, and each explanation a
`title` that shows late, never on keyboard focus, and differently on every OS.

**Why.** Appearance is how one person likes to read, not what the tower is: the user's decision is that it is per
viewer, never the config. A per-browser record needs nothing new stored by the system: it lives where `tower.store`
lives ([[logs-are-facts]] keeps its three stores). Settings and explanations are drawn alike in every renderer, so
they are written once in shared code and a next renderer gets them by importing and wiring
([[renderer-is-disposable]], [[shared-panels]]).

**How.**
- *The record* ([`prefs.ts`](ref:hub/src/shared/prefs.ts), `/prefs.js`): an empty field follows the default (the
  system's scheme, motion and contrast, the shipped face).
- *`tower.prefs`* ([`tower.js`](ref:hub/src/tower/tower.js)) keeps it in the viewer's localStorage at the tower's
  origin, synced across tabs by the `storage` event; framed, it goes through the framing page, which keeps it and
  relays every change ([[renderer-api]]). Whoever writes it, the record is normalized as it is taken in. `tower.js`
  applies it on the root (`data-scheme`, `data-motion`, `data-contrast`, each picked face at the head of its stack,
  the text size as `--scale`, [[design-system]]); renderers load it in their head, so the root is set before the first
  paint. `attributes()` writes the same for a document drawn in a frame without scripts (a brief, a shown markdown
  file). The defaults and shipped stacks are filled into the script as it is served
  ([`towerClient`](ref:hub/src/tower/served.ts#towerClient)).
- *The colour scheme* is the record's `scheme`; `tower.scheme()` and `onScheme` give the scheme drawn, so a page
  linking `/design.css` follows the viewer's choice as well as the system. A `url` shelf entry's frame is sent only
  `{t: 'scheme', scheme}` (the choice is not private), so a separately served app can follow it.
- *Faces by name.* The tower runs in the viewer's own browser on loopback, so any face installed on the computer
  works by name, with no file served. A browser lists no installed faces:
  [`faceInstalled`](ref:hub/src/shared/settings.ts#faceInstalled) measures text in the face against each generic
  family, and the popover suggests only installed faces.
- *The settings popover* ([`settings.ts`](ref:hub/src/shared/settings.ts), `/settings.js`): sections as pure views
  composed by [`settingsHtml`](ref:hub/src/shared/settings.ts#settingsHtml) from those a renderer offers (alerts, the
  ring in [`soundSection`](ref:hub/src/shared/settings.ts#soundSection), the appearance, markdown).
  [`PREF_SECTIONS`](ref:hub/src/shared/settings.ts#PREF_SECTIONS) describes each appearance setting by kind;
  [`prefSections`](ref:hub/src/shared/settings.ts#prefSections) draws them and
  [`wirePrefs`](ref:hub/src/shared/settings.ts#wirePrefs) wires them, so a next setting is a descriptor with no
  renderer to touch. It is a native `popover` (light dismiss, top layer, not a modal). Tower 3D adds its own section
  ([`paintSettings`](ref:hub/renderers/tower3d/src/main.ts#paintSettings)) and offers no alerts: the page framing it
  sends the notifications.
- *Terminals* ([`terminal.ts`](ref:hub/src/shared/terminal.ts), [`term-view.ts`](ref:hub/src/shared/term-view.ts))
  draw in `--mono` at `termSize` while their viewer holds the PTY, so a bigger font gives the session fewer columns
  and rows (the PTY has one size); a watching one fits the PTY at a size up to `termSize`
  ([`fitSize`](ref:hub/src/shared/terminal.ts#fitSize)), from cells measured in the face itself
  ([`cellOf`](ref:hub/src/shared/terminal.ts#cellOf)).
- *Motion and contrast* live in `/design.css` ([`reduced`](ref:hub/src/shared/design.ts#reduced),
  [`designCss`](ref:hub/src/shared/design.ts#designCss)): the root's choice overrides the system's. Tower 3D's camera
  reads [`reducedMotion`](ref:hub/src/shared/prefs.ts#reducedMotion); the text it paints on canvas in the world keeps
  the shipped faces, as art.
- *One tooltip* ([`tips.ts`](ref:hub/src/shared/tips.ts), `/tips.js`): [`watchTips`](ref:hub/src/shared/tips.ts#watchTips)
  puts one element in the top layer and shows any `data-tip`'s text at once on keyboard focus and on a resting hover,
  with `aria-describedby` while shown. [`placeNear`](ref:hub/src/shared/tips.ts#placeNear) keeps it beside its
  element inside the viewport, and [`placeOnOpen`](ref:hub/src/shared/tips.ts#placeOnOpen) stands a popover by its
  button the same way.
- *Every explanation through it*: renderers and shared views say what a control does with `data-tip`, a control with
  no visible name carries an `aria-label`. `title` stays only where no tip can show: an `<iframe>`'s accessible name,
  a native `<option>` ([`scopeHtml`](ref:hub/src/shared/changes-panel.ts#scopeHtml)) and a markdown link's title in framed
  documents that run no `watchTips`. The status counts' and host lamp's words live in `/cards.js`
  ([`ATTENTION_MEANS`](ref:hub/src/shared/status-words.ts#ATTENTION_MEANS),
  [`statusLegendHtml`](ref:hub/src/shared/status-words.ts#statusLegendHtml), [`hostState`](ref:hub/src/shared/health.ts#hostState),
  [`HOST_MEANS`](ref:hub/src/shared/health.ts#HOST_MEANS)), read by their tooltips and the `?` sheet alike.

**Alternatives considered.**
- *Appearance in the config*: follows the user to another browser, but it is a viewer's preference. Config defaults
  under viewer overrides would add a precedence rule; left until asked for.
- *A `tower.store` key for the record*: no change event, and asynchronous framed, where the root must be set before
  painting and terminals read the face synchronously.
- *Keeping the PTY's columns and scaling a bigger font* for the driver: blurry, and a terminal whose text and cells
  disagree. The cost is said in the setting's tip and the terminal's mode line.
- *Keeping `title`s, worded better*: shown late, never on focus, styled by the OS. A tooltip in CSS alone is clipped
  by a scrolling parent and can't stay inside the viewport.
- *A face picker listing installed faces* (Local Font Access): Chrome only, behind a permission prompt.

**Impact.** Every page that links `/design.css` and `/tower.js` gets the viewer's scheme, faces, motion and contrast,
a framed renderer through the relay; a next renderer gets the popover and the tooltips by importing `/settings.js`
and `/tips.js`. A renderer that draws the shared views without `watchTips` shows only their labels.
