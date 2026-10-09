---
{
  "type": "decision",
  "name": "Shelf pages read the board over postMessage",
  "summary": "An html shelf entry gets the live board, version 1, from the renderer that frames it, and asks it for full conversations; it never calls the renderer's routes.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-03",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/shelf-page.ts", "hub/src/tower/tower.js", "hub/src/bridge/board.ts#board", "hub/renderers/page/index.html"]
}
---
**Context.** Shelf pages were inert documents. Letting them read the system turns the shelf into a place
for disposable, per-project renderers (dashboards, the spatial office) without touching the tower.

**Decision.** The [`Board`](ref:hub/src/bridge/board.ts#board) is the contract, moved out of the tower
into the bridge, with the values every renderer needs (`callsign`, `onDuty`) on each card. The wire is
[`src/shared/shelf-page.ts`](ref:hub/src/shared/shelf-page.ts):

```
page  → tower   {t: 'hello'}
tower → page    {t: 'board', v: 1, self: {project, n}, board}     after hello, then on every change
page  → tower   {t: 'ask', id, what: 'conversations', session}
tower → page    {t: 'answer', id, data} | {t: 'answer', id, error}
```

Pages use it through [`/tower.js`](ref:hub/src/tower/tower.js): `tower.subscribe((board, self) => …)` and
`await tower.conversations(id)`. The tower answers only the frame it mounted (`e.source`). Read-only for
now; the whole system is visible, and `self` says which entry the page is.

**Alternatives considered.**
- A board route the page fetches: a shelf page has an opaque origin, so the route would need
  `Access-Control-Allow-Origin: *`, and with no auth any site open in the browser could read every prompt.
- Verbs (spawn, keys, kill) for pages now: deferred until the tower plugin settles which verbs exist, so
  pages and Claude share one set.
- Only the page's own project: a whole-tower renderer could not live on a shelf.

**Consequences.** `Board` changes are protocol changes: bump `v` on a breaking one. A page works only inside
the tower (`tower.js` throws in its own tab). Pages may load remote scripts, and those see the board.
ES-module imports from a shelf page fail without CORS (opaque origin), so renderers use classic scripts or
inline modules.
