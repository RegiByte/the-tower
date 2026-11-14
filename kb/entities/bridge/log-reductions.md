---
{
  "type": "library",
  "name": "Log reductions",
  "summary": "Pure functions over session logs and streams: status, facts, screens, conversations, briefs, resume chains, messages, leftovers and peer names, rate-limit readings, stats, and the board that gathers them for every renderer.",
  "in": "bridge",
  "reviewed": "2026-11-14",
  "refs": ["hub/src/bridge/defaults.ts#claudeDefaults", "hub/src/bridge/status.ts#nextState", "hub/src/bridge/blocked.ts#blockedBy", "hub/src/bridge/facts.ts#factsAfter", "hub/src/bridge/rate-limits.ts#accountLimits", "hub/src/bridge/stats.ts#stats", "hub/src/bridge/messages.ts#deliveries", "hub/src/bridge/messages.ts#delivered", "hub/src/bridge/messages.ts#receipts", "hub/test/stats.test.ts", "hub/src/bridge/screen.ts#snapshot", "hub/src/bridge/screen.ts#lastFrame", "hub/src/bridge/status.ts#withLiveness", "hub/src/bridge/turns.ts#briefOf", "hub/src/bridge/screen.ts#mirrorOf", "hub/src/bridge/screen.ts#headlessTerminal", "hub/test/screen.test.ts", "hub/src/bridge/conversation.ts#conversationsAfter", "hub/src/bridge/chains.ts#threads", "hub/src/bridge/resources.ts#resources", "hub/src/bridge/resources.ts#peers", "hub/src/bridge/board.ts#board", "hub/src/bridge/folds.ts#foldBoard", "hub/src/bridge/life.ts#lifeOf", "hub/src/bridge/verbs.ts", "hub/src/bridge/seats.ts", "hub/src/bridge/checkouts.ts", "hub/src/bridge/worktrees.ts", "hub/src/bridge/retention.ts", "hub/src/bridge/landed.ts"]
}
---
`src/bridge`. Each reduction is written as a fold step, so a log can be folded whole, from a checkpoint
([[fold-checkpoints]]), or one event at a time as it is tailed:

- [`nextState`](ref:hub/src/bridge/status.ts#nextState): `booting | blocked | idle | working | needs_input | watching |
  done | failed | exited`, with `since`. Until Claude raises its first hook, output is read for a screen that holds
  the session before it starts ([`blockedBy`](ref:hub/src/bridge/blocked.ts#blockedBy), [[attention-list]]). Classic
  hooks decide most transitions; a `Stop` listing a running background task or a cron is `watching`, any other
  `done` ([[watching-status]]); the mod's `turn.complete` and `tower.tool.abandoned` decide interrupts and failures (a
  turn ending in an error or a refusal is `failed`). A compaction runs from its `PreCompact` to its `SessionStart`
  with `source: compact` ([[claude-code]]): a manual `/compact` is `working` between the two, then `idle`, or
  `watching` again when it started while the session watched; any other trigger leaves the status as it was. A
  `blocked` state carries its screen and nothing else, any other the compaction in progress, and the card says
  `compacting` while one runs in a working session. A subagent's compaction raises the same hooks, carrying `agent_id`
  since Claude 2.1.323, and is then left out. On an older release nothing tells it apart, so its start can show a
  working main loop as `compacting` until the loop's next step, and its end can end a manual one early (known gaps). A session without an `x` event that the host no longer runs is `lost`
  ([`withLiveness`](ref:hub/src/bridge/status.ts#withLiveness)).
- [`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter), the fold step every reader of facts takes, and the one place
  a bad event is caught: a step that throws leaves the facts as they were with `broken`, and after it only the user
  letting the worker go is folded ([[broken-logs]]). What it folds is the `Facts` type in `src/bridge/facts.ts`:
  state, context, cost, rate limits, the main loop's latest model and effort, Claude's release, the current tool
  and what Claude said this turn, the [[conversation]]s, what the worker showed and kept, the timed facts
  [`stats`](ref:hub/src/bridge/stats.ts#stats) reduces over a window ([[stats]]), and the subagents it started. The
  tower's own facts fold here too: `tower.prompt` makes a worker's typed prompt `peer`, `tower.keys` and `tower.kill`
  name who typed or killed ([[worker-prompts]]), `tower.leave` a worker asking to go home ([[leave]]).
- Messages between Claude sessions are folded as digests, never text. [`deliveries`](ref:hub/src/bridge/messages.ts#deliveries)
  joins every send to the session that logged the same text as received, nearest in time, so a brief's message step
  names the recipient whatever the address was (a name, or a reply's socket path, which nothing else ties to a session). A
  message arrives as a prompt wrapping the text as sent, read by [`delivered`](ref:hub/src/bridge/messages.ts#delivered);
  [`receipts`](ref:hub/src/bridge/messages.ts#receipts) is the same join from the receiving side, which names the
  sender in a brief ([[brief-turns]]). A peer-origin prompt without that wrapper is a subagent's hand-back.
- [`conversationsAfter`](ref:hub/src/bridge/conversation.ts#conversationsAfter) and
  [`threads`](ref:hub/src/bridge/chains.ts#threads): each conversation with its latest prompt and answer, linked to
  the sessions it was resumed from and by ([[resume]]). [`briefOf`](ref:hub/src/bridge/turns.ts#briefOf) gathers a
  worker's saved conversations and their last turns from the logs when a brief is asked for, never kept
  ([[brief-turns]]).
- [`waitsOnSomeone`](ref:hub/src/bridge/status.ts#waitsOnSomeone): see [[waiting-on-you]].
- [`lifeOf`](ref:hub/src/bridge/life.ts#lifeOf): a worker's lifecycle as its card spells it (live, stranded, cut off,
  let go, unresumable, on duty, leaving, waiting, stuck, compacting, its attention), from one session's facts, the one
  derivation of those flags: Tower 3D's fixture boards take theirs from it too.
- [`snapshot`](ref:hub/src/bridge/screen.ts#snapshot) and [`screenAt`](ref:hub/src/bridge/screen.ts#screenAt): replay
  `o` and `r` events into a headless xterm to redraw a screen now or at any moment. An ended session's snapshot is its
  last frame ([`lastFrame`](ref:hub/src/bridge/screen.ts#lastFrame), [[fullscreen-tui]]); `tower screen <id>` reads the
  same frame, or with a time the screen as it stood then. [`mirrorOf`](ref:hub/src/bridge/screen.ts#mirrorOf) keeps a
  running session's screen current from its replay on. Every headless screen is a
  [`headlessTerminal`](ref:hub/src/bridge/screen.ts#headlessTerminal), which gives a character the cells Claude Code
  does, the rule the viewers' terminals follow ([[renderer-shared-modules]]).
- [`resources`](ref:hub/src/bridge/resources.ts#resources): a session's [[leftover]] processes, from `ps` and `lsof`
  output. [`peers`](ref:hub/src/bridge/resources.ts#peers): the peer name of each session's own Claude, from Claude
  Code's registrations and the same `ps` output ([[agent-directory]]).
- [`board`](ref:hub/src/bridge/board.ts#board): the whole system as one view for renderers: projects as floors of
  cards, who waits on you ([[waiting-on-you]]), the verbs each card, conversation and floor offers ([[board-verbs]]),
  each floor's gallery and hiring limits, the model and effort Claude starts a new worker on when asked for neither,
  read from the sessions that asked for none ([`claudeDefaults`](ref:hub/src/bridge/defaults.ts#claudeDefaults); one
  value for the machine, Claude's per-project precedence not modelled), whether the host is outdated and which
  Claude releases live workers run outside the tested range, the rate limits per `argv` command
  ([`accountLimits`](ref:hub/src/bridge/rate-limits.ts#accountLimits), [[probes]]), `today` ([[stats]]) and shells.
  The core's board is built first; then each running extension's folds put its part at a subject's `x`, its
  contributions at `board.adds` and its asks at `board.asks` ([`foldBoard`](ref:hub/src/bridge/folds.ts#foldBoard),
  [[extensions]]): the core's never reads them. Its shape, field by field, is the board schema
  (`src/shared/board.schema.json`, served at `GET /schema`).

`npm test` replays the recorded sessions in `test/fixtures/*.jsonl` against hand-written expectations.
