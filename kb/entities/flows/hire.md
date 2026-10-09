---
{
  "type": "flow",
  "name": "Hire",
  "summary": "A worker starts another on a prompt with tower hire: the floor's hiring limits are checked, the worker is spawned through the renderer API, and who hired whom is logged as a fact the board turns into the new card's hiredBy.",
  "in": "tower",
  "reviewed": "2026-10-09",
  "involves": ["tower-mod", "tower-server", "host-daemon", "system-root", "log-reductions"],
  "refs": ["hub/src/directory.ts#hireArgs", "hub/src/directory.ts#postToHost", "hub/src/directory.ts#hiredLines", "hub/src/shared/cards.ts#hireRefusal", "hub/src/shared/cards.ts#hireDepth", "hub/src/shared/cards.ts#liveHires", "hub/src/shared/cards.ts#spawnDefaults", "hub/src/shared/cards.ts#spawnCall", "hub/src/shared/model.ts#hiringConfig", "hub/src/bridge/facts.ts", "hub/src/bridge/board.ts#hirersOf"]
}
---
```mermaid
sequenceDiagram
  participant W as hirer's Claude
  participant M as [[tower-mod]] (tower command)
  participant T as [[tower-server]]
  participant H as [[host-daemon]]
  participant R as [[system-root]]
  participant F as [[log-reductions]]
  W->>M: tower hire [tag|id] [model|effort|name|base ...] (prompt on stdin or a kept item)
  M->>T: GET /board
  M->>M: hireRefusal(cards, floor, own card)
  M->>T: POST /spawn (spawnCall of the defaults and the given fields)
  T->>H: spawn a new session on the prompt
  M->>H: POST /hooks/<hirer> tower.hire {id: new session}
  H->>R: h event in the hirer's log
  R-->>F: facts.hired gains the id; board: card.hiredBy
```

- **Limits live in the command.** [`hireRefusal`](ref:hub/src/shared/cards.ts#hireRefusal) reads the board, with
  the floors' archives for workers it leaves out ([[board-archive]]):
  how many hires deep the worker stands ([`hireDepth`](ref:hub/src/shared/cards.ts#hireDepth)) and how many of
  its hires still run ([`liveHires`](ref:hub/src/shared/cards.ts#liveHires), reviewers aside), against the
  floor's `hiring` ([`hiringConfig`](ref:hub/src/shared/model.ts#hiringConfig): the project's own, else the top
  level's, else defaults). A refusal is an error telling the worker to ask the user. The tower itself refuses
  nothing: a worker that calls `spawn` directly is not limited, by design ([[hiring-limits]]).
- **What is hired.** The same form the user's quick hire sends, everything left to its default
  ([`spawnDefaults`](ref:hub/src/shared/cards.ts#spawnDefaults), [`spawnCall`](ref:hub/src/shared/cards.ts#spawnCall)):
  a new worktree when the floor cuts by default, else the hub. The prompt is stdin or a kept item's text; an empty
  one is refused.
- **The fact.** The command, not the host, posts `tower.hire` to the hirer's own log, after the spawn succeeded.
  The fold appends the id to `facts.hired`; the board inverts it across resumes
  ([`hirersOf`](ref:hub/src/bridge/board.ts#hirersOf)), so the hired card's `hiredBy` names the worker (the
  callsign of the hirer's whole chain), not one session. A worker started any other way has none.
- **Its answer is the hirer's.** While the hirer runs, a hire's answer to the hirer's prompt waits on the hirer, not
  on the user: off the attention list, its status word "waiting on <HIRER>" ([[waiting-on-you]]).
- **Going home.** The hire reports to its hirer ([[crews]]): `tower home` ends the hirer's crew, deepest first. A
  finished hire whose worktree's work has landed is on the floor's [[tidy]] list.
- **Reviews share the fact.** `tower review` posts the same `tower.hire` ([[review-round]]) but skips the limits.
- **Failure.** Without `TOWER_SESSION_ID` or `TOWER_HOOKS_SOCKET` the command refuses (the Claude was not started by
  the tower); with the host down the floor offers no spawn and the command says to run `tower up`.
