---
{
  "type": "container",
  "name": "Host daemon",
  "summary": "The detached Node process that spawns Claude sessions in PTYs, relays control requests, and appends output, input, hooks and exits to each session's log.",
  "in": "host",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/host/main.ts#spawnSession", "hub/src/host/main.ts#handle", "hub/src/host/main.ts#appendFact", "hub/src/host/session.ts#sessionArgv", "hub/src/shared/protocol.ts#ToHost", "hub/src/shared/protocol.ts#jsonObject"],
  "links": [
    { "to": "claude-code", "verb": "triggers", "carries": "a PTY running config argv + --plugin-dir (the tower mod, which declares the hooks) + client args (its --settings among them), with the cwd checked by sessionDirs, with TOWER_SESSION_ID and TOWER_HOOKS_SOCKET in a scrubbed env" },
    { "to": "system-root", "verb": "writes", "carries": "sessions/<id>.jsonl: header, then o/i/r/h/x events" },
    { "to": "system-root", "verb": "reads", "carries": "config.json on every spawn: argv, env, the project's dirs" }
  ]
}
---
`npm run host` (foreground) or `tower up` (detached). Two sockets in [[system-root]]:

- `control.sock`: newline-delimited JSON, one reply per request in order:
  `spawn {id, project, cwd, args, cols, rows} | write | resize | kill | fact | live`. A spawn names its session: the host
  refuses an id it runs or holds a log for. `fact {id, fact}` appends a `tower.*` event as an `h` event at the
  host's time: a running session's like a hook, any other's to its plain log once closed, which is how a fact
  reaches a session an earlier host ran ([[let-go]]); an archived or unknown log is refused.
  A `spawn` is refused unless `cwd` is one of the project's dirs. The `live` reply carries the ids of the running
  sessions and [`HOST_PROTOCOL`](ref:hub/src/shared/protocol.ts#HOST_PROTOCOL), the protocol's version, bumped
  by any change to a host message: the board says `hostOutdated` while the running host speaks another (one
  started before 2026-10-06 sends none), so a renderer can say the host predates its clients.
- `hooks.sock`: HTTP. `POST /hooks/<session id>` appends the body as an `h` event, a `PostToolUse` without its
  `tool_response` ([[log-diet]]); unknown or exited
  sessions get 404, and a body that isn't a JSON object gets 400 with the reason.

Bad input costs a request, never the host: a control line that isn't a JSON object
([`jsonObject`](ref:hub/src/shared/protocol.ts#jsonObject)), a message of a `t` it doesn't know, or one whose
handling throws is answered `error` with the reason, and the host keeps serving every session.

Every `write` and `resize` is logged before it reaches the PTY, so the log replays exactly what the session
saw. Sessions live as long as this process: SIGINT, SIGTERM or SIGHUP kills each PTY and logs its exit with
`hostStopped`, and the host exits only once every log has flushed its last line. A log behind its disk by more than 1 MB pauses its session's PTY until it drains, so
output waits in the PTY (and Claude slows down) instead of growing the host's memory; input, resizes and hooks
are always appended. A log that fails to write
ends its session (logged to `host.log`); the other sessions keep running. A session id is sortable by start time: `20260930-141203-a1b2`
([`sessionId`](ref:hub/src/shared/launch.ts#sessionId)), minted by the client that asks for the spawn.
