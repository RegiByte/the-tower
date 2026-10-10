---
{
  "type": "flow",
  "name": "Hire",
  "summary": "A worker starts another on a prompt with tower hire: a spawn marked as its hire, which the tower weighs against the floor's hiring limits, starts, and logs as a fact in the hirer's log, one hire of a hirer at a time; the board turns the fact into the new card's hiredBy.",
  "in": "tower",
  "reviewed": "2026-10-10",
  "involves": ["tower-mod", "tower-server", "host-daemon", "system-root", "log-reductions"],
  "refs": ["hub/src/directory.ts#hireArgs", "hub/src/tower/server.ts#hired", "hub/src/tower/server.ts#inTurn", "hub/src/tower/server.ts#counted", "hub/src/system.ts#watchSystem", "hub/src/directory.ts#hiredLines", "hub/src/shared/cards.ts#hireRefusal", "hub/src/shared/cards.ts#hireDepth", "hub/src/shared/cards.ts#liveHires", "hub/src/shared/cards.ts#spawnDefaults", "hub/src/shared/cards.ts#spawnCall", "hub/src/shared/model.ts#hiringConfig", "hub/src/bridge/facts.ts", "hub/src/bridge/board.ts#hirersOf"]
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
  M->>T: POST /spawn (spawnCall of the defaults and the given fields, by: hirer, hire: true)
  T->>T: in the hirer's turn: hireRefusal(every card, floor, hirer's card)
  T->>H: spawn a new session on the prompt
  T->>H: fact tower.hire {id: new session} in the hirer's log
  H->>R: h event in the hirer's log
  R-->>F: facts.hired gains the id; board: card.hiredBy
  T->>T: the hirer's turn ends once the system counts the hire
```

- **Limits live in the tower.** A `spawn` with `hire` and `by` is `by`'s hire, whoever sends it.
  [`hired`](ref:hub/src/tower/server.ts#hired) weighs it with [`hireRefusal`](ref:hub/src/shared/cards.ts#hireRefusal)
  over every card, the ones the board leaves out included ([[board-archive]]): how many hires deep the hirer stands
  ([`hireDepth`](ref:hub/src/shared/cards.ts#hireDepth)) and how many of its hires still run
  ([`liveHires`](ref:hub/src/shared/cards.ts#liveHires), reviewers aside), against the spawn's floor's `hiring`
  ([`hiringConfig`](ref:hub/src/shared/model.ts#hiringConfig): the project's own, else the top level's, else
  defaults). Past them it answers `limited` (409), and the command tells the worker to ask the user. A spawn without
  `hire` is not limited, by design ([[hiring-limits]]).
- **One at a time.** Claude runs Bash calls in parallel, so a worker's hires can arrive together. A hirer's hires
  queue by its callsign ([`inTurn`](ref:hub/src/tower/server.ts#inTurn)), and each holds the turn until the system
  counts it ([`counted`](ref:hub/src/tower/server.ts#counted): its log tracked, the hirer's log naming it, the host
  running it; `until` on [`watchSystem`](ref:hub/src/system.ts#watchSystem), at most 5 s), so the next is weighed
  against it.
- **What is hired.** The same form the user's quick hire sends, everything left to its default
  ([`spawnDefaults`](ref:hub/src/shared/cards.ts#spawnDefaults), [`spawnCall`](ref:hub/src/shared/cards.ts#spawnCall)):
  a new worktree when the floor cuts by default, else the hub. The prompt is stdin or a kept item's text; an empty
  one is refused.
- **The fact.** The tower has the host append `tower.hire` to the hirer's own log through the host's `fact`, right
  after the spawn, as it appends `tower.prompt` ([[worker-prompts]]); a hire that can't be logged is killed (it can be
  resumed), so every hire that runs is counted. The fold appends the id to `facts.hired`; the board inverts it across resumes
  ([`hirersOf`](ref:hub/src/bridge/board.ts#hirersOf)), so the hired card's `hiredBy` names the worker (the
  callsign of the hirer's whole chain), not one session. A worker started any other way has none.
- **Its answer is the hirer's.** While the hirer runs, a hire's answer to the hirer's prompt waits on the hirer, not
  on the user: off the attention list, its status word "waiting on <HIRER>" ([[waiting-on-you]]).
- **Going home.** The hire reports to its hirer ([[crews]]): `tower home` ends the hirer's crew, deepest first. A
  finished hire whose worktree's work has landed is on the floor's [[tidy]] list.
- **Reviews share the fact.** `tower review` spawns with `hire` too ([[review-round]]); a prompt that starts a
  reviewer ([`reviewedIn`](ref:hub/src/shared/reviews.ts#reviewedIn)) is never weighed against the limits.
- **Failure.** Without `TOWER_SESSION_ID` the command refuses (the Claude was not started by the tower); with the
  host down the floor offers no spawn and the command says to run `tower up`; a host older than protocol 2 can't
  append the fact, and the hire refuses with `unavailable` before it spawns.
