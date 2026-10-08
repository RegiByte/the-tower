---
{
  "type": "decision",
  "name": "The renderer API is declared once, as schemas",
  "summary": "Every verb of the renderer API is a zod schema of its input and reply in one module; the tower parses every request with it and answers failures as typed errors, the board carries ready requests beside its verbs, and the schemas are served as JSON Schema for renderers in any language. Its version is major.minor, and only a major breaks a renderer. What the tower serves for renderers to build on (/tower.js, /design.css and the shared modules) is part of the contract: removing or renaming an export is a major, adding one a minor, held by a test over a checked-in list of every served name.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/shared/api.ts#VERBS", "hub/src/shared/api.ts#ApiError", "hub/src/tower/server.ts#command", "hub/src/tower/server.ts#apiSchema", "hub/src/shared/api.ts#API_VERSION", "hub/src/tower/tower.js", "hub/src/tower/served.ts#towerClient", "hub/src/tower/served.ts#MODULES", "hub/test/served.test.ts", "hub/test/served-exports.json", "hub/docs/extending.md", "hub/src/bridge/verbs.ts#cardOffers", "hub/test/board.test.ts", "hub/src/shared/api.ts#ERROR_STATUS"]
}
---
**Problem.** The [[renderer-api]] was typed but never checked. `Verbs` in `shelf-page.ts` is a TypeScript type the
server doesn't read: it coerces each field with `String(body.x)`, so a missing field becomes the text `"undefined"`.
Bad JSON answers an empty 500, an unknown route an empty 404, and `reap` always says ok. Errors are
`{t: 'error', message}`, so a renderer can only show them, never act on them. And every renderer turns a verb the
board offers into a request by hand: the tower page and Tower 3D both find `current(c).id` to resume.

**Why.** The API is the contract the next renderer reads, and the next renderer may not be written in
TypeScript. It must be able to learn the contract from the tower, send a request the tower checks, and branch on
what went wrong.

**How.**
- **One schema per verb.** `src/shared/api.ts` holds `VERBS = { <verb>: { input, reply } }` as zod schemas.
  `Verbs` and the replies are `z.infer` of them, so the types can't drift from what is checked. zod runs in the tower
  only: the host and the terms daemon keep their own small protocols.
- **One dispatch.** Every `POST /<verb>` is parsed, handled and answered in one place in `server.ts`. A body that
  doesn't parse is refused before any handler runs. `mux/watch` and `mux/unwatch` are transport: parsed the same
  way, but not verbs.
- **Errors are data.** Every failure answers `{t: 'error', code, message}`. Renderers branch on `code`, never on
  `message`:

  | code          | status | meaning                                                                 |
  |---------------|--------|-------------------------------------------------------------------------|
  | `invalid`     | 400    | the request is malformed: bad JSON, a field missing or of the wrong type |
  | `not_found`   | 404    | no such verb, read, session, collection or item                          |
  | `refused`     | 409    | the system won't do it now: the conversation isn't resumable, the host or terms daemon answered no, the item changed since it was read |
  | `unavailable` | 502    | the host or terms daemon doesn't answer                                  |
  | `exists`      | 409    | a worktree name, path or branch is taken (a lost one included)           |
  | `would_lose`  | 409    | removing would lose uncommitted or unpushed, unabsorbed work             |
  | `lost`        | 410    | a worktree's folder is gone: recut it first                              |
  | `offline`     | 504    | origin couldn't be fetched within 10 s                                   |
  | `worktree_failed` | 500 | git failed while cutting; what the request made is rolled back          |
  | `config`      | 500    | the config can't be read or holds a value the tower can't take, until the user fixes it ([[board-errors]]) |
  | `internal`    | 500    | the tower failed where it didn't expect to; its log has the stack        |

  Reads answer their failures the same way, and so does a handler that throws ([[board-errors]]).
  The board stream sends `{v, error: {code, message}}` while the tower can't build the board. Over the postMessage tunnel, an answer's error carries the same
  `{code, message}`, and `tower.js` rejects with an `Error` holding `code`.
- **Verbs come with their requests.** Beside `verbs`, each card, conversation and floor carries `calls`: for each
  verb that is a request, `[verb, body]` with every field the board knows (`{ resume: ['resume', { id, conversation }] }`).
  Both are computed in one function of `verbs.ts`, so they can't disagree. The renderer adds only what the user
  supplies (a prompt's text, a floor's directory) and sends it. `drive`, `brief` and `goto` are moves within the
  renderer, not requests, and have no call; `goto` goes to the conversation's `resumedBy` (its `id`, with the `callsign` to name it).
- **The contract is served.** `GET /schema` answers the verbs' input and reply schemas, and the error, as JSON
  Schema (`z.toJSONSchema`).
- **Writes name the version they edited.** `collection/write` carries the item's `modifiedAt` as the writer last
  saw it (from the board, or from its own previous write's reply) and is `refused` once the file has moved on, so
  two editors saving within a board's round trip never overwrite each other. [`itemVersion`](ref:hub/src/collections.ts#itemVersion)
  is the same whole-millisecond mtime the board shows. The draft editor turns the refusal into its conflict.
- **One version on every transport.** `GET /board` sends `{v, board}`, as the tunnel's `board` message does, and
  `tower.js` checks `v` on both. The version lives only in [`API_VERSION`](ref:hub/src/shared/api.ts#API_VERSION): the tower
  fills it into `tower.js` as it serves the script ([`towerClient`](ref:hub/src/tower/served.ts#towerClient)).
- **A version is `major.minor`, and only a major breaks.** An addition an older renderer reads past (a board field, a
  verb, a read, a stream) moves the minor. A rename, a removal or a changed meaning moves the major, the minor returns
  to 0, and CHANGELOG.md says why. `tower.js` reads a board from a tower of its own major at its own minor or newer, and
  stops at the version check on any other. A renderer kept apart from the tower pins the version it was written against
  in its script URL, `/tower.js?v=1.3`, and the script refuses to load into a tower of another major or an older
  minor; a page that names none (every renderer in the repo) moves with the tower. `tower.version` is the full version,
  for a renderer that checks a feature. The public release starts at `1.0`; before it, one integer moved on every
  change a renderer had to follow, up to 23 (the history of those moves is in the decisions that made them: [[blob-reads]],
  [[agent-show]], [[tower-cuts-worktrees]], [[attention-list]], [[watching-status]], [[board-errors]], [[tidy]], [[board-archive]]).

- **The served modules are part of the contract** (2026-10-08). They are how the core hands its capabilities to
  renderers: [`MODULES`](ref:hub/src/tower/served.ts#MODULES) (`/cards.js`, `/panels.js`, `/drafts.js`, `/icons.js`,
  `/design.js`, `/reviews.js`, `/brief.js`, `/termkeys.js`, `/settings.js`, `/tips.js`, `/markdown.js`), `/design.css` (its custom properties and classes) and
  `/tower.js` (the members of `window.tower`). A renderer copied out of the checkout imports them by URL, so they are
  versioned with the API: removing or renaming a name is a major, with a CHANGELOG line saying what to use instead;
  adding one is a minor. A name on its way out stays, marked `@deprecated` with what replaces it, until a major. Changes are announced, not frozen; the core makes a best effort to avoid majors. The
  libraries the tower serves beside them (`/xterm.js`, `/marked.js`…) are those libraries' own APIs, outside the contract.
  [`test/served-exports.json`](ref:hub/test/served-exports.json) lists every served name with the API major it was
  written at; [`served.test.ts`](ref:hub/test/served.test.ts) fails when a listed name is gone and the major hasn't
  moved, saying what to do (keep the name, as a deprecated alias if need be, or move the major and write the CHANGELOG
  line), and otherwise writes the list anew, so an addition shows in the diff without failing. Customizing is a
  copy of a renderer outside the checkout with the user's own layer on top, and there is no plugin API: the state is
  outside the tower, the API does the work, and the modules are a convenience over it. [`docs/extending.md`](ref:hub/docs/extending.md)
  is the user's guide to it.

**Alternatives considered.**
- Hand-written parsers beside the types: a second copy of every shape, which drifts.
- Verbs as objects carrying their own request (`[{ verb, call }]`): one structure instead of two, but every `can()`,
  label table, key table and fixture changes, for no new capability.
- A code per failure (`no_session`, `not_saved`, …): the four codes are what a renderer can act on; the message
  says the rest.
- Mapping the host's error messages to codes: the host's protocol would have to grow codes too, and a host change
  ends every running session.
- The board as a zod schema too: a large type that only the bridge builds, already pinned by the board tests. It
  stays a TypeScript type for now.
- One integer that moves on every change (the scheme before 1.0): every renderer in the repo moves with it, but one
  kept apart breaks on each addition it would have read past.
- Full semver for the API: a patch says nothing to a renderer, which reads the same shapes before and after one.
- Served modules outside the contract, free to change: every copied renderer breaks silently on a rename, with no
  version to pin and nothing in the CHANGELOG.
- Served modules frozen: they would collect dead names, and the shared code would stop moving with the renderers
  that need it.
- A plugin API (hooks into the tower page's code): a second contract over one renderer's internals, while the
  config, the logs and the collections already hold the whole state and the API already does every act.
- A test that fails on any change to the list, additions included: every new export would need a hand edit of the
  list. Written by the test, the list moves in the same diff, where a reviewer reads it.
- The pin as a call (`tower.require('1.3')`): it would run after the script set itself up, and a page could forget it;
  the script URL is read before anything else, by the script itself.

**Impact.** A renderer in any language can read `/schema`, build requests from the board's `calls`, and act on
`code`. Requests the tower used to coerce now fail as `invalid`. Both renderers drop their hand mapping and
`current()` for requests, and the tower page loses its own copy of `tower.js`. Old pages break once on a major
bump, by design, and never on a minor. Since 2026-10-08 the same holds for the served modules: `npm test` stops a
removal that doesn't move the major.
