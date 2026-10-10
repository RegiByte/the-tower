---
{
  "type": "runbook",
  "name": "New Claude release",
  "summary": "A Claude Code release outside the tested range: the board flags each worker on it and says so once, doctor names it, and the range moves only after the fixture set is recorded again on it and replays clean.",
  "in": "tower",
  "reviewed": "2026-10-10",
  "refs": ["hub/src/shared/claude.ts#CLAUDE_TESTED", "hub/src/shared/claude.ts#CLAUDE_SURFACES", "hub/src/shared/claude.ts#claudeRange", "hub/src/mod/hooks/register.js#register", "hub/src/bridge/facts.ts#hookFacts", "hub/src/bridge/board.ts#board", "hub/src/shared/cards.ts#claudeUntestedHtml", "hub/test/fixtures/", "hub/scripts/sandbox.ts"]
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
  `claude <version> untested` ([`claudeUntestedHtml`](ref:hub/src/shared/cards.ts#claudeUntestedHtml)) on a line
  of its own, under the sidebar's head and above the HUD strip, and in the worker's header, with the reason on hover.
- `doctor` checks the installed `claude --version` with
  [`claudeRange`](ref:hub/src/shared/claude.ts#claudeRange): `below`, `tested`, `above`, or `unknown` for a version
  that doesn't read as a release, which is flagged too: a renamed or missing field is drift as well.
- A session started before the mod reported versions has no `claude`, and is never flagged. So is a session whose
  Claude has no `$.session.version`: its start hook fails after the start ran, and no version is posted.

**Where to look first.** Compare what the new release posts with what the fixtures hold: every
`hook_event_name` and its top-level keys, in a fresh recording and in `test/fixtures/*.jsonl`. Then compare
the screens a fresh directory raises with [`blocked.ts`](ref:hub/src/bridge/blocked.ts).

**Fix: move the range.**
1. A throwaway system with a short root (`/tmp/tower-<callsign>`): a git repo for the hub, a config whose
   `argv` is `["claude", "--permission-mode", "default"]` (plain `claude` inherits the user's mode, and
   permission prompts never appear), `tower up` with `TOWER_CONFIG` set to it, and a tower on a free
   `port` in that config. Never the real system.
2. Record again, on the new release, each scenario the fixture set covers (one short Haiku session each:
   `tower spawn <project> --model haiku -- "<prompt>"`, keys through `POST /keys`, `tower kill`, then copy
   `sessions/<id>.jsonl`). A fresh directory raises the trust screen first: down, then enter, as two writes.
3. Diff event names and payload keys against the fixtures, and replace each fixture whose events changed
   under a name the tests already use. `npm test` replays them against the expectations written by hand.
4. Replays pass and nothing the bridge reads drifted: raise `CLAUDE_TESTED.highest` to the release. Something
   drifted: fix the fold (`src/bridge/facts.ts`, `status.ts`, `conversation.ts`, `blocked.ts`) against the new
   fixture, write its expectation by hand from what was observed, then raise the range. A release that drops
   what an older one had raises `lowest` too.
5. Re-check each surface in `CLAUDE_SURFACES` that a fixture doesn't exercise (the paste limit, the peer
   registry, the fullscreen TUI: a session's log enables `?1049h` and `?1006h`, and the wheel over the tower page's
   terminal scrolls the transcript), and update the list if the tower now reads something new.

The draft tagged `lanky-delta` (Haiku scenario runs recorded as fixtures, with a drift table) is this
runbook as an unattended night shift: once it lands, its recordings are the step-2 set.
