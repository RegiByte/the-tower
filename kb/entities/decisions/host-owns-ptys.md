---
{
  "type": "decision",
  "name": "A detached host owns every PTY",
  "summary": "Session PTYs live in a separate long-running process, so renderers and the bridge can restart without ending sessions.",
  "in": "host",
  "status": "accepted",
  "date": "2026-09-30",
  "reviewed": "2026-10-06",
  "refs": ["hub/src/host/main.ts#spawnSession", "hub/src/host/main.ts#stop"]
}
---
**Context.** The renderer is where the churn is. If it held the PTYs, every renderer change would kill
running Claude sessions.

**Decision.** One host process owns every PTY master and is the single writer of the logs. Clients talk to
it over `control.sock`; Claude talks to it over `hooks.sock`.

**Alternatives considered.** PTYs inside the renderer (the agent-office prior art): rejected for the reason
above. tmux as the PTY owner: rejected, the host must see every byte to log it.

**Consequences.** Changing the host ends every session (each is resumable), so host changes are batched
for a deliberate restart and the host stays small ([[host-knows-no-flags]]).
