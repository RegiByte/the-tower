---
{
  "type": "runbook",
  "name": "Leftovers after a kill",
  "summary": "Processes a session started can outlive it (servers, nohup'd or detached jobs); they are found by the TOWER_SESSION_ID they inherited, listed by tower ps and on the card, and ended by reap.",
  "in": "tower",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/bridge/resources.ts#resources", "hub/src/bridge/resources.ts#parseProcesses", "hub/src/machine.ts#resourcesOf", "hub/src/machine.ts#reap", "hub/src/tower/server.ts#reapSession", "hub/src/tower/server.ts#reapProcess", "hub/src/bridge/verbs.ts#cardVerbs", "hub/src/cli.ts", "hub/src/bridge/prunable.ts#prunable"]
}
---
**Symptom.** A session is exited or lost, yet a port it opened still answers. Its card lists what it left running
(pid, ports, orphan, command) and offers `reap`: the tower page shows a count and ports on the card, Tower 3D
offers held Z ([`cardVerbs`](ref:hub/src/bridge/verbs.ts#cardVerbs)). Tower 3D also lists a floor's leftovers on a
Running board by its control room and in the floor panel, each ended on its own. `tower ls` sums them per session.

**Where to look first.** `tower ps`: every [[leftover]] with its session, pid, `orphan` (re-parented to
launchd) and listening ports. The list is read from `ps` and `lsof`
([`resourcesOf`](ref:hub/src/machine.ts#resourcesOf)), and the live system refreshes it every 5 s while a renderer holds the board, so a card lags
a little; a reap reads it afresh when no renderer does.

**Likely causes.**
- Killing a session hangs up its PTY. Its ordinary descendants die; whatever ignores SIGHUP or left the terminal's
  session (`nohup`, `&` from Claude's Bash, daemons, detached spawns) survives. Every one still carries
  `TOWER_SESSION_ID`, which is how [`resources`](ref:hub/src/bridge/resources.ts#resources) finds them; the
  session's own Claude, a direct child of a host, is never one.
- A Claude Code background job runs the session's Claude in its own daemon, still marked: it lists as a leftover.
- An agent's test processes (a test tower, headless Chrome) started from a tower session.
- Apple platform binaries hide their environment and are never listed
  ([`parseProcesses`](ref:hub/src/bridge/resources.ts#parseProcesses)).

**Fix.** Reap: the card's `reap` (tower page, Tower 3D), which ends that session's leftovers
([`reapSession`](ref:hub/src/tower/server.ts#reapSession); `refused` when it left nothing), one of them alone
(`reap/process`, [`reapProcess`](ref:hub/src/tower/server.ts#reapProcess); `refused` unless that pid is one of the
session's leftovers: End on a row of the tower page's leftovers popover, opened from the worker header's `N▪` chip,
or Z on a row of Tower 3D's Running board), or
`tower reap <id>`; `tower reap` with no id ends what every session no longer live left running. The floor's Tidy lists
the same, per floor, with idle workers and landed worktrees, and ends what it listed in one press ([[tidy]]). Reap sends SIGTERM
([`reap`](ref:hub/src/machine.ts#reap)): check `tower ps` afterwards. Reaping a session also ends its background
jobs. A process started from inside a session that must outlive it (a daemon) is started through the scrub
([[env-scrub]]), or it becomes that session's leftover.
