---
{
  "type": "decision",
  "name": "Names the tower answers to live in the config",
  "summary": "The tower answers 127.0.0.1 and localhost at its port, and each name of the config's top-level hosts, at its port or bare behind a proxy; a POST under a name must carry that name's Origin, over http or https. Read on every request.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-29",
  "reviewed": "2026-10-30",
  "refs": ["hub/src/shared/model.ts#towerHosts", "hub/src/tower/http.ts#namedHostOrigins", "hub/src/tower/http.ts#isFromTower", "hub/src/config-check.ts#configProblems", "hub/docs/config.md"]
}
---
**Problem.** Two towers open in one browser, one on the machine and one reached through a tunnel, are both
`localhost` and told apart only by their port. The tower refused every Host but `127.0.0.1:<port>` and
`localhost:<port>`, so no other name could reach it, not even one only the user's machine resolves.

**Why.** The Host and Origin checks guard against browser pages ([[agents-have-every-capability]]): DNS rebinding
arrives under the attacker's name, and a cross-site POST under the attacker's Origin. A name the user chose is
neither, so allowing it keeps the guard as strict. The name belongs to the system's intent, beside its port
([[port-in-config]]).

**How.**

- [`towerHosts`](ref:hub/src/shared/model.ts#towerHosts) reads `hosts` from the config, none when unset; an entry
  that isn't a lower case host name (no port, no scheme) is a config error, which `tower config check` reports.
- [`isFromTower`](ref:hub/src/tower/http.ts#isFromTower) lets the loopback pair through as before, `http` only.
  Any other Host goes to [`namedHostOrigins`](ref:hub/src/tower/http.ts#namedHostOrigins): a configured name at the
  tower's port, or bare (a proxy on port 80 or 443), with `http://<host>` or `https://<host>` the Origins its POSTs
  may carry.
- The config is read on each request whose Host isn't the loopback pair, so an edit to `hosts` holds at once and
  requests under `127.0.0.1` and `localhost` never read it.
- Browsers resolve every `*.localhost` name to the machine itself, so `mini.localhost` needs nothing but the key.
  Any other name needs its own DNS record or `/etc/hosts` line, and a proxy when it drops the port.

**Alternatives considered.**

- *A proxy that rewrites Host and Origin to the loopback pair.* No core change, but it passes every page's POST
  through as the tower's own: the guard is gone.
- *Full origins (`https://name`) in the key.* The scheme depends on the proxy in front, not on the name, and a name
  alone is what the Host header carries.
- *Read the names once at start, as the port is.* The port binds a socket; a name is only compared, so it reads
  live like the rest of the config.

**Impact.** A config key, no API change. Each tower checks its own config, so a tower reached through a tunnel
names itself in the config of the machine it runs on.
