---
{
  "type": "system",
  "name": "Host",
  "summary": "Owns every session's PTY and is the single writer of every session log, so sessions outlive any renderer.",
  "in": "tower",
  "reviewed": "2026-11-17"
}
---
The [[host-daemon]] starts sessions, relays keystrokes and resizes, and appends every fact about a session
to its log. The [[tower-mod|tower mod]] runs inside each session and reports what its runtime does ([[opencode]] beside Claude Code).

Changing the host means restarting it, which ends every running session (each can be resumed). So it stays
small and its log format stable: anything that can live in a client does ([[host-owns-ptys]]).
