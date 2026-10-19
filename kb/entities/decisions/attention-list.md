---
{
  "type": "decision",
  "name": "Attention as one list: blocked screens, waits on the board, what a viewer does about them shared",
  "summary": "A session held by Claude's trust or sign-in screen is a blocked status folded from its boot-time output; the board lists waits in the order to go to them, offers after them; transitions, round-robin N, dismissals and the ring setting are shared code and the viewer's tower.store, never facts.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-19",
  "refs": [
    "hub/src/bridge/blocked.ts#blockedBy",
    "hub/src/bridge/status.ts#nextState",
    "hub/src/tail.ts#factEvents",
    "hub/src/bridge/board.ts#waitingOrder",
    "hub/src/bridge/life.ts#attentionOf",
    "hub/src/shared/cards.ts#loudest",
    "hub/src/shared/cards.ts#transitions",
    "hub/src/shared/cards.ts#nextWait",
    "hub/src/shared/cards.ts#heededWaits",
    "hub/src/shared/cards.ts#SOUNDS",
    "hub/src/shared/cards.ts#attentionOrder",
    "hub/src/shared/cards.ts#offerTransitions",
    "hub/src/shared/cards.ts#ringingSound",
    "hub/src/shared/attend.ts#attendHandlers",
    "hub/src/shared/attend.ts#seeBoard",
    "hub/src/shared/attend.ts#remind",
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
  `blocked`; a match makes it `blocked` with the screen's kind until a status hook or its exit. Fixtures
  `trust-dialog` and `login-screen` record both.
- The live fold skips output before parsing it: [`factEvents`](ref:hub/src/tail.ts#factEvents) folds the session's
  state over what it keeps and keeps output only while the state reads it, so the filter and the fold agree by
  construction (`test/tail.test.ts` checks every fixture).
- `board.waiting` lists one wait per card waiting on you, in the order to go to them; its shape, its rank and whom a
  wait is on (a hire's answer waits on its running hirer, a leaving worker's outcome on nobody) are in
  [[waiting-on-you]].
- Attention ([`attentionOf`](ref:hub/src/bridge/life.ts#attentionOf)): `needs` a screen or a question, `ready` an
  unread answer, `broken` a failure. The colour says what the worker holds, `waiting` whether it is yours; a count or a
  lamp takes its loudest card's ([`loudest`](ref:hub/src/shared/cards.ts#loudest)), so red marks only what needs you
  ([[design-system]]).
- A policy's offered slot (`board.offers`, [[policies]]) asks for you before any worker exists, so it is not a wait:
  [`attentionOrder`](ref:hub/src/shared/cards.ts#attentionOrder) is the heeded waits, then the heeded offers, oldest
  first. N on an offer opens its floor's policies. An auto policy that lost its approval is a change of state, not a
  request: it never rings and isn't in the list.
- In `/cards.js`: [`transitions`](ref:hub/src/shared/cards.ts#transitions) and
  [`offerTransitions`](ref:hub/src/shared/cards.ts#offerTransitions) (silent on the first board),
  [`nextWait`](ref:hub/src/shared/cards.ts#nextWait) (round-robin, `here` skipped),
  [`heededWaits`](ref:hub/src/shared/cards.ts#heededWaits) and `dismissing` (a wait's or an offer's key, in
  `waits.dismissed`; a dismissed offer stays acceptable in the policies panel), the ring setting (`waits.ring`), and
  [`SOUNDS`](ref:hub/src/shared/cards.ts#SOUNDS), a score each for a question, an answer and an offer, picked by
  [`ringingSound`](ref:hub/src/shared/cards.ts#ringingSound). Dismissals and the setting live in `tower.store`: per
  viewer, shared by their renderers ([[viewer-prefs]]).
- In `/attend.js`, one machine composes them for every renderer ([`attendHandlers`](ref:hub/src/shared/attend.ts#attendHandlers),
  [[machines]]): on each board ([`seeBoard`](ref:hub/src/shared/attend.ts#seeBoard)) what began and isn't dismissed is
  said, and but for the watched worker's waits notified and rung, waits before offers; what ended is unnotified. With
  `remind`, a timer rings what is heeded again `REMIND_MS` after the last ring
  ([`remind`](ref:hub/src/shared/attend.ts#remind)), never while the tower is lost (its board is how it stood). A
  dismissal is stored and closes its notification. A renderer drops the effects it has no executor for: Tower 3D
  leaves notifications and the live region to the page.
- One ringer per viewer: a framed renderer rings nothing and leaves it to the page framing it (Tower 3D checks
  `tower.framed`); Tower 3D adds edge arrows toward waiting workers out of view
  ([`pointers`](ref:hub/renderers/tower3d/src/compass.ts#pointers)).

**Alternatives considered.**
- Screen regexes over the rendered screen: needs a terminal per booting session in the bridge; matching writes is
  enough for screens drawn in a write or two.
- A logged "seen" fact so reading an answer clears its wait: a fact about a viewer rather than a session. Dismissing
  is the viewer's own, in `tower.store`.
- A hire's answer kept in the user's list, ranked last: still answers that aren't theirs. Keying it on
  `card.reportsTo`: an untold reviewer reports to its author yet its notes are for the user; `hiredBy` is who asked.
- An offer as a `Wait` with reason `offer`: a wait with no card breaks every renderer. Offers merged with waits by
  `since`: an offer opened an hour ago would jump a blocked screen.
- `failed` sounding as an answer: it needs looking at, so it rings as a question.
