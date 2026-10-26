---
{
  "type": "decision",
  "name": "Attention as one list: blocked screens, waits on the board, what a viewer does about them shared",
  "summary": "A session held by Claude's trust or sign-in screen is a blocked status folded from its boot-time output; the board lists waits in the order to go to them, extensions' asks and offers after them; transitions, round-robin N, dismissals and the ring setting are shared code and the viewer's tower.store, never facts.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-26",
  "refs": [
    "hub/src/bridge/blocked.ts#blockedBy",
    "hub/src/bridge/status.ts#nextState",
    "hub/src/tail.ts#factEvents",
    "hub/src/bridge/board.ts#waitingOrder",
    "hub/src/bridge/life.ts#attentionOf",
    "hub/src/shared/status-words.ts#loudest",
    "hub/src/shared/waits.ts#transitions",
    "hub/src/shared/waits.ts#nextWait",
    "hub/src/shared/waits.ts#heededWaits",
    "hub/src/shared/rings.ts#SOUNDS",
    "hub/src/shared/waits.ts#attentionOrder",
    "hub/src/shared/waits.ts#offerTransitions",
    "hub/src/shared/waits.ts#askTransitions",
    "hub/src/shared/waits.ts#isAbout",
    "hub/src/shared/rings.ts#ringingSound",
    "hub/src/shared/attend.ts#attendHandlers",
    "hub/src/shared/attend.ts#attendNext",
    "hub/src/shared/attend.ts#watching",
    "hub/src/shared/viewer.ts#VIEWER_KEYS",
    "hub/renderers/tower3d/src/compass.ts#pointers",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js"
  ]
}
---
**Problem.** A session on Claude's workspace trust or sign-in screen raises no hook, so it read `booting` and never
waited on you. Each renderer also rolled its own wait handling: N went to the first waiter every time, a wait cleared
only by typing, one chime covered a question and an answer alike, and every wait was coloured as an alarm.

**Why.** Attention is derived once on the board for every renderer and worker (decisions [[renderer-is-disposable]],
[[agents-have-every-capability]]); what a viewer does about it is shared code, so every renderer acts on the same events.

**How.**
- [`blockedBy`](ref:hub/src/bridge/blocked.ts#blockedBy): a table of each screen's wordings, matched on one output
  write with its escapes and whitespace removed. `nextState` reads output only while the session is `booting` or
  `blocked`; a match makes it `blocked` with the screen's kind until a status hook or its exit (fixtures
  `trust-dialog`, `login-screen`).
- The live fold skips output before parsing it: [`factEvents`](ref:hub/src/tail.ts#factEvents) folds the session's
  state over what it keeps and keeps output only while the state reads it, so the filter and the fold agree by
  construction.
- `board.waiting` lists one wait per card waiting on you, in the order to go to them; its shape, its rank and whom a
  wait is on are in [[waiting-on-you]].
- Attention ([`attentionOf`](ref:hub/src/bridge/life.ts#attentionOf)): `needs` a screen or a question, `ready` an
  unread answer, `broken` a failure. The colour says what the worker holds, `waiting` whether it is yours; a count or a
  lamp takes its loudest card's ([`loudest`](ref:hub/src/shared/status-words.ts#loudest)), so red marks only what needs you
  ([[design-system]]).
- A policy's offered slot asks for you before any worker exists, so it is not a wait: the policies extension puts it
  among the asks ([[policies]]), and [`attentionOrder`](ref:hub/src/shared/waits.ts#attentionOrder) is the heeded
  waits, then extensions' heeded asks (`board.asks`, oldest first, [[extensions]]); `board.offers`, LEGACY's copy until
  2.0, is no longer in it. N on an offer opens its floor's policies, on another ask what it is about (its worker, else its floor). An ask is about a worker when its subject is that worker's card
  ([`isAbout`](ref:hub/src/shared/waits.ts#isAbout)): the watched worker's asks ring for nobody, as its waits. An ask
  rings as its `sound` says, as a question or as an offer. An auto policy that lost its approval is a change of
  state, not a request: it never rings and isn't in the list.
- `/cards.js` holds the pieces: what began and ended between two boards
  ([`transitions`](ref:hub/src/shared/waits.ts#transitions),
  [`offerTransitions`](ref:hub/src/shared/waits.ts#offerTransitions),
  [`askTransitions`](ref:hub/src/shared/waits.ts#askTransitions), silent on the first board), round-robin N
  ([`nextWait`](ref:hub/src/shared/waits.ts#nextWait)), the heeded waits
  ([`heededWaits`](ref:hub/src/shared/waits.ts#heededWaits)), and a score each for a question, an answer and an offer
  ([`SOUNDS`](ref:hub/src/shared/rings.ts#SOUNDS), picked by
  [`ringingSound`](ref:hub/src/shared/rings.ts#ringingSound)). Dismissals and the ring setting are per viewer, fields of
  the viewer's record in `tower.store` ([`VIEWER_KEYS`](ref:hub/src/shared/viewer.ts#VIEWER_KEYS),
  [[renderer-shared-modules]]); a dismissed offer stays acceptable in the policies panel.
- `/attend.js` is one machine, [`attendHandlers`](ref:hub/src/shared/attend.ts#attendHandlers), that every renderer's
  own machine hands its events ([[machines]]): on each board what began and isn't dismissed is said, and but for the
  watched worker's waits and asks notified and rung, waits before asks before offers; what ended is unnotified. With `remind`, a timer
  rings what is heeded again, never while the tower is lost (its board is how it stood). The watched worker is the one
  the viewer's view is on while the window is focused and visible
  ([`watching`](ref:hub/src/shared/attend.ts#watching)): attention's state holds the window's focus and visibility
  (`focus`, `visible`) and the worker the view is on (`watch`, told by each renderer as its view moves: the page's
  main view, Tower 3D's desk panel). A renderer drops the effects it has no executor for.
- One ringer per viewer: a framed renderer rings nothing and leaves it to the page framing it; Tower 3D leaves
  notifications and the live region to the page, and adds edge arrows toward waiting workers out of view
  ([`pointers`](ref:hub/renderers/tower3d/src/compass.ts#pointers)).

**Alternatives considered.**
- Screen regexes over the rendered screen: needs a terminal per booting session in the bridge; matching writes is
  enough for screens drawn in a write or two.
- A logged "seen" fact so reading an answer clears its wait: a fact about a viewer rather than a session. Dismissing
  is the viewer's own, in `tower.store`.
- An offer as a `Wait` with reason `offer`: a wait with no card breaks every renderer. Offers merged with waits by
  `since`: an offer opened an hour ago would jump a blocked screen.
- `failed` sounding as an answer: it needs looking at, so it rings as a question.
