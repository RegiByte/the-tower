---
{
  "type": "term",
  "name": "Hub",
  "summary": "A project's main directory: where its sessions start (or in its worktree, when cut), the first of the dirs every worktree is cut in, and what its shelf paths are relative to; the project's other repos are granted file access only, so only the hub configures a session.",
  "in": "tower",
  "reviewed": "2026-10-31",
  "refs": ["hub/src/shared/model.ts#Project", "hub/src/shared/model.ts#projectDirs"]
}
---
See [[repos-file-access-only]] for why the other repos configure nothing.
