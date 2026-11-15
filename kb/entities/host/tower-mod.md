---
{
  "type": "container",
  "name": "tower mod",
  "summary": "The Claude Code mod loaded into every Claude session, and its opencode plugin loaded into every opencode session, posting the runtime's events and a few derived ones to the host, and teaching the session the tower: the tower command on its PATH and two skills, tower:handbook and tower:guide.",
  "in": "host",
  "reviewed": "2026-11-15",
  "refs": ["hub/src/mod/hooks/register.js#register", "hub/src/mod/hooks/register.js#forward", "hub/src/mod/hooks/hooks.json", "hub/src/mod/.claude-plugin/plugin.json", "hub/src/mod/bin/tower", "hub/src/mod/skills/handbook/SKILL.md", "hub/src/mod/skills/guide/SKILL.md", "hub/src/mod/opencode/index.js", "hub/src/mod/opencode/tui.ts", "hub/src/shared/launch-opencode.ts#configOf"],
  "links": [
    { "to": "host-daemon", "verb": "sends", "carries": "from the opencode plugin: opencode's bus events under their own types (tool output left out, a child session's lines with its parentID, a step's end with its model, a subagent call's first progress with the child it spawned, a session's usage with the total of it and its subagents), plugin.started (release, reloaded, models), tool.execute.before, mcp.status and plugin.failed, POST /hooks/<id> on hooks.sock" },
    { "to": "host-daemon", "verb": "sends", "carries": "mod events under Claude's names (turn.step with usage and the step's visible text, tool.call, session.measure, ...) and tower.tool.result / tower.tool.abandoned / tower.claude, POST /hooks/<id> on hooks.sock" },
    { "to": "tower-server", "verb": "reads", "carries": "from the tower command: GET /board, the first event; /conversations/<id> (agent); /archive/<project> for a callsign no worker on duty has; collection items (kept, read); the extensions' reads it names: /reviews/said (thread), /policies/said (policies, runs), /quota/said (probes), any other through `tower x`; /extensions and /schema (extensions, api)" },
    { "to": "tower-server", "verb": "calls", "carries": "from the tower command: collection/create (keep), reviews/append and reviews/resolve (note), reviews/hire (review), spawn (hire), submit (send), the calls a card or a policy offers (home, let-go, policies approve and run), quota/read-now (probes run quota), extension/restart, any extension verb through `tower x`, reveal and edit; and fact, the worker's facts about itself: tower.show (show, open), tower.keep (keep) and tower.leave (`tower home` with the caller's own callsign, [[leave]])" }
  ]
}
---
The plugin `tower`, loaded add-only with `--plugin-dir src/mod`: its skills are `tower:handbook` and `tower:guide`. An event under Claude's name carries Claude's payload; what the
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
how to keep to it ([[tower-cuts-worktrees]]). A reviewer starts on the reviews extension's own skill,
`/reviews:review <CALLSIGN> [tell]`, not on one of the mod's. Its `guide` skill is for the user, not for work: when they ask how to use the
tower or for a tour, the session reads [[docs-usage]] from the checkout, the capabilities and patterns the tips show
(`src/shared/capabilities.ts`, `docs/patterns/`), and the live system (`whoami`, `agents --all`, `kept`), tours their
own floors, and offers one live demo.

**The opencode plugin.** [`src/mod/opencode/index.js`](ref:hub/src/mod/opencode/index.js) is a v2 opencode plugin
that an opencode session loads through the config its launch composes
([`configOf`](ref:hub/src/shared/launch-opencode.ts#configOf), [[opencode]]), with the tower's brief as its option and
the same `skills/` folder. It subscribes to opencode's bus and posts each event as it is, skipping the streaming
deltas and the boot's list-changed events, and leaving out a tool's output (what it read, most of a log's bytes, kept
in opencode's database). What the bus doesn't say it posts or joins on the line, since the normalizer reads one line
at a time ([[runtime-normalizers]]): its release, whether it was reloaded mid-session and the models it can run
(`plugin.started`); the tool a call runs (`tool.execute.before`, which alone names it); a child session's `parentID`
on every line it raises; a step's model, named at its start, on its end; the child a subagent call spawned, on the
call's first progress; and a session's cost summed with its subagents' (`total`). Its shell hook puts `bin/tower` on
every shell's PATH, and its context hook adds the brief to every request. Each post is awaited, so lines keep the bus's
order. When its subscription dies it posts `plugin.failed`, which nothing reads yet. Beside it,
[`tui.ts`](ref:hub/src/mod/opencode/tui.ts) is the plugin's TUI part, which shows the worker's callsign above the
composer ([[opencode]]).
