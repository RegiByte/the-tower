import type { Folder } from '../src/bridge/folds.ts'
import type { BranchRead, ReadTree, RepoRead } from '../src/bridge/worktrees.ts'

/**
 * When a read's facts began to be read. The board trusts a read only if it began at or after every session's start,
 * so this lies after every recorded fixture and is independent of the wall clock.
 */
export const READ_AT = Date.UTC(2100, 0, 1)

type GitRead = Extract<RepoRead, { git: true }>

/** A clean, pushed worktree of `dir` named `name`, with `over` set. */
export const treeRead = (dir: string, name: string, over: Partial<ReadTree> = {}): ReadTree => ({
  name, path: `${dir}/.worktrees/${name}`, branch: `tower/${name}`, present: true, dirty: 0, unpushed: 0, absorbed: false, risk: [], ...over,
})

/** A kept branch with `over` set. */
export const keptRead = (branch: string, over: Partial<BranchRead> = {}): BranchRead => ({
  branch, head: 'c0ffee', base: 'origin/main', unpushed: 0, absorbed: false, risk: [], ...over,
})

/** A git repo at `dir` with a clean main checkout, no origin, no worktrees and no kept branches, with `over` set. */
export const repoRead = (dir: string, over: Partial<Omit<GitRead, 'dir' | 'git'>> = {}): GitRead => ({
  dir, at: READ_AT, git: true, bases: [], originHead: undefined, main: { dirty: 0, ahead: 0 }, trees: [], kept: [], ...over,
})

/** A project dir that is not a git repo. */
export const notGit = (dir: string): RepoRead => ({ dir, at: READ_AT, git: false })

/** `reads` keyed by their dir, as the board takes them. */
export const reposOf = (...reads: RepoRead[]): Map<string, RepoRead> => new Map(reads.map((r) => [r.dir, r]))

/** A started extension's fold pass entry with nothing declared: no folds, no verbs, no settings, no own data. */
export const folder = (cap: string, over: Partial<Folder> = {}): Folder => ({
  id: cap,
  cap,
  requires: [],
  wants: [],
  off: [],
  specs: new Map(),
  folds: {},
  commands: [],
  verbs: new Map(),
  settings: () => undefined,
  own: () => ({ streams: {}, collections: {} }),
  ...over,
})
