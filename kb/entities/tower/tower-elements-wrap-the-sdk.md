---
{
  "type": "decision",
  "name": "The tower's elements wrap the UI SDK's parts, loaded eagerly on one core",
  "summary": "Menus and comboboxes are tower-* outer elements that build the UI SDK's own ui-* parts inside themselves at connect, bundled once and imported eagerly: the SDK's behavior is kept whole, the morph stays lossless, and only the outer tags are contract.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-11-18",
  "reviewed": "2026-11-18",
  "refs": ["hub/src/lib-ui/menu.ts", "hub/src/lib-ui/combobox.ts", "hub/src/lib-ui/sdk.ts", "hub/src/tower/served.ts#uiSdkModule", "hub/package.json"]
}
---
**Context.** The page needs menus (a subject's actions at a right-click, the keyboard's ⋯ button, submenus) and
searchable selects that keep their state while a view redraws from html every few hundred milliseconds. Writing the
keyboard, focus, placement, dismissal and ARIA by hand for each is where such widgets go wrong. The UI SDK
(`@ui-sdk/web`, beta) ships them as custom elements with no styles of their own.

**Decision.**
- **Wrap, don't redefine.** Each `tower-*` element builds the SDK's own `ui-*` tree inside itself at connect
  ([[tower-elements]]). The SDK's glue (submenus, the touch sheet, data rendering) stays whole, and an SDK pin may
  change the inner parts freely, since only the outer tag is contract. The right-click zone is the tower's own
  `<tower-menu-area>`, opening the menu through the SDK's controller: the SDK's context trigger would have to be the
  element around the page's own morphed row.
- **Nothing written on the outer element.** State goes through `ElementInternals`, so the morph's
  `data-owned="children"` mode updates only what the render wrote and `/lib/morph.js` needs no change.
- **Eager, one core.** The SDK entries in use are bundled once into `/lib-ui/sdk.js` and imported statically, so a
  page's import map and preloads cover them and the elements upgrade before first paint. Two cores on a page can't
  share the layer stack popups use.
- **Pinned exactly** (`0.1.0-beta.10`, no caret): a bump is its own commit and re-runs `tool:lib-ui` in both engines.

**Alternatives considered.**
- Registering `tower-*` parts directly with the SDK's `createParts`: it works for a flat menu and combobox, but the
  SDK's definitions hardcode `ui-*` names, so every component would mean keeping a copy of its glue, and submenus,
  the sheet and data rendering need internals the SDK doesn't export.
- Writing the `ui-*` markup in each view: the inner names would become API in practice, in every core and extension
  view, and each part would need its own ownership mark against the morph.
- The SDK's autoloader: its imports are dynamic, outside the import map and preloads, a waterfall of files after the
  first render; it loads for any `ui-*` tag anyone writes, pulling the inner names toward API; and the page draws
  both elements on every load, so loading lazily saves nothing.
- One `/vendor/` bundle per SDK entry: each carries its own core, and more bytes.
- The SDK's `web.css`: it styles `a`, `hr`, `code` and `kbd` page-wide, so `/lib-ui/` ships its own sheet for the parts.

**Consequences.** A page or extension draws a menu or combobox as one tag and keeps drawing html as strings. The SDK
is about 240 KB minified on every page that imports an element. Tokens and themes for the elements are a later pass,
where each element names the tokens it needs; until then they read the SDK's `--ui-*` variables set from the
design's tokens.
