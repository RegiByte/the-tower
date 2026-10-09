---
{
  "type": "decision",
  "name": "Scrub the parent session from every child env",
  "summary": "Every environment passed to a child PTY or a daemon drops the variables a parent Claude session sets and the parent managed session's id, so what is started from inside a session is neither a child session nor that session's leftover; a PTY the tower draws also drops the terminal its daemon was started from.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-09-29",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/env.ts#withoutParentSession", "hub/src/shared/env.ts#withoutTerminal", "hub/src/terms/main.ts", "hub/src/host/session.ts#sessionEnv", "hub/src/machine.ts#startDetached"]
}
---
**Context.** The daemons are often started from a shell inside a Claude session. A Claude spawned with that
parent's markers believes it is a child session: it stops saving its transcript (so it cannot be resumed)
and inherits the parent's messaging socket and token.

**Decision.** [`withoutParentSession`](ref:hub/src/shared/env.ts#withoutParentSession) drops `CLAUDECODE`,
`CLAUDE_PID`, `CLAUDE_EFFORT`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SSE_PORT`, `CLAUDE_CODE_EXECPATH` and the
`CLAUDE_CODE_SESSION*`, `CLAUDE_CODE_CHILD*`, `CLAUDE_CODE_MESSAGING*` prefixes. Other `CLAUDE_CODE_*` stay:
they can be user config. It also drops a parent managed session's `TOWER_SESSION_ID` and `TOWER_HOOKS_SOCKET`: every
process carrying a session's id is that session's [[leftover]], so a terms daemon started by `tower up` from inside a
session would make its shells (and itself) that session's to reap. `TOWER_CONFIG` stays: it chooses the system.
The host scrubs a session's env after the config's `env` is merged in
([`sessionEnv`](ref:hub/src/host/session.ts#sessionEnv)), so a config cannot set a marker again; until 2026-10-06
the config's `env` was applied after the scrub. The host and the terms daemon apply it to their children, and `tower up` to the daemons it starts
([`startDetached`](ref:hub/src/machine.ts#startDetached)).

**The launching terminal (2026-10-09).** A daemon started from a terminal carries that terminal's identity
(`TERM_PROGRAM`, `VSCODE_*`, `CURSOR_*`, `ITERM_*`, `TMUX`, …), and programs tune themselves to it. Started from
Cursor, every Claude believed it ran in an editor's xterm.js and changed how it scrolls ([[fullscreen-tui]]): each wheel
report moved a scroll speed's rows (about 15 a row of travel, measured) and the last 30 rows eased in after the wheel
stopped. A PTY the tower draws is in the viewer's xterm, wherever `tower up` ran, so a session's and a shell's
environment drop it ([`withoutTerminal`](ref:hub/src/shared/env.ts#withoutTerminal), in
[`sessionEnv`](ref:hub/src/host/session.ts#sessionEnv) and the terms daemon's shells). `GIT_ASKPASS` goes with
`VSCODE_*`: VS Code and Cursor point it at a script that reaches the running editor through them, and git falls back to
the user's credential helper. Unlike a parent session's markers, the config's `env` may set them again: it is merged
after this scrub. Git, npm and the daemons keep the terminal: nothing they run is drawn.

**Alternatives considered.** Starting children with an empty env: rejected, it loses the user's PATH and
config. Telling Claude it runs in xterm.js (it reads `TERM_PROGRAM=vscode` as one): its xterm.js mode is tuned to
editors that flood the wheel, and measured on the tower it overshoots and lags; with no terminal named, Claude scrolls a
row per report and stops with the wheel.

**Consequences.** A new marker in a Claude release brings the bug back; check this list when transcripts
stop being saved.
