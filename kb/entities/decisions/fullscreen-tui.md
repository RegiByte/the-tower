---
{
  "type": "decision",
  "name": "Sessions run Claude's fullscreen TUI",
  "summary": "Every Claude the tower starts is given tui: fullscreen in its --settings: the viewer's terminal keeps no scrollback, so only Claude's own alternate-screen transcript, scrolled by mouse reports, can be scrolled.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/terminal.ts#reportWheel", "hub/renderers/tower3d/src/term.ts", "hub/src/shared/launch.ts#settingsArgs", "hub/src/shared/claude.ts#CLAUDE_SURFACES", "hub/renderers/page/index.html", "hub/src/bridge/screen.ts#lastFrame"]
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

**The wheel (2026-10-09).** Scrolling the transcript is a round of wheel reports: Claude moves its transcript a
scroll speed's rows per report and repaints (2 ms to its first byte, 5–8 ms a frame, measured from the logs), the
speed 3 in xterm.js-like terminals and 1 in macOS's own, or `/scroll-speed`'s (`CLAUDE_CODE_SCROLL_SPEED`, up to 20,
in the user's settings), ramped during fast scrolls unless `wheelScrollAccelerationEnabled` is false (Claude
2.1.295). The tower's legs, host to stream and browser to PTY, take 2 ms. xterm.js 6.0, left alone, sends one report
per wheel event however many rows it is worth and damps a delta under 50 px by ×0.3 as a trackpad's: measured on the
user's Mac, a fast mouse flick reached Claude as about a quarter of its travel (an event is worth 45–90 rows), a slow
trackpad stroke of 9 rows as 2 reports, the first after 190 ms, and the last 200–400 ms of a stroke as none. A session's
terminal therefore sends the wheel itself ([`reportWheel`](ref:hub/src/shared/terminal.ts#reportWheel), both
renderers): one SGR report per row of travel at the terminal's own row height, the remainder carried, undamped, so
Claude scrolls as far and as soon as the finger moves. How Claude counts them depends on the terminal it believes it
runs in, which the tower no longer passes on ([[env-scrub]]): with none named, it counts reports arriving together a
row each and drains what is left of a scroll at three quarters a frame, so the transcript follows the finger about one
to one and stops with the last report (1 ms after it, measured). A shell's terminal keeps xterm's
wheel: xterm does not say which mouse encoding a shell's program asked for, and Claude asks for SGR (`?1006h`).
Rejected: xterm's `scrollSensitivity` (still one report per event, so a flick stays capped) and a renderer dividing by
Claude's scroll speed (the speed is the user's Claude setting, which the renderer cannot read).

**Consequences.** Every worker runs fullscreen, the user's setting notwithstanding; a user who wants Claude's
default renderer elsewhere keeps it outside the tower. Checked on 2.1.295 on a sandbox system: a session with
`{"tui":"default"}` first in its argv still runs fullscreen, and the wheel over the tower page's terminal scrolls the
transcript to "Jump to bottom".

As Claude exits it leaves the alternate screen (`?1049l`) for the empty normal screen and prints its resume line
there, so a whole log replays to that line alone. An ended session's screen is therefore cut just before that exit
([`lastFrame`](ref:hub/src/bridge/screen.ts#lastFrame), [[log-reductions]]): its final frame, the conversation, last
answer and status line. The resume line is dropped: the frame fills every row, there is no row under it to keep the
line on without covering the status line, and every renderer offers Resume for a past session from the board.
