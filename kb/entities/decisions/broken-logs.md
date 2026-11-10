---
{
  "type": "decision",
  "name": "A log the fold can't read past breaks its own session, never the tower",
  "summary": "An event whose fold throws, a line that holds no event, or a first line that holds no header stops that one log's fold where it stands: its facts keep what came before, Facts.broken records the error, the event's time and code, and nothing after it is folded. The board says it as a card's broken (attention broken, status word broken, the reason as its gist), and every other session and the tower live on.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-11-10",
  "refs": [
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/bridge/facts.ts#Broken",
    "hub/src/tail.ts#factEvents",
    "hub/src/tail.ts#afterBreak",
    "hub/src/checkpoints.ts#foldLog",
    "hub/src/system.ts#watchSystem",
    "hub/src/bridge/board.ts#Card",
    "hub/src/shared/status-words.ts#statusName",
    "hub/src/shared/status-words.ts#statusTitle",
    "hub/src/shared/status-words.ts#gistOf",
    "hub/src/cli.ts",
    "hub/src/host/main.ts#appendFact",
    "hub/test/board.test.ts",
    "hub/test/fixtures/stop-without-tasks.jsonl",
    "hub/test/checkpoints.test.ts",
    "hub/src/bridge/facts.ts#Unreadable",
    "hub/src/tail.ts#readHeader",
    "hub/src/tail.ts#Head",
    "hub/src/shared/launch.ts#startOfSessionId",
    "hub/src/shared/model.ts#floorOf",
    "hub/src/bridge/board.ts#placedOn",
    "hub/test/server.test.ts"
  ]
}
---
**Problem.** One malformed event in one session's log (a `Stop` hook posted without the fields Claude's own always
carries, or a line cut short by a crash and then appended after) threw in the fold. The event is in the log, so every
start re-folded it and died again, as did `tower ls`, `tower resume` and archiving: one log took the whole tower down,
with editing the log by hand the only way out.

**Why.** The user's call: one log failing is said clearly, and costs no other session. A log is a fact
([[logs-are-facts]]): the tower may not read past a line it can't follow, but it may not lose the rest of the system
over it either. Guarding each payload field (`?? []`) instead would hide the bad event, scatter checks [[fail-clearly]]
rules out, and still leave the next unforeseen shape fatal.

**How.** The guard is the fold step itself, the one every reader of facts takes:
[`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter) runs the step and, if it throws, hands back the facts as they
were with [`broken`](ref:hub/src/bridge/facts.ts#Broken) set: the error's message, the event's time (seconds since
the session's start) and its code. A broken session's facts fold nothing more.

- **The read filter** ([`factEvents`](ref:hub/src/tail.ts#factEvents)) follows the session's state to know when it
  stops reading output, so it meets the bad event first. It keeps that event, for the fold to break on, and keeps
  nothing after it.
- **Checkpoints** ([[fold-checkpoints]]) hold `broken` like any other fact, computed from the log by this code: one
  before the bad line meets it again, one after it reads on with [`afterBreak`](ref:hub/src/tail.ts#afterBreak), which folds only the user letting the
  session go ([[let-go]]). Nothing
  is stored beyond the cache.
- **The live tail** ([[live-system]]) stops when its session breaks, as it does when one exits; a broken log is not
  tailed at the next start. `tower ls` reads `broken` and the reason; archiving folds through the same step.
- **The board** ([`Card.broken`](ref:hub/src/bridge/board.ts#Card), epoch ms) makes a broken card's attention
  `broken` and leaves its status as folded, still read through the host's live set (`lost` once the host no longer
  runs it). Its facts say nothing reliable after the break, so it waits on no one and is never stuck. The shared
  words ([`statusName`](ref:hub/src/shared/status-words.ts#statusName), [`gistOf`](ref:hub/src/shared/status-words.ts#gistOf),
  [`statusTitle`](ref:hub/src/shared/status-words.ts#statusTitle)) say `broken`, the reason as its gist (`× log unreadable
  past a hook (time): <error>`) and what to do on hover, so every renderer draws it alike.

**What the user does** (runbook [[broken-log]]): the verbs stand as the facts allow. While the host runs it, drive
it or kill it; once it no longer runs, resume its conversation, which starts a new log and a healthy session under the
same callsign. Off duty, Tidy archives it like any ended worker's log.

[`test/board.test.ts`](ref:hub/test/board.test.ts) replays
[`stop-without-tasks`](ref:hub/test/fixtures/stop-without-tasks.jsonl) to hold this, and
[`test/checkpoints.test.ts`](ref:hub/test/checkpoints.test.ts) resumes every fixture's fold before and after a break
and folds logs whose first line or an event line is bad; [`test/server.test.ts`](ref:hub/test/server.test.ts) starts
the tower with such logs in place.

**Alternatives considered.**
- `?? []` at `stopStatus`: fixes the one shape found, leaves the next fatal, and [[fail-clearly]] rules out defensive checks.
- Skipping the bad event and folding on: facts after it would be built on a step that never happened, silently.
- A try/catch around each reader (`track`, `tower ls`, archiving): three guards, none knowing which line broke.
- A `broken` status in `Status`: status also carries liveness (`drive`, `kill` and `submit` read it), and a broken
  session may still run; a card field leaves those as the host says.

**Impact.** A bad line costs its own session's facts from that line on, said on its card; the tower, every other
session and `tower ls` carry on, and a restart meets the same break in the same place.

*A line that holds no event.* A write cut short by a crash leaves an incomplete last line every reader leaves unread
until something appends after it. The fact filter ([`factEvents`](ref:hub/src/tail.ts#factEvents)) reads such a
complete line as [`Unreadable`](ref:hub/src/bridge/facts.ts#Unreadable) (its time and code as far as its prefix
reads, the session's start and `?` past that), for `factsAfter` to break on like any event it can't follow. So does
JSON that isn't `[time, code, …]` (a `null`, a `{}`), which the host never writes and which would otherwise end the
fold silently or break it with no time. Only a line the filter parses can break the fold, so a torn output line past the session's start costs nothing. After a break the filter keeps what `afterBreak`
keeps, and a live tail that stops at a break folds the log again from its checkpoint
([`watchSystem`](ref:hub/src/system.ts#watchSystem)). The screen and every-event readers skip the line. The host
itself makes no such line: before it appends a fact to a log it doesn't run, it cuts an unfinished last line back to
the log's whole lines ([`appendFact`](ref:hub/src/host/main.ts#appendFact), [[let-go]]).

*A first line that holds no header.* Every reader of a log starts at its header, so the fold, the screen and the
brief all need one. It is read in one step ([`readHeader`](ref:hub/src/tail.ts#readHeader), and `readLog` through it). A first line that isn't JSON or
isn't a header's shape gives a [`Head`](ref:hub/src/tail.ts#Head) with a header made of what is left, and `unreadable`,
which [`foldLog`](ref:hub/src/checkpoints.ts#foldLog) starts the facts broken on: at 0, code `header`, so the facts are the
initial ones and only `afterBreak` reads on. That code is the one a card tells it by: its line reads `× log unreadable
from its start: <error>` with no time, and its hover says nothing resumes it. A log with no whole line is still a log the host hasn't finished writing a
header to, not a broken one.

What is left is derived from the log, so a checkpoint for it holds: the id from the file name, the start from that id
([`startOfSessionId`](ref:hub/src/shared/launch.ts#startOfSessionId)), the directory from its first hook that names
one, no argv, an 80×24 terminal for its screen. `project` is `''`: a directory says its floor only against the config,
so the fold can't say it and the live system, which reads no config, leaves it. Whoever holds a config places the
session: [`placedOn`](ref:hub/src/bridge/board.ts#placedOn) over [`floorOf`](ref:hub/src/shared/model.ts#floorOf), in
the view every board is cut from and in the reads that name a session's floor. A config the tower can't read stays the
board's error ([[board-errors]]), not a throw from reading sessions.
The session holds no conversations, so it is neither resumable nor on duty once the host no longer runs it, and it
offers no let-go, which the host could not append anyway (`appendFact` reads the header for the event's time). It is an
ended session in its floor's archive, reading broken. While the host runs it, it is on duty and can be driven and
killed. A log whose directory is unknown or on no floor has no floor to be drawn on: `tower ls` is what says it.

Alternatives considered here: a try/catch at `track`, `tower ls` and `trackNew` would keep the tower up and leave the
session unseen; keeping the bad session out of the system would too. Folding on past a lost header (its events are
intact) would give a session built on a made-up start, against a broken session folding nothing more. A board-wide
list of floorless logs would reach the few logs with no hook, at the cost of a board field every renderer must draw.
