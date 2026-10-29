---
{
  "type": "runbook",
  "name": "New Claude release",
  "summary": "A Claude Code release outside the tested range: the board flags each worker on it and says so once, doctor names it, and the range moves only after `tool:claude-check` records the scenarios again on it and reads clean against the baseline and the fixtures.",
  "in": "tower",
  "reviewed": "2026-10-29",
  "refs": ["hub/src/shared/claude.ts#CLAUDE_TESTED", "hub/src/shared/claude.ts#CLAUDE_SURFACES", "hub/src/shared/claude.ts#claudeRange", "hub/src/mod/hooks/register.js#register", "hub/src/bridge/facts.ts#hookFacts", "hub/src/bridge/board.ts#board", "hub/src/shared/health.ts#claudeUntestedHtml", "hub/test/fixtures/", "hub/scripts/claude-check.ts", "hub/scripts/claude-check.ts#due", "hub/scripts/claude-check.report.ts#scenarioDifferences", "hub/scripts/claude-check.read.ts#withoutKept", "hub/scripts/claude-check.scenarios.ts#SCENARIOS", "hub/test/claude-shapes.json"]
}
---
**Symptom.** The tower reads several of [[claude-code]]'s surfaces it doesn't own: mod events and their
payloads, classic hook fields, the trust and sign-in screens, the short pastes `submit` sends, the peer
registry, a transcript saved with the first prompt, and the fullscreen TUI the tower's `--settings` asks for (the list, with where each is read:
[`CLAUDE_SURFACES`](ref:hub/src/shared/claude.ts#CLAUDE_SURFACES)). When one drifts, nothing crashes: the board
goes quietly wrong, with a worker stuck `working`, waits that never come, or a card that stays `booting`
([[stuck-booting]]).

What says a release is new to the tower:
- The mod posts `tower.claude` with `$.session.version()` as each session starts, once Claude's own start has run
  ([`register`](ref:hub/src/mod/hooks/register.js#register)), folded into `facts.claude`. A card whose release
  is outside [`CLAUDE_TESTED`](ref:hub/src/shared/claude.ts#CLAUDE_TESTED) has `claudeUntested`, and the board
  lists each such release a live worker runs once, as `board.claudeUntested`. The tower page and Tower 3D say
  `claude <version> untested` ([`claudeUntestedHtml`](ref:hub/src/shared/health.ts#claudeUntestedHtml)), with the
  reason on hover.
- `doctor` checks the installed `claude --version` with
  [`claudeRange`](ref:hub/src/shared/claude.ts#claudeRange): `below`, `tested`, `above`, or `unknown` for a version
  that doesn't read as a release, which is flagged too: a renamed or missing field is drift as well.
- A session started before the mod reported versions has no `claude`, and is never flagged. So is a session whose
  Claude has no `$.session.version`: its start hook fails after the start ran, and no version is posted.

**Where to look first.** `npm run tool:claude-check -- run`
([`claude-check.ts`](ref:hub/scripts/claude-check.ts#run)) records on the installed release every scenario in
[`SCENARIOS`](ref:hub/scripts/claude-check.scenarios.ts#SCENARIOS), one per fixture of real Claude's and a few
with none, and reports, by scenario and event, everything that reads differently from the release the baseline was
taken on. It exits 0 when nothing does, 1 when there is something to read. About 30 Haiku sessions and six minutes.
Before it reports, each scenario that stopped short, replays differently or misses a check of its own sessions is
recorded again, up to `--retries` times (1 unless set), and only its last attempt is read, the report naming what each
earlier one missed ([`scenarioDifferences`](ref:hub/scripts/claude-check.report.ts#scenarioDifferences)): Haiku's
timing, or the classic-renderer fallback after a scenario died mid-start ([[claude-code]]), clears on a second take,
drift doesn't.
`npm run -s tool:claude-check -- due` ([`due`](ref:hub/scripts/claude-check.ts#due)) says whether the installed
release still needs a run: exit 0 when it reads `above` and no pull request titled `Claude <release>` is open or
merged, the title a clean run's pull request takes (step 1), 1 when not, 2 when it can't tell. It is the check line of
a policy ([[policies]]) that offers the run on each new release, and never again once one passed. Run by the tower,
it reads `claude`, `gh` and `npm` from the tower's own PATH, and `gh` signed in and reaching GitHub: a tower started
without them reads exit 2 at every slot, a `check-failed` pass, and offers nothing.
- **Shapes.** Every event Claude posted and its payload keys, one level into objects (a tool's own input left
  out), against [`test/claude-shapes.json`](ref:hub/test/claude-shapes.json), the shapes of the last accepted run:
  the fixtures come from mixed releases, so they are no baseline for shapes. The run is compared as one vocabulary
  ([`shapeChanges`](ref:hub/scripts/claude-check.read.ts#shapeChanges)), since which scenario raises an event
  shifts with timing and the model's choices; a scenario that stops raising one shows in its replay.
- **Status replays.** Each recording through `timeline` (`test/replay.ts`) against its fixture's, the scenario
  driven as the fixture was. What a fixture can't share with a fresh run is left out by the scenario's data, not by
  the code ([`comparedForm`](ref:hub/scripts/claude-check.read.ts#comparedForm)): the trust screen of a fixture
  recorded in a trusted directory, and how many turns subagents that race the main loop report in.
- **Surfaces no fixture covers** ([`renderReport`](ref:hub/scripts/claude-check.report.ts#renderReport)): the
  quota probe's `get_usage` answer against `test/fixtures/probe-usage.out` (what the fold reads), a submit longer
  than a paste chunk landing whole, each session's peer registration with `pid` and `name`, `tower.claude` posting
  the installed release, `?1049h` and `?1006h` in every session's output, and the resume chain.
- **Held back.** The compaction scenarios run with `--debug-file`, whose `<mod>: <event> bypassed by
  cc-plugin-sec-default` lines say what Claude's built-in `sec-default` mod kept from the tower's inside a Team or
  Enterprise organization, as it keeps `session.compact` since 2.1.299 ([[claude-code]]): such an event is read
  from a classic hook, which still fires. A `sec-default@builtin not seated` line says the run was recorded outside
  one, where nothing is kept, and the report names that condition
  ([`unseatedBecause`](ref:hub/scripts/claude-check.read.ts#unseatedBecause)). On every run, each recording is also
  replayed without what `sec-default` keeps ([`withoutKept`](ref:hub/scripts/claude-check.read.ts#withoutKept)):
  a recording whose statuses change depends on an event a session inside an organization never logs, and the run
  is not clean.
- **Mods API.** [`register.js`](ref:hub/src/mod/hooks/register.js#register) declares, in JSDoc, the slice of the
  mods API it calls (`$.env.get`, `$.http.fetch`, `$.session.version`, `next.signal`), checked by `npm run
  typecheck`; Claude writes the release's own types beside a mod it loads (`.claude-plugin/types/claude-code/`), the
  place a rename of one of them shows first.
- **Changelog.** The release's section of `~/.claude/cache/changelog.md`, each entry naming a surface the tower
  reads (hooks, mods, compaction, trust, permissions, peers, usage) marked.

What a throwaway recording of real Claude needs, all in the tool: a short root of its own (`--root`, emptied by each
run but for its `scenarios/`) and port; a git repo per scenario directory, seeded again on each run, since Claude
keeps folder trust per repo root; each directory the same on every run (`<root>/scenarios/<scenario>`), since Claude
remembers a trusted path, so it asks once and `~/.claude.json` stops gaining an entry per scenario per run, the
replays leaving the trust screen out; the one scenario that needs the screen (`fresh`, `trust-dialog`) in a directory
named for the run; the trust screen answered once its output goes quiet (down, then
enter, as two writes); one writer of the config (two raced and dropped a `repos` entry), which `spawn` needs to list
each directory; scenarios with the same Claude flags and environment run together, five at a time (at 21, `POST
/keys` landed up to a minute late); and every step waiting on an event read from the session's log, never on a
sleep or the board. Compaction takes `autoCompactEnabled` in the directory's `.claude/settings.local.json`,
`CLAUDE_CODE_AUTO_COMPACT_WINDOW=100k` and `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=54`; the sign-in screen takes
`CLAUDE_CONFIG_DIR` at an empty directory.

**Fix: move the range.**
1. Exit 0: raise `CLAUDE_TESTED.highest` to the release, and `npm run tool:claude-check -- accept` to take the
   baseline on it, both in one commit. Its pull request is titled `Claude <release>: tested`, which `due` reads. A release that drops what an older one had raises `lowest` too.
2. Exit 1: read each difference in `<root>/report.md`. A scenario that stopped short is run again with `--only`.
   A `fullscreen TUI` miss on one session whose output opens with Claude's classic-renderer notice is the
   fallback after an earlier scenario died mid-start ([[claude-code]]), not drift: run that scenario again with
   `--only`.
   A replay that differs because of how it was driven is fixed in the scenario. A key or event gone, or a replay
   that differs, is drift: fix the fold (`src/bridge/facts.ts`, `status.ts`, `conversation.ts`, `blocked.ts`)
   against the recording in `<root>/recordings/`, replace the fixture with it under the name the tests already
   use (its home path and host replaced, as every fixture's are), write its expectation by hand from what was
   observed, `npm test`, then raise the range. A new key or event is read for whether the bridge should use it,
   then accepted.
3. What stays human: reading the changelog entries the report marks, and provoking a change one names that no
   scenario covers (a targeted scenario, kept with the run's notes); replacing a fixture; the wheel over the tower
   page's terminal scrolling Claude's transcript, which needs a browser; the `*-outside-org` fixtures, which need
   an account outside an organization; and updating [`CLAUDE_SURFACES`](ref:hub/src/shared/claude.ts#CLAUDE_SURFACES)
   and the scenarios when the tower reads something new.
