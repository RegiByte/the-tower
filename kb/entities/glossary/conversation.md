---
{
  "type": "term",
  "name": "Conversation",
  "summary": "One of Claude's conversations, known by the session_id of its classic hooks; a session holds one or more, a new one after each /clear or in-session /resume, each with its latest user prompt and Claude's latest answer.",
  "in": "tower",
  "reviewed": "2026-10-23",
  "refs": ["hub/src/bridge/conversation.ts#Conversation", "hub/src/bridge/conversation.ts#USER_ORIGINS"]
}
---
Only prompts the user gave count, by the mod's `origin`: typed into Claude's composer (at the terminal, or by a worker
through the tower's `submit` or a hire's prompt, which type into the PTY) or sent through Remote Control. Harness
notifications, peers' messages and schedules do not. `SessionStart` repeats on `/compact` under the same id, which is
not a new conversation.
