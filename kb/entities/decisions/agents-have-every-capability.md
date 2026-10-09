---
{
  "type": "decision",
  "name": "Workers hold every capability; the boundary is the machine",
  "summary": "A worker may call every verb of the renderer API, spawning, prompting, resuming and killing workers included, and uses them when the task calls for it; same-user processes are trusted, and what the tower guards against is the outside: browser pages and other users.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/tower/server.ts#isFromTower", "hub/src/directory.ts#command", "hub/src/mod/skills/handbook/SKILL.md", "hub/src/host/main.ts"]
}
---
**Problem.** The tower skill told workers never to start, prompt, kill or resume workers ([[agent-directory]]).
It was a rule in a markdown file, not a boundary: the `tower` command sets the Origin header itself
([`command`](ref:hub/src/directory.ts#command)), so any worker could already `POST /spawn`, `/submit` or
`/kill`; the hooks socket accepts facts under any session id; `/run` pages are served at the tower's origin.
The research of 2026-10-06 (the maintainer's notes, outside the repo) named it a
convention and proposed keeping it, reworded as "only the user drives workers".

**Why.** An agent running as the user already reaches everything on the machine. A door that blocks only the
polite path protects nothing and makes agents less useful: a worker cannot hand a draft to a peer, start a
reviewer, or carry a night shift. What needs protecting is the user from what is outside the machine, not
from the agents the user runs. This follows from [[renderer-is-disposable]]: a capability is the system's,
open to every renderer and every agent.

**How.**
- *Trusted:* every process running as the user, workers included. Sockets are `0600`, so other OS users are
  out.
- *Guarded:* browser pages. The tower answers only its own Host names and requires its own Origin on every
  POST ([`isFromTower`](ref:hub/src/tower/server.ts#isFromTower)), which stops DNS rebinding and cross-site
  requests.
- *Workers* may call every verb the board offers. They are not directed to: they act on other workers when
  the task calls for it or the user asks, and say what they did. The skill states this in place of the old
  rule.
- `/run` pages keep full authority: a page a worker edits gains nothing the worker lacks.

**Alternatives considered.**
- *Keep the convention, reworded* ("only the user drives, by hand or through clients they start"). Rejected:
  it keeps a fake door and makes every agent-run tool an exception to explain.
- *Identity before delegation* (a per-session secret minted at spawn, grants as data, every delegated act
  logged). Deferred: it answers untrusted agents (sandboxed, remote, another user's), which this local
  system does not run. The order stands if they ever arrive.

**Impact.** Workers can compose the tower's verbs into their own tools (a reviewer, a runner, a night shift);
`tower hire` is the first general one: a worker starts another on a prompt ([[agent-directory]]), and `tower home`
ends a worker with everyone under it ([[crews]]). The verbs that reach the user's desktop, `reveal` and `edit`, take
only paths the system names ([[open-files]]).
Open follow-up: attribution. A hire is the first act logged with its actor (`tower.hire` in the hirer's log, read as
the hired card's `hiredBy`, [[hiring-limits]]); the other acts one worker takes on another (`submit`, `kill`) are not
yet facts naming their actor; the roadmap carries it.
