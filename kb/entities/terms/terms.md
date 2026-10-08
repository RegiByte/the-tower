---
{
  "type": "system",
  "name": "Terms",
  "summary": "Plain shells in project directories that outlive renderers, kept apart from the host so the host stays small.",
  "in": "tower",
  "reviewed": "2026-10-08"
}
---
The [[terms-daemon]] is the only part. Shells are not sessions: nothing is logged and nothing is derived;
a shell's screen lives in memory and is gone when the shell ends.
