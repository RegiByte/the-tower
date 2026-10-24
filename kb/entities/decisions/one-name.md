---
{
  "type": "decision",
  "name": "One name: the tower",
  "summary": "The repo, the package, the kb project, the command, the mod, its skills, the env, the log's derived events and the system root all say tower; one tower command holds the user's verbs and the workers', and no other name is read.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-24",
  "refs": ["hub/src/cli.ts", "hub/src/cli-verbs.ts#CLI_VERBS", "hub/src/mod/bin/tower", "hub/src/mod/.claude-plugin/plugin.json", "hub/src/shared/paths.ts#configPath", "hub/src/host/session.ts#sessionEnv", "hub/src/shared/env.ts#withoutParentSession", "hub/src/bridge/facts.ts", "hub/package.json"]
}
---
**Problem.** The project had grown four names (the repo's, the package's, the user's CLI `mc` with its mod, env and
`mc.*` log events, and "the tower"), two commands shared one namespace by accident, and a Claude working on the code
had four names to keep straight.

**Why.** "The tower" is the least generic and the one the product already used. One name is what a public repo
needs, and what keeps the Claudes who change the code consistent.

**How.** One command, [`cli.ts`](ref:hub/src/cli.ts): the user's verbs ([[tower-cli]]) read the system root; any
other verb is a worker's, handed to the directory ([[agent-directory]]); `package.json` declares it as the package's
`bin`. The mod is the plugin `tower`, its skills `tower:`-prefixed. The env is `TOWER_*`
([[env-scrub]]). The log events the tower derives are `tower.*`, a namespace Claude's own events don't use; logs
written before were rewritten once, and no other name is read. The system root is `~/.tower` ([[system-root]]).

**Alternatives considered.**
- *Keep the old event names in the logs and read both namespaces*: a compat shim in the fold forever, and two names
  for one fact. The name a fact is filed under is the tower's own vocabulary, so a one-time rewrite that changes
  nothing else is safe ([[logs-are-facts]]).
- *Two commands, one for the user and one for workers*: the verbs overlap, and a worker holds every capability the
  user does ([[agents-have-every-capability]]).

**Impact.** One name across the repo, the command, the mod, the env, the log events and the system root; nothing
reads the old names.
