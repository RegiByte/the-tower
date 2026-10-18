---
{
  "type": "library",
  "name": "Log reductions",
  "summary": "Pure functions over session logs and streams: status, facts, screens, conversations, briefs, resume chains, messages, leftovers and peer names, policies and probes, stats, and the board that gathers them for every renderer.",
  "in": "bridge",
  "reviewed": "2026-10-18",
  "refs": ["hub/src/bridge/status.ts#nextState", "hub/src/bridge/blocked.ts#blockedBy", "hub/src/bridge/facts.ts#factsAfter", "hub/src/bridge/probes.ts#accountLimits", "hub/src/bridge/stats.ts#stats", "hub/src/bridge/messages.ts#deliveries", "hub/src/bridge/messages.ts#delivered", "hub/src/bridge/messages.ts#receipts", "hub/test/stats.test.ts", "hub/src/bridge/screen.ts#snapshot", "hub/src/bridge/screen.ts#lastFrame", "hub/src/bridge/status.ts#withLiveness", "hub/src/bridge/turns.ts#briefOf", "hub/src/bridge/screen.ts#mirrorOf", "hub/test/screen.test.ts", "hub/src/bridge/conversation.ts#conversationsAfter", "hub/src/bridge/chains.ts#threads", "hub/src/bridge/resources.ts#resources", "hub/src/bridge/resources.ts#peers", "hub/src/bridge/board.ts#board", "hub/src/bridge/verbs.ts", "hub/src/bridge/policies.ts", "hub/src/bridge/seats.ts", "hub/src/bridge/reviews.ts", "hub/src/bridge/worktrees.ts", "hub/src/bridge/retention.ts", "hub/src/bridge/landed.ts"]
}
---
`src/bridge`. Each reduction is written as a fold step, so a log can be folded whole, from a checkpoint
([[fold-checkpoints]]), or one event at a time as it is tailed:

- [`nextState`](ref:hub/src/bridge/status.ts#nextState): `booting | blocked | idle | working | needs_input | watching |
  done | failed | exited`, with `since`. Until Claude raises its first status hook, output is read for a screen that
  holds the session before it starts ([`blockedBy`](ref:hub/src/bridge/blocked.ts#blockedBy), [[attention-list]]).
  Classic hooks decide most transitions; a `Stop` listing a running background task or a cron is `watching`, any other
  `done` ([[watching-status]]); the mod's `turn.complete` and `tower.tool.abandoned` decide interrupts and failures,
  and a turn the autocompact breaker ends is `failed` (`reason: error`). A compaction runs from its `PreCompact` to its
  `SessionStart` with `source: compact` ([[claude-code]]): a manual `/compact` is `working` between the two, then
  `idle`, or `watching` again when it started while the session watched (the state's `resumes`); an automatic one leaves the status as it was (it runs inside a turn that carries on, or summarizes a waiting
  session, which keeps waiting). The state keeps the compaction's `trigger`, and the card says `compacting` while one
  runs inside a turn or by `/compact`. A subagent's compaction raises the same hooks, so its start can show a working
  main loop as `compacting` until the loop's next step, and its end can end a manual one early (known gaps). A session
  without an `x` event that the host no longer runs is `lost`
  ([`withLiveness`](ref:hub/src/bridge/status.ts#withLiveness)).
- [`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter), the fold step every reader of facts takes, and the one place
  a bad event is caught: a step that throws leaves the facts as they were with `broken` and folds nothing after it
  ([[broken-logs]]). What it folds is the `Facts` type in `src/bridge/facts.ts`, field by field: state, size, context,
  cost, rate limits, model and release, the current tool and what Claude said this turn (each clipped to a line), the
  [[conversation]]s, what the worker showed and kept, its pages, the timed facts [`stats`](ref:hub/src/bridge/stats.ts#stats)
  reduces over a window ([[stats]]), and the subagents it started, each followed by its `agentId` through its loop
  until its turn ends. The tower's own facts fold here too: `tower.prompt` makes a worker's typed prompt `peer`
  ([[worker-prompts]]), `tower.keys` and `tower.kill` name who typed or killed ([[worker-prompts]]), `tower.leave` a worker
  asking to go home ([[leave]]).
- Messages between Claude sessions are folded as digests, never text. [`deliveries`](ref:hub/src/bridge/messages.ts#deliveries)
  joins every send to the session that logged the same text as received, nearest in time, so `card.sent` names the
  recipient whatever the address was (a name, or a reply's socket path, which nothing else ties to a session). A
  message arrives as a prompt wrapping the text as sent, read by [`delivered`](ref:hub/src/bridge/messages.ts#delivered);
  [`receipts`](ref:hub/src/bridge/messages.ts#receipts) is the same join from the receiving side, which names the
  sender in a brief ([[brief-turns]]). A peer-origin prompt without that wrapper is a subagent's hand-back.
- [`conversationsAfter`](ref:hub/src/bridge/conversation.ts#conversationsAfter) and
  [`threads`](ref:hub/src/bridge/chains.ts#threads): each conversation with its latest prompt and answer, linked to
  the sessions it was resumed from and by ([[resume]]). [`briefOf`](ref:hub/src/bridge/turns.ts#briefOf) gathers a
  worker's saved conversations and their last turns from the logs when a brief is asked for, never kept
  ([[brief-turns]]).
- [`waitsOnSomeone`](ref:hub/src/bridge/status.ts#waitsOnSomeone): see [[waiting-on-you]].
- [`snapshot`](ref:hub/src/bridge/screen.ts#snapshot) and [`screenAt`](ref:hub/src/bridge/screen.ts#screenAt): replay
  `o` and `r` events into a headless xterm to redraw a screen now or at any moment, waiting for it to parse as it goes,
  so a log of any size replays whole. An ended session's snapshot is its last frame
  ([`lastFrame`](ref:hub/src/bridge/screen.ts#lastFrame)): the log cut just before Claude's last exit from the
  alternate screen, which would leave the empty normal screen under Claude's resume line ([[fullscreen-tui]]).
  `tower screen <id>` reads the same frame, or with a time the screen as it stood then.
  [`mirrorOf`](ref:hub/src/bridge/screen.ts#mirrorOf) keeps a running session's screen current from its replay on,
  and a snapshot of it is the bytes a replay of the log so far gives (`test/screen.test.ts`).
- [`resources`](ref:hub/src/bridge/resources.ts#resources): a session's [[leftover]] processes, from `ps` and `lsof`
  output. [`peers`](ref:hub/src/bridge/resources.ts#peers): the peer name of each session's own Claude, from Claude
  Code's registrations and the same `ps` output ([[agent-directory]]).
- [`board`](ref:hub/src/bridge/board.ts#board): the whole system as one view for renderers: projects as floors of
  cards, who waits on you as waits ([[waiting-on-you]]), the verbs each card, conversation and floor offers
  ([[board-verbs]]), each floor's review threads, gallery and hiring limits, the host's and Claude's versions, the
  rate limits, `today` ([[stats]]) and shells. Its shape, field by field with their docs, is the board schema
  (`src/shared/board.schema.json`, `npm run schema:board`, served at `GET /schema`). The rate limits are the latest
  reading of any session's turn or any probe's read ([`accountLimits`](ref:hub/src/bridge/probes.ts#accountLimits)),
  with when and whose it is (`rateLimitsAt`, `rateLimitsFrom`): a reading arrives only with a turn or a read
  ([[probes]]), so renderers show its age. The tower draws it and relays it to shelf pages ([[renderer-api]]).

Fixtures in `test/fixtures/*.jsonl` are real recorded sessions; `npm test` replays them against hand-written
expectations.
