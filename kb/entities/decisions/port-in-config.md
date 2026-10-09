---
{
  "type": "decision",
  "name": "The port lives in the config",
  "summary": "The tower's loopback port is the config's top-level port (4317 unless set), the one source every reader takes it from: the server, tower up, down, doctor and update, the workers' directory, setup and the sandbox tools. The TOWER_PORT variable is gone.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/model.ts#towerPort", "hub/src/shared/model.ts#towerUrl", "hub/src/machine.ts#daemons", "hub/src/machine.ts#startedPid", "hub/src/tower/server.ts", "hub/src/directory.ts", "hub/src/doctor.ts#running", "hub/src/init.ts#initialConfig", "hub/scripts/sandbox.ts", "hub/scripts/sandbox-root.ts"]
}
---
**Problem.** The port came from the environment (`TOWER_PORT`, 4317 unless set) while everything else about a system
came from its config. A system served on another port worked only while every process that touched it had the
variable: a second system on 4400, brought up later without it, reached the first system's tower ("already up").
What a worker was told named 4317 as the API's address whatever the port was.

**Why.** The config is the system's intent ([[system-root]]); the port is part of it. A fact two processes must agree
on, kept in each one's environment, is two copies that drift.

**How.**

- [`towerPort`](ref:hub/src/shared/model.ts#towerPort) reads `port` from the config, 4317 when it names none, and a
  value that isn't a whole number from 1 to 65535 is a config error. [`towerUrl`](ref:hub/src/shared/model.ts#towerUrl)
  is `http://127.0.0.1:<port>`.
- The server reads it once, when it starts: changing the port takes `tower down` and `tower up`. `down` finds the
  running tower by its pid file, so it stops it after the port changed too ([[bring-up]]). `tower up` with the
  tower still running on the old port refuses, naming that; `tower update` restarts it; `tower doctor` fails on it
  ([`startedPid`](ref:hub/src/machine.ts#startedPid)).
- [`daemons`](ref:hub/src/machine.ts#daemons) takes the port; `tower up`, `down`, `update`, `doctor` and setup read it
  from the config they run against. `doctor` checks it with the rest of the config, and says the daemons are
  unchecked while it can't read one. A port held by something else is refused naming the config file to set another
  port in.
- The workers' directory reads the config at `TOWER_CONFIG` (the default system root when unset) for the board's
  address, and `tower whoami` prints it, the page's and the API's address alike. The handbook points there.
- `tower init` writes `port: 4317` into a first config, so the key is found where it is changed.
- The sandbox keeps its port in its own config: `npm run sandbox -- up --port <n>` writes it (4399 for a new
  sandbox, the one already there otherwise), and `down`, `tool:frames` and `tool:tour` read it from the config under
  `TOWER_SANDBOX` ([`sandbox-root.ts`](ref:hub/scripts/sandbox-root.ts)).

**Alternatives considered.**

- *Keep `TOWER_PORT` as an override of the config's port.* Two sources again, and the failure above stays possible.
- *A `--port` flag on `tower up`.* Every other reader still needs to learn the port, from the running tower or a
  file: the config already is that file.
- *Derive the URL into the worker's system prompt.* The prompt is fixed at spawn and outlives a port change;
  `tower whoami` reads it when asked.

**Impact.** A config key (**config** in the changelog's v1.0.0). Two systems on one machine run side by side with
nothing in the environment but which config each is (`TOWER_CONFIG`, or `TOWER_SANDBOX` for a sandbox).
