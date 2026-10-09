---
{
  "type": "decision",
  "name": "One name: the tower",
  "summary": "The repo, the package, the kb project, the command, the mod, its skills, the env, the log's derived events and the system root all say tower; mc is merged into the tower command, and the logs written before were rewritten once by a migration script.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/cli.ts", "hub/src/directory.ts", "hub/src/mod/bin/tower", "hub/src/mod/.claude-plugin/plugin.json", "hub/src/shared/paths.ts#configPath", "hub/src/host/session.ts#sessionEnv", "hub/src/shared/env.ts#withoutParentSession", "hub/src/bridge/facts.ts", "hub/scripts/migrate-tower.ts", "hub/package.json"]
}
---
**Problem.** The project had four names: `agent-hub` (the GitHub repo and the kb project), `managing-claudes` (the
package and the system root `~/.managing-claudes`), `mc` (the user's CLI, the `mc-sensor` mod, the `MC_*` env and the
`mc.*` events the tower derives into the logs) and "the tower" (the product, and the workers' `tower` command). Two
commands shared one namespace by accident, and a Claude working on the code had four names to keep straight.

**Why.** "The tower" is the least generic of them and the one the product already used. One name is what a public
repo needs, and what keeps the Claudes who change the code consistent.

**How.**

- **One command.** [`cli.ts`](ref:hub/src/cli.ts) is `tower`: the user's verbs (`up`, `down`, `spawn`, `resume`,
  `submit`, `kill`, `live`, `ls`, `ps`, `reap`, `screen`, `attach`) read the system root; any other verb is a worker's,
  handed to the directory ([[agent-directory]]). `mc send <id> <text>` became `tower submit`, the API's verb, because
  `tower send <CALLSIGN>` already delivers review notes. The mod's `bin/tower` runs it and `package.json` declares it
  as the package's `bin`, so `npm link` puts it on the user's PATH. `npm run tower` still starts the server.
- **The mod** is the plugin `tower`; its skills are `tower:handbook` (the old `tower` skill) and `tower:review`.
- **Env:** `TOWER_SESSION_ID`, `TOWER_HOOKS_SOCKET` (set by the host, scrubbed from children, [[env-scrub]]),
  `TOWER_CONFIG`, `TOWER_PORT`, `TOWER_SANDBOX`, `TOWER_FRAMES`, `TOWER_TOUR`.
- **Log events** the tower derives are `tower.show`, `tower.keep`, `tower.hire`, `tower.tool.result` and
  `tower.tool.abandoned`. The fold reads only these. [`migrate-tower.ts`](ref:hub/scripts/migrate-tower.ts) rewrote the
  logs written before, once (and the recorded fixtures), and deleted `cache/facts`, whose byte offsets it invalidated.
  It also renamed a reviewer's launch prompt, `/mc-sensor:review` → `/tower:review`, in the header's argv and in the
  prompt events that carry it: the board finds a reviewer from its launch (`reviewedIn`) and the hirer of a prompt by
  comparing it with the launch (`promptBy`).
- **System root** `~/.tower` ([[system-root]]), moved by the user with the host stopped.

**Alternatives considered.**

- *Keep `mc.*` in the logs and read both namespaces.* Rejected: a compat shim in the fold forever, and two names for one
  fact. Logs are facts ([[logs-are-facts]]), but the name a fact is filed under is the tower's own vocabulary, so a
  one-time rewrite that changes nothing else is safe; it was checked on a copy of the real root: every log's facts,
  reviewer and conversations, derived by the old code before and the new code after, identical.
- *Two commands, `mc` for the user and `tower` for workers.* Rejected: the verbs overlap (`send`), and a worker holds
  every capability the user does ([[agents-have-every-capability]]).
- *`npm run tower` as the CLI and `tower serve` for the server.* Settled by the setup work: `tower up` starts the
  server with the daemons, and `npm run tower` runs it in the foreground ([[setup]]).

**Impact.** Sessions started before the change carry `MC_*` and the old mod until resumed under a host started after
it. Processes they left running are marked with `MC_SESSION_ID`, which the leftover scan no longer reads: reap them
before the cutover. Moving the system root and rewriting the logs is one step for the user, with every daemon stopped.
