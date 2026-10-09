---
{
  "type": "decision",
  "name": "Letting a stranded worker go is a fact the host appends",
  "summary": "A worker stranded by the host (stopped with it, or lost) leaves duty when the user lets it go: the tower asks the host, the single writer of every log, to append a tower.letGo hook event to the session's log through a control message that takes any tower.* fact, for a running session or one an earlier host ran; the board folds it as card.letGoAt, the card goes to the archive with its conversation still resumable, and a floor's stranded workers can be resumed at once.",
  "in": "host",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-09",
  "refs": [
    "hub/src/host/main.ts#appendFact",
    "hub/src/shared/log-file.ts#endsLine",
    "hub/src/shared/protocol.ts#ToHost",
    "hub/src/shared/protocol.ts#HOST_PROTOCOL",
    "hub/src/bridge/facts.ts#LET_GO",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/bridge/board.ts#Card",
    "hub/src/bridge/verbs.ts#CardVerb",
    "hub/src/bridge/seats.ts#leftAt",
    "hub/src/system.ts#watchSystem",
    "hub/src/tower/server.ts#letGo",
    "hub/src/shared/cards.ts#strandedOf",
    "hub/src/directory.ts",
    "hub/test/board.test.ts"
  ],
  "links": [
    { "to": "system-root", "verb": "writes", "carries": "[t, 'h', {hook_event_name: 'tower.letGo'}] appended to a stranded session's log" }
  ]
}
---
**Problem.** After a host restart every interrupted worker stays on duty as "stopped, resumable" or "lost,
resumable" until it is resumed. Kill is not offered (nothing runs), so a worker the user no longer wants holds its
desk, its seat and its place in the counts for good, and N stranded workers had to be resumed one by one.

**Why.** On duty is derived from the log ([[logs-are-facts]]): a stranded card is on duty while its latest
conversation waits to be resumed. Ending that needs a new fact in the log, and only the host writes logs. The
hooks socket appends only for sessions the host runs, and a stranded session is run by nobody.

**How.**
- The fact is `[t, 'h', {hook_event_name: 'tower.letGo'}]`: an `h` event in the `tower.*` namespace, so the log
  format is unchanged. Old logs don't have it, and a bridge that predates it skips it as an unknown hook.
- The host takes a control message `fact {id, fact}`, for `tower.*` facts only
  ([`appendFact`](ref:hub/src/host/main.ts#appendFact)). For a running session it is appended like a hook. Any other
  session's plain log gets it with `appendFileSync`, at seconds since the header's `startedAt` (the first line, read
  by [`firstLine`](ref:hub/src/shared/log-file.ts#firstLine), shared with the bridge's reader and importing no
  bridge code), on a line of its own even when a host that died left the last line unfinished
  ([`endsLine`](ref:hub/src/shared/log-file.ts#endsLine)). It refuses a log that is archived, unknown, or still
  flushing its exit. A stranded id never runs again (a resume is a new session), so
  nothing else writes that file. `HOST_PROTOCOL` is 2, and `POST /let-go` refuses with `unavailable` and the
  restart to do while the running host is older.
- The bridge folds it as `letGoAt` without counting it as Claude heard from. The card carries `letGoAt`, is off duty
  and frees its seat at that moment. Its status reads "let go, resumable", and it keeps `resume` in the archive.
  The `let-go` verb is offered while the card is stranded, on duty and not yet resumed. It is a
  card verb with its call ([[board-verbs]]), the API's `let-go`, and `tower let-go <CALLSIGN>`.
- The live system stops tailing a log at its exit or its break ([[broken-logs]]), so a log that grows after it is
  folded again from its checkpoint when the sessions directory reports it. A broken session folds nothing past
  its break but this fact ([`afterBreak`](ref:hub/src/tail.ts#afterBreak)), so it can be let go too.
- "Resume all N" on a floor is composed in the renderer from the stranded cards' `calls.resume`
  ([`strandedOf`](ref:hub/src/shared/cards.ts#strandedOf)), asked first with the list.

**Alternatives considered.**
- The tower appends to the stranded log itself. It needs no host restart and has no race, but it makes a second
  writer of logs, and [[log-diet]]'s rule lives at the one writer.
- A new event code, or a second `x`. A code changes the log's type for one fact. `x` means the process exited,
  and the process is long gone.
- Accepting posts for ended sessions on the hooks socket. That socket answers only a status code, and errors
  ("archived", "still flushing") belong in the control protocol's replies.

**Impact.** Needs a host restart (the protocol moves to 2). A stranded worker can be let go from every renderer,
the CLI and the API. The `fact` message is the general way to record a fact about a session an earlier host ran.
