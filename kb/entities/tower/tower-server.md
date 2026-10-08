---
{
  "type": "container",
  "name": "Tower server",
  "summary": "The HTTP server whose routes are the renderer API, and which serves the renderers at /r/<name>/: the board from the live system, commands relayed to the daemons, streams multiplexed per client.",
  "in": "web-tower",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/tower/server.ts#sandboxed", "hub/src/tower/server.ts#handle", "hub/src/tower/server.ts#command", "hub/src/tower/server.ts#HANDLERS", "hub/src/tower/server.ts#inCollection", "hub/src/bridge/board.ts#board", "hub/src/tower/tower.js", "hub/src/tower/server.ts#screenStream", "hub/src/tower/server.ts#openMux", "hub/src/tower/server.ts#run", "hub/src/tower/server.ts#rendered", "hub/src/tower/server.ts#home", "hub/src/renderers.ts#renderersOf", "hub/renderers/page/index.html"],
  "links": [
    { "to": "live-system", "verb": "uses", "carries": "watchSystem: sessions with facts, live set, shells, leftovers; onChange publishes the board" },
    { "to": "host-daemon", "verb": "calls", "carries": "spawn, write, resize, kill over control.sock" },
    { "to": "terms-daemon", "verb": "calls", "carries": "spawn, write, resize, kill and attach over terms.sock" },
    { "to": "system-root", "verb": "reads", "carries": "config.json on every request; shelf files under each project's hub, or a shelf item in its collection" },
    { "to": "operator", "verb": "opens", "carries": "a path the system names in Finder (reveal) or the user's editor (edit), project dirs in a new editor window (open)" },
    { "to": "system-root", "verb": "writes", "carries": "collection items: create, write, delete inside declared collections; review threads appended (review/append), and filed by tidy once their checkout landed (`<checkout>@<time>.md`), read back as history at /reviews/<project>" }
  ]
}
---
`tower up` starts it detached with the daemons ([[bring-up]]), `npm run tower` in the foreground, on the
config's `port`, read when it starts ([[port-in-config]]). The board (floors of cards, rate limits, today's stats, shells) is
derived by [`board`](ref:hub/src/bridge/board.ts#board) and pushed over SSE, debounced: it carries the present, and
every other card is read at [`/archive/<project>`](ref:hub/src/tower/server.ts#archive) ([[board-archive]]). A session screen is
a stream ([`screenStream`](ref:hub/src/tower/server.ts#screenStream)): a [snapshot](ref:hub/src/bridge/screen.ts#snapshot)
rebuilt from the log, marked `exited` (read-only) unless the host still runs the session, then the log's
output as it is appended. An interactive terminal opens the same stream as `terminal/<id>`
([`terminalStream`](ref:hub/src/tower/server.ts#terminalStream)), whose snapshot also says how many other terminals
are open on the session, so a renderer claims the PTY size on open only as the sole one ([[tower3d-desk]]). A board
client observes the machine while it holds the board ([[live-system]]). Screens and shells stream on their own routes or
multiplexed on one connection per client ([`openMux`](ref:hub/src/tower/server.ts#openMux)). Requests from
any other site are refused.

Renderers are served at [`/r/<name>/`](ref:hub/src/tower/server.ts#rendered): the entry, or any file below the
renderer's root, at the tower's origin and unsandboxed, since the user declared them. `/` redirects to the configured
one ([`home`](ref:hub/src/tower/server.ts#home)), and `GET /renderers` lists every one
([`renderersOf`](ref:hub/src/renderers.ts#renderersOf)), built or not ([[renderers-in-config]]). A renderer that
isn't built, or a config that can't be read, shows as an HTML page saying so: a reader of `/` is in a browser tab.

The routes are the renderer API ([[renderer-api]]); the tower page (`renderers/page/`) is one renderer over them, and reaches them only
through [`/tower.js`](ref:hub/src/tower/tower.js) like any other: the board, commands (the board's `calls` where it
offers them), reads and streams. It relays a framed shelf page's requests to the same `tower.js`.

Every command goes through [`command`](ref:hub/src/tower/server.ts#command): the body is parsed by the verb's
schema in [`api.ts`](ref:hub/src/shared/api.ts), handled by its entry in
[`HANDLERS`](ref:hub/src/tower/server.ts#HANDLERS), and the reply checked against the verb's reply schema. Handlers
return a reply or an error as a value; a daemon that answers no becomes `refused`, one that doesn't answer
`unavailable`. Reads answer their failures as the same `{t: 'error', code, message}` ([[renderer-api-contract]]).
[`/schema`](ref:hub/src/tower/server.ts#apiSchema) serves every verb's input and reply, and the error, as JSON
Schema, and `/board` sends `{v, board}`, or `{v, error}` while the board can't be built ([[board-errors]]). A handler
that throws answers `config` for a [`ConfigError`](ref:hub/src/shared/model.ts#ConfigError), else `internal`
([`errorOf`](ref:hub/src/tower/server.ts#errorOf)), and goes to the log.

The design system ([[design-system]]) is served from [`design`](ref:hub/src/tower/server.ts#design): `/design.css`,
the module `/design.js` and its faces, readable from any origin, and the drafts editor renderers share,
`/drafts.js` ([[corkboard]]), what renderers say about a worker, `/cards.js`
([`cards.ts`](ref:hub/src/shared/cards.ts)): status words, the one-line gist, times, the order and keys that move
between workers, and the icons they draw, `/icons.js` ([`icons.ts`](ref:hub/src/shared/icons.ts)), and the review threads' format,
`/reviews.js` ([[review-threads]]), and the Changes and Reviews panels, `/panels.js` ([[shared-panels]]). Every module
in [`MODULES`](ref:hub/src/tower/served.ts#MODULES) is served as JavaScript, bundled with what it imports
([`bundled`](ref:hub/src/tower/served.ts#bundled)). What it serves for renderers to build on (`/tower.js`, `/design.css`
and these modules) is part of the API's contract ([[renderer-api-contract]]).

Shelf entries are served only when declared in the config, with a CSP `sandbox` header
([`sandboxed`](ref:hub/src/tower/server.ts#sandboxed)); a video (`.mp4`, `.webm`) gets `nosniff` instead: it runs no
script, and Chrome plays no video document under a sandbox. So are collection items
(`/collection/<project>/<collection>/<item>`), and [`inCollection`](ref:hub/src/tower/server.ts#inCollection)
changes items only inside a collection the config declares for the project ([[collections]]). A file a worker
showed (`/shown/<id>/<path>`) is served the same way, and only while that session's log shows it ([[agent-show]]). `/submit` types a prompt
into a worker's composer through [`submitText`](ref:hub/src/machine.ts#submitText). claude.ai
artifacts refuse framing, so they go on the shelf as `link`, not `url`. An `item` entry's file is served from its
collection, alone ([[shelf-items]]).

An open `html` entry is framed with scripts, popups and pointer lock allowed. It gets the board over
`postMessage` and reaches every route through the page's relay;
[`/run/<project>/<n>`](ref:hub/src/tower/server.ts#run) serves the same entry at the tower's origin, unsandboxed,
as a renderer of its own; its redirect to the entry's page keeps the query (`?board=`, `?seed=`).
