---
{
  "type": "decision",
  "name": "The tower's routes are the renderer API",
  "summary": "Every renderer drives the system through the tower server's HTTP routes, versioned major.minor by API_VERSION: framed shelf pages reach them over a postMessage tunnel, pages at the tower's origin call them directly, and streams share one multiplexed connection.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-26",
  "refs": ["hub/src/shared/api.ts", "hub/src/shared/api.ts#QUERIES", "hub/src/shared/shelf-page.ts", "hub/src/tower/tower.js", "hub/src/tower/http.ts#openMux", "hub/src/tower/http.ts#run", "hub/src/tower/tower.js#relay", "hub/renderers/page/index.html", "hub/renderers/page/page.js"]
}
---
**Context.** Shelf pages and renderers need to read the system and act on it, or no renderer could ever do what
the tower page does: the tower could not be replaced from inside it.

**Decision.** Those routes are the API: commands declared as schemas in [`src/shared/api.ts`](ref:hub/src/shared/api.ts)
([[renderer-api-contract]]), reads, streams and the tunnel typed in
[`src/shared/shelf-page.ts`](ref:hub/src/shared/shelf-page.ts) (`Reads`, `Streams`, `TowerVerb`). Two transports carry it, hidden by
[`/tower.js`](ref:hub/src/tower/tower.js):

```
framed (opaque origin)                      at the tower's origin (/r/<name>/, /run/<project>/<n>)
page → tower  {t: 'call', id, verb, body}   POST /<verb>
page → tower  {t: 'get', id, path}          GET  /<path>
page → tower  {t: 'text' | 'blob', id, path}  GET  /<path>, as text or as a Blob of its type
page → tower  {t: 'watch', id, path}        POST /mux/watch {mux, key, path}  (events on GET /mux)
page → tower  {t: 'unwatch', id}            POST /mux/unwatch {mux, key}
page → tower  {t: 'tower', verb, …}         —   (select, home, shelf: the framing tower's own view; prefs: the viewer's appearance; scheme, deprecated)
page → tower  {t: 'remember', value}        localStorage, keyed by the page's path
page → tower  {t: 'recall', id}             localStorage, keyed by the page's path
page → tower  {t: 'store', key, value}      localStorage, keyed by `key`, shared by every page
page → tower  {t: 'stored', id, key}        localStorage, keyed by `key`, shared by every page
tower → page  {v, board} · answer · event    GET /board {v, board | error} · replies · GET /mux
tower → page  {t: 'prefs', prefs}           localStorage `tower.prefs`, the viewer's appearance
tower → page  {t: 'scheme', scheme}         its scheme alone, for a `url` entry's frame
```

A board the tower can't build arrives as `{v, error: {code, message}}` on the same stream and message, handed to
`tower.onBoardError` ([[board-errors]]).

A renderer relays a page it frames with [`tower.relay`](ref:hub/src/tower/tower.js#relay), part of `tower.js`: the
framed page's requests go to the routes they name, its watches through the framing page's own `tower.watch`, and
the board, board errors and the viewer's appearance follow as they change. The relay is paired per load: the frame's URL carries a fresh `?tower=<token>`, `tower.js` sends it
with every message, and nothing reaches the page before its `hello`. A document the frame navigates to never has
the token, and a frame that loads without a `hello` ends the relay, so a page followed by a link neither reads the
board nor drives the routes. Streams are multiplexed on one SSE connection per client
([`openMux`](ref:hub/src/tower/http.ts#openMux)): a browser holds at most six connections to a host, and a
renderer with a live screen per desk would otherwise starve. The tower page itself streams through
`tower.js`. A declared renderer runs at the tower's origin at `/r/<name>/` ([[renderers-in-config]]), and
[`/run/<project>/<n>`](ref:hub/src/tower/http.ts#run) serves a shelf's `html` entry there too, so it runs on its
own, full screen. [[tower3d]] is a full-parity renderer.

`get` answers JSON as data and anything else as text, `text` reads any read as text and `blob` as a `Blob` of its
type, which is how a framed renderer draws an image in WebGL ([[blob-reads]]). The reads (a shelf's files, a
collection's item, a file a worker showed, [[changes-view]], [[stats]], [[review-threads]] and more) are typed by
`Reads` in `shelf-page.ts`; every verb and every GET route are listed at `/schema` ([[tower-server]]), and each verb's reply
and its errors are in [[renderer-api-contract]].
`remember`/`recall` keep one value per page in the viewer's browser (where a walker stood): a framed page's
own storage throws at its opaque origin, so the framing tower keeps it, per shelf entry.
`tower.store.set`/`get` keep values under keys every page shares, the tower page included, in the same
storage: what one renderer marks (the files viewed in a diff), another reads in the same browser. The viewer's
appearance and colour scheme, `prefs` and `scheme`, are [[viewer-prefs]].

**Alternatives considered.**
- A semantic message set per verb: a second vocabulary to keep in step with the routes, for no gain.
- A WebSocket per client: Node has no WebSocket server built in; SSE plus POST needs no dependency.
- A connection per stream: breaks past five or six live screens.
- A board route a framed page fetches itself: at an opaque origin the route would need
  `Access-Control-Allow-Origin: *`, and with no auth any site open in the browser could read every prompt.
- Guards on which verbs a page gets: the environment is trusted (local, one operator), and a page's code
  could reach the routes anyway once it runs at the tower's origin.

**Consequences.** The tower *server* is no longer disposable: its routes are the contract, and only the tower
*page* is a disposable renderer. A page's remote scripts can type into PTYs. Both transports carry the API version
`v`, checked by `tower.js`, and a breaking change to the routes or the board moves its major ([[renderer-api-contract]]).
A framed page sits at an opaque origin, where modules load only with CORS: the tower serves its shared modules,
stylesheet and faces to any origin ([`ANY_ORIGIN`](ref:hub/src/tower/http.ts#ANY_ORIGIN)).
