---
{
  "type": "decision",
  "name": "Blob reads: real images through the renderer API",
  "summary": "Any read of the renderer API can be taken as a Blob of its type (tower.blob), so a framed renderer draws real images in WebGL; a shown or shelved markdown page also serves the images beside it.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-23",
  "refs": [
    "hub/src/tower/tower.js",
    "hub/src/shared/shelf-page.ts#FromPage",
    "hub/src/shelf.ts#shownServes",
    "hub/src/shelf.ts#shelfServes",
    "hub/src/shared/markdown.ts#documentHtml",
    "hub/renderers/tower3d/src/showing.ts#posterOf",
    "hub/renderers/tower3d/src/showing.ts#pictured",
    "hub/renderers/tower3d/src/gallery.ts#fitPicture",
    "hub/renderers/tower3d/src/fixtures.ts#readBlob"
  ]
}
---
**Problem.** A framed renderer runs at an opaque origin, so every URL is cross-origin to it, the tower's own
`/shown` included: an `<img>` displays, but WebGL refuses to upload it, so a renderer drawing in WebGL can show a
screenshot only as a poster naming it. And markdown with `![](plot.png)` needs the images beside it served.

**Why.** Most of what workers show the user is visual: screenshots, plots, diagrams. On the shared wall
([[shared-wall]]) and the desk's second monitor ([[agent-show]]) a poster says that something was shown, not
what.

**How.**
- **A read mode, no new route.** [`tower.js`](ref:hub/src/tower/tower.js) has `tower.blob(path)`: any read the
  API serves, as a `Blob` of its type. At the tower's origin it is a `fetch`; framed it is one tunnel message,
  `{t: 'blob', id, path}` ([`FromPage`](ref:hub/src/shared/shelf-page.ts#FromPage)), which `tower.relay` in the
  framing page answers. A `Blob` is structured-cloneable: it crosses `postMessage` with its MIME type. Who may read
  what is unchanged.
- **Markdown pulls in its images.** [`shownServes`](ref:hub/src/shelf.ts#shownServes) lets a shown `.md` serve
  the images beside or below it, and [`shelfServes`](ref:hub/src/shelf.ts#shelfServes) does the same for an `md`
  shelf entry's files. Only images: showing a README doesn't open its repo.
  [`documentHtml`](ref:hub/src/shared/markdown.ts#documentHtml) rewrites a relative image's `href` to its served
  path as it parses; links are left alone, so in-page anchors and links between shelf docs keep working
  ([[markdown-safe]]).
- **Tower 3D** ([`posterOf`](ref:hub/renderers/tower3d/src/showing.ts#posterOf)): an image showing is read as a
  blob, put on a blob URL (same-origin to the page that made it, so the canvas stays clean), decoded by an `<img>`,
  which takes every format, SVG included, and drawn onto a canvas: letterboxed on the monitor's sheet, bare at its
  own proportions in the gallery ([`fitPicture`](ref:hub/renderers/tower3d/src/gallery.ts#fitPicture)). A markdown
  poster typesets its images. The poster stands until the read settles; a file gone keeps it. Videos go the same
  way, played on a blob URL with their frames painted into the world ([[agent-show]]). HTML pages and PDFs stay
  posters.
- **Fixtures and the door.** On a fixture board every image reads as one plot drawn on a canvas
  ([`readBlob`](ref:hub/renderers/tower3d/src/fixtures.ts#readBlob)). Decoding runs in real time, outside the
  stepped clock, so the door's `ready()` also waits for the first board's pictures
  ([`pictured`](ref:hub/renderers/tower3d/src/showing.ts#pictured)) and the frames walk is the same on every run.

**Alternatives considered.**
- *CORS on `/shown` and `/shelf`.* Any web site open in the browser could read shown files over loopback.
- *A route answering base64 JSON.* A third bigger, a second encoding, and a server change for nothing.
- *An `ArrayBuffer` with a transfer list.* Loses the MIME type that decoding needs.
- *`createImageBitmap(blob)`.* Chrome refuses SVG blobs; the `<img>` path takes every format.
- *A `<base href>` in the readers' srcdoc.* Resolves images, but sends `#anchor` links to the base URL.
