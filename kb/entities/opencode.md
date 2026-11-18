---
{
  "type": "external",
  "name": "opencode",
  "summary": "The opencode v2 TUI, the tower's second runtime: one standalone server per session in a real PTY, configured through its env and read through the tower's plugin on its event bus.",
  "in": "tower",
  "reviewed": "2026-11-17",
  "refs": ["hub/src/shared/opencode.ts#OPENCODE_TESTED", "hub/src/shared/opencode.ts#OPENCODE_SURFACES", "hub/src/shared/launch-opencode.ts", "hub/src/mod/opencode/tui.ts", "hub/src/opencode-state.ts#sweepOpencodeStates", "hub/src/bridge/runtimes/opencode.ts#normalizeOpencode", "hub/test/opencode.test.ts", "hub/src/doctor.ts#readiness", "hub/src/shared/spawn-form.ts#modelNote"],
  "links": [
    { "to": "tower-mod", "verb": "triggers", "carries": "bus events to the tower's opencode plugin (session.*, permission.*, form.*, mcp.status.changed) and its tool, shell and session context hooks" }
  ]
}
---
A session runs opencode when its spawn names `runtime: 'opencode'` and the config has a `runtimes.opencode` key; a
session's runtime is fixed for its life and its resume chain. The releases the tower is tested on are
[`OPENCODE_TESTED`](ref:hub/src/shared/opencode.ts#OPENCODE_TESTED), beside the surfaces of opencode's it reads
([`OPENCODE_SURFACES`](ref:hub/src/shared/opencode.ts#OPENCODE_SURFACES)): the v2 plugin API and its bus events change
between minor releases, so a session outside the range is flagged on the board, and the range moves only after
`tool:opencode-check` reads a release clean ([[new-opencode-release]]). A v1 opencode refuses the plugin.

**How a session starts** ([`launch-opencode.ts`](ref:hub/src/shared/launch-opencode.ts)). Every session runs its own
server (`--standalone`): opencode applies its config when its server starts, so a session attached to a running
server would read that server's config, another session's brief or no plugin, without a word. The config reaches it
as `OPENCODE_CONFIG_CONTENT`, which opencode merges over the user's and the project's own: the tower's plugin with the
brief as its option, the plugins the config names, the tower's skills, and the model, its effort as the model's variant
(`provider/model#effort`). The user's config dir, credentials and saved conversations stay theirs, and the skills and
global instructions opencode loads by default (its own, and the user's `~/.claude` ones) keep loading. The first
prompt goes as `--prompt`, which opencode submits once it is ready; a resume opens the saved conversation with `-s`.

**Its callsign in the TUI** ([`tui.ts`](ref:hub/src/mod/opencode/tui.ts)). opencode's TUI loads the TUI part of every
plugin its server loads, from the same directory, so the tower's plugin shows the worker's callsign right-aligned above
the composer (the `session.composer.top` slot), where Claude shows `--name`. As of 2.2.5 the server's plugin options
don't reach a plugin's TUI part: the server hands the TUI only the plugin's path. So every launch, spawn and resume, sets
the callsign as `TOWER_CALLSIGN`, the name the tower logged as `tower.named`. opencode's home screen, where a worker
spawned with no prompt waits, has no slot near its composer, so the label shows from the first prompt on. The part is
plain calls into OpenTUI's Solid renderer, which opencode hands every TUI plugin as `@opentui/solid`, so it needs no JSX
compile step and is typechecked with the rest of the repo.

**Its state dir.** The TUI keeps preferences that outrank the config (a model's variant), its prompt history and its
tabs in its state dir, so every session gets a fresh one as its `XDG_STATE_HOME`, under
`<root>/cache/opencode/<id>/`. Nothing reads it or resumes from it, so it is a cache: before each opencode start the
tower deletes every one whose session the host doesn't run
([`sweepOpencodeStates`](ref:hub/src/opencode-state.ts#sweepOpencodeStates)), never on exit.

**What the tower reads.** The tower's plugin ([[tower-mod]]) posts opencode's bus events and what it joins onto them;
[`normalizeOpencode`](ref:hub/src/bridge/runtimes/opencode.ts#normalizeOpencode) reads them
([[runtime-normalizers]]). A prompt sent while a turn runs waits in the session's inbox and is delivered inside it, so
status follows executions and the Brief opens a turn where its prompt is delivered. A subagent runs in a child
session. opencode's cost is its conversation's, cumulative across every session that ran it; the spend the stats
count comes from what each step and compaction charged ([[log-reductions]]). opencode names a conversation itself;
the title stays in the normalized stream (`conversation.titled`) with no card field.

**What it can't offer.** The board says so per runtime (`board.runtimes.opencode`: no `blocked` or `watching`
status; `absent` rate limits, `watching`, messages between workers, and slash commands
other than `/compact`, which run in the TUI process the plugin can't see). Its workers are told in their brief that
they can't message another worker. The models it offers are those its latest session reported, which leaves out
providers defined in an `opencode.json`, and a model it doesn't know runs on its default without a word: so its list
is not complete (`absent: modelList`), and the new-worker form and `tower hire` take any model id, saying when it isn't
in the list ([[web-tower]], [[tower-cli]]). Its default model is the one its spawns that asked for none ran on: the
model reaches it in env, not argv, so each spawn logs what it asked for as `tower.asked` ([[log-reductions]]). Its
events don't say who sent a prompt: each one arrives as text in the session's inbox.

**Choosing it.** Claude stays the default and a required dependency. A worker starts on opencode only when picked:
the form's runtime choice, drawn once the config runs more than one, or `tower hire runtime opencode`. `tower doctor`
checks each binary `runtimes.opencode.argv` starts, its version against the tested range, only when the config runs it;
it checks no provider, since any opencode command but `--version` may start or attach to a server. A command that
isn't installed exits before opencode prints anything, and the card says so (`startFailure`). The spawn still
answers `spawned`: the host runs the command, and only its exit tells, so dispatch checks no PATH of its own (its PATH
can differ from the host's). `tower hire` reads the board once the hire has settled (logged and live, or exited), and
fails with the card's `startFailure` when that board holds it: a command that isn't installed exits within
milliseconds, before the hire settles, but one that takes longer to fail (a wrapper script) is hired as usual, and
only its card says so.

**When the plugin stops hearing it.** The plugin's subscribe loop posts `plugin.failed` with its error when it dies;
the normalizer reads it as `events.lost`, the fold keeps the error, and the card says it (`card.eventsLost`, API 2.4),
drawn as the shared gist: the tower stopped hearing opencode, its status stands where the events stopped, and, while
it still runs, a kill and a resume start a fresh plugin; an ended card keeps the fact without the advice. It holds for the rest of the session: a plugin reload after it is not read as
hearing it again.

The recorded fixtures `test/fixtures/opencode-*.jsonl`, with
[their expectations](ref:hub/test/opencode.test.ts), are the reference for what the bridge expects of it.
