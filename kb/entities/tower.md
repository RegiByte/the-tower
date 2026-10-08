---
{
  "type": "project",
  "name": "tower",
  "summary": "A local-first surface for managing many Claude Code sessions, where sessions are data and the presentation is swappable.",
  "reviewed": "2026-10-08",
  "refs": ["hub/AGENTS.md", "hub/package.json", "hub/src/shared/model.ts"]
}
---
The tower runs Claude Code in real PTYs (the full TUI, never `claude -p`) and records everything that
happens to each session as an append-only log. Every view of those sessions is derived from the logs, so
any renderer can be plugged in or thrown away. One user, the [[operator]], works from it every day across
several projects. It is local only: no accounts, no external services, no multiplayer.

**Why it exists.** The seed is an agent HQ: one floor per project, one desk per agent, its live terminal on a
monitor. The bet is that the same data laid out in space changes how you hold work in your head. What it fixed
early is the shape: sessions are data, renderers are disposable. Disposable means no capability lives in a renderer: every
capability is a primitive in the core, open to every renderer and every worker ([[renderer-is-disposable]],
[[agents-have-every-capability]]), and a renderer may grow as sophisticated as it likes on top.

**The parts.**

- [[host]]: the detached process that owns every session PTY and writes the logs, plus the
  [[tower-mod]] loaded into every session.
- [[terms]]: a second detached process owning plain shells in project directories.
- [[bridge]]: pure reductions over the logs and the live store a renderer subscribes to. This is the
  contract a new renderer plugs into.
- [[web-tower]]: today's web renderer. [[cli]]: the `tower` command, a terminal renderer and control surface.

**Data.** [[system-root]] holds the only stored state: the config (intent), the session logs (facts) and the
collections (files kept for later). Everything else is computed from them ([[logs-are-facts]]); what is kept to skip
computing it again lives in a cache that is never authoritative ([[fold-checkpoints]]).

**Where to start.** `AGENTS.md` for the rules, then [[session-lifecycle]] for one session end to end, then
[`model.ts`](ref:hub/src/shared/model.ts#LogEvent) for the log format everything is derived from.
