---
{
  "type": "decision",
  "name": "The board stream says why it can't build the board",
  "summary": "When building the board throws, GET /board sends {v, error: {code, message}} in place of the board, config for a config the tower can't read or take and internal otherwise; tower.js hands it to onBoardError, every renderer shows it over its last board, and a watch on the config file brings the board back once it is fixed.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-20",
  "refs": [
    "hub/src/tower/server.ts#currentBoard",
    "hub/src/tower/server.ts#errorOf",
    "hub/src/tower/server.ts#problemPage", "hub/src/tower/server.ts#withConfig",
    "hub/src/shared/shelf-page.ts#BoardMsg",
    "hub/src/shared/shelf-page.ts#BoardError",
    "hub/src/shared/cards.ts#boardErrorTitle",
    "hub/src/shared/cards.ts#HostState",
    "hub/src/shared/api.ts#ERROR_CODES",
    "hub/src/shared/model.ts#ConfigError",
    "hub/src/system.ts#readConfig",
    "hub/src/system.ts#watchSystem",
    "hub/src/tower/tower.js",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
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
  ([`BoardMsg`](ref:hub/src/shared/shelf-page.ts#BoardMsg)) on the same stream, deduplicated like boards; a framed
  page's `board` message carries it the same way.
- **Two codes.** [`ConfigError`](ref:hub/src/shared/model.ts#ConfigError) marks what the user must fix in the config:
  JSON that doesn't parse ([`readConfig`](ref:hub/src/system.ts#readConfig) names the file), and a key with a value
  the tower can't use, thrown where that key is read. It answers `config`; anything else answers `internal` and goes
  to the log with its stack ([`errorOf`](ref:hub/src/tower/server.ts#errorOf)). The same mapping answers any request
  whose handler throws.
- **Renderers.** `tower.onBoardError(fn)` is called with an `Error` holding `code`, at once if the tower's latest word
  was a failure; the next board through `subscribe` means it recovered. Renderers show it over the last board they
  drew, headed by [`boardErrorTitle`](ref:hub/src/shared/cards.ts#boardErrorTitle) (Tower 3D, before its first board,
  on its loading screen, [[tower3d-start]]); the tower page relays it to a framed page.
- **A lost tower is a board error too.** When `/board` drops, `tower.js` tells `onBoardError` an error of code
  `disconnected` ([`BoardError`](ref:hub/src/shared/shelf-page.ts#BoardError): told by the client, never sent by the
  tower) and reopens the stream itself when the browser gives up on it. While it lasts, the tower page dims the board,
  reads the host as `unknown` ([`HostState`](ref:hub/src/shared/cards.ts#HostState)) and stops its times at the
  moment it was lost.
- **Recovery without a reload.** [`watchSystem`](ref:hub/src/system.ts#watchSystem) watches the config's directory
  for the config file (editors replace it on save, which a watch on the file itself would lose), so a fix publishes
  the board at once. A config the tower can't read keeps the system's last reads.

**Alternatives considered.**
- *An SSE `event: error`.* `EventSource` raises its own `error` on every dropped connection, on the same listener: a
  renderer couldn't tell the tower's word from a restart.
- *A fallback board (empty floors, `error` field).* A board that looks real while saying nothing; renderers would draw
  an empty tower.
- *Validating the whole config with a schema on every read.* A config the tower's readers don't foresee fails where
  it is first read, as `internal`, shown the same way. `tower config check` and `tower doctor` name each problem at
  its key path ([`configProblems`](ref:hub/src/config-check.ts#configProblems)), outside the board.
- *Retrying on a timer.* The config watch is the event the board waits for; nothing else can fix it.

**Impact.** A broken config is told on every renderer and by every verb that reads it, and the tower survives
config JSON that doesn't parse. `/`, `/r/<name>/` and `/run/<project>/<n>` need the config to find what they serve, so
with unparseable JSON they answer the `config` error as an HTML page ([`withConfig`](ref:hub/src/tower/server.ts#withConfig),
[`problemPage`](ref:hub/src/tower/server.ts#problemPage)), since a browser tab reads it; the API's routes answer JSON.
The host, the terms daemon and `tower` read the config their own way and still throw JavaScript's message.
