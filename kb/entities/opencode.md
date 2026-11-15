---
{
  "type": "external",
  "name": "opencode",
  "summary": "The opencode v2 TUI, the tower's second runtime: one standalone server per session in a real PTY, configured through its env and read through the tower's plugin on its event bus.",
  "in": "tower",
  "reviewed": "2026-11-15",
  "refs": ["hub/src/shared/opencode.ts#OPENCODE_TESTED", "hub/src/shared/opencode.ts#OPENCODE_SURFACES", "hub/src/shared/launch-opencode.ts", "hub/src/opencode-state.ts#sweepOpencodeStates", "hub/src/bridge/runtimes/opencode.ts#normalizeOpencode", "hub/test/opencode.test.ts"],
  "links": [
    { "to": "tower-mod", "verb": "triggers", "carries": "bus events to the tower's opencode plugin (session.*, permission.*, form.*, mcp.status.changed) and its tool, shell and session context hooks" }
  ]
}
---
A session runs opencode when its spawn names `runtime: 'opencode'` and the config has a `runtimes.opencode` key; a
session's runtime is fixed for its life and its resume chain. The releases the tower is tested on are
[`OPENCODE_TESTED`](ref:hub/src/shared/opencode.ts#OPENCODE_TESTED), beside the surfaces of opencode's it reads
([`OPENCODE_SURFACES`](ref:hub/src/shared/opencode.ts#OPENCODE_SURFACES)): the v2 plugin API and its bus events change
between minor releases, so a session outside the range is flagged on the board. A v1 opencode refuses the plugin.

**How a session starts** ([`launch-opencode.ts`](ref:hub/src/shared/launch-opencode.ts)). Every session runs its own
server (`--standalone`): opencode applies its config when its server starts, so a session attached to a running
server would read that server's config, another session's brief or no plugin, without a word. The config reaches it
as `OPENCODE_CONFIG_CONTENT`, which opencode merges over the user's and the project's own: the tower's plugin with the
brief as its option, the plugins the config names, the tower's skills, and the model, its effort as the model's variant
(`provider/model#effort`). The user's config dir, credentials and saved conversations stay theirs, and the skills and
global instructions opencode loads by default (its own, and the user's `~/.claude` ones) keep loading. The first
prompt goes as `--prompt`, which opencode submits once it is ready; a resume opens the saved conversation with `-s`.

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
status; `absent` rate limits, `watching`, messages between workers, the callsign in its own TUI, and slash commands
other than `/compact`, which run in the TUI process the plugin can't see). Its workers are told in their brief that
they can't message another worker. The models it offers are those its latest session reported, which leaves out
providers defined in an `opencode.json`. Its events don't say who sent a prompt: each one arrives as text in the session's inbox.

The recorded fixtures `test/fixtures/opencode-*.jsonl`, with
[their expectations](ref:hub/test/opencode.test.ts), are the reference for what the bridge expects of it.
