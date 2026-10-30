---
{
  "type": "decision",
  "name": "Letting a stranded worker go is a fact the host appends",
  "summary": "A stranded worker (stopped with the host, lost, or killed from outside the tower: carry-on) leaves duty when the user lets it go: the tower asks the host, the single writer of every log, to append a tower.letGo hook event to the session's log through a control message that takes any tower.* fact, for a running session or one an earlier host ran; the board folds it as card.letGoAt, the card goes to the archive with its conversation still resumable, and a floor's stranded workers can be resumed at once.",
  "in": "host",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-30",
  "refs": [
    "hub/src/host/main.ts#appendFact",
    "hub/src/shared/log-file.ts#wholeLinesLength",
    "hub/src/shared/protocol.ts#ToHost",
    "hub/src/shared/protocol.ts#HOST_PROTOCOL",
    "hub/src/bridge/facts.ts#LET_GO",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/bridge/board.ts#Card",
    "hub/src/bridge/verbs.ts#CardVerb",
    "hub/src/bridge/seats.ts#leftAt",
    "hub/src/system.ts#watchSystem",
    "hub/src/tower/dispatch.ts#letGo",
    "hub/src/shared/duty.ts#strandedOf",
    "hub/src/shared/duty.ts#resumeStranded",
    "hub/renderers/tower3d/src/main.ts#letWorkerGo",
    "hub/renderers/tower3d/src/acts.ts#HELD",
    "hub/src/cli-verbs.ts#CLI_VERBS",
    "hub/test/board.test.ts"
  ],
  "links": [
    { "to": "system-root", "verb": "writes", "carries": "[t, 'h', {hook_event_name: 'tower.letGo'}] appended to a stranded session's log" }
  ]
}
---
**Problem.** After a host restart every interrupted worker stays on duty as "stopped" or "lost, resumable" until
it is resumed. Kill is not offered (nothing runs), so a worker the user no longer wants holds its desk, its seat and
its place in the counts for good, and a floor's stranded workers had to be resumed one by one.

**Why.** On duty is derived from the log ([[logs-are-facts]]): a stranded card is on duty while its latest
conversation waits to be resumed. Ending that needs a new fact in the log, and only the host writes logs. The hooks
socket appends only for sessions the host runs, and a stranded session is run by nobody.

**How.**
- The fact is `[t, 'h', {hook_event_name: 'tower.letGo'}]`: an `h` event in the `tower.*` namespace, so the log
  format is unchanged.
- The host takes a control message `fact {id, fact}`, for `tower.*` facts only
  ([`appendFact`](ref:hub/src/host/main.ts#appendFact)). A running session gets it like a hook. Any other session's
  plain log gets it appended at seconds since its header's `startedAt`, after cutting back a last line a dead host
  left unfinished ([`wholeLinesLength`](ref:hub/src/shared/log-file.ts#wholeLinesLength), [[broken-logs]]). It
  refuses a session with no plain log (unknown or archived) and one still writing its exit. A stranded id never runs
  again (a resume is a new session), so nothing else writes that file. `POST /let-go` refuses with `unavailable`
  while the running host is too old to take `fact` ([`factRefused`](ref:hub/src/tower/dispatch.ts#factRefused)).
- The bridge folds it as `letGoAt` without counting it as Claude heard from. The card is off duty and frees its seat
  at that moment, reads "let go, resumable", and keeps `resume` in the archive. The `let-go` card verb
  ([[board-verbs]]) is offered while the card is stranded, on duty and not yet resumed; the CLI's
  `tower let-go <CALLSIGN>` runs it.
- The live system stops tailing a log at its exit, its break or this fact. A broken session folds nothing past its
  break but this fact ([`afterBreak`](ref:hub/src/tail.ts#afterBreak)), so it can be let go too.
- "Resume all" on a floor is composed in the renderer from the stranded cards' calls
  ([`strandedOf`](ref:hub/src/shared/duty.ts#strandedOf), [`resumeStranded`](ref:hub/src/shared/duty.ts#resumeStranded),
  a worker cut off mid-turn carried on: [[carry-on]]), asked first with the list. Every renderer asks in the same
  words (`letGoAsk`, `resumeAllAsk`).

**Alternatives considered.**
- The tower appends to the stranded log itself. It needs no host restart and has no race, but it makes a second
  writer of logs, and [[logs-are-facts]]' trim of tool output lives at the one writer.
- A new event code, or a second `x`. A code changes the log's type for one fact. `x` means the process exited,
  and the process is long gone.
- Accepting posts for ended sessions on the hooks socket. That socket answers only a status code, and errors
  ("archived", "still writing its exit") belong in the control protocol's replies.

**Impact.** A stranded worker can be let go from every renderer, the CLI and the API. The `fact` message is the
general way to record a `tower.*` fact about a session, one an earlier host ran included.
