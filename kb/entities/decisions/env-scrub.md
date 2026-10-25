---
{
  "type": "decision",
  "name": "Scrub the parent session from every child env",
  "summary": "Every environment passed to a child PTY or a daemon drops the variables a parent Claude session sets and the parent managed session's id, so what is started from inside a session is neither a child session nor that session's leftover; a PTY the tower draws also drops the terminal its daemon was started from.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-09-29",
  "reviewed": "2026-10-25",
  "refs": ["hub/src/shared/env.ts#withoutParentSession", "hub/src/shared/env.ts#withoutTerminal", "hub/src/terms/main.ts", "hub/src/host/session.ts#sessionEnv", "hub/src/machine.ts#startDetached", "hub/src/git.ts", "hub/src/run.ts#runProcess", "hub/src/policies.ts", "hub/src/update.ts#update"]
}
---
**Problem.** The daemons are often started from a shell inside a Claude session. A Claude spawned with that parent's
markers believes it is a child session: it stops saving its transcript (so it cannot be resumed) and inherits the
parent's messaging socket and token.

**How.** [`withoutParentSession`](ref:hub/src/shared/env.ts#withoutParentSession) drops `CLAUDECODE`, `CLAUDE_PID`,
`CLAUDE_EFFORT`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SSE_PORT`, `CLAUDE_CODE_EXECPATH` and the
`CLAUDE_CODE_SESSION*`, `CLAUDE_CODE_CHILD*`, `CLAUDE_CODE_MESSAGING*` prefixes; other `CLAUDE_CODE_*` stay, as they
can be user config. It also drops a parent managed session's `TOWER_SESSION_ID` and `TOWER_HOOKS_SOCKET`: every
process carrying a session's id is that session's [[leftover]], so a terms daemon started by `tower up` from inside a
session would make its shells (and itself) that session's to reap. `TOWER_CONFIG` stays: it chooses the system.

The daemons `tower up` starts are scrubbed ([`startDetached`](ref:hub/src/machine.ts#startDetached)), so what they
run inherits a clean environment. What starts a session or runs the user's commands scrubs again, for a daemon started
by hand: the host's sessions, after the config's `env` is merged in, so a config cannot set a marker again
([`sessionEnv`](ref:hub/src/host/session.ts#sessionEnv)); the terms daemon's shells; git
([`git.ts`](ref:hub/src/git.ts)); the quota extension's Claude (through `ctx.run`); policy checks; and `tower update`'s npm. One-shot reads (`ps`, `lsof`,
`open`, the editor command, the doctor's checks) run with the caller's environment.

**The launching terminal.** A daemon started from a terminal carries that terminal's identity (`TERM_PROGRAM`,
`VSCODE_*`, `CURSOR_*`, `ITERM_*`, `TMUX`, …), and programs tune themselves to it: started from an editor, every
Claude believed it ran in an editor's xterm.js and changed how it scrolls ([[fullscreen-tui]]). A PTY the tower draws
is in the viewer's xterm, wherever `tower up` ran, so a session's and a shell's environment drop it
([`withoutTerminal`](ref:hub/src/shared/env.ts#withoutTerminal)). `GIT_ASKPASS` goes with `VSCODE_*`: VS Code and
Cursor point it at a script that reaches the running editor, and git falls back to the user's credential helper. The
config's `env` may set these again: it is merged after this scrub. Git, npm and the daemons keep the terminal:
nothing they run is drawn.

**Alternatives considered.** Starting children with an empty env loses the user's PATH and config. Telling Claude it
runs in xterm.js (it reads `TERM_PROGRAM=vscode` as one): its xterm.js mode is tuned to editors that flood the wheel,
and on the tower it overshoots and lags.

**Consequences.** A new marker in a Claude release brings the bug back; check this list when transcripts stop being
saved.
