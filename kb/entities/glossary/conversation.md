---
{
  "type": "term",
  "name": "Conversation",
  "summary": "One of Claude's conversations, known by the session_id of its classic hooks; a session holds one or more, a new one after each /clear, each with its latest user prompt and Claude's latest answer.",
  "in": "tower",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/bridge/conversation.ts#Conversation"]
}
---
Only prompts the user gave count (typed at the terminal or sent through Remote Control, by the mod's
`origin`); harness notifications do not. `SessionStart` repeats on `/compact` under the same id, which is not
a new conversation.
