---
{
  "type": "decision",
  "name": "Worktrees are Claude's, their setup is the repo's",
  "summary": "The tower builds no worktree machinery: a session in a worktree is one optional Launch field passed as Claude's own --worktree flag, and preparing a fresh worktree (env files, dependencies) belongs to each repo.",
  "in": "tower",
  "status": "proposed",
  "date": "2026-10-04",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/shared/launch.ts"]
}
---
**Problem.** Parallel agents writing one repo need isolated checkouts, and a fresh worktree lacks what is
git-ignored: `.env` files, `node_modules`, venvs. Every repo needs a different setup.

**Why.** Claude Code ships `-w, --worktree [name]` (2.1.289). Agent-office, which creates worktrees itself,
never solved setup either: it tells the agent to install what it needs. Setup is knowledge only a repo has.
The user works sequentially, so drafts ([[drafts]]) solve today's need and worktrees can wait.

**How.** When wanted: `worktree?: string` on `Launch`, composed into `--worktree <name>` like the other flags
([[host-knows-no-flags]]). Per-repo setup lives in the repo, through Claude's own worktree configuration.
Renderers may show a session's worktree, derived from its cwd.

**Alternatives considered.** Creating, setting up and removing worktrees in the tower, as agent-office does:
per-stack setup rules in our config, and cleanup flows with data-loss risks.

**Impact.** Nothing to build now; one field when it is needed.
