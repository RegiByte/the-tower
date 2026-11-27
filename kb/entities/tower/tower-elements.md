---
{
  "type": "library",
  "name": "The tower's elements (/lib-ui/)",
  "summary": "The tower-* custom elements a page or an extension's client draws as tags, served at /lib-ui/<module>.js: each builds the UI SDK's ui-* parts inside itself, so menus, comboboxes, the dialog, the split and popovers get the SDK's keyboard, focus, placement and dismissal while views keep drawing html as strings through the morph.",
  "in": "tower-core",
  "reviewed": "2026-11-27",
  "refs": ["hub/src/lib-ui/menu.ts#elements", "hub/src/lib-ui/combobox.ts#elements", "hub/src/lib-ui/dialog.ts#elements", "hub/src/lib-ui/split.ts#elements", "hub/src/lib-ui/popover.ts#elements", "hub/src/lib-ui/sdk.ts#relay", "hub/src/lib-ui/sdk.ts#ElementContract", "hub/src/lib-ui/look.css", "hub/src/tower/served.ts#uiSdkModule", "hub/src/tower/served.ts#servedModule", "hub/src/tower/served.ts#libUiUrls", "hub/src/shared/elements.ts#subjectHtml", "hub/src/shared/elements.ts#comboboxHtml", "hub/src/shared/elements.ts#subjectAreaHtml", "hub/src/shared/elements.ts#subjectButtonHtml", "hub/src/shared/elements.ts#popoverHtml", "hub/src/shared/elements.ts#popoverButtonHtml", "hub/src/shared/elements.ts#menuHtml", "hub/src/shared/dom-id.ts#domId", "hub/src/lib/elements.ts", "hub/test/lib-ui.test.ts", "hub/test/library.ts#elementsOf", "hub/scripts/lib-ui-check.ts", "hub/renderers/playground/scenes.js#SCENES", "hub/renderers/playground/playground.js", "hub/docs/extending.md"]
}
---
Each module of `src/lib-ui/` is served at `/lib-ui/<module>.js`
([`servedModule`](ref:hub/src/tower/served.ts#servedModule)); importing it defines its elements:
[`/lib-ui/menu.js`](ref:hub/src/lib-ui/menu.ts#elements) `<tower-menu>`, `<tower-menu-button>` and
`<tower-menu-area>`, [`/lib-ui/combobox.js`](ref:hub/src/lib-ui/combobox.ts#elements) `<tower-combobox>`,
[`/lib-ui/dialog.js`](ref:hub/src/lib-ui/dialog.ts#elements) `<tower-dialog>`,
[`/lib-ui/split.js`](ref:hub/src/lib-ui/split.ts#elements) `<tower-split>`,
[`/lib-ui/popover.js`](ref:hub/src/lib-ui/popover.ts#elements) `<tower-popover>` and `<tower-popover-button>`. Why they
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
  ([`relay`](ref:hub/src/lib-ui/sdk.ts#relay)), so a core view listens on its host; one the element refused itself is
  not, since it never happened.
- **One subject menu per page.** `<tower-menu>` holds the SDK's data menu; each subject's area and ⋯ button name it by
  `for` and the subject by `payload`, and its owner sets `items` on `payloadchange`, which it fires on every opening:
  the SDK says a payload only when it changes, so an opening for the subject it was last filled for is said too, before
  its `openchange`, and the menu is filled as the page stands then. The area handles `contextmenu`
  and a long press itself, by the SDK's own context trigger's rules (a finger may move 10 px, the browser's long-press
  menu is refused while it is down, the click its release makes after a hold is eaten) without binding the SDK's hold,
  which writes on the element it binds, and opens the menu at the point through the SDK's controller; the menu marks the areas of
  the subject it is open for, however it opened. An area is no tab stop of its own: the keyboard reaches the subject
by its ⋯. A checkbox item is drawn with its check at its end, from a `<template>` the menu holds for the SDK's data
menu to copy, and its `checkedchange`, which doesn't bubble, is fired again on the menu with the item's value.
- **One SDK core.** `/lib-ui/sdk.js` is internal: the SDK entries in use bundled once, packages inlined, minified
  ([`uiSdkModule`](ref:hub/src/tower/served.ts#uiSdkModule)), never through `/vendor/`, since popups on two cores
  can't share a layer stack. It adopts [`look.css`](ref:hub/src/lib-ui/look.css), the tower's look for the parts,
  which reads the SDK's `--ui-*` variables, each set on the outer element from a design token: the mapping in the
  design's cascade layer, so a component of the design can re-point one on an element it holds, the parts' rules in
  the elements' layer ([[cascade-layers]]).
- **A dialog the page fills.** `<tower-dialog>` holds the SDK's modal dialog: its backdrop, focus taken as it opens
  (onto the dialog itself, so reading starts at the top) and kept inside, Escape, a press outside and the page made
  inert are the SDK's, and focus goes back where it was when it closes. Its `label` is its title and its accessible
  name; a close button after its body closes it. The page puts what it shows in its `body` property, which scrolls
  inside a box sized for reading beside an index and never past the window; `open` opens and closes it, and its
  `openchange` is fired again on it. The page's `board.dialog` region draws in it ([[ui-model]]).
- **A split that holds pixels.** `<tower-split>` moves its two element children into the SDK's resizable group at
  connect, one of them sized. The SDK's model is percent of the space the panels share, so the element keeps px as its
  contract: `size`, `default-size`, `min` and `max` are CSS lengths, resolved by an inline-styled probe inside it (its
  `%` of the whole split), and on every resize of the group, before the frame is painted, it hands the SDK the bounds,
  the arrow keys' step (24px, Shift ten) and the layout, all in percent of the space measured then: the SDK converts px
  with the space it measured last, which can be a frame old. The layout is set in a microtask, after the SDK has taken
  the new bounds. Only a viewer's changes (`drag`, `step-key`) fire `sizechange` and `sizecommit`; a double-click
  returns to `default-size` and commits `null`. `disabled` hides the grip and gives the sized pane its content's size
  over the SDK's inline flex, for layouts that size it themselves. The SDK makes every frame pointer-transparent while
  a grip is dragged. Its separator's ARIA describes the panel before the grip, in percent, so the element writes over
  it, after the SDK has, for the sized pane: `aria-controls` names it and `aria-valuenow`, `-min` and `-max` are its px,
  so a split sized `last` (the shells) reads as the shells, growing as they do. `tip` becomes the grip's `data-tip`;
  the grip is an 8px box whose margins take its size back, so it takes no room and a pointer resting on it is over it. It has no string builder: the page
  writes it once in its html, and since the morph leaves an owned element's children, a view redraws each pane by its
  id. WebKit's check covers its keys only: the harness's synthetic mouse holds no button
  (`buttons` 0), and the SDK ends a drag on such a move.
- **A popover beside the page's own button.** `<tower-popover>` holds the SDK's non-modal popover, its content kept in
  the page while closed so the page fills its `body` on every draw. `<tower-popover-button>` wraps a button the page
  draws and redraws itself, so it is the one element that writes on what isn't its own: no SDK trigger binds the
  button, since the SDK writes its marks and its CSS anchor on the element it binds, which a redraw rewrites. The element
  opens the popover through the SDK's controller instead, anchored to a box that reads the button's place
  ([`boxOf`](ref:hub/src/lib-ui/popover.ts#boxOf)), writes `aria-haspopup`, `aria-expanded` and `aria-controls` on the
  button and again after each redraw, keeps it open for the press and the focus its own button takes (or the press's
  click would reopen it), and gives focus back to the button itself, since the web part takes `final-focus` as a selector
  only. Escape, a press outside, focus leaving and a press into a frame, one running no script too (the SDK's own
  window-blur check, reported as `focus-out`), are the SDK's.
- **A combobox named from outside.** `labelledby` names a label the form draws itself (an eyebrow, an optional mark, a
  hint): the element then draws no label part and points its input's `aria-labelledby` at it. A `<label>` around it
  would take a press in its list for one on the box.
- **A combobox keeps a form's keys as a native select.** Open, typing highlights the first match (the SDK's
  `auto-highlight`), and an Enter, ⌘↵ included, chooses the highlighted option or does nothing, then stops at the
  element, so a form's submit key fires only while it is closed. Leaving without choosing shows the chosen label again;
  the half-typed query is not kept for the next opening, which the SDK resets to the chosen label. With `custom`, typing
  highlights nothing, as a datalist's box does, so Enter chooses the text typed (a model id a runtime's list misses,
  `openai/gpt-5` beside a listed `openai/gpt-5-mini`), an option only once an arrow key moved to it or its label is
  exactly the text; leaving still restores what was chosen, the element refusing the value the SDK's `allow-custom-value` would take as the list closes: a choice is
  always made on purpose.
- **Strings for core views.** A core view draws an element through `/lib/elements.js`
  ([`comboboxHtml`](ref:hub/src/shared/elements.ts#comboboxHtml), [`subjectHtml`](ref:hub/src/shared/elements.ts#subjectHtml),
  [`popoverHtml`](ref:hub/src/shared/elements.ts#popoverHtml), [`popoverButtonHtml`](ref:hub/src/shared/elements.ts#popoverButtonHtml),
  [`menuHtml`](ref:hub/src/shared/elements.ts#menuHtml) for a menu of a view's own),
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
`served:update` lists it, and its `--ui-*` variables join the list in `docs/extending.md`. It gets a scene in the
playground ([`renderers/playground`](ref:hub/renderers/playground/scenes.js#SCENES)), a renderer for the people and agents developing
the tower that draws every element and shared behavior from fixtures in each theme and scheme the page is offered, with
a door for agents (`window.playground`); a sandbox serves it at `/r/playground/`, no user's tower does. It passes the
morph proof: [`tool:lib-ui`](ref:hub/scripts/lib-ui-check.ts) serves the playground alone (the default look, no tower)
and runs its menu, combobox and split scenes' steps, the page redrawn every 100 ms while typing and while open, in Chrome and
WebKit, on every SDK bump, which is its own commit with the pins exact.

The SDK's own docs and skill ship in `node_modules` at the pinned version (AGENTS.md says where); their rules on
tests, JSDoc and agent-readiness yield to PRINCIPLES.md. Not yet tried: a touch device's long press, VoiceOver, the
sheet presentation, Firefox. A known SDK gap: the SDK gives the trigger that opened the menu
its id (`<menu>--ui-trigger`) and names the menu by it, and with no trigger (a right-click on an area) every ⋯ holds
that id and the menu is named by the page's first; its `open` takes no trigger to name. The subject's title is still
said, as the menu's first group label, and no id the tower spells or reads is affected.
