---
{
  "type": "system",
  "name": "Host",
  "summary": "Owns every Claude session's PTY and is the single writer of every session log, so sessions outlive any renderer.",
  "in": "tower",
  "reviewed": "2026-10-08"
}
---
The [[host-daemon]] starts sessions, relays keystrokes and resizes, and appends every fact about a session
to its log. The [[tower-mod|tower mod]] runs inside each session and reports what Claude does.

Changing the host means restarting it, which ends every running session (each can be resumed). So it stays
small and its log format stable: anything that can live in a client does ([[host-knows-no-flags]]).
