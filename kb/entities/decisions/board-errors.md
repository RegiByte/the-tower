---
{
  "type": "decision",
  "name": "The board stream says why it can't build the board",
  "summary": "When building the board throws, GET /board sends {v, error: {code, message}} in place of the board, config for a config the tower can't read or take and internal otherwise; tower.js hands it to onBoardError, every renderer shows it over its last board, and a watch on the config file brings the board back once it is fixed.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-17",
  "refs": [
    "hub/src/tower/server.ts#currentBoard",
    "hub/src/tower/server.ts#errorOf",
    "hub/src/tower/server.ts#problemPage", "hub/src/tower/server.ts#withConfig",
    "hub/src/shared/shelf-page.ts#BoardMsg",
    "hub/src/shared/shelf-page.ts#BoardError",
    "hub/src/shared/cards.ts#boardErrorTitle",
    "hub/src/shared/api.ts#ERROR_CODES",
    "hub/src/shared/model.ts#ConfigError",
    "hub/src/system.ts#readConfig",
    "hub/src/system.ts#watchSystem",
    "hub/src/tower/tower.js",
    "hub/renderers/page/index.html",
    "hub/renderers/tower3d/src/main.ts#onBoardError"
  ]
}
---
**Problem.** A board the tower can't build (a hand-edited config with a value it can't use, or JSON that doesn't
parse) must not leave every renderer empty with the reason only in `tower.log`, nor end the tower process.

**Why.** A renderer that can't get a board should say why, and every renderer should be able to, so the reason
belongs to the API, not to one page. The fix is the user's (a typo in the config): the message has to name it.

**How.**
- **The stream carries the failure.** [`currentBoard`](ref:hub/src/tower/server.ts#currentBoard) catches whatever
  building the board throws and sends `{v, error: {code, message}}`
  ([`BoardMsg`](ref:hub/src/shared/shelf-page.ts#BoardMsg)) on the same stream, deduplicated like boards. The tunnel's
  `board` message carries it the same way, with `error` in place of `board`.
- **Two codes.** [`ConfigError`](ref:hub/src/shared/model.ts#ConfigError) marks what the user must fix in the config:
  JSON that doesn't parse ([`readConfig`](ref:hub/src/system.ts#readConfig) names the file), and a key the tower
  reads with a value it can't use (a `user.name` no note can carry, an `editor` template, `keys`, `callsigns`,
  `port`, a renderer, a collection that clashes). It answers `config`; anything else answers `internal` and goes to the log with its stack
  ([`errorOf`](ref:hub/src/tower/server.ts#errorOf)). The same mapping answers any request whose handler throws, which
  would otherwise end with an empty 500.
- **Renderers.** `tower.onBoardError(fn)` is called with an `Error` holding `code`, at once if the tower's latest word
  was a failure; the next board through `subscribe` means it recovered. The tower page and Tower 3D show it in a
  banner over the last board they drew, gone with the next board (Tower 3D, before its first board, on its loading
  screen too, [[tower3d-start]]); the tower page relays it to a framed page.
- **A lost tower is a board error too.** When `/board` drops, `tower.js` tells `onBoardError` an error of code
  `disconnected` ([`BoardError`](ref:hub/src/shared/shelf-page.ts#BoardError): told by the client, never sent by the
  tower), once until a board comes back. The browser's `EventSource` reconnects by itself after a dropped connection;
  one it gave up on (an error answer) `tower.js` opens again after a pause, `/mux` alike, whose next id re-watches every
  stream. The board through `subscribe` clears it, as for the tower's own errors, and the tower page relays it to a
  framed page. Renderers head it with [`boardErrorTitle`](ref:hub/src/shared/cards.ts#boardErrorTitle); the tower
  page also dims the board and its counts, reads the host as `unknown` (`HostState`), and stops its `data-since`
  times at the moment it was lost.
- **Recovery without a reload.** [`watchSystem`](ref:hub/src/system.ts#watchSystem) watches the config's directory
  for the config file (editors replace it on save, which a watch on the file itself would lose), so a fix publishes
  the board at once. A config the tower can't read keeps the repos' last git read.

**Alternatives considered.**
- *An SSE `event: error`.* `EventSource` raises its own `error` on every dropped connection, on the same listener: a
  renderer couldn't tell the tower's word from a restart.
- *A fallback board (empty floors, `error` field).* A board that looks real while saying nothing; renderers would draw
  an empty tower.
- *Validating the whole config with a schema on every read.* A config the tower's readers don't foresee fails where it
  is first read, as `internal` with JavaScript's message, shown the same way. `tower config check` and `tower doctor` read a config as the tower
  does and name each problem at its key path ([`configProblems`](ref:hub/src/config-check.ts#configProblems)),
  outside the board.
- *Retrying on a timer.* The config watch is the event the board waits for; nothing else can fix it.

**Impact.** A broken config is told on every renderer and by every verb that reads it, and the tower survives
config JSON that doesn't parse. `/`, `/r/<name>/` and `/run/<project>/<n>` need the config to find what they serve, so
with unparseable JSON they answer the `config` error themselves, in place of the page: as an HTML page in the
design's style (the message and the config's path, `problemPage`) with the error's status, since a browser tab reads it. The API's routes answer JSON. The host, the terms daemon and `tower` read the config their
own way and still throw JavaScript's message.
