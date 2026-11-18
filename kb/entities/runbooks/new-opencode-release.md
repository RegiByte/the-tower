---
{
  "type": "runbook",
  "name": "New opencode release",
  "summary": "An opencode release outside the tested range: the board flags each worker on it, doctor names it, and the range moves only after `tool:opencode-check` records the scenarios again on it and reads clean against the baseline and the fixtures.",
  "in": "tower",
  "reviewed": "2026-11-17",
  "refs": ["hub/src/shared/opencode.ts#OPENCODE_TESTED", "hub/src/shared/opencode.ts#OPENCODE_SURFACES", "hub/scripts/runtime-check.ts", "hub/scripts/runtime-check.ts#due", "hub/scripts/runtime-check.ts#sessionPid", "hub/scripts/runtime-check.opencode.ts#OPENCODE", "hub/scripts/runtime-check.opencode.scenarios.ts#SCENARIOS", "hub/scripts/runtime-check.opencode.fakes.ts#fakes", "hub/scripts/runtime-check.report.ts#scenarioDifferences", "hub/test/opencode-shapes.json", "hub/test/opencode.test.ts", "hub/test/fixtures/"]
}
---
**Symptom.** The tower reads [[opencode]]'s v2 plugin API, its bus events and a few config keys and flags, each listed
with where it is read in [`OPENCODE_SURFACES`](ref:hub/src/shared/opencode.ts#OPENCODE_SURFACES); they change between
minor releases. When one drifts, nothing crashes: the board goes quietly wrong. A card whose release, posted by the
tower's plugin as `plugin.started`, is outside [`OPENCODE_TESTED`](ref:hub/src/shared/opencode.ts#OPENCODE_TESTED) is
flagged untested, and `doctor` checks the `--version` of each opencode the config's `runtimes.opencode.argv` starts,
as [[new-claude-release]] says for Claude.

**Where to look first.** `npm run tool:opencode-check -- run` records on the installed release every scenario in
[`SCENARIOS`](ref:hub/scripts/runtime-check.opencode.scenarios.ts#SCENARIOS), one per fixture
`test/fixtures/opencode-*.jsonl`, each driven as its fixture was, and reports everything that reads differently. It is
the runner Claude's check runs on ([[new-claude-release]]: shapes, status replays, retries, `due`, `accept`), with
opencode's part one record, [`OPENCODE`](ref:hub/scripts/runtime-check.opencode.ts#OPENCODE); `tool:opencode-check`
is `tool:runtime-check -- opencode`. Its throwaway system is `/tmp/tower-opencode-check` on port 4397, apart from
Claude's.
`npm run -s tool:opencode-check -- due` ([`due`](ref:hub/scripts/runtime-check.ts#due)) exits 0 when the installed
release reads above the range and no pull request titled `opencode <release>` is open or merged, 1 when not, 2 when it
can't tell: the check line of the policy that offers the run on each new release. It reads only the installed
opencode (`opencode --version`, the one opencode command that starts no server), never upstream's releases.
- **Model.** The scenarios run on Gemini 4 Argon through OpenRouter (`openrouter/google/gemini-4-argon`, one on
  Hydrogen), data in the scenarios: a Claude model would not exercise opencode's own paths. Its key stays in
  opencode's own credentials, never in the tower's config or the tool. A non-Claude model drives a scenario less
  predictably, which `--retries` absorbs: the report names each scenario that needed one and why.
- **Fakes** ([`fakes`](ref:hub/scripts/runtime-check.opencode.fakes.ts#fakes)). A failed turn, a retry and an automatic
  compaction (and one that fails) run on a local OpenAI-compatible provider the runner serves in its own process, as
  their fixtures were recorded: models `fail` (400), `retry` (503 twice), `big` (an answer that fills its 32k context,
  then a summary in opencode's template) and `badsummary` (a summary off it). A remote MCP server that asks for an
  OAuth login is served beside it. Each reaches a scenario through its directory's `opencode.json`, which opencode
  merges under the config the tower composes, as do the permission scenario's rules: shell calls and paths outside
  the session's directories ask (opencode's own agents allow external reads unless told otherwise), so its reads go to
  `/etc/hosts` and a path under the run's root, outside the hub and every scenario directory the tower hands it.
- **Surfaces no fixture covers.** Every session loads the tower's plugin and it posts the installed release; a session
  the tower killed reads as sent home, and one killed from outside as stranded; the resume chain.
- **Killed from outside.** `killed-outside` signals the session's process itself, never through the tower
  ([`sessionPid`](ref:hub/scripts/runtime-check.ts#sessionPid)): the one process `ps -E` shows carrying the session's
  `TOWER_SESSION_ID` whose parent doesn't (every process it starts inherits the variable), and only for a session the
  run spawned, its log under the run's root. No such process, more than one, or a session not the run's own fails the
  scenario rather than widen the match: a pattern kill once took down the real tower.
- **Changelog.** opencode keeps none on disk: the release notes since the tested release are read by hand for the
  surfaces `OPENCODE_SURFACES` lists.

Sessions end as their fixtures did, `/exit` typed and chosen. Conversations land in the user's own opencode database,
as every opencode session's do. The fixtures `opencode-standalone` and `opencode-variant` are recorded on one model
each; a run takes about 12 sessions on OpenRouter and 4 on the fake provider, about five minutes and well under a
dollar.

**Fix: move the range.**
1. Exit 0: raise `OPENCODE_TESTED.highest` to the release, and `npm run tool:opencode-check -- accept` to take the
   baseline [`test/opencode-shapes.json`](ref:hub/test/opencode-shapes.json) on it, both in one commit. Its pull
   request is titled `opencode <release>: tested`, which `due` reads. A release that drops what an older one had
   raises `lowest` too.
2. Exit 1: read each difference in `<root>/report.md`. A scenario that stopped short is run again with `--only`; one
   that differs because of how it was driven (the model skipped a step the scenario waits on) is fixed in the
   scenario. A key or event gone, or a replay that differs again, is drift: fix the normalizer
   (`src/bridge/runtimes/opencode.ts`) or the plugin (`src/mod/opencode/`) against the recording in
   `<root>/recordings/`, replace the fixture with it under the name the tests already use (its home path rewritten,
   the plugin's model list cut to the models used, as every fixture's is), update its expectation in
   [`opencode.test.ts`](ref:hub/test/opencode.test.ts) by hand, `npm test`, then raise the range. A new key or event
   is read for whether the bridge should use it, then accepted.
3. What stays human: the release notes; a surface a release changes that no scenario provokes (a targeted scenario);
   replacing a fixture; and updating `OPENCODE_SURFACES` and the scenarios when the tower reads something new.
