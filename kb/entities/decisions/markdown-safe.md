---
{
  "type": "decision",
  "name": "Markdown is drawn through one shared module, safe by construction for unvetted words",
  "summary": "Every renderer draws markdown through /markdown.js: markdownHtml for Claude's answers, prompts and workers' words (raw HTML escaped, links only http(s), mailto or relative, images only the tower's own), safe in any element; documentHtml for a shown, shelved or kept file, raw HTML kept as written for a frame without scripts, its markdown links held to safeHref; the frame contains a document's raw HTML; inside a document frame the renderer holds what it made by reference and delegates only links, by one rule, and draws a section's commands in a gutter beside the frame, never in it.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-30",
  "refs": [
    "hub/src/shared/markdown.ts",
    "hub/src/shared/markdown.ts#markdownHtml",
    "hub/src/shared/markdown.ts#documentHtml",
    "hub/src/shared/markdown.ts#safeHref",
    "hub/src/shared/markdown.ts#imagePath",
    "hub/src/shared/markdown.ts#relativeHref",
    "hub/src/tower/served.ts#MODULES",
    "hub/test/markdown.test.ts",
    "hub/src/views/frame.ts#followLink",
    "hub/src/views/frame.ts#scrollToFragment",
    "hub/src/views/document.ts#mount",
    "hub/src/views/document.ts#followSections",
    "hub/src/shared/markdown.ts#sectionsHtml",
    "hub/src/views/link.ts#mount",
    "hub/src/views/brief.ts#mount",
    "hub/renderers/tower3d/src/ui.ts#docHtml",
    "hub/renderers/tower3d/src/showing.ts"
  ],
  "links": [
    { "to": "renderer-shared-modules", "verb": "extends", "carries": "/markdown.js" },
    { "to": "brief-turns", "verb": "uses", "carries": "markdownHtml as the tower page's said" },
    { "to": "agent-show", "verb": "uses", "carries": "documentHtml for a shown markdown file" },
    { "to": "renderer-api-contract", "verb": "follows", "carries": "a served module added" }
  ]
}
---
**Problem.** Markdown was rendered with `marked` and nothing else, at each call site its own way. Raw HTML and `javascript:` links in
Claude's answers reached the page: one `<style>` in an answer restyled the whole brief, `<img>` beacons loaded from the
network, and the only thing standing between an `onerror` and the tower's API was the `sandbox` attribute repeated at
each call site. The brief's frame is `allow-same-origin` with the tower, whose API spawns sessions; one
`allow-scripts`, or a renderer that put marked's html inline, would have been code execution. The tower page's shelf
also opened any link a document carried, `javascript:` included, from the unsandboxed page.

**Why.** Claude's words are not vetted: a web page Claude read can put anything in them. A guarantee held by an
attribute at every call site is not held by anything a test can check. A renderer written from `docs/extending.md`
would reach for a markdown library's `parse` and draw it inline.

**How.** [`markdown.ts`](ref:hub/src/shared/markdown.ts), served as `/markdown.js`, holds two `Marked` instances
(none mutates marked's global) and two functions:
- [`markdownHtml`](ref:hub/src/shared/markdown.ts#markdownHtml), for words nobody vetted: the `html` renderer returns
  the raw HTML escaped (a block one as a paragraph), the `link` renderer keeps a link only when
  [`safeHref`](ref:hub/src/shared/markdown.ts#safeHref) allows it and otherwise draws its words, and the `image`
  renderer keeps only an image that resolves to the tower's own origin (a path), drawing any other as a link to it.
  Markdown syntax emits only a fixed set of tags, so with raw HTML escaped and URLs allowlisted the output is safe by
  construction, in any element.
- [`documentHtml`](ref:hub/src/shared/markdown.ts#documentHtml), for a file a worker showed or a shelf keeps: raw HTML
  stays (the user's documents may use it), relative images are read beside the file
  ([`imagePath`](ref:hub/src/shared/markdown.ts#imagePath)), and markdown links obey
  `safeHref`. Raw HTML is kept as written, a `javascript:` anchor or a `<script>` included: containing it is the
  frame's job, without `allow-scripts`, and the test pins that `documentHtml` does not.
- `safeHref` resolves a href against a placeholder origin and allows `http:`, `https:` and `mailto:`; a relative path
  resolves to `http:`. The href written is the string checked, escaped, so an entity (`&#106;avascript:`) reaches the
  browser as the text it was checked as.
- No document frame runs scripts. Each frame the tower page writes a document into (a shown or kept markdown or text
  file, [`framedText`](ref:hub/src/views/item.ts#framedText); the page asking to open a link,
  [`tower/link`](ref:hub/src/views/link.ts#mount); a shelf file) is
  `allow-same-origin` without `allow-scripts`, so the renderer reaches its keys and geometry ([[keymap]]): beside
  `allow-same-origin`, a script there would run as the tower. A `javascript:` link it carries runs nowhere, in the
  frame or in the tab `allow-popups-to-escape-sandbox` opens (checked in Chrome).
- Briefs and review notes in every renderer use `markdownHtml` as their `said` ([[brief-turns]]); shown, shelf and
  kept docs use `documentHtml` in the tower page (`tower/document`, [[ui-model]]); Tower 3D draws a kept item's
  markdown with `markdownHtml`. `/marked.js` is still served, outside the contract; Tower 3D keeps marked's lexer to
  typeset pages on canvas.
- *The binding rule* (step 5c). A document's raw HTML can hold elements that mimic the renderer's (a
  `<button data-action>`, a fake heading or section). So inside a document frame the renderer holds the elements it
  creates by reference, never delegates an event by selector and never finds one of its own by selector.
  [`tower/document`](ref:hub/src/views/document.ts#mount) makes each section's element with the frame's document
  (`contentDocument.createElement`) and fills it there from [`sectionsHtml`](ref:hub/src/shared/markdown.ts#sectionsHtml),
  never on a node of the page's own document, where an `onerror` in the raw HTML would run as the tower; a frame that
  navigated itself away holds a document the renderer didn't write, and nothing is bound there.
- *The gutter* (D11 of the UI model). Nothing of the renderer's that paints or takes a click lives in a document
  frame: a section's commands (`section.acts`) are drawn in a gutter beside the frame, in the page's own document,
  each row kept level with its section ([`followSections`](ref:hub/src/views/document.ts#followSections)), so a
  file's CSS, SVG, top layer or `inert` can't cover, move or click through one: an iframe paints only inside its own
  box. Document frames keep `documentHtml`'s full fidelity, author CSS included. A row acts on the section whose key
  and body come from the source the view holds, labelled with that section's heading from the source; rows never
  overlap, each opaque and as wide as the gutter, so what a row reads is what it acts on. The residual risk is
  misalignment (a file's CSS moving its headings, an offset changing with no resize or scroll): a correctly
  labelled button beside the wrong text.
- *Links* are the one delegated case, by one rule every document frame shares
  ([`followLink`](ref:hub/src/views/frame.ts#followLink)), matching `a[href]` and `area[href]`: a `#fragment` scrolls
  the frame to the element of that id or the heading whose GitHub slug it is
  ([`scrollToFragment`](ref:hub/src/views/frame.ts#scrollToFragment)); a file of the shelf entry opens in place; a link
  `safeHref` allows opens a tab of its own, unless it is relative to the document
  ([`relativeHref`](ref:hub/src/shared/markdown.ts#relativeHref)), which only a view that places it can follow (a
  frame's document is the page's, so a relative link would resolve against the page's address, a tower error); any
  other is refused, the toast naming it and why.
- [`markdown.test.ts`](ref:hub/test/markdown.test.ts) runs the payloads of the brief's audit and the usual ways around
  a scheme check through `markdownHtml` and holds every tag and attribute of its output to an allowlist, every href to
  http(s) or mailto and every image to the tower's origin, as a browser would read them.

**Alternatives considered.** A sanitizer (DOMPurify) after marked: a second policy to keep in step with the first, a
DOM to run it in, and it would keep HTML Claude has no business emitting in a brief. One function with a flag for
documents: two uses with different guarantees are two functions. Escaping raw HTML in documents too: the user's own
files may use it, and they stay framed without scripts.

**Impact.** Raw HTML in an answer or a prompt shows as its text (Claude's occasional `<details>` or `<br>` included);
a remote image in an answer is a link. `/markdown.js` is a served module under the contract ([[renderer-api-contract]]).
