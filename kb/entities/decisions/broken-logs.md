---
{
  "type": "decision",
  "name": "A log the fold can't read past breaks its own session, never the tower",
  "summary": "An event whose fold throws stops that one log's fold where it stands: its facts keep what came before, Facts.broken records the error, the event's time and code, and nothing after it is folded. The board says it as a card's broken (attention broken, status word broken, the reason as its gist), and every other session and the tower live on.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/bridge/facts.ts#Broken",
    "hub/src/tail.ts#factEvents",
    "hub/src/tail.ts#noEvents",
    "hub/src/checkpoints.ts#foldLog",
    "hub/src/system.ts#watchSystem",
    "hub/src/bridge/board.ts#Card",
    "hub/src/shared/cards.ts#statusName",
    "hub/src/shared/cards.ts#statusTitle",
    "hub/src/shared/cards.ts#gistOf",
    "hub/src/cli.ts",
    "hub/src/host/main.ts",
    "hub/test/board.test.ts",
    "hub/test/fixtures/stop-without-tasks.jsonl"
  ]
}
---
**Problem.** One malformed event in one session's log took the whole tower down, and kept doing so on every
restart. A `Stop` hook posted without `background_tasks` and `session_crons` throws in the status step (Claude's
own `Stop` always carries both); the event is in the log, so every start re-folded it and died again, as did
`tower ls`, `tower resume` and archiving. The only way out was editing the log by hand.

**Why.** The user's call: one log failing is said clearly, and costs no other session. A log is a fact
([[logs-are-facts]]): the tower may not read past a line it can't follow, but it may not lose the rest of the system
over it either. Guarding each payload field (`?? []`) instead would hide the bad event, scatter checks AGENTS.md
rules out, and still leave the next unforeseen shape fatal.

**How.** The guard is the fold step itself, the one every reader of facts takes:
[`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter) runs the step and, if it throws, hands back the facts as they
were with [`broken`](ref:hub/src/bridge/facts.ts#Broken) set: the error's message, the event's time (seconds since
the session's start) and its code. A broken session's facts fold nothing more.

- **The read filter** ([`factEvents`](ref:hub/src/tail.ts#factEvents)) follows the session's state to know when it
  stops reading output, so it meets the bad event first. It keeps that event, for the fold to break on, and keeps
  nothing after it.
- **Checkpoints** ([[fold-checkpoints]]) hold `broken` like any other fact, computed from the log by this code: one
  before the bad line meets it again, one after it reads on with [`noEvents`](ref:hub/src/tail.ts#noEvents). Nothing
  is stored beyond the cache.
- **The live tail** ([[live-system]]) stops when its session breaks, as it does when one exits; a broken log is not
  tailed at the next start. `tower ls` reads `broken` and the reason; archiving folds through the same step.
- **The board** ([`Card.broken`](ref:hub/src/bridge/board.ts#Card), epoch ms) makes a broken card's attention
  `broken` and leaves its status as folded, still read through the host's live set (`lost` once the host no longer
  runs it). Its facts say nothing reliable after the break, so it waits on no one and is never stuck. The shared
  words ([`statusName`](ref:hub/src/shared/cards.ts#statusName), [`gistOf`](ref:hub/src/shared/cards.ts#gistOf),
  [`statusTitle`](ref:hub/src/shared/cards.ts#statusTitle)) say `broken`, the reason as its gist (`× log unreadable
  past a hook (time): <error>`) and what to do on hover, so both renderers draw it alike. API 1.14.

**What the user does** (runbook [[broken-log]]): the verbs stand as the facts allow. While the host runs it, drive
it or kill it; once it no longer runs, resume its conversation, which starts a new log and a healthy session under the
same callsign. Off duty, Tidy archives it like any ended worker's log.

[`test/board.test.ts`](ref:hub/test/board.test.ts) replays
[`stop-without-tasks`](ref:hub/test/fixtures/stop-without-tasks.jsonl), a sandbox session sent a `Stop` without
either field and a prompt after it: facts stop at the `Stop` (8.056 s), the card reads broken with the reason, and
offers drive and kill while running, resume once not. Every fixture's checkpoint test resumes it before and after the
break.

**Alternatives considered.**
- `?? []` at `stopStatus`: fixes the one shape found, leaves the next fatal, and AGENTS.md rules out defensive checks.
- Skipping the bad event and folding on: facts after it would be built on a step that never happened, silently.
- A try/catch around each reader (`track`, `tower ls`, archiving): three guards, none knowing which line broke.
- A `broken` status in `Status`: status also carries liveness (`drive`, `kill` and `submit` read it), and a broken
  session may still run; a card field leaves those as the host says.

**Impact.** A bad line costs its own session's facts from that line on, said on its card; the tower, every other
session and `tower ls` carry on, and a restart meets the same break in the same place. It covers events that parse
and can't be folded, not lines that don't parse: a log has one writer, the host that spawned its session, which
creates it (`wx`) and never reopens it, so a write cut short by a crash is the log's last bytes, an incomplete line
every reader leaves unread. A complete line that isn't JSON would need a second writer, and still throws in the
filter's parse.
