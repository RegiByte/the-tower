---
{
  "type": "container",
  "name": "tower mod",
  "summary": "The Claude Code mod loaded into every session, posting Claude's mod events and a few derived ones to the host, and teaching the session the tower: the tower command on its PATH and two skills, tower:handbook and tower:review.",
  "in": "host",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/mod/hooks/register.js#register", "hub/src/mod/hooks/register.js#forward", "hub/src/mod/hooks/hooks.json", "hub/src/mod/.claude-plugin/plugin.json", "hub/src/mod/bin/tower", "hub/src/mod/skills/handbook/SKILL.md", "hub/src/mod/skills/review/SKILL.md"],
  "links": [
    { "to": "host-daemon", "verb": "sends", "carries": "mod events under Claude's names (turn.step with usage and the step's visible text, tool.call, session.measure, ...) and tower.tool.result / tower.tool.abandoned / tower.claude, POST /hooks/<id> on hooks.sock; from the tower command, tower.show, tower.keep and tower.hire" },
    { "to": "tower-server", "verb": "reads", "carries": "from the tower command: GET /board, the first event; /conversations/<id> (agent); /archive/<project> for a callsign no worker on duty has, and for the hire depth; collection items and review threads (kept, read, hire, thread)" },
    { "to": "tower-server", "verb": "calls", "carries": "from the tower command: collection/create (keep), review/append (note), spawn (hire, review), submit (send), kill (home), reveal and edit" }
  ]
}
---
The plugin `tower`, loaded add-only with `--plugin-dir src/mod`: its skills are `tower:handbook` and `tower:review`. An event under Claude's name carries Claude's payload; what the
mod derives is posted under `tower.*`, a namespace Claude's own events never use. Payloads that would repeat the
conversation are cut: `tool.check` leaves out the tool input its `tool.call` carries, and `session.compact`
posts `trigger`, `instructions` and a `messageCount` in place of the messages it summarizes (the whole
conversation, megabytes in a long session). Each hook awaits its post, so
events reach the log in the order Claude raised them.

`tower.claude` carries `$.session.version()` (the release, `claude --version`'s), posted right after
`session.start`: the release a session runs is a fact in its own log ([[new-claude-release]]).

`tower.tool.abandoned` exists because a denied permission or an Esc cancels the mods API calls made inside that
event: the abandoned call is remembered and posted at the loop's `turn.complete`.

Classic hooks (curl), declared in the same `hooks/hooks.json`, still deliver the classic events
(`SessionStart`, `Stop`, ...) because the mods API's `classic.*` events never fire: two transports into one
socket. Until 2026-10-06 the host passed that list as settings hooks, so changing it meant a host restart; in
the plugin, each Claude reads it as it starts ([[host-knows-no-flags]]).

The plugin's `bin/tower` is on the Bash tool's PATH in every session. The brief in the system prompt gives the
everyday recipes, and the `tower:handbook` skill is the handbook beside it ([[brief-first]]): it tells Claude what the tower is, how to find itself and other workers, and how to reach one with `SendMessage` ([[agent-directory]]); how
to show the user a page ([[agent-show]]) or open a file on their desktop ([[open-files]]), keep an item ([[agent-keep]]), answer review notes ([[review-threads]]), hire
a reviewer ([[reviewer]]) or a worker, within the floor's limits ([[hiring-limits]]), and send a crew home ([[crews]]); and, in a worktree the tower cut,
how to keep to it ([[tower-cuts-worktrees]]). Its `review` skill is what a reviewer starts on
(`/tower:review <CALLSIGN> [tell]`).
