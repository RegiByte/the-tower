---
{
  "type": "container",
  "name": "Terms daemon",
  "summary": "The detached Node process that owns login shells started in project directories and streams their screens to viewers.",
  "in": "terms",
  "reviewed": "2026-10-21",
  "refs": ["hub/src/terms/main.ts#spawnShell", "hub/src/terms/main.ts#attach", "hub/src/shared/terms.ts#ToTerms", "hub/src/shared/terms.ts#ShellStream", "hub/src/shared/terms.ts#SHELL_SCROLLBACK", "hub/src/shared/protocol.ts#jsonObject", "hub/src/shared/protocol.ts#checkSize"],
  "links": [
    { "to": "system-root", "verb": "reads", "carries": "config.json on every spawn: the project's dirs" }
  ]
}
---
Started by `tower up` or `npm run terms`. A shell is `$SHELL -l` in a project dir or a [[worktree]] of one, its
`cwd` checked by `sessionDirs` as the host checks a session's ([[tower-cuts-worktrees]]), its environment scrubbed of
the parent session and the launching terminal ([[env-scrub]]). Its output is mirrored into a headless xterm with
`SHELL_SCROLLBACK` lines of scrollback, the snapshot a viewer gets.

`terms.sock` takes newline-delimited JSON: `spawn | write | resize | kill | list | attach`. A line that isn't a JSON
object, an unknown message, or one whose handling throws is answered `error` with the reason (`code: 'not_found'` for
a shell the daemon doesn't hold), and every shell keeps running. A size that isn't whole cols and rows within
`MAX_TERMINAL_SIDE` is refused before the PTY sees it ([`checkSize`](ref:hub/src/shared/protocol.ts#checkSize)), since
the headless screen would throw on it later, outside any reply. A read error on a shell's PTY ends that shell as an
exit, never the daemon ([`endOnReadError`](ref:hub/src/shared/pty.ts#endOnReadError)).

`attach` turns the connection into the shell's stream: a snapshot, then `o`, `r` and `x` as they happen. Output that
arrives while the snapshot is taken is held and sent after it, so nothing is lost or repeated
([`attach`](ref:hub/src/terms/main.ts#attach)). A shell ends only when killed or when it exits.
