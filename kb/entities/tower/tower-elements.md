---
{
  "type": "library",
  "name": "The tower's elements (/lib-ui/)",
  "summary": "The tower-* custom elements a page or an extension's client draws as tags, served at /lib-ui/<module>.js: each builds the UI SDK's ui-* parts inside itself, so menus and comboboxes get the SDK's keyboard, focus, placement and dismissal while views keep drawing html as strings through the morph.",
  "in": "tower-core",
  "reviewed": "2026-11-18",
  "refs": ["hub/src/lib-ui/menu.ts#elements", "hub/src/lib-ui/combobox.ts#elements", "hub/src/lib-ui/sdk.ts#relay", "hub/src/lib-ui/sdk.ts#ElementContract", "hub/src/lib-ui/look.css", "hub/src/tower/served.ts#uiSdkModule", "hub/src/tower/served.ts#servedModule", "hub/src/tower/served.ts#libUiUrls", "hub/src/shared/elements.ts#subjectHtml", "hub/src/shared/elements.ts#comboboxHtml", "hub/src/shared/elements.ts#subjectAreaHtml", "hub/src/shared/elements.ts#subjectButtonHtml", "hub/src/shared/dom-id.ts#domId", "hub/src/lib/elements.ts", "hub/test/lib-ui.test.ts", "hub/test/library.ts#elementsOf", "hub/scripts/lib-ui-check.ts", "hub/docs/extending.md"]
}
---
Each module of `src/lib-ui/` is served at `/lib-ui/<module>.js`
([`servedModule`](ref:hub/src/tower/served.ts#servedModule)); importing it defines its elements:
[`/lib-ui/menu.js`](ref:hub/src/lib-ui/menu.ts#elements) `<tower-menu>`, `<tower-menu-button>` and
`<tower-menu-area>`, [`/lib-ui/combobox.js`](ref:hub/src/lib-ui/combobox.ts#elements) `<tower-combobox>`. Why they
wrap the SDK this way is [[tower-elements-wrap-the-sdk]].

- **The outer tag is the contract.** Its attributes, properties, events and custom states, each listed with what it
  means in the module's `elements` export ([`ElementContract`](ref:hub/src/lib-ui/sdk.ts#ElementContract)).
  `served-exports.json` lists them under `libUi` with the minor each arrived in, read in node by
  [`elementsOf`](ref:hub/test/library.ts#elementsOf), and `docs/extending.md`'s elements table is generated from the
  same data ([[renderer-api-contract]]). The `ui-*` parts inside are implementation: never listed, written or styled
  outside `/lib-ui/`.
- **Built at connect, nothing written on itself.** An element builds its parts once and keeps them across a move;
  inputs are attributes a pure render writes (plain, mapped into the part they mean, or parsed: `options` as JSON),
  properties only for what no render holds (a menu's `items`, the SDK's `api`). It shows its own state through
  `ElementInternals` (`tower-menu-area:state(open)`), so a page marks it `data-owned="children"` and the morph
  ([[renderer-shared-modules]]) loses nothing. Its SDK events are fired again on it, bubbling and cancelable
  ([`relay`](ref:hub/src/lib-ui/sdk.ts#relay)), so a core view listens on its host.
- **One subject menu per page.** `<tower-menu>` holds the SDK's data menu; each subject's area and ⋯ button name it by
  `for` and the subject by `payload`, and its owner sets `items` on `payloadchange`. The area handles `contextmenu`
  and a long press itself, by the SDK's own context trigger's rules (a finger may move 10 px, the browser's long-press
  menu is refused while it is down, the click its release makes after a hold is eaten) without binding the SDK's hold,
  which writes on the element it binds, and opens the menu at the point through the SDK's controller; the menu marks the areas of
  the subject it is open for, however it opened. An area is no tab stop of its own: the keyboard reaches the subject
by its ⋯. A checkbox item is drawn with its check at its end, from a `<template>` the menu holds for the SDK's data
menu to copy, and its `checkedchange`, which doesn't bubble, is fired again on the menu with the item's value.
- **One SDK core.** `/lib-ui/sdk.js` is internal: the SDK entries in use bundled once, packages inlined, minified
  ([`uiSdkModule`](ref:hub/src/tower/served.ts#uiSdkModule)), never through `/vendor/`, since popups on two cores
  can't share a layer stack. It adopts [`look.css`](ref:hub/src/lib-ui/look.css), the tower's look for the parts,
  which reads the SDK's `--ui-*` variables, each set on the outer element from a design token.
- **A combobox named from outside.** `labelledby` names a label the form draws itself (an eyebrow, an optional mark, a
  hint): the element then draws no label part and points its input's `aria-labelledby` at it. A `<label>` around it
  would take a press in its list for one on the box.
- **A combobox keeps a form's keys as a native select.** Open, typing highlights the first match (the SDK's
  `auto-highlight`), and an Enter, ⌘↵ included, chooses the highlighted option or does nothing, then stops at the
  element, so a form's submit key fires only while it is closed. Leaving without choosing shows the chosen label again;
  the half-typed query is not kept for the next opening, which the SDK resets to the chosen label.
- **Strings for core views.** A core view draws an element through `/lib/elements.js`
  ([`comboboxHtml`](ref:hub/src/shared/elements.ts#comboboxHtml), [`subjectHtml`](ref:hub/src/shared/elements.ts#subjectHtml)),
  which imports nothing of `/lib-ui/`. Each builder takes a place and a key and derives its ids by the id rule,
  [`domId`](ref:hub/src/shared/dom-id.ts#domId) of `/lib/morph.js`: `<place>:<key>`, the place words of `[a-z0-9-]`
  named by the code, the key from data with whitespace and `%` percent-encoded, a part in the place
  ([`subjectAreaHtml`](ref:hub/src/shared/elements.ts#subjectAreaHtml) is `place:key`,
  [`subjectButtonHtml`](ref:hub/src/shared/elements.ts#subjectButtonHtml) `place/menu:key`, a combobox `place:name`).
  A redraw's `keepingFocus` finds a control inside an element again by the element's id, since the SDK writes the
  same attributes on every part it builds. [`lib-ui.test.ts`](ref:hub/test/lib-ui.test.ts) holds the direction over the
  served module graph: nothing in `/lib/`, `src/shared` or a core view reaches `/lib-ui/`, and a `/lib-ui/` module
  imports only `/lib/` and the SDK bundle, which imports nothing.

**The standard for the next element.** An outer `tower-<name>` in `src/lib-ui/<name>.ts` that builds its `ui-*` tree
at connect, writes no attribute on itself (states through `ElementInternals`), and fires again the SDK events it
promises; its SDK entry is added to `sdk.ts` and its parts' look to `look.css`, on tokens alone. Every input is an
attribute a pure render can write; properties only for what no render holds. Pages mark it `data-owned="children"`,
and a string builder in `/lib/` serves core views. Its `elements` data says every name with its meaning,
`served:update` lists it, and its `--ui-*` variables join the list in `docs/extending.md`. It passes the morph proof:
[`tool:lib-ui`](ref:hub/scripts/lib-ui-check.ts) redraws the page every 100 ms while typing and while open, in Chrome
and WebKit, and is run on every SDK bump, which is its own commit with the pins exact.

The SDK's own docs and skill ship in `node_modules` at the pinned version (AGENTS.md says where); their rules on
tests, JSDoc and agent-readiness yield to PRINCIPLES.md. Not yet tried: a touch device's long press, VoiceOver, the
sheet presentation, Firefox. A known SDK gap: the SDK gives the trigger that opened the menu
its id (`<menu>--ui-trigger`) and names the menu by it, and with no trigger (a right-click on an area) every ⋯ holds
that id and the menu is named by the page's first; its `open` takes no trigger to name. The subject's title is still
said, as the menu's first group label, and no id the tower spells or reads is affected.
