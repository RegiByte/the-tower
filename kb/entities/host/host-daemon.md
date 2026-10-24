---
{
  "type": "container",
  "name": "Host daemon",
  "summary": "The detached Node process that spawns Claude sessions in PTYs, relays control requests, and appends output, input, hooks and exits to each session's log.",
  "in": "host",
  "reviewed": "2026-10-24",
  "refs": ["hub/src/host/main.ts#spawnSession", "hub/src/host/main.ts#handle", "hub/src/host/main.ts#appendFact", "hub/src/host/main.ts#checkFact", "hub/src/host/session.ts#sessionArgv", "hub/src/shared/protocol.ts#ToHost", "hub/src/shared/protocol.ts#jsonObject", "hub/src/shared/protocol.ts#checkSize", "hub/src/host/main.ts#LOG_BUFFER_BYTES", "hub/src/host/session.ts#hookFact"],
  "links": [
    { "to": "claude-code", "verb": "triggers", "carries": "a PTY running config argv + --plugin-dir (the tower mod, which declares the hooks) + client args (its --settings among them), with the cwd checked by sessionDirs, with TOWER_SESSION_ID and TOWER_HOOKS_SOCKET in a scrubbed env" },
    { "to": "system-root", "verb": "writes", "carries": "sessions/<id>.jsonl: header (runtime claude), the spawn's tower.* facts, then o/i/r/h/x events" },
    { "to": "system-root", "verb": "reads", "carries": "config.json on every spawn: argv, env, the project's dirs" }
  ]
}
---
`npm run host` (foreground) or `tower up` (detached, [[bring-up]]). Two sockets in [[system-root]]:

- `control.sock`: newline-delimited JSON, one reply per request in order ([`ToHost`](ref:hub/src/shared/protocol.ts#ToHost)):
  `spawn | write | resize | kill | fact | live`. A spawn names its session (the client mints the id,
  [`sessionId`](ref:hub/src/shared/launch.ts#sessionId), sortable by start time); the host refuses an id it runs or
  holds a plain log for, and a `cwd` that `sessionDirs` rejects: one of the project's dirs or a worktree of one
  ([[tower-cuts-worktrees]]). The header names the session's `runtime`, `claude`: the host starts the config's `argv`
  with the Claude mod, and a log without it, from an older host, is Claude's. A spawn's `facts`, `tower.*` events only
  ([`checkFact`](ref:hub/src/host/main.ts#checkFact)), are logged as `h` events right after the header, in the same
  tick, so they come before the session's first output or hook whoever asked for the spawn, and whatever happens to
  it afterwards. `fact` appends a `tower.*` event as an `h` event at the host's time: a running
  session's like a hook, any other's to its plain log once closed, which is how a fact reaches a session an earlier
  host ran ([[let-go]]); an archived or unknown log is refused. The `live` reply carries the running ids and
  [`HOST_PROTOCOL`](ref:hub/src/shared/protocol.ts#HOST_PROTOCOL), bumped by any change to a host message: the board
  says `hostOutdated` while the running host speaks another or none. A host reads past a field it doesn't know, so a
  client checks the protocol before asking for what an older host would drop: the tower refuses a `spawn` with
  `facts` while the host speaks below 3, and a `fact` below 2.
- `hooks.sock`: HTTP. `POST /hooks/<session id>` appends the body as an `h` event, a `PostToolUse` without its
  `tool_response` ([`hookFact`](ref:hub/src/host/session.ts#hookFact), [[logs-are-facts]]); an unknown or exited
  session gets 404, a body that isn't a JSON object 400 with the reason.

**Bad input costs a request, never the host.** A control line that isn't a JSON object
([`jsonObject`](ref:hub/src/shared/protocol.ts#jsonObject)), an unknown `t`, or a message whose handling throws is
answered `error`. A read error on a PTY master, which node-pty would rethrow and end the host with, ends that session
alone ([`endOnReadError`](ref:hub/src/shared/pty.ts#endOnReadError)). A log that fails to write ends its session,
reported in `host.log`.

**The log replays what the session saw.** A `write` or `resize` is logged once the PTY took it, in the same tick,
before any output it causes. One a log or a screen couldn't take is answered `error` and never logged: data that
isn't a string, or a size [`checkSize`](ref:hub/src/shared/protocol.ts#checkSize) refuses (checked on `spawn` too,
since node-pty takes sizes xterm throws on later).

**Memory stays bounded.** A log behind its disk past
[`LOG_BUFFER_BYTES`](ref:hub/src/host/main.ts#LOG_BUFFER_BYTES) pauses its session's PTY until it drains, so output
waits in the PTY (and Claude slows down); input, resizes and hooks are always appended.

**Sessions live as long as this process.** SIGINT, SIGTERM or SIGHUP kills each PTY and logs its exit with
`hostStopped`, and the host exits only once every log has flushed its last line. Every `x` holds the exit code and,
when the process died of a signal it didn't catch, that `signal` (node-pty reports it with code 0): a `kill -9` reads
as such ([[carry-on]]).
