---
{
  "type": "decision",
  "name": "Markdown is drawn through one shared module, safe by construction for unvetted words",
  "summary": "Every renderer draws markdown through /markdown.js: markdownHtml for Claude's answers, prompts and workers' words (raw HTML escaped, links only http(s), mailto or relative, images only the tower's own), safe in any element; documentHtml for a shown, shelved or kept file, raw HTML kept as written for a frame without scripts, its markdown links held to safeHref; the frame contains a document's raw HTML; inside a document frame the renderer holds what it made by reference and hears nothing (WebKit calls no listener in a document that can't run scripts): it writes where each link goes as it draws, by one rule, empties what could hold a document of its own, follows the frame's scroll from the page, and draws a section's commands in a gutter beside the frame, never in it.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-31",
  "refs": [
    "hub/src/shared/markdown.ts",
    "hub/src/shared/markdown.ts#markdownHtml",
    "hub/src/shared/markdown.ts#documentHtml",
    "hub/src/shared/markdown.ts#safeHref",
    "hub/src/shared/markdown.ts#imagePath",
    "hub/src/shared/markdown.ts#relativeHref",
    "hub/src/shared/subjects.ts#linkedFile",
    "hub/src/tower/served.ts#MODULES",
    "hub/test/markdown.test.ts",
    "hub/src/views/frame.ts#writeLinks",
    "hub/src/views/frame.ts#linkTo",
    "hub/src/views/frame.ts#contain",
    "hub/src/views/frame.ts#DOCUMENT_SANDBOX",
    "hub/src/views/frame.ts#scrollToFragment",
    "hub/renderers/page/page.js#linkHash",
    "hub/scripts/webkit.ts",
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
  `allow-same-origin` without `allow-scripts`, so the renderer reaches its document and geometry: beside
  `allow-same-origin`, a script there would run as the tower. A `javascript:` link it carries runs nowhere, in the
  frame or in the tab `allow-popups-to-escape-sandbox` opens (checked in Chrome).
- *Nothing is heard in a document frame.* WebKit (Safari, and Tower.app's WKWebView) calls no event listener in a
  document whose frame can't run scripts, even one the page's own script added; Chrome calls them. So page code never
  relies on a listener inside one: what the view needs from the document it writes as data when it draws, or reads
  from the page's side. Observers the page creates (`ResizeObserver`, `IntersectionObserver`) are the page's and
  run in both. The one listener left, the keymap's on a document frame's keys ([[keymap]]), works in Chrome alone:
  in WebKit, a chord pressed with the focus in a document stays the document's until a click outside it gives the
  page its keys back. `tool:webkit` ([`webkit.ts`](ref:hub/scripts/webkit.ts)) drives a WKWebView with real clicks
  and keys to check this, since `drive` is Chrome only.
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
- *Containment* ([`contain`](ref:hub/src/views/frame.ts#contain)). Before a document's part joins the frame's
  document, a nested `iframe` or `frame` loses its `src` and `srcdoc`, an `object` its `data`, an `embed` its `src`,
  and a `<base>` or `<meta http-equiv>` is removed: a nested frame would take the document frame's sandbox (top
  navigation included) with links no rule wrote, a base would move where every link resolves, and a meta refresh
  would navigate the frame away. Raw HTML otherwise stays as written.
- *The gutter* (D11 of the UI model). Nothing of the renderer's that paints or takes a click lives in a document
  frame: a section's commands (`section.acts`) are drawn in a gutter beside the frame, in the page's own document,
  each row kept level with its section ([`followSections`](ref:hub/src/views/document.ts#followSections): each
  animation frame while the view is seen it reads the frame's `scrollY`, and when that or the body's size changed
  reads every anchor and writes every row), so a
  file's CSS, SVG, top layer or `inert` can't cover, move or click through one: an iframe paints only inside its own
  box. Document frames keep `documentHtml`'s full fidelity, author CSS included. A row acts on the section whose key
  and body come from the source the view holds, labelled with that section's heading from the source; rows never
  overlap, each opaque and as wide as the gutter, so what a row reads is what it acts on. The residual risk is
  misalignment (a file's CSS moving its headings, an inner scroller of its own, an offset changing with no resize or
  scroll of the frame): a correctly
  labelled button beside the wrong text.
- *Links are data* ([`writeLinks`](ref:hub/src/views/frame.ts#writeLinks), one rule every document frame shares,
  [`linkTo`](ref:hub/src/views/frame.ts#linkTo)). As the view draws a document it writes each `a` and `area` (an SVG
  link's `xlink:href` read as its href) where it goes, so pressing one needs nothing heard: a `#fragment` naming an
  element (headings get their GitHub slug as an id) stays in the frame, written as `about:srcdoc#…` since a srcdoc
  resolves a bare `#` against the page's address; a link the view places itself takes the page to one of its
  locations by the hash the kit's `href` gives, `target="_top"` with the page's address written whole (refused in a
  renderer that lends no `href`): a file of the shelf entry by the shelf's location on it, or, in a file of a
  worker's checkout, a path relative to it
  ([`relativeHref`](ref:hub/src/shared/markdown.ts#relativeHref)) resolved in its repo
  ([`linkedFile`](ref:hub/src/shared/subjects.ts#linkedFile)) by the hash `kit.href` gives that `file`
  ([`linkHash`](ref:hub/renderers/page/page.js#linkHash), [[ui-model]]); a link `safeHref` allows opens a tab of its
  own (`_blank`), unless it is relative, which no other document can place (a frame's document is the page's, so a
  relative link would resolve against the page's address, a tower error); any other loses its href, its title naming
  it and why. The frame is sandboxed with `allow-top-navigation-by-user-activation`
  ([`DOCUMENT_SANDBOX`](ref:hub/src/views/frame.ts#DOCUMENT_SANDBOX)): still no script runs, and only a click takes
  the page anywhere. Every link's target is written by the rule and nested frames are emptied, so the page goes only
  to its own address; in Tower.app a web address in the main frame opens in the default browser anyway.
- [`markdown.test.ts`](ref:hub/test/markdown.test.ts) runs the payloads of the brief's audit and the usual ways around
  a scheme check through `markdownHtml` and holds every tag and attribute of its output to an allowlist, every href to
  http(s) or mailto and every image to the tower's origin, as a browser would read them.

**Alternatives considered.** For links in WebKit: the page listening on the frame's own navigation (a relative link
would reach the network and replace the document before the page could put it back); fragment links the page polls
for in the frame's address (each would push an entry Back steps through invisibly); `allow-scripts` with a relay, as
html pages have (a document's raw HTML would run, and the page could no longer reach the document for its sections).
For keys: handing the focus back to the page whenever it enters a document, which would cost copying a selection and
scrolling the document by keyboard in every browser. A sanitizer (DOMPurify) after marked: a second policy to keep in step with the first, a
DOM to run it in, and it would keep HTML Claude has no business emitting in a brief. One function with a flag for
documents: two uses with different guarantees are two functions. Escaping raw HTML in documents too: the user's own
files may use it, and they stay framed without scripts.

**Impact.** Links, fragments and the gutter work alike in Chrome and WebKit; a document's nested frames, objects and
embeds draw empty. Raw HTML in an answer or a prompt shows as its text (Claude's occasional `<details>` or `<br>` included);
a remote image in an answer is a link. `/markdown.js` is a served module under the contract ([[renderer-api-contract]]).
