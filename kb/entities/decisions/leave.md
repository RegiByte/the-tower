---
{
  "type": "decision",
  "name": "A worker ends itself with its own callsign, once its turn ends",
  "summary": "tower home naming the worker's own callsign logs tower.leave in its own log; the card is leaving until a later prompt cancels it, its outcome waiting on nobody meanwhile, and once the main loop's turn completes the tower runs the card's send-home, or its kill when it is in no crew, each named as the worker's own act.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-13",
  "reviewed": "2026-10-15",
  "refs": [
    "hub/src/directory.ts",
    "hub/src/bridge/facts.ts#LEAVE",
    "hub/src/bridge/facts.ts#leavesNow",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/bridge/board.ts#Card",
    "hub/src/tower/server.ts#sendLeaversHome",
    "hub/src/shared/cards.ts#statusName",
    "hub/src/mod/skills/handbook/SKILL.md"
  ],
  "links": [
    { "to": "crews", "verb": "uses", "carries": "the card's send-home, a kill per running worker under it, then its own" },
    { "to": "worker-acts", "verb": "uses", "carries": "each kill named by the leaving worker's id (tower.kill)" },
    { "to": "agent-show", "verb": "extends", "carries": "a fact the worker logs in its own log through the hooks socket" }
  ]
}
---
**Problem.** Standing work runs unwatched: a run that posts its findings somewhere and is done stays on duty, ready,
until someone ends it. A worker could end itself with `tower kill` on its own session, but a kill mid-turn ends the
turn before `turn.complete`, the event its latest answer is folded from (`conversationsAfter`). Its brief would show no
answer, and a next run reading its predecessors would find no handoff note.

**Decision.**
- *Only the worker's own callsign.* `tower home <CALLSIGN>` naming the caller's own card (`card.id` is
  `TOWER_SESSION_ID`) posts `{hook_event_name: 'tower.leave'}` to the host's hooks socket under the session's own id,
  as `tower show` does ([[agent-show]]): no host change. A bare `tower home` stays a usage error, so ending oneself
  takes reading one's callsign (`tower whoami`). Naming anyone else is the crew's `send-home`, unchanged, or the `kill` of a worker in no crew ([[crews]]).
- *Folded, not stored.* The fold sets `facts.leaveAt`; any later `prompt.submit` clears it, so someone typing to the
  worker keeps it on duty. `card.leaving` is a running card with `leaveAt` set, and a leaving card's outcome
  (`done`, `failed`: [`isOutcome`](ref:hub/src/bridge/status.ts#isOutcome)) waits on nobody, so its `Stop` before going
  raises no wait or ring. A screen or a question still waits on the user: the turn can't end until someone answers.
- *Effective when the turn ends.* [`leavesNow`](ref:hub/src/bridge/facts.ts#leavesNow): a leave is pending and no
  main-loop turn runs (`turnStartedAt` cleared by `turn.complete`, after the answer is folded). On every change of the
  live system the tower server ([`sendLeaversHome`](ref:hub/src/tower/server.ts#sendLeaversHome)) takes each leaving
  card that `leavesNow` (computing the cards only when a live session does, or a departure is in flight) and runs its calls through the public `kill` handler, its body parsed by the verb's schema as
  a `POST` would be: `send-home` when it is in a crew (everyone under it, deepest first, then itself), else `kill`.
  Each kill is `by` the leaving worker ([[worker-acts]]). A worker is sent once while it is leaving. The leave lives in
  the log, so a turn that completed while the tower was down is acted on when it starts.
- *Drawn as a word.* `statusName` adds `going home` (`working, going home`), which every renderer and `tower agents`
  read. The `tower:handbook` skill says to end oneself with one's own callsign, after this turn.

**Alternatives considered.**
- *An immediate self-kill* (`card.calls.kill` when no `send-home`): a CLI-only change, but it loses the last answer.
- *Writing the handoff to a file, showing it, then killing*: works, but the brief stays empty and every policy gains a
  ritual.
- *A bare `tower home` meaning oneself*: one slip ends the caller; naming oneself is deliberate.
- *A host change that ends a session after its next turn*: the host stays small and knows nothing of turns; the tower
  already folds them.

**Impact.** Log: the `tower.leave` fact. Board: `card.leaving` (API 1.48). Tower server: a reaction to the live
system that sends leaving workers home. CLI: `tower home` with one's own callsign. Shared: `statusName` says
`going home`. A worker ended this way is off duty, resumable, its last answer kept.
