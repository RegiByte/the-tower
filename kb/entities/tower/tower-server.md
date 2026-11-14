---
{
  "type": "container",
  "name": "Tower server",
  "summary": "The HTTP server whose routes are the renderer API, and which serves the renderers at /r/<name>/: the board from the live system, commands relayed to the daemons, streams multiplexed per client.",
  "in": "tower-core",
  "reviewed": "2026-11-14",
  "refs": ["hub/src/tower/spine.ts#tower", "hub/src/tower/http.ts#sandboxed", "hub/src/tower/http.ts#byteRange", "hub/src/tower/http.ts#handle", "hub/src/tower/http.ts#command", "hub/src/tower/http.ts#READS", "hub/src/tower/http.ts#describeReads", "hub/src/tower/http.ts#describeStreams", "hub/src/tower/http.ts#route", "hub/src/tower/http.ts#readBody", "hub/src/tower/dispatch.ts#HANDLERS", "hub/src/tower/dispatch.ts#inCollection", "hub/src/bridge/board.ts#board", "hub/src/tower/tower.js", "hub/src/tower/http.ts#screenStream", "hub/src/tower/screens.ts#screenMirrors", "hub/src/tower/screens.ts#lastFrames", "hub/src/tower/http.ts#openMux", "hub/src/tower/publisher.ts#sendBoard", "hub/src/tower/http.ts#sse", "hub/src/tower/http.ts#run", "hub/src/tower/http.ts#rendered", "hub/src/tower/http.ts#clientFile", "hub/src/tower/http.ts#served", "hub/src/tower/http.ts#preloaded", "hub/src/tower/served.ts#clientModule", "hub/src/tower/served.ts#moduleGraph", "hub/src/tower/served.ts#importMap", "hub/src/tower/publisher.ts#boardOf", "hub/src/tower/http.ts#home", "hub/src/renderers.ts#renderersOf", "hub/renderers/page/index.html", "hub/renderers/page/page.js", "hub/test/server.test.ts", "hub/src/views/shelf.ts#showPage", "hub/src/views/html.ts#mount", "hub/renderers/tower3d/src/ui.ts#relayedFrameHtml"],
  "links": [
    { "to": "live-system", "verb": "uses", "carries": "watchSystem: sessions with facts, live set, shells, leftovers; onChange publishes the board" },
    { "to": "host-daemon", "verb": "calls", "carries": "spawn, write, resize, kill over control.sock" },
    { "to": "terms-daemon", "verb": "calls", "carries": "spawn, write, resize, kill and attach over terms.sock" },
    { "to": "system-root", "verb": "reads", "carries": "config.json on every request; shelf files under each project's hub, or a shelf item in its collection" },
    { "to": "operator", "verb": "opens", "carries": "a path the system names in Finder (reveal) or the user's editor (edit), project dirs in a new editor window (open)" },
    { "to": "system-root", "verb": "writes", "carries": "config.json, one checked edit per config verb, then read again at once" },
    { "to": "system-root", "verb": "writes", "carries": "collection items: create, write, delete inside declared collections" }
  ]
}
---
`tower up` starts it detached with the daemons ([[bring-up]]), `npm run tower` in the foreground, on the
config's `port`, read when it starts ([[port-in-config]]). The process is seven braided resources and one per
extension ([[spine]], [[extensions]]): this server is `core:http`, over `core:dispatch` (the verbs' handlers),
`core:publisher` (the board and its clients), `core:extensions` (what the extensions show), `core:system`,
`core:config`, and `core:slots`, the slot loop ([`runSlots`](ref:hub/src/slots.ts#runSlots): the extensions' slots, the policies extension's among them, [[policies]]). SIGTERM (`tower down`) or SIGINT halts them in reverse: the server closes every connection, its streams
stop with them and its screen mirrors are dropped. `GET /extensions` answers every extension and the resources'
topology, and `GET /schema` serves an extension's manifest as `extension`. `GET /config` reads the config file as it
holds it, and the config verbs edit it one key at a time ([[config-writes]]). The board (floors of cards, rate limits, today's stats, extensions, shells) is
derived by [`board`](ref:hub/src/bridge/board.ts#board), with the running extensions' folds on it
([`boardOf`](ref:hub/src/tower/publisher.ts#boardOf): a fold that calls `ctx.board()` throws, since it holds the board), and pushed over SSE, debounced: it carries the present, and
every other card is read at [`/archive/<project>`](ref:hub/src/tower/http.ts#archive) ([[board-archive]]). The board's
`jobs` holds the jobs running or over within the last day, `GET /jobs` every job the log holds, and a job's screen
streams at `/job/<id>/screen` from the jobs daemon while it keeps it, as a shell's does from terms
([`streamPty`](ref:hub/src/tower/http.ts#streamPty), [[jobs]]). A session screen is
a stream ([`screenStream`](ref:hub/src/tower/http.ts#screenStream)): a snapshot, marked `exited` (read-only) unless
the host still runs the session and its log holds no exit yet (the host's live set is polled, so it can still list a
session that just exited), then the log's output as it is appended. A running session's screen is one
[mirror](ref:hub/src/tower/screens.ts#screenMirrors) shared by all its viewers: the first builds it, replaying the
log once ([`mirrorOf`](ref:hub/src/bridge/screen.ts#mirrorOf)), it follows the log with one tail, and every later
viewer is sent its snapshot at the size the mirror drew it (a resize its replay took has no `r` to follow), so a floor of monitors opening at once costs one replay per session, not one per
monitor. It outlives its last viewer briefly, so a reconnect finds it built, and is kept nowhere else. A session no longer running is sent its last frame, a
[snapshot](ref:hub/src/bridge/screen.ts#snapshot) of the log at the size its replay drew it, and no mirror. A log that holds its exit never changes,
so its frame is computed once and kept in memory ([`lastFrames`](ref:hub/src/tower/screens.ts#lastFrames), bounded, guarded by the log's size). A session without an exit in its log (stranded by the host) is replayed on every
open. An interactive terminal opens the same stream as `terminal/<id>`
([`terminalStream`](ref:hub/src/tower/http.ts#terminalStream)), whose snapshot also says how many other terminals
are open on the session, so a renderer claims the PTY size on open only as the sole one ([[tower3d-desk]]). A board
client observes the machine while it holds the board ([[live-system]]); its first board waits three seconds at most for
that read, so a repo that hangs costs a slow first board, not a blank page, and what isn't read yet comes on later
boards. A verb that decides from the read, Tidy among them, waits for all of it (`observe`). Screens and shells stream on their own routes or
multiplexed on one connection per client ([`openMux`](ref:hub/src/tower/http.ts#openMux)). Requests from
any other site are refused.

A viewer that stops reading (a suspended tab, a frozen web view) costs the tower a bounded amount: a board client
still reading an earlier board is sent the newest once it has, the boards between skipped
([`sendBoard`](ref:hub/src/tower/publisher.ts#sendBoard)); a screen, shell or mux connection, whose bytes can't be
skipped, is closed once what waits for it hasn't drained within a time or a size bound
([`sse`](ref:hub/src/tower/http.ts#sse)), and its client reconnects and starts again from a snapshot (`tower.js` re-watches every stream on a new mux). A stream that fails to open answers its
watch with the failure and leaves nothing behind on the mux.

Renderers are served at [`/r/<name>/`](ref:hub/src/tower/http.ts#rendered): the entry, or any file below the
renderer's root that isn't hidden there (`.git`, `.env`), at the tower's origin and unsandboxed, since the user declared them; its files are readable from
any origin, so a renderer framed on a shelf at an opaque origin still loads its modules. Framed at the tower's
origin, as a shown URL, `tower.js` calls the routes itself; only a frame at an origin of its own is relayed. `/` redirects to the configured
one ([`home`](ref:hub/src/tower/http.ts#home)), and `GET /renderers` lists every one
([`renderersOf`](ref:hub/src/renderers.ts#renderersOf)), built or not ([[renderers-in-config]]). A renderer that
isn't built, or a config that can't be read, shows as an HTML page saying so: a reader of `/` is in a browser tab.
A running extension's `client` folder is served the same way at [`/x/<cap>/`](ref:hub/src/tower/http.ts#clientFile),
readable from any origin: its commands' modules, which renderers import ([[extensions]]).

The routes are the renderer API ([[renderer-api]]); the tower page (`renderers/page/`) is one renderer over them, and reaches them only
through [`/tower.js`](ref:hub/src/tower/tower.js) like any other: the board, commands (the calls of the board's `actions` where it
offers them), reads and streams. It relays a framed shelf page's requests to the same `tower.js`.

Every command goes through [`command`](ref:hub/src/tower/http.ts#command): the body, read up to 28 MB
([`readBody`](ref:hub/src/tower/http.ts#readBody), refused past it as `invalid` with the rest left unread), is parsed by the verb's
schema in [`api.ts`](ref:hub/src/shared/api.ts), handled by its entry in
[`HANDLERS`](ref:hub/src/tower/dispatch.ts#HANDLERS) with the caller the request claims, and the reply checked against
the verb's reply schema, all through the dispatch's [`call`](ref:hub/src/tower/dispatch.ts#call), by which an
extension's `POST /<cap>/<verb>` is answered too, and a writable fact's door `POST /<cap>/facts/<name>`; a path no entry of `READS` matches is an extension's read when its
first segment is a running capability ([[extensions]]). Handlers
return a reply or an error as a value; a daemon that answers no becomes `refused` (`not_found` when the terms daemon
holds no such shell), one that doesn't answer `unavailable`. A spawn, a resume or a fork answers once the system tracks the new session's log, or
after `TRACK_TIMEOUT_MS` without it, answering `spawned` all the same ([`host`](ref:hub/src/tower/dispatch.ts#host)). Every GET but the served files (`/tower.js`, the
design, the modules, the vendored scripts) is an entry of [`READS`](ref:hub/src/tower/http.ts#READS), matched by
[`route`](ref:hub/src/tower/http.ts#route): an API read answers as data, so an extension's `ctx.read` takes the same
reply ([[extensions]]), and pages, streams and the schema are served on the response itself. The typecheck refuses an
entry naming a read the API doesn't declare and a declared read with no entry. Reads answer their failures as the same `{t: 'error', code, message}` ([[renderer-api-contract]]).
[`/schema`](ref:hub/src/tower/http.ts#apiSchema) serves every verb's input and reply, every entry of `READS` as a read
(its path with named params, its kind, its query's schema), and the error, as JSON
Schema, derived by [`describeReads`](ref:hub/src/tower/http.ts#describeReads) from the entries themselves, the streams described on their `READS` entries (`/board`, `/mux`) beside `terminal/<id>`, which only `/mux` reaches, and the `board` stream's message as the JSON Schema generated from `BoardMsg` ([[renderer-api-contract]]); `/board` sends `{v, served, board}`, or `{v, served, error}` while the board can't be built ([[board-errors]]), `served` the code the tower started on ([[stale-page]]). A handler
that throws answers `config` for a [`ConfigError`](ref:hub/src/shared/model.ts#ConfigError), else `internal`
([`errorOf`](ref:hub/src/tower/answers.ts#errorOf)), and goes to the log.

The design system's `/design.css` and faces, `/tower.js` and the shared modules
([[renderer-shared-modules]]) are served readable from any origin, each source file once at its own internal URL
(`/shared/`, `/src/`, `/vendor/`, [`served`](ref:hub/src/tower/http.ts#served)) so a page holds one instance of
every module, and the library, at `/lib/`, is served the same way ([[library]]); a core view or a bundled client's `.ts` is bundled with its own modules and packages, what it reaches
below `src/` imported by URL, and the library, `/tower.js` and `/x/` kept as the URLs they are, in a checkout or out of it ([`clientModule`](ref:hub/src/tower/served.ts#clientModule)). A renderer's html page is
served with its module scripts' static graph ([`preloaded`](ref:hub/src/tower/http.ts#preloaded),
[`moduleGraph`](ref:hub/src/tower/served.ts#moduleGraph)): an import map
([`importMap`](ref:hub/src/tower/served.ts#importMap)) naming each file and package at the hash of its text, served
`immutable`, and each served module at its file's hashed URL, so a reload asks again only for what changed; and a
`modulepreload` link for each module, so the browser asks for them at once rather than one level of imports at a
time. Modules keep importing the unhashed URLs and the map resolves them, so one file is still one module record. The
tower keeps every hashed text it named, so a page left open across a change still gets what its map named; a hash it
never named (an open page across a restart) answers the text as it is now, uncached. Every other response from a file or
built text carries `cache-control: no-store` (`FRESH`): renderer files and pages, redirects, problem pages. The few large
unhashed texts (`/tower.js`, `/design.css`, the unhashed module URLs, the vendored scripts) are `no-cache` with an
`ETag` of their text ([`revalidated`](ref:hub/src/tower/http.ts#revalidated)), so a reload over a slow link is a 304.
With no validators a browser may keep a response for the life of its process; only a hashed URL and the fonts are
cached outright. What renderers build on is part of the
API's contract ([[renderer-api-contract]]); the internal URLs are not.

Shelf entries are served only when declared in the config, with a CSP `sandbox` header
([`sandboxed`](ref:hub/src/tower/http.ts#sandboxed)); a video or a sound (a `video/*` or `audio/*` media type) gets
`nosniff` instead: it runs no script, and Chrome plays no media document under a sandbox. A page a renderer frames is
held by that header and by its iframe's own `sandbox` attribute at once, so it gets what the two share: a new
permission goes in the header and in each frame that needs it
([`tower/shelf`](ref:hub/src/views/shelf.ts#showPage), [`tower/html`](ref:hub/src/views/html.ts#mount), Tower 3D's
[`relayedFrameHtml`](ref:hub/renderers/tower3d/src/ui.ts#relayedFrameHtml)). A file says its length, without
which WebKit refuses it as a media element's `src` (`MEDIA_ERR_SRC_NOT_SUPPORTED`), and answers a single byte range
([`byteRange`](ref:hub/src/tower/http.ts#byteRange)), as media players ask to stream and seek a file. An html one gets `<script src="/frame-keys.js">` appended,
which sends its keys, and nothing else, to the tower framing it ([[keymap]]), and `<script src="/frame-picks.js">`
before it, which sends its selection ([[passage-picks]]). So are collection items
(`/collection/<project>/<collection>/<item>`), and [`inCollection`](ref:hub/src/tower/dispatch.ts#inCollection)
changes items only inside a collection the config declares for the project ([[collections]]). A file a worker
showed (`/shown/<id>/<path>`) is served the same way, and only while that session's log shows it ([[agent-show]]). `/submit` types a prompt
into a worker's composer through [`submitText`](ref:hub/src/machine.ts#submitText), and `/submit/at-prompt` only while
it sits at its prompt with nothing in its composer ([[submit-at-prompt]]). A worker's `submit`, `spawn`,
`kill` and `keys` (with `by`) are named in the target's log first ([[worker-prompts]]); a `/spawn` with `hire` is
weighed against the floor's limits by [`hired`](ref:hub/src/tower/dispatch.ts#hired) ([[hiring-limits]]); a worker that
asked to go home is sent home once its turn completes ([[leave]]). An `item` shelf entry's file is served from its
collection, alone ([[shelf-items]]).

An open `html` entry is framed with scripts, popups and pointer lock allowed. It gets the board over
`postMessage` and reaches every route through the page's `tower.relay`;
[`/run/<project>/<n>`](ref:hub/src/tower/http.ts#run) serves the same entry at the tower's origin, unsandboxed,
as a renderer of its own; its redirect to the entry's page keeps the query (`?board=`, `?seed=`).

One integration test ([`server.test.ts`](ref:hub/test/server.test.ts)) boots this file as its own process on a throwaway
root, with no host or terms daemon (a session is a log written into the root), and drives it over HTTP.
