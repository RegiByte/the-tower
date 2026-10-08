---
{
  "type": "flow",
  "name": "Bring-up",
  "summary": "tower up starts the host, the terms daemon and the tower detached, each only if this system's own does not already answer where it serves, and records their pids; tower down stops what it started. Either takes daemons by name.",
  "in": "tower",
  "reviewed": "2026-10-08",
  "involves": ["operator", "tower-cli", "host-daemon", "terms-daemon", "tower-server"],
  "refs": ["hub/src/machine.ts#bringUp", "hub/src/machine.ts#bringAllUp", "hub/src/machine.ts#bringDown", "hub/src/machine.ts#bringAllDown", "hub/src/machine.ts#daemons", "hub/src/machine.ts#daemonsNamed", "hub/src/machine.ts#startedPid", "hub/src/shared/socket.ts#claimSocket", "hub/src/shared/model.ts#towerPort"]
}
---
```mermaid
sequenceDiagram
  participant O as [[operator]]
  participant M as [[tower-cli]]
  participant H as [[host-daemon]]
  participant S as [[terms-daemon]]
  participant T as [[tower-server]]
  O->>M: tower up [host|terms|tower...]
  M->>M: who holds each place? control.sock, terms.sock, the tower's port
  alt something else holds one
    M-->>O: refuse, naming it: nothing starts
  end
  M->>H: control.sock answers?
  alt no
    M->>H: node --import tsx src/host/main.ts (detached, parent session scrubbed, logs to host.log, pid to host.pid)
    M->>H: poll until it answers (15 s)
  end
  M->>S: the same with terms.sock, terms.log, terms.pid
  M->>T: the same with the tower's port, tower.log, tower.pid
  O->>M: tower down [host|terms|tower...]
  M->>T: SIGTERM the pid in tower.pid, if it still runs src/tower/server.ts; wait for it to exit
  M->>S: the same with terms.pid
  M->>H: the same with host.pid
```

- Each daemon names the place it serves at and who holds it
  ([`daemons`](ref:hub/src/machine.ts#daemons)): a socket is held by this system's daemon when it answers, since the
  socket lives in the system root; the tower's port (the config's `port`, 4317 unless set,
  [`towerPort`](ref:hub/src/shared/model.ts#towerPort), [[port-in-config]]) is held by this system's tower when the process listening on it
  runs the tower's server with this system's config, read from its environment (`ps -E`). Anything else on the port is
  something else, and [`bringAllUp`](ref:hub/src/machine.ts#bringAllUp) refuses before starting anything. It also
  refuses a daemon whose place is free while its pid file names this system's daemon still running
  ([`startedPid`](ref:hub/src/machine.ts#startedPid)): a tower started before the config's port changed, which
  `tower down` stops and `tower doctor` fails on.
- A daemon claims its socket path on start: it removes a path left by a dead process and refuses one
  that still answers ([`claimSocket`](ref:hub/src/shared/socket.ts#claimSocket)).
- Names pick daemons ([`daemonsNamed`](ref:hub/src/machine.ts#daemonsNamed)); with none, all three. `tower down tower
  && tower up tower` restarts the tower alone: a new server, the host and every session untouched.
- `tower down` signals only the pid in this system's pid file, and only while that process still runs the daemon's
  script with this system's config in its environment, since pids are reused and every system runs the same scripts
  ([`bringDown`](ref:hub/src/machine.ts#bringDown)): it never reaches another system root's daemons. It goes on past
  a daemon it refuses ([`bringAllDown`](ref:hub/src/machine.ts#bringAllDown)). A daemon answering without a pid file was started by
  hand (`npm run host`, `npm run tower`): `tower down` refuses it, says to stop it where it runs, stops the others and
  exits 1. Stopping the
  host ends every session (`hostStopped`, resumable); stopping terms ends every shell.
- `npm run setup` ends with the same bring-up ([[setup]]); the sandbox brings its own system up and down through it.
