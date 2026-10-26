/**
 * What a change on disk makes stale in a repo's last read, and when to read it again. A watcher reports a path that
 * changed and nothing more (on macOS a write is mostly reported as a rename, and a burst may come as one event or
 * none): `staleOf` says which parts of the read that path can change, and the settle machine reads a repo once its
 * changes go quiet, or once they have run for `SETTLE_MAX_MS`, so a file rewritten forever costs one read per
 * `SETTLE_MAX_MS` and never starves the read.
 */
import type { StateEffect, TimerEffect } from '../shared/loop.ts'
import { WORKTREE_NAME, WORKTREES_DIR } from '../shared/model.ts'

/**
 * The parts of a repo's read to read again: `repo`, the facts every worktree's read is judged on (the worktree list,
 * the tower's records, the branches and remote refs, the main checkout's commits ahead); `main`, the main checkout's
 * status; `trees`, the status of each tower worktree named; `branches`, the reflog of each branch named. `all` reads
 * everything afresh.
 */
export type Stale = 'all' | StaleParts

export type StaleParts = { repo: boolean; main: boolean; trees: string[]; branches: string[] }

export const NOTHING: StaleParts = { repo: false, main: false, trees: [], branches: [] }

export const isNothing = (s: Stale): boolean => s !== 'all' && !s.repo && !s.main && !s.trees.length && !s.branches.length

export const mergeStale = (a: Stale | undefined, b: Stale): Stale =>
  a === undefined
    ? b
    : a === 'all' || b === 'all'
      ? 'all'
      : { repo: a.repo || b.repo, main: a.main || b.main, trees: [...new Set([...a.trees, ...b.trees])], branches: [...new Set([...a.branches, ...b.branches])] }

/**
 * Where a repo's git keeps what a read depends on, every path real (symlinks resolved, as a watcher reports them):
 * `root`, the project dir; `gitDir`, the main checkout's own git dir; `commonDir`, what every worktree shares (the
 * same as `gitDir` unless the dir is itself a linked worktree); `admins`, each tower worktree's own git dir, by name.
 */
export type RepoLayout = { root: string; gitDir: string; commonDir: string; admins: Record<string, string> }

const under = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`)
const within = (file: string, dir: string) => file.slice(dir.length + 1)

/** A checkout's own git dir: its index changes only its status; its HEAD, its list entry and its commits too. */
const checkoutChange = (rel: string, checkout: { main: true } | { tree: string }): Stale => {
  const repo = rel !== 'index'
  return 'main' in checkout ? { ...NOTHING, repo, main: true } : { ...NOTHING, repo, trees: [checkout.tree] }
}

/** Files of the main checkout's own that git keeps in the common dir when the two are one. */
const MAIN_OWN = new Set(['index', 'HEAD', 'logs/HEAD'])

/** A change in the tower's worktrees folder, `<root>/.worktrees/…`; `undefined` for one outside it. */
const worktreesChange = (root: string, path: string): Stale | undefined => {
  if (!under(path, `${root}/${WORKTREES_DIR}`)) return undefined
  const [, name, ...inside] = within(path, root).split('/')
  if (name === undefined || !inside.length) return { ...NOTHING, repo: true }
  return WORKTREE_NAME.test(name) ? { ...NOTHING, trees: [name] } : NOTHING
}

/**
 * What the change of `file` (an absolute real path; `null` when the watcher couldn't say) makes stale in the repo laid
 * out as `layout`. `nested`: the roots of the other project dirs inside this one, whose changes are theirs. The
 * worktrees folder is told apart before the common dir, which in a bare repo is the project dir itself.
 */
export const staleOf = (layout: RepoLayout | undefined, nested: string[], file: string | null): Stale => {
  if (file === null || layout === undefined) return 'all'
  const path = file.replace(/\.lock$/, '')
  for (const [tree, admin] of Object.entries(layout.admins)) if (under(path, admin)) return checkoutChange(within(path, admin), { tree })
  if (layout.gitDir !== layout.commonDir && under(path, layout.gitDir)) return checkoutChange(within(path, layout.gitDir), { main: true })
  if (nested.some((dir) => under(path, dir))) return NOTHING
  if (path === layout.root) return 'all'
  const inWorktrees = worktreesChange(layout.root, path)
  if (inWorktrees) return inWorktrees
  if (under(path, layout.commonDir)) {
    const rel = within(path, layout.commonDir)
    if (layout.gitDir === layout.commonDir && MAIN_OWN.has(rel)) return checkoutChange(rel, { main: true })
    const branch = /^logs\/refs\/heads\/(.+)$/.exec(rel)?.[1]
    return branch ? { ...NOTHING, branches: [branch] } : { ...NOTHING, repo: true }
  }
  return under(path, layout.root) ? { ...NOTHING, main: true } : NOTHING
}

/**
 * The directories of a repo's git whose changes say nothing a read needs, left unwatched: objects are written only
 * beside a ref or an index, which say what changed, and the fsmonitor daemon writes cookies there on every status, the
 * tower's own included. `commonDir` is `<root>/.git` until the repo has been read.
 */
export const ignoredIn = (commonDir: string): string[] => [`${commonDir}/objects`, `${commonDir}/fsmonitor--daemon`]

/** How long a repo's changes must go quiet before it is read. */
export const SETTLE_QUIET_MS = 1000
/** How long after its first unread change a repo is read, however long its changes go on. */
export const SETTLE_MAX_MS = 10_000

/** Each repo with changes not yet read: what they made stale, and when the first of them came. */
export type Settling = Record<string, { stale: Stale; since: number }>

export type SettleEvent = { type: 'changed'; dir: string; stale: Stale; at: number } | { type: 'due'; dir: string } | { type: 'forget'; dir: string }

export type SettleEffect = StateEffect<Settling> | TimerEffect<SettleEvent> | { type: 'read'; dir: string; stale: Stale }

const without = (s: Settling, dir: string): Settling => Object.fromEntries(Object.entries(s).filter(([d]) => d !== dir))

export const settleHandlers = {
  changed: (s: Settling, { dir, stale, at }: Extract<SettleEvent, { type: 'changed' }>): SettleEffect[] => {
    if (isNothing(stale)) return []
    const since = s[dir]?.since ?? at
    return [
      { type: 'state', state: { ...s, [dir]: { stale: mergeStale(s[dir]?.stale, stale), since } } },
      { type: 'timer/start', id: dir, ms: Math.max(0, Math.min(SETTLE_QUIET_MS, since + SETTLE_MAX_MS - at)), fire: { type: 'due', dir } },
    ]
  },
  due: (s: Settling, { dir }: Extract<SettleEvent, { type: 'due' }>): SettleEffect[] =>
    s[dir] ? [{ type: 'state', state: without(s, dir) }, { type: 'read', dir, stale: s[dir].stale }] : [],
  forget: (s: Settling, { dir }: Extract<SettleEvent, { type: 'forget' }>): SettleEffect[] => [
    { type: 'state', state: without(s, dir) },
    { type: 'timer/cancel', id: dir },
  ],
}
