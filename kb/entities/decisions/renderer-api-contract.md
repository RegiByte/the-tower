---
{
  "type": "decision",
  "name": "The renderer API is declared once, as schemas",
  "summary": "Every verb of the renderer API is a zod schema of its input and reply in one module; the tower parses every request with it and answers failures as typed errors, the board carries ready requests beside its verbs, and the schemas are served as JSON Schema for renderers in any language. Its version is major.minor, and only a major breaks a renderer. What the tower serves for renderers to build on (/tower.js, /design.css and the shared modules) is part of the contract: removing or renaming an export is a major, adding one a minor, held by a test over a checked-in list of every served name.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-15",
  "refs": ["hub/src/shared/api.ts#VERBS", "hub/src/shared/api.ts#ApiError", "hub/src/tower/server.ts#command", "hub/src/tower/server.ts#apiSchema", "hub/src/shared/api.ts#API_VERSION", "hub/src/tower/tower.js", "hub/src/tower/served.ts#towerClient", "hub/src/tower/served.ts#MODULES", "hub/test/served.test.ts", "hub/test/served-exports.json", "hub/docs/extending.md", "hub/src/bridge/verbs.ts#cardOffers", "hub/test/board.test.ts", "hub/src/shared/api.ts#ERROR_STATUS", "hub/src/shared/api.ts#ERROR_CODES", "hub/src/collections.ts#itemVersion", "hub/scripts/board-schema.ts", "hub/test/board-schema.test.ts"]
}
---
**Problem.** The [[renderer-api]] is the contract the next renderer reads, and that renderer may not be written in
TypeScript. A type the server doesn't check lets malformed requests through as coerced values; errors that are only
messages can be shown but never acted on; and every renderer that turns a verb the board offers into a request by hand
gets it slightly differently.

**Why.** A renderer must be able to learn the contract from the tower, send a request the tower checks, branch on what
went wrong, and know which changes can break it.

**How.**
- **One schema per verb.** [`VERBS`](ref:hub/src/shared/api.ts#VERBS) in `src/shared/api.ts` holds `{ input, reply }`
  as zod schemas; `Verbs` and the replies are `z.infer` of them, so the types can't drift from what is checked. zod
  runs in the tower only: the host and the terms daemon keep their own small protocols.
- **One dispatch.** Every `POST /<verb>` is parsed, handled and answered in one place
  ([`command`](ref:hub/src/tower/server.ts#command)); a body that doesn't parse is refused before any handler runs.
  `mux/watch` and `mux/unwatch` are transport: parsed the same way, but not verbs.
- **Errors are data.** Every failure, of a verb, a read or a handler that throws, answers
  [`{t: 'error', code, message}`](ref:hub/src/shared/api.ts#ApiError). Renderers branch on `code`, never on `message`;
  the codes and what each means are [`ERROR_CODES`](ref:hub/src/shared/api.ts#ERROR_CODES), their HTTP statuses
  [`ERROR_STATUS`](ref:hub/src/shared/api.ts#ERROR_STATUS). The board stream sends `{v, error: {code, message}}`
  while the tower can't build the board ([[board-errors]]); over the postMessage tunnel an answer's error carries the
  same `{code, message}`, and `tower.js` rejects with an `Error` holding `code`.
- **Verbs come with their requests.** Beside `verbs`, each card, conversation and floor carries `calls`: for each verb
  that is a request, `[verb, body]` with every field the board knows. Both are computed in one function of `verbs.ts`
  ([`cardOffers`](ref:hub/src/bridge/verbs.ts#cardOffers)), so they can't disagree; the renderer adds only what the
  user supplies (a prompt's text, a floor's directory). `drive`, `brief` and `goto` are moves within the renderer,
  not requests, and have no call.
- **The contract is served.** `GET /schema` answers the verbs' input and reply schemas and the error as JSON Schema
  ([`apiSchema`](ref:hub/src/tower/server.ts#apiSchema)), and its `streams`: the board's message as the JSON Schema of
  the TypeScript type `BoardMsg`, JSDoc as descriptions. `npm run schema:board`
  ([`board-schema.ts`](ref:hub/scripts/board-schema.ts)) writes the committed `src/shared/board.schema.json` from the
  type, and [`board-schema.test.ts`](ref:hub/test/board-schema.test.ts) fails when it is stale. `tower api board`
  prints it.
- **Writes name the version they edited.** `collection/write` carries the item's `modifiedAt` as the writer last saw
  it and is `refused` once the file has moved on, so two editors saving within a board's round trip never overwrite
  each other; [`itemVersion`](ref:hub/src/collections.ts#itemVersion) is the same mtime the board shows.
- **One version, `major.minor`, and only a major breaks.** It lives only in
  [`API_VERSION`](ref:hub/src/shared/api.ts#API_VERSION), filled into `tower.js` as it is served
  ([`towerClient`](ref:hub/src/tower/served.ts#towerClient)), and carried by `GET /board` and the tunnel's `board`
  message alike. An addition an older renderer reads past (a board field, a verb, a read, a stream) moves the minor; a
  rename, a removal or a changed meaning moves the major, and CHANGELOG.md says why. `tower.js` reads a board from a
  tower of its own major at its own minor or newer. A renderer kept apart from the tower pins the version it was
  written against in its script URL (`/tower.js?v=1.3`), and the script refuses to load into a tower of another major
  or an older minor; a page that names none moves with the tower. `tower.version` is the full version.
- **The served modules are part of the contract.** Every module in [`MODULES`](ref:hub/src/tower/served.ts#MODULES),
  `/design.css` (its custom properties and classes) and `/tower.js` (the members of `window.tower`) are imported by URL
  by a renderer copied out of the checkout, so they are versioned with the API: removing or renaming a name is a major,
  with a CHANGELOG line saying what to use instead; adding one is a minor; a name on its way out stays `@deprecated`
  until a major. The libraries served beside them (`/xterm.js`, `/marked.js`…) are those libraries' own APIs, outside
  the contract. [`test/served-exports.json`](ref:hub/test/served-exports.json) lists every served name with the major
  it was written at; [`served.test.ts`](ref:hub/test/served.test.ts) fails when a listed name is gone and the major
  hasn't moved, and on any other difference, so an addition is a deliberate `npm run served:update` that shows in the
  diff. There is no plugin API: customizing is a copy of a renderer with the user's own layer on top
  ([`docs/extending.md`](ref:hub/docs/extending.md)).

**Alternatives considered.**
- Hand-written parsers beside the types: a second copy of every shape, which drifts.
- The board as a zod schema too: a large type only the bridge builds, already pinned by the board tests; its schema is
  generated from the type instead.
- One integer that moves on every change: a renderer kept apart breaks on each addition it would have read past.
  Full semver: a patch says nothing to a renderer.
- Served modules outside the contract, or frozen: outside, every copied renderer breaks silently on a rename; frozen,
  they collect dead names and stop moving with the renderers that need them.
- A plugin API (hooks into the tower page's code): a second contract over one renderer's internals, while the config,
  the logs and the collections hold the whole state and the API does every act.

**Impact.** A renderer in any language can read `/schema`, build requests from the board's `calls`, and act on `code`.
Old pages break once on a major, by design, and never on a minor; `npm test` stops a removal of a served name that
doesn't move the major.
