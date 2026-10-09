---
{
  "type": "decision",
  "name": "Ctrl+Z never reaches a session",
  "summary": "Keys bound for a session drop Ctrl+Z, because a session's Claude can be suspended but never continued.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-05",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/protocol.ts#sessionKeys", "hub/src/tower/server.ts#HANDLERS", "hub/src/attach.ts"]
}
---
**Context.** Ctrl+Z in a worker's terminal makes Claude leave its screen, print "Claude Code has been
suspended. Run `fg` to bring Claude Code back." and send itself SIGTSTP. The host runs `claude` as the
PTY's session leader with no shell above it, so its process group is orphaned and the kernel discards the
stop: the process sleeps (`S`, not `T`) waiting for a SIGCONT nothing sends. Typing `fg` only queues text
in its composer. `kill -CONT <pid>` brings it back with the conversation intact. Claude handles Ctrl+Z in
its input layer, not as a keybinding action, so `keybindings.json` cannot turn it off.

**Decision.** [`sessionKeys`](ref:hub/src/shared/protocol.ts#sessionKeys) drops `\x1a` from every key
write bound for a session: the tower's `keys` verb (every renderer) and `tower attach`. A write left empty is
not sent. Shells (`shell/keys`) keep Ctrl+Z, where job control is real.

**Alternatives considered.** A host `continue` verb (SIGCONT) with a button in each renderer: sound, but a
host change ends every running session, and it recovers a state the filter makes unreachable. Kept as the
answer if Claude ever suspends some other way. Marking the session `suspended` on the board from Claude's
output: it reads Claude's on-screen wording, which any release can change. Filtering in each renderer:
logic every renderer would repeat.

**Consequences.** Ctrl+Z does nothing in a worker. The press is not logged as input. The host and the
log format are unchanged.
