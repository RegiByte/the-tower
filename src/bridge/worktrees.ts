/**
 * The tower's worktrees and branches as data: what git prints, parsed, and what every project dir's git says folded
 * into one entry per worktree name, with its state and the verbs it offers. Git is read, never mirrored: nothing here
 * is stored. The commands that produce the input are in `src/worktrees.ts`.
 */
import { WORKTREE_NAME, WORKTREES_DIR } from '../shared/model.ts'
import { branchOffers, worktreeOffers, type BranchCalls, type BranchVerb, type WorktreeCalls, type WorktreeVerb } from './verbs.ts'

/** One entry of `git worktree list --porcelain`. `head` and `branch` are missing on a bare entry, `branch` on a detached HEAD. */
export type GitWorktree = { path: string; head?: string; branch?: string; prunable: boolean; locked: boolean }

export const parseWorktreeList = (porcelain: string): GitWorktree[] =>
  porcelain
    .split('\n\n')
    .filter((block) => block.startsWith('worktree '))
    .map((block) => {
      const lines = block.split('\n')
      const value = (key: string) => lines.find((l) => l.startsWith(`${key} `))?.slice(key.length + 1)
      const has = (key: string) => lines.some((l) => l === key || l.startsWith(`${key} `))
      return {
        path: value('worktree')!,
        head: value('HEAD'),
        branch: value('branch')?.replace(/^refs\/heads\//, ''),
        prunable: has('prunable'),
        locked: has('locked'),
      }
    })

/** The worktree's name when it is one the tower places, `<dir>/.worktrees/<name>`; others' worktrees are invisible. */
export const towerTreeName = (dir: string, path: string): string | undefined => {
  const prefix = `${dir}/${WORKTREES_DIR}/`
  const name = path.startsWith(prefix) ? path.slice(prefix.length) : undefined
  return name !== undefined && WORKTREE_NAME.test(name) ? name : undefined
}

/**
 * What the tower recorded on a branch it cut: the base it was cut from, and the worktree name it was cut under. A fork
 * also records the snapshot it started from (`fork`) and the checkout that snapshot is of (`from`).
 */
export type TowerRecord = { base?: string; name?: string; fork?: string; from?: string }

const RECORD_KEY = /^branch\.(.+)\.tower(base|name|fork|from)$/

/**
 * `git config --get-regexp '^branch\..*\.tower(base|name|fork|from)$'`: every branch the tower cut, with its record.
 * Git lowercases the key's last part, never the branch name, which may hold dots.
 */
export const parseTowerRecords = (out: string): Map<string, TowerRecord> => {
  const records = new Map<string, TowerRecord>()
  for (const line of out.split('\n').filter(Boolean)) {
    const [key, value] = line.split(' ')
    const [, branch, field] = RECORD_KEY.exec(key)!
    records.set(branch, { ...records.get(branch), [field]: value })
  }
  return records
}

/**
 * Whether work could be lost here: `dirty` uncommitted files (tracked or not), `unpushed` commits on no remote. A
 * branch is `absorbed` when merging it into `against` would change nothing (merged, rebased or squashed in), or each of
 * its commits is in `against` as an equal patch.
 * `against` is its recorded base, or origin's default once that base is gone; `undefined` when there is neither.
 * `risk` names a few of the files and commits, for people.
 */
export type Exposure = { dirty: number; unpushed: number; absorbed: boolean; against?: string; risk: string[] }

export const atRisk = ({ dirty, unpushed, absorbed }: Exposure) => dirty > 0 || (unpushed > 0 && !absorbed)

/**
 * One of the tower's worktrees in one repo. `present`: its folder exists; a missing one is git's `prunable`. `from`: the
 * checkout it was forked from, for a fork.
 */
export type TreeRead = Exposure & { name: string; path: string; branch?: string; head?: string; base?: string; from?: string; present: boolean }

/** A branch the tower cut that no worktree has checked out. `tree`: the worktree name it was cut under, when recorded. */
export type BranchRead = Omit<Exposure, 'dirty'> & { branch: string; base: string; tree?: string }

/**
 * What one project dir's git says, read without fetching: remote refs are as of the last fetch. `bases`: origin's
 * branches as `origin/<x>`, its default first, empty without an origin. `main`: the main checkout's own work.
 */
export type RepoRead = { dir: string; git: false } | { dir: string; git: true; bases: string[]; main: MainRead; trees: TreeRead[]; kept: BranchRead[] }

/** The main checkout's unlanded work: `dirty` files (tracked or not), and commits `ahead` of its upstream (none without one). */
export type MainRead = { dirty: number; ahead: number }

export type WorktreeState = 'live' | 'lost' | 'at-risk' | 'removable'

/** `atRisk`: work only this repo's worktree holds; its `risk` names it. */
export type FloorWorktreeRepo = Omit<TreeRead, 'name'> & { dir: string; atRisk: boolean }

export type FloorWorktree = {
  name: string
  repos: FloorWorktreeRepo[]
  /** The live sessions and shells whose cwd is inside any of its paths. */
  sessions: string[]
  state: WorktreeState
  verbs: WorktreeVerb[]
  calls: WorktreeCalls
}

export type FloorBranch = {
  name: string
  repos: (Omit<BranchRead, 'branch'> & { dir: string })[]
  /** Absorbed in every repo that has it: deleting it loses nothing. */
  absorbed: boolean
  verbs: BranchVerb[]
  calls: BranchCalls
}

/** A running session or shell, by the directory it runs in. */
export type Occupant = { id: string; cwd: string }

const inside = (cwd: string, path: string) => cwd === path || cwd.startsWith(`${path}/`)

/** Live first: a worktree in use is never offered for removal, whatever else is true of it. */
const stateOf = (repos: FloorWorktreeRepo[], sessions: string[]): WorktreeState => {
  if (sessions.length) return 'live'
  if (repos.some((r) => !r.present)) return 'lost'
  if (repos.some((r) => r.atRisk)) return 'at-risk'
  return 'removable'
}

const gitReads = (reads: RepoRead[]) => reads.filter((r): r is Extract<RepoRead, { git: true }> => r.git)

/** One entry per name, across the project's repos, in name order. */
export const floorWorktrees = (project: string, reads: RepoRead[], occupants: Occupant[]): FloorWorktree[] => {
  const repos = gitReads(reads).flatMap(({ dir, trees }) => trees.map(({ name, ...tree }) => ({ name, repo: { dir, ...tree, atRisk: atRisk(tree) } })))
  const names = [...new Set(repos.map((r) => r.name))].sort()
  return names.map((name) => {
    const own = repos.filter((r) => r.name === name).map((r) => r.repo)
    const sessions = occupants.filter((o) => own.some((r) => inside(o.cwd, r.path))).map((o) => o.id)
    const state = stateOf(own, sessions)
    return { name, repos: own, sessions, state, ...worktreeOffers(project, name, state) }
  })
}

/** Kept branches by name, across the project's repos, in name order. */
export const floorBranches = (project: string, reads: RepoRead[]): FloorBranch[] => {
  const kept = gitReads(reads).flatMap(({ dir, kept }) => kept.map(({ branch, ...rest }) => ({ branch, repo: { dir, ...rest } })))
  const names = [...new Set(kept.map((k) => k.branch))].sort()
  return names.map((name) => {
    const repos = kept.filter((k) => k.branch === name).map((k) => k.repo)
    const absorbed = repos.every((r) => r.absorbed)
    return { name, repos, absorbed, ...branchOffers(project, name, absorbed) }
  })
}

/** The bases a cut can take: origin's branches every repo of the project has, in the hub's order. */
export const commonBases = (reads: RepoRead[]): string[] => {
  const repos = gitReads(reads)
  if (repos.length !== reads.length || !repos.length) return []
  return repos[0].bases.filter((base) => repos.every((r) => r.bases.includes(base)))
}

/**
 * The project's dirs as git read them, in the order given; `undefined` until every one has been read once.
 */
export const projectReads = (dirs: string[], repos: Map<string, RepoRead>): RepoRead[] | undefined => {
  const reads = dirs.map((dir) => repos.get(dir))
  return reads.every((r) => r !== undefined) ? (reads as RepoRead[]) : undefined
}

/** The worktree a session in `cwd` works in, and the branch its repo has checked out there. */
export const treeAt = (reads: RepoRead[], cwd: string): TreeRead | undefined =>
  gitReads(reads)
    .flatMap((r) => r.trees)
    .find((t) => t.path === cwd)
