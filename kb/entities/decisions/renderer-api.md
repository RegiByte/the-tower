---
{
  "type": "decision",
  "name": "The tower's routes are the renderer API",
  "summary": "Every renderer drives the system through the tower server's HTTP routes, version 23: framed shelf pages reach them over a postMessage tunnel, pages at the tower's origin call them directly, and streams share one multiplexed connection.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-03",
  "supersedes": "shelf-page-contract",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/api.ts", "hub/src/shared/api.ts#QUERIES", "hub/src/shared/shelf-page.ts", "hub/src/tower/tower.js", "hub/src/tower/server.ts#openMux", "hub/src/tower/server.ts#run", "hub/renderers/page/index.html"]
}
---
**Context.** Shelf pages could read the board but not act ([[shelf-page-contract]]), so no renderer on a
shelf could ever do what the tower page does: by definition the tower could not be replaced from inside it.
The tower page already drove everything through about a dozen HTTP routes and two SSE streams.

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
tower → page  board v14 · answer · event     GET /board {v, board | error} · replies · GET /mux
tower → page  {t: 'prefs', prefs}           localStorage `tower.prefs`, the viewer's appearance
tower → page  {t: 'scheme', scheme}         its scheme alone, for a `url` entry's frame
```

A board the tower can't build arrives as `{v, error: {code, message}}` on the same stream and message, handed to
`tower.onBoardError` ([[board-errors]]).

The tower page relays a framed page's requests to the routes they name, and its watches through its own
`tower.watch`. The relay is paired per load: the frame's URL carries a fresh `?tower=<token>`, `tower.js` sends it
with every message, and nothing reaches the page before its `hello`. A document the frame navigates to never has
the token, and a frame that loads without a `hello` ends the relay, so a page followed by a link neither reads the
board nor drives the routes. Streams are multiplexed on one SSE connection per client
([`openMux`](ref:hub/src/tower/server.ts#openMux)): a browser holds at most six connections to a host, and a
renderer with a live screen per desk would otherwise starve. The tower page itself now streams through
`tower.js`. A declared renderer runs at the tower's origin at `/r/<name>/` ([[renderers-in-config]]), and
[`/run/<project>/<n>`](ref:hub/src/tower/server.ts#run) serves a shelf's `html` entry there too, so it runs on its
own, full screen. [[tower3d]] is a full-parity renderer.

`get` answers JSON as data and anything else as text, so a renderer reads a shelf's file list
(`shelf/<project>/<n>`) and its markdown (`shelf/<project>/<n>/<file>`) through the same read, and a collection's
item (`collection/<project>/<collection>/<item>`, listed on the board) too, and a file a worker showed
(`shown/<id>/<path>`, on its card), and what a worker changed in its repos (`changes/<id>`, [[changes-view]]), and stats over every log
(`stats?from&to&bucket&project`, `tower.stats(query)`: a read whose query has a schema, listed at `/schema` under
`reads`, [[stats]]), what landing changed on a carried branch (`landing?project&branch`, `tower.landing(query)`, [[carried]]), and a project's review threads, live and landed, as history (`reviews/<project>`, [[review-threads]]). `text` reads any of them as text and `blob` as a `Blob` of its type,
which is how a framed renderer draws an image in WebGL ([[blob-reads]]). `collection/create | write | delete`
change items and `submit` types a prompt into a worker's composer ([[collections]]); `review/append` appends a note
to a checkout's review thread, and `/reviews.js` serves the threads' format to renderers ([[review-threads]]); `spawn {cut}`,
`worktree/recut | prune | remove`, `branch/delete` and `tidy` cut and tidy worktrees ([[tower-cuts-worktrees]]), and
`worktree/discard` throws away work that never landed ([[discard]]); each verb's reply and its
errors are in [[renderer-api-contract]].
`remember`/`recall` keep one value per page in the viewer's browser (where a walker stood): a framed page's
own storage throws at its opaque origin, so the framing tower keeps it, per shelf entry.
`tower.store.set`/`get` keep values under keys every page shares, the tower page included, in the same
storage: what one renderer marks (the files viewed in a diff), another reads in the same browser.
`tower.scheme()`/`onScheme` carry the viewer's colour scheme ([[design-system]]): `tower.js` puts the choice on
the root's `data-scheme`, so a page linking `/design.css` follows the tower's toggle as well as the system. A
`url` entry's frame is sent the same `scheme` message on each load and change (its only message: the choice is
not private), so a separately served app can follow the toggle by setting its own `data-scheme`.
The choice behind it is a field of the viewer's appearance, `tower.prefs` (API 1.13, [[viewer-prefs]]): at the
tower's origin `tower.js` keeps the record in localStorage `tower.prefs`, framed it asks the framing page (`{t: 'tower',
verb: 'prefs'}`), which keeps it and sends `prefs` back, so any renderer's settings change every page's appearance
([[settings-and-tips]]). `tower.schemeChoice()`/`chooseScheme(c)` (API 1.3) and the `scheme` verb stay, deprecated.

**Alternatives considered.**
- A semantic message set per verb: a second vocabulary to keep in step with the routes, for no gain.
- A WebSocket per client: Node has no WebSocket server built in; SSE plus POST needs no dependency.
- A connection per stream: breaks past five or six live screens.
- Guards on which verbs a page gets: the environment is trusted (local, one operator), and a page's code
  could reach the routes anyway once it runs at the tower's origin.

**Consequences.** The tower *server* is no longer disposable: its routes are the contract, and only the tower
*page* is a disposable renderer. A page's remote scripts can type into PTYs. `v` ([[renderer-api-contract]], declared once in `api.ts`), carried by both transports and checked by `tower.js`; a breaking change to
the routes or the board bumps it. Three.js loads as ES modules from a CORS-enabled CDN inside the opaque
frame; only the tower's own files can't be imported as modules there.
