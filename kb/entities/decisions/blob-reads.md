---
{
  "type": "decision",
  "name": "Blob reads: real images through the renderer API",
  "summary": "Any read of the renderer API can be taken as a Blob of its type (tower.blob, API v5), so a framed renderer draws real images in WebGL; a shown or shelved markdown page also serves the images beside it.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-10",
  "refs": [
    "hub/src/tower/tower.js",
    "hub/src/shared/shelf-page.ts#FromPage",
    "hub/src/shared/api.ts#API_VERSION",
    "hub/renderers/page/index.html",
    "hub/src/shelf.ts#shownServes",
    "hub/src/shelf.ts#shelfServes",
    "hub/renderers/tower3d/src/showing.ts#posterOf",
    "hub/renderers/tower3d/src/showing.ts#pictured",
    "hub/renderers/tower3d/src/gallery.ts#fitPicture",
    "hub/renderers/tower3d/src/fixtures.ts#readBlob"
  ]
}
---
**Problem.** A worker that showed a screenshot or a plot got a poster in Tower 3D: an enamel band reading IMAGE,
the file's name and the time. A framed renderer runs at an opaque origin, so every URL is cross-origin to it,
the tower's own `/shown` included: an `<img>` displays, but WebGL refuses to upload it. The renderer API read
only text. Markdown with `![](plot.png)` showed a broken image in both readers, since only an html showing let
the files beside it be read.

**Why.** Most of what workers show the user is visual: screenshots, plots, diagrams. On the shared wall
([[shared-wall]]) and the desk's second monitor ([[agent-show]]) a poster says that something was shown, not
what.

**How.**
- **A read mode, no new route.** [`tower.js`](ref:hub/src/tower/tower.js) gains `tower.blob(path)`: any read the
  API serves, as a `Blob` of its type. At the tower's origin it is `fetch(path).then(r => r.blob())`; framed it is
  one new tunnel message, `{t: 'blob', id, path}` ([`FromPage`](ref:hub/src/shared/shelf-page.ts#FromPage)),
  which the tower page answers with a one-line relay. A `Blob` is structured-cloneable: it crosses `postMessage`
  with its MIME type. The server already served images with their types; who may read what is unchanged.
  [`API_VERSION`](ref:hub/src/shared/api.ts#API_VERSION) moved to 5: a v5 page asking a v4 tower would wait
  forever for an answer.
- **Markdown pulls in its images.** [`shownServes`](ref:hub/src/shelf.ts#shownServes) lets a shown `.md` serve
  the images (png, jpg, gif, webp, svg) beside or below it, and [`shelfServes`](ref:hub/src/shelf.ts#shelfServes)
  does the same for an `md` shelf entry's files. Only images: showing a README doesn't open its repo. Both readers
  rewrite a relative image's `href` to its served path while `marked` parses (`walkTokens`); links are left
  alone, so in-page anchors and links between shelf docs keep working.
- **Tower 3D** ([`posterOf`](ref:hub/renderers/tower3d/src/showing.ts#posterOf)): an image showing is read as a
  blob, put on a blob URL (same-origin to the page that made it, so the canvas stays clean) and decoded by an
  `<img>`, which takes every format, SVG included. It is drawn onto a canvas at most 2048 px on its long side. The
  monitor's sheet is repainted with it letterboxed on the screen's dark; the gallery gets a second texture of the
  bare image ([`fitPicture`](ref:hub/renderers/tower3d/src/gallery.ts#fitPicture)), as large as its place allows
  at its own proportions, the frame, plaque and ribbon around it. A markdown poster typesets its images,
  shrunk to the room left on the sheet. The poster stands until the read settles; a file gone keeps it.
- **Fixtures and the door.** On a fixture board every image reads as one plot drawn on a canvas
  ([`readBlob`](ref:hub/renderers/tower3d/src/fixtures.ts#readBlob)), and the busy board shows a PNG. Decoding
  runs in real time, outside the stepped clock, so the door's `ready()` also waits for the first board's pictures
  ([`pictured`](ref:hub/renderers/tower3d/src/showing.ts#pictured)); the frames walk is the same on every run.

**Alternatives considered.**
- *CORS on `/shown` and `/shelf`.* Any web site open in the browser could read shown files over loopback.
- *A route answering base64 JSON.* A third bigger, a second encoding, and a server change for nothing.
- *An `ArrayBuffer` with a transfer list.* Loses the MIME type that decoding needs.
- *`createImageBitmap(blob)`.* Chrome refuses SVG blobs; the `<img>` path takes every format.
- *A `<base href>` in the readers' srcdoc.* Resolves images, but sends `#anchor` links to the base URL.
- *HTML-in-canvas* (Chrome origin trial). Paints the DOM into a texture, but leaves cross-origin images in that
  DOM undrawn, so images still need blob reads; and its API is still being renamed. A later spike.

**Impact.** One read mode on the renderer API for every renderer and shelf page. Tower 3D's wall and monitors
carry the real screenshots and plots workers show, and markdown reports show their figures everywhere. The
tower needs a restart (`tower up`) for the new `tower.js`, the relay and the version; the host and the board are
unchanged. HTML pages and PDFs stay posters. Videos (`.mp4`, `.webm`) came later the same way: read as a blob,
played on a blob URL, their frames painted into the world ([[agent-show]]).
