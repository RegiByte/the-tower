---
{
  "type": "decision",
  "name": "The active viewer: the page the user acted on last, said by the pages, held in the tower's memory",
  "summary": "A renderer page names itself on its board stream (GET /board?viewer=<id>) and calls viewer/active when the user acts on it; the board's viewers.active is the viewer acted on last among those whose stream is open, so one page across every machine reading the tower does what only one should, such as speaking. The tower holds it in memory, never logs it, and forgets a viewer when its last stream closes.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-31",
  "reviewed": "2026-10-31",
  "refs": [
    "hub/src/shared/api.ts#VIEWER_ID",
    "hub/src/tower/publisher.ts#viewerActive",
    "hub/src/tower/publisher.ts#viewerGone",
    "hub/src/tower/publisher.ts#activeViewer",
    "hub/src/bridge/board.ts#Viewers",
    "hub/src/tower/http.ts#READS",
    "hub/test/server.test.ts"
  ],
  "links": [
    { "to": "logs-are-facts", "verb": "follows", "carries": "an observation of the pages, like the host's live set: memory, never a store" },
    { "to": "renderer-is-disposable", "verb": "follows", "carries": "a verb and a board field any renderer takes part through" }
  ]
}
---
**Problem.** The user reads the tower from more than one page at once: the machine it runs on and a laptop through a
tunnel, often both open. Something only one page should do, such as speaking a worker's memo aloud, happened on every
page, or on none, since no page knew whether the user was at it or at another.

**Why.** Each page knows only its own focus. Which page the user is at is a fact about all of them, so it has to be
gathered where every page reports: the tower. It is an observation of the pages as they are, not something that
happened worth keeping, so it lives in memory like the host's live set and is gone on restart ([[logs-are-facts]]). A
verb and a board field keep it open to any renderer ([[renderer-is-disposable]]).

**How.** A page makes its own viewer id (one per tab) and names it on its board stream, `GET /board?viewer=<id>`
(`VIEWER_ID`; a malformed one is `invalid`). When the user acts on it (it gains focus while visible, a key or a
pointer press), it calls [`viewer/active`](ref:hub/src/tower/publisher.ts#viewerActive) `{viewer}`, which notes the
time; a viewer with no open stream is `not_found`. [`activeViewer`](ref:hub/src/tower/publisher.ts#activeViewer) is
the one noted last among those with an open stream, published as the board's `viewers.active` and absent while none
has said so. The board is published again only when that id changes. When a viewer's last stream closes
([`viewerGone`](ref:hub/src/tower/publisher.ts#viewerGone)) it is forgotten, and the one noted before it, if still
open, becomes active.

**Alternatives considered.** A bundled `presence` extension holding the same verb and folding the board field: the
same shape behind one more manifest, while every renderer still has to call it, and the question is about pages, not
any one capability. Keeping it in the browser (`tower.store`): it is per browser, so two machines never see each
other. A timeout after which nobody is active: a memo then plays nowhere while the user steps away and comes back to
the same page; the last page acted on is the best guess of where they will be.

**Impact.** Any renderer can do one-page-only work by comparing `viewers.active` with its own id. Narration plays a
worker's memo only there, and the page's rings, which today sound on every open page, can take it up later.
