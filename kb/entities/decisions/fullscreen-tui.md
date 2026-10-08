---
{
  "type": "decision",
  "name": "Sessions run Claude's fullscreen TUI",
  "summary": "Every Claude the tower starts is given tui: fullscreen in its --settings: the viewer's terminal keeps no scrollback, so only Claude's own alternate-screen transcript, scrolled by mouse reports, can be scrolled.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/shared/launch.ts#settingsArgs", "hub/src/shared/claude.ts#CLAUDE_SURFACES", "hub/renderers/page/index.html"]
}
---
**Context.** A session's screen is replayed into a viewer's xterm with no scrollback (`scrollback: 0` on the tower
page): the log is the history, and a viewer draws only the screen. Claude has two renderers, picked by its `tui`
setting. `fullscreen` enters the alternate screen (`?1049h`) and turns on mouse reporting (`?1000h ?1002h ?1003h
?1006h`): the wheel reaches Claude as SGR reports (`\e[<64;x;yM` up) and scrolls its transcript. `default` enables
neither: the conversation scrolls off into a scrollback the viewer doesn't keep, and xterm sends the wheel as arrow
keys (`\e[A`), which walk the prompt history while Claude says "Scroll wheel is sending arrow keys · use PgUp/PgDn to
scroll". With `tui` unset, Claude 2.1.295 picks by a feature gate (`tengu_pewter_brook`), so the same tower scrolled
for one user and not for another.

**Decision.** [`settingsArgs`](ref:hub/src/shared/launch.ts#settingsArgs) puts `tui: "fullscreen"` in every spawn's
and resume's `--settings`, beside the session's `additionalDirectories` ([[repos-file-access-only]]). Flag settings
outrank the user's own, so it holds whatever `~/.claude/settings.json` says. It is listed in `CLAUDE_SURFACES`: a
release that renames the setting or its value drops sessions back to arrow keys.

**Alternatives considered.** Scrollback in the viewer: the default TUI redraws its live region in place, so a
scrollback fills with stale frames, and the log, not the viewer, is the history. `CLAUDE_CODE_NO_FLICKER=1` in the
session's env forces the same renderer, but the env is the host's to compose and an undocumented variable is a
weaker contract than a documented setting. Asking users to set it themselves: the tower depends on it, so the tower
sets it.

**Consequences.** Every worker runs fullscreen, the user's setting notwithstanding; a user who wants Claude's
default renderer elsewhere keeps it outside the tower. Checked on 2.1.295 on a sandbox system: a session with
`{"tui":"default"}` first in its argv still runs fullscreen, and the wheel over the tower page's terminal scrolls the
transcript to "Jump to bottom".
