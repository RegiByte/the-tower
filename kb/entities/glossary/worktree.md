---
{
  "type": "term",
  "name": "Worktree",
  "summary": "A git working tree the tower cut for a name, at <dir>/.worktrees/<name> in every repo of a project, on one branch (tower/<name> by default); a session started there works only in that name's worktrees, and the name outlives the worker that cut it.",
  "in": "tower",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/model.ts#worktreeName", "hub/src/bridge/worktrees.ts#towerTreeName"]
}
---
Decided in [[tower-cuts-worktrees]]. Worktrees elsewhere (another tool's) are invisible to the tower. A fork is a
worktree cut from a snapshot of another checkout, uncommitted work included; its branch records the checkout
(`towerFrom`), and its card shows it as `worktree.from` ([[reviewer]]).
