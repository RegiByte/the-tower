---
{
  "type": "decision",
  "name": "Attention as one list: blocked screens, waits on the board, what a viewer does about them shared",
  "summary": "A session held by Claude's trust or sign-in screen is a blocked status folded from its boot-time output; the board lists waits ({id, key, reason, since, detail}) in the order to go to them; transitions, round-robin N, dismissals and the ring setting are shared code and the viewer's tower.store, never facts.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-14",
  "refs": [
    "hub/src/bridge/blocked.ts#blockedBy",
    "hub/src/bridge/status.ts#nextState",
    "hub/src/tail.ts#factEvents",
    "hub/src/bridge/board.ts#waitingOrder",
    "hub/src/bridge/board.ts#attentionOf",
    "hub/src/shared/cards.ts#loudest",
    "hub/src/shared/cards.ts#transitions",
    "hub/src/shared/cards.ts#nextWait",
    "hub/src/shared/cards.ts#heededWaits",
    "hub/src/shared/cards.ts#SOUNDS",
    "hub/src/shared/cards.ts#attentionOrder",
    "hub/src/shared/cards.ts#offerTransitions",
    "hub/src/shared/cards.ts#ringingSound",
    "hub/renderers/tower3d/src/compass.ts#pointers",
    "hub/renderers/page/index.html"
  ]
}
---
**Problem.** A session on Claude's workspace trust or first-run screen raises no hook, so it read `booting`, coloured
"working", and never waited on you: only the tower page guessed, after 12 s, and Tower 3D said nothing. Each renderer
also rolled its own wait handling (the page's `waitKey`/`notify`, Tower 3D's `lastWaiting`/`chime`): N went to the first
waiter every time, a wait could only be cleared by typing, and one chime covered a question and an answer alike.

**Why.** agent-office (research pack 2026-10-06, sections 03.5, 06, 07) detects setup screens from the screen and ranks
attention as a cycle you step through; our board is the better place for it, derived once for every renderer and
worker (decisions [[renderer-is-disposable]], [[agents-have-every-capability]]).

**How.**
- [`blockedBy`](ref:hub/src/bridge/blocked.ts#blockedBy): a table of each screen's wordings, matched on one output write
  with its escapes and whitespace removed (Claude draws spaces as cursor moves). `nextState` reads output only while the
  session is `booting` or `blocked`; a match makes it `blocked` with the screen's kind until a status hook or its exit.
  Attention `needs`; it waits on you; the card carries `blocked`. Recorded fixtures: `trust-dialog` (answered, then
  `SessionStart`) and `login-screen` (a fresh `CLAUDE_CONFIG_DIR`, exited on the login screen).
- The live fold skips output before parsing it: [`factEvents`](ref:hub/src/tail.ts#factEvents) became a filter per log
  that folds the session's state over what it keeps and keeps output only while the state reads it, so the filter and
  the fold agree by construction (`test/tail.test.ts` checks every fixture). Startup fold over 188 real logs: ~1.16 s
  before and after.
- `board.waiting` is `Wait[]`: `key` (`id@since`) names one wait; reasons ranked blocked, asks, failed, done, then the
  longest wait ([`waitingOrder`](ref:hub/src/bridge/board.ts#waitingOrder)).
- In `/cards.js`: [`transitions`](ref:hub/src/shared/cards.ts#transitions) (silent on the first board),
  [`nextWait`](ref:hub/src/shared/cards.ts#nextWait) (round-robin, `here` skipped, a new round once all were visited),
  [`heededWaits`](ref:hub/src/shared/cards.ts#heededWaits) and `dismissing`, the ring setting (`once`, `remind` every
  30 s while unwatched, `off`) and [`SOUNDS`](ref:hub/src/shared/cards.ts#SOUNDS), a score per sound (question, done)
  each renderer plays its own way. The setting is chosen in the shared settings popover, where each sound can be played
  ([[settings-and-tips]]). Dismissals and the setting live in `tower.store` (`waits.dismissed`,
  `waits.ring`): per viewer, shared by their renderers, re-read on every board.
- One ringer per viewer: a framed renderer rings nothing and leaves it to the page framing it (Tower 3D checks
  `tower.framed`), which sees the same transitions; Tower 3D run on its own rings itself.
- Tower 3D adds edge arrows toward waiting workers out of view on your floor
  ([`pointers`](ref:hub/renderers/tower3d/src/compass.ts#pointers)); the page drops its 12 s hint.

**Alternatives considered.**
- Screen regexes over the rendered screen (agent-office): needs a terminal per booting session in the bridge; matching
  writes is enough for screens drawn in a write or two.
- Keeping output until the first hook of any kind: the mod's `session.start` comes before `SessionStart`, so the filter
  and the fold could disagree; folding the state in the filter can't.
- A logged "seen" fact so reading an answer clears its wait: the first fact about a viewer rather than a session.
  Dismissing is the viewer's own, in `tower.store`.
- `failed` sounding as an answer: it needs looking at, so it rings as a question.

**A hire's answer waits on its hirer** (2026-10-07). With a coordinator running several hires, every answer they
finished rang and joined the list, though the hirer is the one to read it. And `needs` (red, blinking) coloured every
wait alike, so "done, your turn" read as alarm.
- Whom a wait is on is derived on the board, beside crews ([[crews]]): a `done` wait whose latest conversation's
  prompt is the hirer's (`promptBy`), while the hirer's current card is live, gets `waiting: false` and `waitsOn` (the
  hirer's id and callsign). Everything that keys on `board.waiting` or `card.waiting` (rings, notifications, N, counts,
  the tab title) leaves it alone with no renderer change; `statusName` says "waiting on <CALLSIGN>".
- A worker that asked to go home (`card.leaving`): its outcome waits on nobody, as the tower sends it home when its
  turn ends; a screen or a question still waits on the user ([[leave]]).
- Attention splits: `needs` is a screen or a question (red, blinks), `ready` an unread answer (a calm green, still),
  `broken` a failure, read or not. `ready` holds whomever the answer waits on: the colour says what the worker holds,
  `waiting` whether it's yours. A count of waits is coloured by its loudest card
  ([`loudest`](ref:hub/src/shared/cards.ts#loudest): needs, broken, ready, the rank waits are gone to in).
- Alternatives: keeping a hire's done-wait in the list ranked last, silent or ringing: still the user's list filled with
  answers that aren't theirs. Its hirer's state ignored: a hirer gone home reads nothing, so the answer comes back to
  you. Keying on `card.reportsTo`: an untold reviewer reports to its author yet its notes are for the user; `hiredBy`
  (who ran `tower review` or `tower hire`) is who asked. A `ready` reason the renderers colour: colour would be derived
  in each renderer ([[design-system]]).

**Offers join the list** (2026-10-13). A policy's slot offered (`board.offers`, [[policies]]) asks for you
before any worker exists, so it can't be a `Wait`: every renderer looks a wait's card up by its `id`.
- [`attentionOrder`](ref:hub/src/shared/cards.ts#attentionOrder): the heeded waits, then the heeded offers (oldest
  first). A worker held mid-task costs more than a slot not yet taken, and an offer stays open until its policy's next
  slot. `nextWait` takes either (an offer is never `here`'s); N on an offer opens the policies of its floor.
- Dismissing an offer is `dismissing` with its key (`policy@slot`), in the same `waits.dismissed`: a dismissed offer
  stays open and acceptable in the policies panel ([[shared-panels]]), out of the count, the order and the rings.
- [`offerTransitions`](ref:hub/src/shared/cards.ts#offerTransitions) reads offers as `transitions` reads waits;
  `offersBeganLine` is the live region's sentence. An offer rings with a score of its own, `offer` in `SOUNDS`
  (a rising triad), so it isn't taken for a worker waiting
  ([`ringingSound`](ref:hub/src/shared/cards.ts#ringingSound): the first wait not watched, else the first offer). It
  can be played in the settings popover beside the other two.
- An auto policy that lost its approval ("needs you") is a change of state, not a request: it never rings and isn't in
  the list.
- Alternatives: a `Wait.reason` of `offer` (a wait with no card breaks every renderer, an API major); offers merged
  with waits by `since` (an offer opened an hour ago would jump a blocked screen).

**Impact.** A breaking board change (`waiting` from ids to waits; `neighbours` takes the viewer's `Heed`): both
renderers moved in the same change. `Status` gains `blocked`, live and not at its composer (no `submit`). Seats and
other renderer logic (`card.seat`, `bubbleOf`) stay for the roadmap's "logic out of renderers" item.
