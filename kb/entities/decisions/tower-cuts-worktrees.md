---
{
  "type": "decision",
  "name": "The tower cuts a worktree per worker, and tidies them by hand",
  "summary": "The tower cuts one git worktree per name in every repo of a project, inside each repo at .worktrees/<name>, and a session in one gets only those worktrees as its directories; git is read on each poll, never mirrored, and removal is a manual Tidy that never loses unmerged or uncommitted work; work that never landed goes only by a deliberate discard that notes its tips first.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-05",
  "reviewed": "2026-10-24",
  "refs": ["hub/src/worktrees.ts#cut", "hub/src/git.ts#PINNED", "hub/src/git.ts#exec", "hub/src/worktrees.ts#deleteAt", "hub/src/worktrees.ts#writingConfig", "hub/src/worktrees.ts#fetchOrigin", "hub/src/worktrees.ts#fork", "hub/src/worktrees.ts#snapshot", "hub/src/worktrees.ts#readRepo", "hub/src/worktrees.ts#absorbed", "hub/src/worktrees.ts#tidy", "hub/src/bridge/worktrees.ts#floorWorktrees", "hub/src/bridge/board.ts#occupantsOf", "hub/src/shared/model.ts#sessionDirs", "hub/src/shared/launch.ts#worktreeBrief", "hub/src/shared/launch.ts#linkArgs", "hub/src/worktrees.ts#linkedSources", "hub/src/tower/dispatch.ts#spawnCut", "hub/src/packages.ts#packageDir", "hub/src/shared/spawn-form.ts#spawnFormHtml", "hub/src/shared/spawn-form.ts#defaultWhere"]
}
---
**Problem.** Workers sharing one checkout interleave edits, test each other's half-done changes and move each
other's HEAD. A warning to each worker is no guard: it fails silently.

**Why.** Parallel workers per floor are the norm. A worktree that is the session's `cwd` from birth keeps everything
keyed on `cwd` working: resume, shells, the editor, leftovers, a reviewer in the same dir.

**How.**
- **Directories from `cwd`.** [`sessionDirs`](ref:hub/src/shared/model.ts#sessionDirs) gives a session in
  `<dir>/.worktrees/<name>` the same worktree of every project dir, never the main checkouts; the host, terms and
  `open` accept exactly those. A resume reuses `cwd`, so nothing new is stored and the log header and host protocol
  are unchanged ([[repos-file-access-only]]). A worktree session's system prompt also gets one line naming its
  worktree, branch and directories ([`worktreeBrief`](ref:hub/src/shared/launch.ts#worktreeBrief)), on spawn and
  resume, because auto modes skip the permission guard and CLAUDE.md names the main checkouts' paths.
- **Read, never stored.** [`readRepo`](ref:hub/src/worktrees.ts#readRepo) reads each project dir's git (worktree
  list, status, unpushed commits, `branch.<br>.towerBase`, origin's branches) without fetching, on a thread of its own
  ([`readRepos`](ref:hub/src/system.ts#readRepos)); the pure fold
  ([`floorWorktrees`](ref:hub/src/bridge/worktrees.ts#floorWorktrees)) makes one entry per name across repos with a
  state: `live` (a worker on duty in it, running or stranded until resumed or let go, or a shell; [[tidy]]), `lost`
  (a folder gone), `at-risk` (uncommitted files, or commits on no remote that aren't **absorbed** or [[carried]]),
  `carried` (clean, its work landed only as copies, some edited: removed by its own `remove`), else `removable`. Every
  git call runs with the user's config that would change a read set back to git's default
  ([`PINNED`](ref:hub/src/git.ts#PINNED)): under `status.showUntrackedFiles=no` a worktree holding only new files
  reads clean, and `worktree remove` would delete them. Every git call is stopped past a timeout with its process
  group, hooks and fsmonitor included, and a few run at once, the rest queued ([`exec`](ref:hub/src/git.ts#exec)), so
  a hung hook can't hold the tower.
- **Absorbed** is content, not ancestry, and exact ([[absorbed]], [`absorbed`](ref:hub/src/worktrees.ts#absorbed)):
  true after a merge, rebase, squash or cherry-pick, with no GitHub. A copy landed edited is [[carried]]. No fuzzy
  matching (similar subjects, most hunks): a wrong absorbed deletes work.
- **The cut** ([`cut`](ref:hub/src/worktrees.ts#cut), offered through `spawn {cut}`,
  [`spawnCut`](ref:hub/src/tower/dispatch.ts#spawnCut)): preflight every repo (a repo with an origin, a valid and free
  branch, a free path not named `main`, each `worktrees.links` key ignored and untracked), fetch (else `offline`; a
  burst of verbs shares one fetch per repo: [`fetchOrigin`](ref:hub/src/worktrees.ts#fetchOrigin)), resolve the base
  (an origin branch, `origin/HEAD` by default), then per repo `worktree add --no-track -b`, record `towerBase` and
  `towerName` in the branch's config, copy what `.worktreeinclude` names and symlink the links. Every verb writing a
  repo's `.git/config` runs one at a time ([`writingConfig`](ref:hub/src/worktrees.ts#writingConfig)), since git locks
  the file. A failure while making, or a failed spawn, rolls back what this request made. The default name is a
  callsign whose name is free on the floor, and the worker is started with that session id ([[callsign-free-name]]).
- **A fork** ([`fork`](ref:hub/src/worktrees.ts#fork), offered through `spawn {cut: {from}}`): the same preflight,
  fetch and making, each repo started from a [`snapshot`](ref:hub/src/worktrees.ts#snapshot) of a checkout (uncommitted work
  committed from a copy of its index, the source untouched), and recording the source's base plus
  `towerFork` and `towerFrom`. Only commits beyond the snapshot count as its own, so a fork with none is absorbed and
  Tidy removes it once nobody works there ([[reviewer]]).
- **Links share state, never dependencies.** A link is one folder every worker writes back to the main checkout
  (a git-ignored notes folder shared by every worktree). Claude checks a write by the path it resolves to, so every
  spawn and resume in a worktree passes each link's source as `--add-dir`
  ([`linkedSources`](ref:hub/src/worktrees.ts#linkedSources): configured links whose source directory exists in a
  repo's main checkout; composed in [`linkArgs`](ref:hub/src/shared/launch.ts#linkArgs)), the way
  [[workers-edit-kept-items]] passes the kept items: the client's flag, no host change. `node_modules` is not linked:
  an install in a worktree would change the main checkout's; the tower reads the files it serves from packages
  through Node's resolver ([`packageDir`](ref:hub/src/packages.ts#packageDir)).
- **No global prune.** The cut never runs `git worktree prune`: it would clear every lost worktree's ghost entry, the
  only evidence of `lost`. A ghost at the name's path answers `exists`; `worktree/recut` and `worktree/prune` clear
  only that name's ghost with `git worktree remove --force <path>` (the folder is gone, so `--force` loses nothing).
- **Lost refuses work.** Spawn and resume are refused with `lost` when any of the session's dirs is gone, not only
  its `cwd`; recut restores the folders from the branch.
- **Where a worker starts.** Its own worktree, unless told otherwise: `worktrees.cutByDefault` (on by default) is the
  board's `floor.cutByDefault`, and [`defaultWhere`](ref:hub/src/shared/spawn-form.ts#defaultWhere) turns it into a new
  worktree when the floor can cut, else the hub. Every start goes through one form,
  [`spawnFormHtml`](ref:hub/src/shared/spawn-form.ts#spawnFormHtml), whose defaults a quick hire sends too.
- **Tidy is manual** ([`tidy`](ref:hub/src/worktrees.ts#tidy)): after a fetch, every `removable` name its list
  named is removed (refused, before anything, when one no longer is: [[tidy]]) without `--force` and its branch
  deleted where absorbed; an unmerged branch is kept and listed as a kept branch. Every branch delete (Tidy, `remove`,
  `prune`, `branch/delete`, discard, a rollback) is [`deleteAt`](ref:hub/src/worktrees.ts#deleteAt):
  `git update-ref -d refs/heads/<b> <head as read>`, then its `branch.<b>` config, so git refuses once the branch
  moved after the read and the branch is kept, named in the reply's `kept` (Tidy's `skipped`). Only a branch with a
  record of the tower's cut (`branch.<b>.towerBase`) is deleted: one checked out by hand under `.worktrees/` is the
  user's, and its worktree goes while the branch stays, named in `kept`. A carried worktree is removed by its own
  `remove`, its branch deleted where carried. Work at risk is thrown away only by `worktree/discard` ([[discard]]).
  Tidy then files the review thread of every checkout whose work has landed ([[review-threads]]). A kept branch comes back with `branch/recut`
  ([`recutBranch`](ref:hub/src/worktrees.ts#recutBranch)) under the name it was cut under, so its workers resume.

**Alternatives considered.** Claude's own `--worktree`: it moves Claude into the worktree after start, so the workdir
would be derived from hooks everywhere, for Claude only. Spawn carrying `dirs` stored in the log header: stores what
`cwd` derives, and changes the host protocol. Sibling worktrees (`../app-name`): the workspace-trust dialog sticks.
`git branch -d` as the merged test: misses squash merges and deletes pushed-but-unmerged branches. Asking GitHub: a
prescriptive integration. Copying shared folders: they diverge.

**Impact.** The API's `spawn.cut`, the `worktree/*`, `branch/*` and `tidy` verbs and the board's `floor.worktrees`,
`floor.branches` and `card.worktree` ([[board-verbs]]); the config's `worktrees` ([[docs-config]]).
