---
{
  "type": "container",
  "name": "tower mod",
  "summary": "The Claude Code mod loaded into every session, posting Claude's mod events and a few derived ones to the host, and teaching the session the tower: the tower command on its PATH and three skills, tower:handbook, tower:review and tower:guide.",
  "in": "host",
  "reviewed": "2026-10-20",
  "refs": ["hub/src/mod/hooks/register.js#register", "hub/src/mod/hooks/register.js#forward", "hub/src/mod/hooks/hooks.json", "hub/src/mod/.claude-plugin/plugin.json", "hub/src/mod/bin/tower", "hub/src/mod/skills/handbook/SKILL.md", "hub/src/mod/skills/review/SKILL.md", "hub/src/mod/skills/guide/SKILL.md"],
  "links": [
    { "to": "host-daemon", "verb": "sends", "carries": "mod events under Claude's names (turn.step with usage and the step's visible text, tool.call, session.measure, ...) and tower.tool.result / tower.tool.abandoned / tower.claude, POST /hooks/<id> on hooks.sock; from the tower command, tower.show and tower.keep" },
    { "to": "tower-server", "verb": "reads", "carries": "from the tower command: GET /board, the first event; /conversations/<id> (agent); /archive/<project> for a callsign no worker on duty has, and for the hire depth; collection items and review threads (kept, read, hire, thread)" },
    { "to": "tower-server", "verb": "calls", "carries": "from the tower command: collection/create (keep), review/append (note), spawn (hire, review), submit (send), the card's send-home calls (home), let-go, policy/run and policy/approve (policies), probe/run (probes), reveal and edit; `tower home` with the caller's own callsign posts `tower.leave` to the hooks socket instead ([[leave]])" }
  ]
}
---
The plugin `tower`, loaded add-only with `--plugin-dir src/mod`: its skills are `tower:handbook`, `tower:review` and `tower:guide`. An event under Claude's name carries Claude's payload; what the
mod derives is posted under `tower.*`, a namespace Claude's own events never use. Payloads that would repeat the
conversation are cut: `tool.check` leaves out the tool input its `tool.call` carries, and `session.compact`
posts `trigger`, `instructions` and a `messageCount` in place of the messages it summarizes (the whole
conversation, megabytes in a long session). Each hook awaits its post, so
events reach the log in the order Claude raised them.

`agent.spawn` is posted once Claude has started the subagent, with Claude's answer under `result`: the
`agentId` every event of the subagent's loop carries, and the model it runs on. It joins a spawn to its loop
([[log-reductions]]: `subagentRuns`).

`tower.claude` carries `$.session.version()` (the release, `claude --version`'s), posted right after
`session.start`: the release a session runs is a fact in its own log ([[new-claude-release]]).

`tower.tool.abandoned` exists because a denied permission or an Esc cancels the mods API calls made inside that
event: the abandoned call is remembered and posted at the loop's `turn.complete`.

Classic hooks (curl), declared in the same `hooks/hooks.json`, still deliver the classic events
(`SessionStart`, `Stop`, `PreCompact`, ...) because the mods API's `classic.*` events never fire: two transports into one
socket. A classic hook also reaches the log when Claude's built-in `sec-default` mod keeps a mod event from user
mods, as it keeps `session.compact` inside an organization ([[claude-code]]). Each Claude reads that list from the plugin as it starts, so changing it needs no host restart
([[host-owns-ptys]]).

The plugin's `bin/tower` is on the Bash tool's PATH in every session. The brief in the system prompt gives the
everyday recipes, and the `tower:handbook` skill is the handbook beside it ([[brief-first]]): it tells Claude what the tower is, how to find itself and other workers, and how to reach one with `SendMessage` ([[agent-directory]]); how
to show the user a page ([[agent-show]]) or open a file on their desktop ([[open-files]]), keep an item ([[workers-edit-kept-items]]), answer review notes and report to its hirer after ([[review-threads]]), hire
a reviewer ([[reviewer]]) or a worker, within the floor's limits ([[hiring-limits]]), and send a crew home ([[crews]]); and, in a worktree the tower cut,
how to keep to it ([[tower-cuts-worktrees]]). Its `review` skill is what a reviewer starts on
(`/tower:review <CALLSIGN> [tell]`). Its `guide` skill is for the user, not for work: when they ask how to use the
tower or for a tour, the session reads [[docs-usage]] from the checkout and the live system (`whoami`, `agents
--all`, `kept`), tours their own floors, and offers one live demo.
