---
{
  "type": "decision",
  "name": "The tower cuts a worktree per worker, and tidies them by hand",
  "summary": "The tower cuts one git worktree per name in every repo of a project, inside each repo at .worktrees/<name>, and a session in one gets only those worktrees as its directories; git is read every 5 s, never mirrored, and removal is a manual Tidy that never loses unmerged or uncommitted work; work that never landed goes only by a deliberate discard that notes its tips first.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-05",
  "supersedes": "worktrees-are-claudes",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/worktrees.ts#cut", "hub/src/git.ts#PINNED", "hub/src/worktrees.ts#writingConfig", "hub/src/worktrees.ts#fetchOrigin", "hub/src/worktrees.ts#fork", "hub/src/worktrees.ts#snapshot", "hub/src/worktrees.ts#readRepo", "hub/src/worktrees.ts#absorbed", "hub/src/worktrees.ts#tidy", "hub/src/bridge/worktrees.ts#floorWorktrees", "hub/src/bridge/board.ts#occupantsOf", "hub/src/shared/model.ts#sessionDirs", "hub/src/shared/launch.ts#worktreeBrief", "hub/src/shared/launch.ts#linkArgs", "hub/src/worktrees.ts#linkedSources", "hub/src/tower/server.ts#spawnCut", "hub/src/packages.ts#packageDir", "hub/src/shared/cards.ts#spawnFormHtml", "hub/src/shared/cards.ts#defaultWhere"]
}
---
**Problem.** Every worker on a floor ran in the same checkout: workers interleaved edits, tested each other's
half-done changes and moved each other's HEAD. A warning to each worker was the only guard, and it failed silently.

**Why.** Parallel workers per floor became the norm. Claude's own `--worktree` ([[worktrees-are-claudes]]) moves
Claude into the worktree after start, so the workdir would be derived from hooks everywhere, for Claude only. A
worktree that is the session's `cwd` from birth keeps everything keyed on `cwd` working: resume, shells, the editor,
leftovers, a reviewer in the same dir. The spec and lab evidence are in the maintainer's notes, outside the repo.

**How.**
- **Directories from `cwd`.** [`sessionDirs`](ref:hub/src/shared/model.ts#sessionDirs) gives a session in
  `<dir>/.worktrees/<name>` the same worktree of every project dir, never the main checkouts; the host, terms and
  `open` accept exactly those. A resume reuses `cwd`, so nothing new is stored and the log header and host protocol
  are unchanged ([[repos-file-access-only]]). A worktree session's system prompt also gets one line naming its
  worktree, branch and directories ([`worktreeBrief`](ref:hub/src/shared/launch.ts#worktreeBrief)), on spawn and
  resume, because auto modes skip the permission guard and CLAUDE.md names the main checkouts' paths.
- **Read, never stored.** [`readRepo`](ref:hub/src/worktrees.ts#readRepo) reads each project dir's git (worktree
  list, status, unpushed commits, `branch.<br>.towerBase`, origin's branches) without fetching; the pure fold
  ([`floorWorktrees`](ref:hub/src/bridge/worktrees.ts#floorWorktrees)) makes one entry per name across repos with a
  state: `live` (a worker on duty in it, running or stranded until resumed or let go, or a shell; [[tidy]]), `lost` (a folder gone), `at-risk` (uncommitted files, or commits
  on no remote that aren't **absorbed** or [[carried]]), `carried` (clean, its work landed only as copies, some
  edited: removed by its own `remove`), else `removable`. Git prints resolved paths (`/private/tmp`), so the read
  maps them back to the config's spelling of each dir. Every git call runs with the user's config that would change
  a read set back to git's default ([`PINNED`](ref:hub/src/git.ts#PINNED)): under `status.showUntrackedFiles=no`
  a worktree holding only new files read clean, and `worktree remove` deleted them.
- **Absorbed** is content, not ancestry: `git merge-tree --write-tree <base> <br>` equals the base's tree. It is
  true after a merge, rebase or squash, with no GitHub. The base is the one recorded at the cut, or origin's
  default once origin deleted it ([`againstOf`](ref:hub/src/worktrees.ts#againstOf)): an integration branch's work
  has usually landed there by then. Otherwise a squash-merged sub-branch read as unpushed and at risk forever.
  A branch landed as a rebased or cherry-picked copy is absorbed too, whenever merging it would still change the base
  (the base changed those lines again, or reverted them): every commit `git rev-list --cherry-mark --right-only <base>...<br>` lists is marked `=`, an
  equal `git patch-id` in the base. A merge commit has no patch-id and keeps the branch at risk, and so does a copy
  landed with conflicts resolved (a different patch-id): it is [[carried]] when every such commit has a copy made alike,
  else removed by hand or discarded ([[discard]]). The answer is cached per pair of
  commits (at most 1024, then forgotten), since git is read every 5 s. No fuzzy matching (similar subjects, most hunks): a wrong absorbed deletes
  work. [[carried]] matches by what git keeps of a commit's making (author, author date, subject), never by
  similar content, and is never deleted in bulk.
- **The cut** ([`cut`](ref:hub/src/worktrees.ts#cut), offered through `spawn {cut}`,
  [`spawnCut`](ref:hub/src/tower/server.ts#spawnCut)): preflight every repo (a repo with an origin, a valid and free
  branch, a free path, each `worktrees.links` key ignored and untracked), fetch (10 s, else `offline`; verbs at
  once share a repo's fetch, one finished under 5 s ago stands for a new one, and one that can't (a prune after a plain
  fetch) waits for it, so a burst of hires fetches once and a repo never runs two:
  [`fetchOrigin`](ref:hub/src/worktrees.ts#fetchOrigin); a failed fetch fails all who shared it and is never reused), resolve the
  base (an origin branch, `origin/HEAD` by default), then per repo `.worktrees/` into `.git/info/exclude`,
  `worktree add --no-track -b`, record `towerBase` and `towerName`, copy what `.worktreeinclude` names, symlink the links, each checked
  ignored again as the link it is (a pattern ending in `/` matches a directory, never a link). Every verb writing a repo's `.git/config` (a cut's or fork's
  making, a branch recut, a rollback, deleting absorbed branches) runs one at a time
  ([`writingConfig`](ref:hub/src/worktrees.ts#writingConfig)): git locks the file, so two at once failed one of
  them on "could not lock config file". A failure
  while making, or a failed spawn, rolls back what this request made. The default name is a callsign whose name is
  free on the floor, and the worker is started with that session id.
- **A fork** ([`fork`](ref:hub/src/worktrees.ts#fork), offered through `spawn {cut: {from}}`): the same preflight and
  making, each repo started from a [`snapshot`](ref:hub/src/worktrees.ts#snapshot) of a checkout (uncommitted work
  committed from a copy of its index, the source untouched) with no fetch, and recording the source's base plus
  `towerFork` and `towerFrom`. Only commits beyond the snapshot count as its own, so a fork with none is absorbed and
  Tidy removes it once nobody works there ([[reviewer]]).
- **Links share state, never dependencies.** A link is one folder every worker writes back to the main checkout
  (a git-ignored notes folder shared by every worktree). Claude checks a write by the path it resolves to, so a write through a link left
  the session's directories and asked permission, even in auto mode. Every spawn and resume in a worktree therefore
  passes each link's source as `--add-dir` ([`linkedSources`](ref:hub/src/worktrees.ts#linkedSources): the configured
  links whose source exists in a repo's main checkout, the ones a cut makes, directories only (Claude takes no file
  as a directory, and a file's parent is the main checkout); composed in
  [`linkArgs`](ref:hub/src/shared/launch.ts#linkArgs)), the way [[workers-edit-kept-items]] passes the kept items:
  the client's flag, no host change. `node_modules` is not linked: an install in a worktree would change the main
  checkout's. A worktree without its own resolves packages from the main checkout as Node walks up, and the tower
  reads the files it serves from packages (xterm, marked, fonts) through Node's resolver
  ([`packageDir`](ref:hub/src/packages.ts#packageDir)), never by a path into `node_modules`.
- **No global prune.** Unlike the spec, the cut never runs `git worktree prune`: it clears every lost worktree's
  ghost entry, the only evidence of `lost`. A ghost at the name's path answers `exists`; `worktree/recut` and
  `worktree/prune` clear only that name's ghost with `git worktree remove --force <path>` (the folder is gone, so
  `--force` loses nothing).
- **Lost refuses work.** Spawn and resume are refused with `lost` when any of the session's dirs is gone, not only
  its `cwd`; recut restores the folders from the branch.
- **Where a worker starts.** Its own worktree, unless told otherwise: `worktrees.cutByDefault` (top level and per
  project, on by default) is the board's `floor.cutByDefault`, and
  [`defaultWhere`](ref:hub/src/shared/cards.ts#defaultWhere) turns it into a new worktree when the floor can cut,
  else the hub. Every start goes through one form, [`spawnFormHtml`](ref:hub/src/shared/cards.ts#spawnFormHtml),
  which both renderers draw the same way: the first prompt beside Where (new worktree, existing worktree, main
  checkout), every optional field marked, and a line saying what Start does. A quick hire (Tower 3D's E or H at the
  open desk) sends the form's defaults (`spawnDefaults`), so it lands where the dialog would.
- **Tidy is manual** ([`tidy`](ref:hub/src/worktrees.ts#tidy)): after a fetch, every `removable` name its list
  named is removed (refused, before anything, when one no longer is: [[tidy]])
  without `--force` and its branch deleted where absorbed; an unmerged branch is kept and listed as a kept branch.
  A carried worktree is removed by its own `remove`, its branch deleted where carried. Work at risk is thrown away
  only by `worktree/discard`, which notes each repo's tip on the review thread first ([[discard]]). Tidy then files the review thread of every checkout
  whose work has landed ([[review-threads]]). A cut refuses the name `main`, which names the main checkouts' thread.
  A kept branch comes back with `branch/recut`
  ([`recutBranch`](ref:hub/src/worktrees.ts#recutBranch)) under the name it was cut under, so its workers resume.

**Alternatives considered.** Claude's `--worktree` (above). Spawn carrying `dirs` stored in the log header: stores
what `cwd` derives, and changes the host protocol. Sibling worktrees (`../app-name`): the workspace-trust dialog
sticks. `git branch -d` as the merged test: misses squash merges and deletes pushed-but-unmerged branches. Asking
GitHub: a prescriptive integration. Removing on exit: removal waits until a kill is a fact in a log. Copying shared
folders: they diverge. A global `git worktree prune` in the cut: erases other names' `lost`.

**Impact.** A host change (`sessionDirs`). API v8: `spawn.cut`, verbs `worktree/recut | prune | remove`,
`branch/recut`, `branch/delete`, `tidy`, errors `exists`, `would_lose`, `lost`, `offline`, `worktree_failed`. The board gains
`floor.worktrees`, `floor.branches`, `floor.bases`, `floor.branchPrefix`, `floor.cutByDefault` and `card.worktree` ([[board-verbs]]).
Config gains `worktrees: { branchPrefix, links, cutByDefault }`, top level and per project. No new stored state.
