---
{
  "type": "container",
  "name": "Terms daemon",
  "summary": "The detached Node process that owns login shells started in project directories and streams their screens to viewers.",
  "in": "terms",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/terms/main.ts#spawnShell", "hub/src/terms/main.ts#attach", "hub/src/shared/terms.ts#ToTerms", "hub/src/shared/terms.ts#ShellStream", "hub/src/shared/terms.ts#SHELL_SCROLLBACK", "hub/src/shared/protocol.ts#jsonObject", "hub/src/shared/protocol.ts#checkSize"],
  "links": [
    { "to": "system-root", "verb": "reads", "carries": "config.json on every spawn: the project's dirs" }
  ]
}
---
`npm run terms` or `tower up`. A shell opens in a project dir or a [[worktree]] of one: the `cwd` is checked by
`sessionDirs`, as the host checks a session's ([[tower-cuts-worktrees]]). `terms.sock` takes newline-delimited JSON:
`spawn | write | resize | kill | list | attach`; a line that isn't a JSON object, a message it doesn't know or one whose
handling throws is answered `error` with the reason, and every shell keeps running. A `spawn` or `resize` to a size
that isn't whole cols and rows from 1 to 1000 is refused before the PTY sees it
([`checkSize`](ref:hub/src/shared/protocol.ts#checkSize)): the shell's screen would throw on it later, outside any reply. Each shell is `$SHELL -l` with the parent session and the launching terminal
scrubbed ([[env-scrub]]), mirrored into a headless xterm with `SHELL_SCROLLBACK` (2000) lines of scrollback, sent with every snapshot.

`attach` turns the connection into the shell's stream: a snapshot of the screen, then `o`, `r` and `x` as
they happen. Output that arrives while the snapshot is taken is held and sent after it, so nothing is lost
or repeated. A shell ends only when killed or when it exits.
