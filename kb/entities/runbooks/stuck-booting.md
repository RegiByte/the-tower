---
{
  "type": "runbook",
  "name": "Session stuck on booting",
  "summary": "A session that stays booting is Claude on a startup screen the bridge does not recognize (an external CLAUDE.md imports prompt, new dialog copy), or a launch that never drew Claude; recognized screens (trust, login) show as blocked.",
  "in": "host",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/bridge/status.ts#BOOTING", "hub/src/bridge/status.ts#HOOK_STATUS", "hub/src/bridge/blocked.ts#blockedBy", "hub/src/bridge/verbs.ts#AT_COMPOSER", "hub/src/cli.ts"]
}
---
**Symptom.** A card reads `booting` and does not move on. The workspace trust dialog and Claude's first-run setup
and sign-in screens are recognized from the session's output ([`blockedBy`](ref:hub/src/bridge/blocked.ts#blockedBy)):
those read `blocked`, wait on you and lead the waiting list ([[attention-list]]). A card left `booting` is on a screen the table doesn't
know. The card offers no `submit`, so drafts cannot be handed to it
([`AT_COMPOSER`](ref:hub/src/bridge/verbs.ts#AT_COMPOSER)).

**Where to look first.** The session's screen: open its terminal in a renderer, or `tower screen <id>` (rebuilt
from the log) or `tower attach <id>` ([`cli.ts`](ref:hub/src/cli.ts)). Its log has `o` events but no `h` event.

**Likely causes.**
- Every session starts [`booting`](ref:hub/src/bridge/status.ts#BOOTING) and leaves it on the first
  `SessionStart` ([`HOOK_STATUS`](ref:hub/src/bridge/status.ts#HOOK_STATUS)). Startup dialogs come before
  `SessionStart`, so no hook fires while one waits.
- The workspace trust dialog, shown the first time Claude runs in a directory (a new hub, a new worktree).
  It preselects "No, exit".
- "Allow external CLAUDE.md imports?", or a screen whose copy changed in a new Claude version: add its wording to
  [`blockedBy`](ref:hub/src/bridge/blocked.ts#blockedBy)'s table, with a fixture recorded on a throwaway system.
- The trust dialog is not raised in a folder inside a trusted one: on 2026-10-06 none of 188 real logs showed it,
  worktrees included (they live under their trusted repo's `.worktrees/`). A new hub, or a folder outside a trusted
  repo, raises it.

**Fix.** Answer the dialog in the session's terminal. For workspace trust: ↓ then Enter, sent as separate
writes. A spawn with a first prompt (`-- <prompt>`) waits behind the dialog and runs the prompt once it is
answered. If the screen shows no dialog either, the session never drew one: check that the config's `argv`
starts Claude, and read the screen for an error.
