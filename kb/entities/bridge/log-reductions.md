---
{
  "type": "library",
  "name": "Log reductions",
  "summary": "Pure functions over session logs: status, facts, screens, conversations, resume chains, leftovers and peer names.",
  "in": "bridge",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/bridge/status.ts#nextState", "hub/src/bridge/blocked.ts#blockedBy", "hub/src/bridge/board.ts#waitingOrder", "hub/src/bridge/facts.ts#factsAfter", "hub/src/bridge/facts.ts#latestRateLimits", "hub/src/bridge/stats.ts#stats", "hub/src/bridge/messages.ts#deliveries", "hub/src/bridge/messages.ts#delivered", "hub/src/bridge/messages.ts#receipts", "hub/test/stats.test.ts", "hub/src/bridge/screen.ts#snapshot", "hub/src/bridge/screen.ts#lastFrame", "hub/src/bridge/screen.ts#mirrorOf", "hub/test/screen.test.ts", "hub/src/bridge/conversation.ts#conversationsAfter", "hub/src/bridge/chains.ts#threads", "hub/src/bridge/resources.ts#resources", "hub/src/bridge/resources.ts#peers", "hub/src/bridge/board.ts#board", "hub/src/bridge/verbs.ts"]
}
---
`src/bridge`. Each reduction is written as a fold step, so a log can be folded whole, from a checkpoint
([[fold-checkpoints]]: the facts fold's result at a line boundary, cached under a hash of these modules' source),
or one event at a time as it is tailed:

- [`nextState`](ref:hub/src/bridge/status.ts#nextState): `booting | blocked | idle | working | needs_input | watching |
  done | failed | exited`, with `since`. Until Claude raises its first status hook, output is read for a screen that holds the
  session before it starts ([`blockedBy`](ref:hub/src/bridge/blocked.ts#blockedBy): the workspace trust dialog,
  first-run setup and sign-in), matched on the output with its escapes and whitespace removed (Claude draws spaces as
  cursor moves); such a screen makes it `blocked` with the screen's kind (`trust`, `login`) until that hook or its exit.
  Classic hooks decide most transitions; a `Stop` listing a running background task or a cron is `watching`, any other
  `done` ([[watching-status]]); the mod's `turn.complete` and
  `tower.tool.abandoned` decide interrupts and failures. A compaction (the mod's `session.compact`) is `working`
  until its `SessionStart` with `source: compact`: idle after a manual `/compact`, which runs between turns;
  unchanged after an automatic one, which runs inside a turn that carries on (an automatic one may also give
  up with no `SessionStart`, ended by the turn's next step). The state keeps the `trigger` of the compaction in
  progress for that, and the board's card says `compacting` while it runs. A session without
  an `x` event that the host no longer runs is `lost` ([`withLiveness`](ref:hub/src/bridge/status.ts#withLiveness)).
- [`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter), the fold step every reader of facts takes, and the one
  place a bad event is caught: a step that throws leaves the facts as they were with `broken` (the error, the event's
  time and code) and folds nothing after it ([[broken-logs]]). It folds state plus size, context, cost, rate limits,
  current tool (its label clipped to 280 characters, like each of `says`: a Bash heredoc runs to kilobytes), what
  Claude told the user between tool calls this turn (`says`, its latest few steps), model,
  effort, the release of Claude it runs (`claude`, from `tower.claude`), the main loop's finished turns (`turns`: each `Stop`; an interrupt or a failure raises none), the [[conversation]]s held, what the worker showed (`shown`, from `tower.show`: [[agent-show]]), what it kept (`kept`, from `tower.keep`: [[agent-keep]]), when someone
  last typed, `hostStopped` and `exitedFrom` (the status it exited from, which says a turn was cut short:
  [[carry-on]]), and the timed facts stats reduce ([[stats]]): `spend` per cost reading, `tokens` per
  model step, `turnSpans`, `waits` on the user, `prompts` by origin, `asks`, `failures`, `spawns` and each rate
  limit's readings where they moved. [`stats`](ref:hub/src/bridge/stats.ts#stats) reduces them over a window. Also
  `pages`: each html file the worker wrote (`Write`, subagents' too), which the card carries with whether the worker
  showed it (`card.pages`), and `sent` and `received`: each message to or from another Claude session with a digest
  of its text, never the text. [`deliveries`](ref:hub/src/bridge/messages.ts#deliveries) joins every send to the
  session that logged the same text as received, nearest in time, so `card.sent` names the recipient's callsign
  whatever the address was: a name, or a reply's `uds:/tmp/cc-socks/<pid>.sock`, which nothing else ties to a session.
  A message is received as a prompt wrapping the text as sent (`<cross-session-message from-name="…">`), read by
  [`delivered`](ref:hub/src/bridge/messages.ts#delivered); [`receipts`](ref:hub/src/bridge/messages.ts#receipts) is the
  same join from the receiving side, which names the sender of a worker's message in its brief ([[brief-turns]]).
  A prompt of Claude's peer origin without that wrapper is a subagent's hand-back, counted under `prompts` as
  `hand-back`. A prompt a worker typed through the tower (`submit` or `spawn` with `by`) reaches Claude as the
  composer's: the `tower.prompt` fact before it makes it `peer`, and it answers no wait ([[worker-prompts]]).
- [`conversationsAfter`](ref:hub/src/bridge/conversation.ts#conversationsAfter) and
  [`threads`](ref:hub/src/bridge/chains.ts#threads): each conversation with its latest prompt and answer, linked
  to the sessions it was resumed from and by ([[resume]]). [`briefOf`](ref:hub/src/bridge/turns.ts#briefOf) gathers
  the saved conversations of every session the worker ran as up to the one asked for, each with its session and its
  last turns, read from the session logs (and its resume sources', only as far as needed) when a brief is asked for
  and never kept ([[brief-turns]]).
- [`waitsOnSomeone`](ref:hub/src/bridge/status.ts#waitsOnSomeone): see [[waiting-on-you]].
- [`snapshot`](ref:hub/src/bridge/screen.ts#snapshot) and [`screenAt`](ref:hub/src/bridge/screen.ts#screenAt):
  replay `o` and `r` events into a headless xterm to redraw a screen now or at any moment, waiting for it to parse every
  few MB of output (xterm throws away writes past ~50 MB unparsed), so a log of any size replays whole. An ended session's
  snapshot is its last frame ([`lastFrame`](ref:hub/src/bridge/screen.ts#lastFrame)): the log cut just before
  Claude's last exit from the alternate screen (`?1049l`, found in the output joined across events, so an escape
  split between two `o` events or sharing one with other bytes cuts at its first byte), which would leave the empty
  normal screen under Claude's resume line ([[fullscreen-tui]]). A log with no `x`, or whose last `?1049h` follows
  its last `?1049l` (killed in the alternate screen), is replayed whole. `tower screen <id>` reads the same frame;
  with a time, the screen as it stood then. [`mirrorOf`](ref:hub/src/bridge/screen.ts#mirrorOf) keeps a running
  session's screen current from its replay on: each later event drawn in the order it was logged (a resize waits in
  xterm's write queue behind the output before it), and a snapshot of it is the bytes a replay of the log so far
  gives (`test/screen.test.ts` checks it at several cuts of every fixture).
- [`resources`](ref:hub/src/bridge/resources.ts#resources): a session's [[leftover]] processes, from `ps`
  and `lsof` output. [`peers`](ref:hub/src/bridge/resources.ts#peers): the peer name of each session's own
  Claude, from Claude Code's registrations and the same `ps` output ([[agent-directory]]).
- [`board`](ref:hub/src/bridge/board.ts#board): the whole system as one view for renderers: projects as
  floors of cards (status, `live`, waiting, attention (`watching` is `quiet`), `callsign`, `shown` and `turns` across the sessions the worker ran as
  ([`lineage`](ref:hub/src/bridge/chains.ts#lineage)), `continuedBy` and each conversation's `resumes`/`resumedBy` as `{id, callsign, startedAt}`, `peer`, `onDuty`, `seat` ([[workstations]]), `hiredBy` ([[hiring-limits]]), `reportsTo` ([[crews]]),
  `checkout`, `reviews` and `unseen` ([[reviewer]], [[review-threads]]), `checkoutState` and `threadState` (live, landed or gone, [[review-threads]]), `unresumable` (why a past worker can't be
  resumed where it ran, [[resume]]), `stranded` and `cutOff` (stranded mid-turn, [[carry-on]]), facts, conversation excerpts and
  the verbs each card, conversation and floor offers, see [[board-verbs]]), who waits on you in the order to go
  to them as waits ([`waitingOrder`](ref:hub/src/bridge/board.ts#waitingOrder): `{id, key: id@since, reason, since,
  detail}`, a screen first, then a question, a failure, an answer, each reason by the longest wait; [[waiting-on-you]],
  [[attention-list]]), each floor's review `threads`, `gallery` (its last showings, [[shared-wall]]) and `hiring` limits,
  whether the host is up and speaks the clients' protocol (`hostUp`, `hostOutdated`), each card's `claude`
  and whether it is outside the tested range (`claudeUntested`), and once per untested release a live worker runs
  (`board.claudeUntested`, [[new-claude-release]]),
  rate limits (the latest reading of any session, [`latestRateLimits`](ref:hub/src/bridge/facts.ts#latestRateLimits),
  with when it was read as `rateLimitsAt`: a reading arrives only with a turn, so renderers show its age),
  `today` (today's spend, agent-hours, waits and the weekly budget, [[stats]]) and shells. The tower draws it and relays it to shelf pages ([[shelf-page-contract]]).

Fixtures in `test/fixtures/*.jsonl` are real recorded sessions; `npm test` replays them against hand-written
expectations.
