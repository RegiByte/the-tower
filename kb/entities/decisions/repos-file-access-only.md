---
{
  "type": "decision",
  "name": "A project's other repos are file access only",
  "summary": "Sessions get the project's other dirs as permissions.additionalDirectories: only the directory a session starts in loads CLAUDE.md, skills, commands and agents.",
  "in": "host",
  "status": "accepted",
  "date": "2026-10-05",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/shared/launch.ts#settingsArgs", "hub/src/shared/model.ts#sessionDirs"]
}
---
**Context.** Sessions got the project's other dirs with `--add-dir`, which also loads each dir's `.claude/`
skills, commands and agents, so a session in a three-repo project listed a skill kept in every repo three times.

**Decision.** [`settingsArgs`](ref:hub/src/shared/launch.ts#settingsArgs) passes the dirs as
`permissions.additionalDirectories` in the session's `--settings`, composed by clients since 2026-10-08
([[host-knows-no-flags]]): the same file access, none of the config loading.
The directory a session starts in (the [[hub]] or the repo chosen at spawn) is the only one that configures it.
Checked on Claude Code 2.1.289: with `--add-dir` a repo's skill is listed; with `additionalDirectories` it is not,
and the repo's files read without a prompt either way.

The dirs are [`sessionDirs`](ref:hub/src/shared/model.ts#sessionDirs) of the session's `cwd` but its own: a session
in a [[worktree]] gets the same worktree of the project's other repos, never their main checkouts
([[tower-cuts-worktrees]]).

**Alternatives considered.** `--add-dir` with skills disabled: no flag does it (`--disable-slash-commands` drops
every skill). Keeping skills out of repos:
puts the fix on every repo instead of the tower.

**Consequences.** A repo's own skills are reachable only from a session started in it. A repo's CLAUDE.md was never
loaded (that takes `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`), and still is not. Clients still pass
`--add-dir` for directories outside the project's repos: the floor's collections directory, and in a [[worktree]] the
directory sources of its links ([[tower-cuts-worktrees]]); a `.claude/` in one of those would load. First a host change (running
sessions end when the host restarts, and can be resumed); the settings are the clients' now.
