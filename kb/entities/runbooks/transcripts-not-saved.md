---
{
  "type": "runbook",
  "name": "Transcripts not saved",
  "summary": "A Claude started with a parent Claude session's variables believes it is a child session and saves no transcript, so its conversations cannot be resumed; the scrub in env.ts is what prevents it.",
  "in": "host",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/env.ts#withoutParentSession", "hub/src/host/session.ts#sessionEnv", "hub/src/machine.ts#startDetached", "hub/src/terms/main.ts#spawnShell", "hub/src/bridge/conversation.ts#conversationsAfter", "hub/src/shared/model.ts#ClaudeHookInput"]
}
---
**Symptom.** Resuming a conversation does not continue it, though the board offered `resume`: a conversation
counts as saved once `UserPromptSubmit` is logged
([`conversationsAfter`](ref:hub/src/bridge/conversation.ts#conversationsAfter)), whether or not Claude wrote
its transcript. The session may also reach the parent session's messaging socket and token.

**Where to look first.**
- The transcript: every classic hook carries `transcript_path`
  ([`ClaudeHookInput`](ref:hub/src/shared/model.ts#ClaudeHookInput)); read it from the session's `SessionStart`
  `h` event and check the file exists. Claude creates it with the first message, so check after a prompt.
- The environment of the session's Claude, the host's direct child: `ps -E -ww -o command= -p <pid>`. Look for
  `CLAUDECODE`, `CLAUDE_PID`, `CLAUDE_CODE_SESSION*`, `CLAUDE_CODE_CHILD*`, `CLAUDE_CODE_MESSAGING*`.

**Likely causes.**
- A Claude Code release added a marker the scrub does not drop
  ([`withoutParentSession`](ref:hub/src/shared/env.ts#withoutParentSession), [[env-scrub]]).
- The config's `env` sets one: [`sessionEnv`](ref:hub/src/host/session.ts#sessionEnv) applies it after the
  scrub.
- A child started by a path that skips the scrub. The host's sessions, the terms daemon's shells
  ([`spawnShell`](ref:hub/src/terms/main.ts#spawnShell)) and the daemons `tower up` starts
  ([`startDetached`](ref:hub/src/machine.ts#startDetached)) all go through it; anything new that starts a child
  must too.

**Fix.** Add the variable or prefix to the lists in `src/shared/env.ts` (leave other `CLAUDE_CODE_*` alone:
they can be user config), or drop it from the config's `env`. The scrub runs in the host, so the fix takes effect
on a host restart, which ends every session ([[no-host]]); sessions spawned after it save their transcripts.
Conversations that were never written cannot be recovered.
