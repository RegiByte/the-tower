---
{
  "type": "decision",
  "name": "Sessions run Claude's fullscreen TUI",
  "summary": "Every Claude the tower starts is given tui: fullscreen in its --settings: the viewer's terminal keeps no scrollback, so only Claude's own alternate-screen transcript, scrolled by mouse reports, can be scrolled.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-16",
  "refs": ["hub/src/shared/terminal.ts#reportWheel", "hub/renderers/tower3d/src/term.ts", "hub/src/shared/launch.ts#settingsArgs", "hub/src/shared/claude.ts#CLAUDE_SURFACES", "hub/renderers/page/index.html", "hub/src/bridge/screen.ts#lastFrame"]
}
---
**Context.** A session's screen is replayed into a viewer's xterm with no scrollback: the log is the history, and a
viewer draws only the screen. Claude has two renderers, picked by its `tui` setting. `fullscreen` enters the alternate
screen and turns on mouse reporting: the wheel reaches Claude as SGR reports and scrolls its transcript. `default`
enables neither: the conversation scrolls off into a scrollback the viewer doesn't keep, and xterm sends the wheel as
arrow keys, which walk the prompt history. With `tui` unset, Claude picks by a feature gate, so the same tower would
scroll for one user and not for another.

**Decision.** [`settingsArgs`](ref:hub/src/shared/launch.ts#settingsArgs) puts `tui: "fullscreen"` in every spawn's
and resume's `--settings`, beside the session's `additionalDirectories` ([[repos-file-access-only]]). Flag settings
outrank the user's own, so it holds whatever `~/.claude/settings.json` says. It is listed in `CLAUDE_SURFACES`: a
release that renames the setting or its value drops sessions back to arrow keys.

A session's terminal sends the wheel itself ([`reportWheel`](ref:hub/src/shared/terminal.ts#reportWheel), every
renderer): one SGR report per row of travel, the remainder carried, since xterm left alone sends one report per wheel event
however far it went, so a flick would reach Claude as a fraction of its travel. With no terminal named in its env ([[env-scrub]]), Claude moves a row per
report and stops with the wheel, so the transcript follows the finger. A shell's terminal keeps xterm's wheel: xterm
does not say which mouse encoding a shell's program asked for.

**Alternatives considered.**
- Scrollback in the viewer: the default TUI redraws its live region in place, so a scrollback fills with stale frames.
- `CLAUDE_CODE_NO_FLICKER=1` in the session's env: the env is the host's to compose, and an undocumented variable is a
  weaker contract than a documented setting.
- Asking users to set it themselves: the tower depends on it, so the tower sets it.
- xterm's `scrollSensitivity`: still one report per event, so a flick stays capped. Dividing by Claude's scroll speed:
  it is the user's Claude setting, which a renderer cannot read.

**Consequences.** Every worker runs fullscreen, the user's setting notwithstanding; a user who wants Claude's default
renderer elsewhere keeps it outside the tower.

As Claude exits it leaves the alternate screen for the empty normal screen and prints its resume line there, so a
whole log replays to that line alone. An ended session's screen is therefore cut just before that exit
([`lastFrame`](ref:hub/src/bridge/screen.ts#lastFrame), [[log-reductions]]): its final frame, the conversation, last
answer and status line. The resume line is dropped: every renderer offers Resume for a past session from the board.
