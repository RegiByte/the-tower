---
{
  "type": "runbook",
  "name": "No host answering",
  "summary": "Nothing answers on control.sock: the board shows the host down, running sessions turn lost, and every session verb fails as unavailable until a host is started.",
  "in": "host",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/shared/paths.ts#systemPaths", "hub/src/shared/client.ts#connectHost", "hub/src/machine.ts#hostLive", "hub/src/machine.ts#bringUp", "hub/src/machine.ts#bringDown", "hub/src/shared/socket.ts#claimSocket", "hub/src/bridge/status.ts#withLiveness", "hub/src/tower/server.ts#daemon"]
}
---
**Symptom.**
- The tower page and Tower 3D show `host down` on a broken lamp (`board.hostUp` false); floors stop offering
  `spawn` ([[board-verbs]]).
- Sessions that never logged an exit read `lost` ([`withLiveness`](ref:hub/src/bridge/status.ts#withLiveness)):
  their PTYs died with the host. Each stays resumable.
- Keys, resize, kill and spawn fail with `unavailable` (502) from the tower
  ([`daemon`](ref:hub/src/tower/server.ts#daemon)); `tower` commands fail with "No host on …/control.sock (…).
  Start it with: npm run host" ([`connectHost`](ref:hub/src/shared/client.ts#connectHost)). A request the daemon leaves
  unanswered for 30 s fails naming it ("may be wedged") and closes the connection, so a hung host reads as an error, not a wait.

**Host outdated.** A host that answers with another protocol than its clients (`board.hostOutdated`) is up and
works; it runs code older than the tower's, so the renderers say `host outdated`. It updates when restarted
(`tower down`, then `tower up`), which ends every session: they stay resumable.

**Where to look first.** The system root, the directory holding `config.json` (`TOWER_CONFIG` overrides
`~/.tower/config.json`), holds every path ([`systemPaths`](ref:hub/src/shared/paths.ts#systemPaths)):
`control.sock` and `hooks.sock` (the host), `terms.sock`, and, when `tower up` started the daemons, `host.log`,
`host.pid`, `terms.log`, `terms.pid`. Read the end of `host.log` first. Check which system the renderer reads:
a tower started with another `TOWER_CONFIG` looks at another root.

**Likely causes.**
- The host was stopped (`tower down`, a signal) or crashed. Its own stop logs `x` with `hostStopped` on every
  session; a crash leaves no `x`, hence `lost`.
- The host failed to start. On start it claims both sockets
  ([`claimSocket`](ref:hub/src/shared/socket.ts#claimSocket)) and refuses a path over 103 bytes ("Move the
  config to a shorter directory") or one something still answers on. `tower up` waits 15 s for the socket, then
  fails pointing at `host.log` ([`bringUp`](ref:hub/src/machine.ts#bringUp)).
- A socket file left by a dead host does not count: liveness is a connect, not the file
  ([`hostLive`](ref:hub/src/machine.ts#hostLive)), and the next host removes it.

**Fix.** `tower up` (or `npm run up`) starts whatever does not answer, detached; `npm run host` runs one in
the foreground. Then resume the sessions that were running ([[resume]]). `tower down` stops only daemons `tower up`
started: it trusts `host.pid` only while that pid still runs the host's script, and refuses a host started by
hand, which is stopped where it runs ([`bringDown`](ref:hub/src/machine.ts#bringDown)). Never stop or restart
the real host from a session inside it: every session ends, that one included.
