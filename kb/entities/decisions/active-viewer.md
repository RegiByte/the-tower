---
{
  "type": "decision",
  "name": "The active viewer: the page the user acted on last, said by the pages, held in the tower's memory",
  "summary": "A renderer page names itself and its renderer on its board stream (GET /board?viewer=<id>&renderer=<name>) and calls viewer/active when the user acts on it; the board's viewers.active is the viewer acted on last among those whose stream is open, viewers.last the same per renderer, so one page across every machine reading the tower does what only one should, such as speaking. A page also says the worker it has selected (viewer/selected, tower.select), the board's viewers.selected by viewer, so another renderer can act on the worker the user is on. The tower holds it all in memory, never logs it, and forgets a viewer when its last stream closes.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-31",
  "reviewed": "2026-11-12",
  "refs": [
    "hub/src/shared/api.ts#VIEWER_ID",
    "hub/src/tower/publisher.ts#viewerActive",
    "hub/src/tower/publisher.ts#viewerSelected",
    "hub/src/tower/tower.js#saySelected",
    "hub/renderers/page/page.js#viewed",
    "hub/src/tower/publisher.ts#viewerGone",
    "hub/src/tower/publisher.ts#viewersNow",
    "hub/src/bridge/board.ts#Viewers",
    "hub/src/tower/http.ts#READS",
    "hub/src/tower/tower.js#viewerId",
    "hub/src/tower/tower.js#acted",
    "hub/src/shared/shelf-page.ts#Tower",
    "hub/test/server.test.ts",
    "hub/examples/extensions/narrate/client/memos.js"
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

**How.** `tower.js` does a page's part for every renderer at the tower's origin, so none wires it. It makes the page
a viewer id on every load ([`viewerId`](ref:hub/src/tower/tower.js#viewerId)), so a reload, a duplicated tab and a
frame at the tower's origin are viewers of their own, serves it as `tower.viewer`, and names it and the renderer it is
(`/r/<name>/`) on its board stream, `GET /board?viewer=<id>&renderer=<name>` (`VIEWER_ID`, `VIEWER_RENDERER`; a
malformed one, or a renderer without a viewer, is `invalid`). A framed shelf page has none: it is its framing page's.
It says the user acted ([`acted`](ref:hub/src/tower/tower.js#acted)) on focus, a pointer press or a key while the
page is visible and the board doesn't already have it active, one call at a time, and on any board with no active
viewer while it has focus, as after a tower restart, which forgets them all. The call is
[`viewer/active`](ref:hub/src/tower/publisher.ts#viewerActive) `{viewer}`, which notes the time; a viewer with no open
stream is `not_found`. [`viewersNow`](ref:hub/src/tower/publisher.ts#viewersNow) gives the board's `viewers`:
`active`, the viewer noted last among those with an open stream, absent while none has said so, and `last`, the same
for each renderer, so what one renderer's page alone does (narration's memos, drawn only by the tower page) is done by
that renderer's page used last even while the user is in a tab of another. The board is published again only when
those move. When a viewer's last stream closes ([`viewerGone`](ref:hub/src/tower/publisher.ts#viewerGone)) it is
forgotten, and the one noted before it, if still open, takes its place.

A page also says which worker it has selected, so another renderer can act on the worker the user is on (a voice page
told "tell it to…" sends to that worker without its name):
[`viewer/selected`](ref:hub/src/tower/publisher.ts#viewerSelected) `{viewer, id}`, a session id or `null` for none,
on the same terms as `viewer/active` (`not_found` without an open stream). The board's `viewers.selected` maps each
viewer to its worker, a viewer with none left out, and loses a viewer with its last stream. It is a separate verb, not
a field on `viewer/active`: acting on a page and what the page is on change apart (a worker opened from a link, the
page in the background). `tower.js` keeps the page's selection (`tower.select`) and
[says it again](ref:hub/src/tower/tower.js#saySelected) on any board that doesn't carry it, so a tower restart or a
dropped stream heals on its own. The tower page says the worker its main pane is on from
[`viewed`](ref:hub/renderers/page/page.js#viewed), the one way its view changes; the worker the user has selected
there is `selected[last.page]`, none when no tower page is open, and with two open, the one the user acted on last.
It is none too while no tower page has been acted on since the tower started, since `last` comes from `viewer/active`
alone; `selected` is keyed by viewer, not renderer, so what a consumer does then is its own (the docs suggest the one
entry when there is exactly one). A selection made while a `viewer/selected` is on its way is said once it settles.

**Alternatives considered.** A bundled `presence` extension holding the same verb and folding the board field: the
same shape behind one more manifest, while every renderer still has to call it, and the question is about pages, not
any one capability. Keeping it in the browser (`tower.store`): it is per browser, so two machines never see each
other. A timeout after which nobody is active: a memo then plays nowhere while the user steps away and comes back to
the same page; the last page acted on is the best guess of where they will be.

**Impact.** Any renderer can do one-page-only work by comparing `viewers.active`, or `viewers.last` under its own
name, with its own id. Narration's memos view ([`memos.js`](ref:hub/examples/extensions/narrate/client/memos.js))
says a worker's memo only on the tower page used last, and the
page's rings, which today sound on every open page, can take it up later. A terminal's size does not follow `viewers.active`: focus
makes a page active, and a window coming to the front must not reflow a session another machine is typing in. The
shared terminal view takes the PTY's size only when the user acts on that terminal: a key or a pointer press in it, a
paste or a drop on it ([[renderer-shared-modules]]).
