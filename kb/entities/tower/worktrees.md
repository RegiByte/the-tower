---
{
  "type": "library",
  "name": "Worktrees",
  "summary": "Git for the tower: cutting and forking a worktree per name in every repo of a project, reading each repo's worktrees and branches, tidying what has landed, and reading what a worker changed.",
  "in": "tower-core",
  "reviewed": "2026-11-07",
  "refs": ["hub/src/worktrees.ts#cut", "hub/src/worktrees.ts#fork", "hub/src/worktrees.ts#snapshot", "hub/src/worktrees.ts#readRepo", "hub/src/worktrees.ts#rereadRepo", "hub/src/worktrees.ts#fetchOrigin", "hub/src/worktrees.ts#tidyable", "hub/src/worktrees.ts#linksIn", "hub/src/worktrees.ts#linkedSources", "hub/src/worktrees.ts#againstFor", "hub/src/worktrees.ts#rollback", "hub/src/worktrees.ts#recutBranch", "hub/src/worktrees.ts#recutWorktree", "hub/src/worktrees.ts#restoreWorktree", "hub/src/worktrees.ts#pruneWorktree", "hub/src/worktrees.ts#removeWorktree", "hub/src/worktrees.ts#deleteBranch", "hub/src/repo-reader.ts", "hub/src/worktrees.ts#landingOf", "hub/src/worktrees.ts#discardable", "hub/src/worktrees.ts#discard", "hub/src/changes.ts#changesIn", "hub/src/changes.ts#repoChanges", "hub/src/changed-files.ts#changedSince"]
}
---
`src/worktrees.ts` is the only code that changes the tower's worktrees and branches. The tower server calls it; what
git's output means is decided in the bridge (`src/bridge/worktrees.ts`). The rules it keeps (when a branch may be
deleted, why removal never forces, how links are checked) are [[tower-cuts-worktrees]]'s.

Every verb, cut and fork included, fetches first ([`fetchOrigin`](ref:hub/src/worktrees.ts#fetchOrigin), shared by
verbs at once in a repo) and re-checks what it was offered on, since the board may lag a change and its remote refs are
as old as the last fetch.

- **Cut and fork.** [`cut`](ref:hub/src/worktrees.ts#cut) makes one [[worktree]] per repo at `.worktrees/<name>`, on
  one new branch from a base on origin; [`fork`](ref:hub/src/worktrees.ts#fork) starts it from a
  [`snapshot`](ref:hub/src/worktrees.ts#snapshot) of another [[checkout]] ([[reviewer]]). Both record the branch in git
  config (`branch.<b>.tower*`), which is how the tower knows a branch is its own and what it is counted from.
  [`linksIn`](ref:hub/src/worktrees.ts#linksIn) refuses a link git doesn't ignore or tracks;
  [`linkedSources`](ref:hub/src/worktrees.ts#linkedSources) gives a worktree session the links' source directories.
  [`rollback`](ref:hub/src/worktrees.ts#rollback) undoes a cut whose session failed to start.
- **Read.** [`readRepo`](ref:hub/src/worktrees.ts#readRepo) reads a repo's worktrees and kept branches without
  fetching, every part afresh, as every verb does after its fetch; [`rereadRepo`](ref:hub/src/worktrees.ts#rereadRepo)
  reads again only the parts a change made stale (the repo's own facts, a checkout's status, a branch's reflog) and
  keeps the rest from its last parts, as the board's reads do on a thread of their own (`src/repo-reader.ts`, started
  by [[live-system]]). Both remember what never changes for a commit: whether it is [[absorbed]] or [[carried]], what
  is unpushed, and where a head left its base. Each checkout's read carries `changed`, the files its Changes count
  ([`changedSince`](ref:hub/src/changed-files.ts#changedSince), [[changes-view]]), counted again only when its status is
  read again or where it left its base moved.
  [`landingOf`](ref:hub/src/worktrees.ts#landingOf) reads what landing changed on a carried branch.
- **A failed read costs only its checkout.** A checkout whose own read fails (a corrupt index, a commit gone, a `.git`
  that names nothing, a hook past the timeout) reads as [`UnreadTree`](ref:hub/src/bridge/worktrees.ts#UnreadTree) with
  what git said, its neighbours read as usual, and the next read of the repo asks it again, so a repair shows by
  itself. It carries no `dirty`, `unpushed` or `absorbed`: an empty status would read as clean, and a clean worktree
  is one Tidy offers to remove. So the type makes every typed reader of those fields say what an unread one means,
  and a stale one gets no confident 0: what a reader must go by is the state and `atRisk`. A worktree git lists as
  `prunable` whose folder is still there, its `.git` file gone, is one too: only a missing folder is `lost`. Its state is `unread`: it offers no
  verb, Tidy doesn't list it, it has not landed, and every verb refuses it through
  [`worktreeIn`](ref:hub/src/worktrees.ts#worktreeIn), which `lost` alone outranks: `prune` and `recut` touch only the
  folders that are gone, and keep a branch nothing says landed. The main checkout's read fails the same way
  (`MainRead`), said as `unread` on the floor's `main` beside its dir, and it hasn't landed. What every checkout
  stands on (the worktree list, the refs, a kept branch's read) still fails the repo's read, which keeps its last
  ([[live-system]]).
- **One worktree or branch.** The `/worktree/*` and `/branch/*` verbs: recut a lost worktree or a [[kept-branch]],
  prune a lost one, remove one that is removable or carried, delete a kept branch once absorbed or carried. A resume
  brings a gone worktree back under its name through [`restoreWorktree`](ref:hub/src/worktrees.ts#restoreWorktree),
  which picks one of those recuts or a fresh [`cut`](ref:hub/src/worktrees.ts#cut) by what git reads ([[resume]]).
- **Tidy and discard.** [`tidyable`](ref:hub/src/worktrees.ts#tidyable) refuses a Tidy whose worktrees or branches
  no longer qualify after a fetch; Tidy then applies its list through the verbs above ([[tidy]]). Work that
  never landed goes only through [`discardable`](ref:hub/src/worktrees.ts#discardable), then
  [`discard`](ref:hub/src/worktrees.ts#discard), the one call that forces ([[discard]]).
- **Changes.** [`changesIn`](ref:hub/src/changes.ts#changesIn) serves `/changes/<id>`: per repo of a session, the diff
  since the ref its work is counted from ([`againstFor`](ref:hub/src/worktrees.ts#againstFor)), untracked files
  included, with the commits since, narrowed by a scope. Git is read on every request, never kept ([[changes-view]]).
