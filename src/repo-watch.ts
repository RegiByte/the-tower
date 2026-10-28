/**
 * Every project dir's git, read when it changes. While watched, each dir's tree is watched (`subscribe.ts`), and its
 * git's common dir when that lies outside it; a change is mapped to the parts of the repo's read it makes stale
 * (`staleOf`), settled (`settleHandlers`), and only those parts are read again. File events can be dropped or merged
 * without a word (FSEvents' "must rescan" never reaches Node), so safety rounds read every repo's own facts every
 * `SAFETY_REPO_MS` and every worktree's status every `SAFETY_TREES_MS`, a few at each tick. A dir whose watch fails
 * is read by the rounds alone, its watch tried again at each tick. Reads run one at a time, on the reader the caller
 * gives.
 */
import { realpathSync } from 'node:fs'
import { ignoredIn, isNothing, mergeStale, settleHandlers, staleOf, type SettleEffect, type SettleEvent, type Settling, type Stale } from './bridge/repo-changes.ts'
import type { RepoRead } from './bridge/worktrees.ts'
import { logged, loggedRead, serially } from './logged.ts'
import { subscribe, type Subscription } from './subscribe.ts'
import { loop, timers, type Executors } from './shared/loop.ts'
import type { RepoParts, RepoReading } from './worktrees.ts'

/** How often the safety rounds step. */
const SAFETY_TICK_MS = 10_000
/** How long the safety rounds take to read every repo's own facts and its main checkout's status once. */
const SAFETY_REPO_MS = 2 * 60_000
/** How long the safety rounds take to read every tower worktree's status once. */
const SAFETY_TREES_MS = 10 * 60_000

/** A read asked of the reader: `dir`'s parts as last read, and what is stale in them. */
export type RepoAsk = { dir: string; last: RepoParts | undefined; stale: Stale }

export type RepoWatch = {
  repos: () => Map<string, RepoRead>
  /** Reads every dir afresh; resolves once read. */
  refresh: () => Promise<void>
  /** Starts the watches and the safety rounds, and once watching reads every dir afresh; resolves once read. */
  start: () => Promise<void>
  /** Closes every watch, and stops the rounds and every settling change. */
  pause: () => void
  /** Watches dirs the config added and reads them, and stops watching dirs it removed. */
  reconcile: () => void
}

/** A watch, none once it failed to start, and the directories it was started ignoring. */
type Watch = { subscription: Promise<Subscription | undefined>; ignore: string[] }

const close = ({ subscription }: Watch) => void subscription.then((s) => s?.close())

const inside = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`)

const REPO_ROUND: Stale = { repo: true, main: true, trees: [], branches: [] }

/**
 * The items a round reads at one tick: from `at`, a position counted in items, the next `share` of them, wrapping, and
 * where the next tick starts. A share of less than one item a tick carries over, so a round's pace holds however few items.
 */
const roundSlice = <T>(items: T[], at: number, share: number): { slice: T[]; at: number } => {
  if (!items.length) return { slice: [], at: 0 }
  const start = at % items.length
  const end = start + items.length * share
  return { slice: [...items, ...items].slice(Math.floor(start), Math.floor(end)), at: end }
}

/** A value as JSON, Maps as arrays, so two reads compare by what they hold. */
const asJson = (value: unknown): string | undefined => JSON.stringify(value, (_, v) => (v instanceof Map ? [...v] : v))

/**
 * `dirs`: the project dirs as the config names them now, `undefined` while the config can't be read (every last read
 * kept). `read`: the reader. `changed`: called once a read changed what `repos` holds.
 */
export const watchRepos = (
  dirs: () => string[] | undefined,
  read: (asks: RepoAsk[]) => Promise<PromiseSettledResult<RepoReading>[]>,
  changed: () => void,
): RepoWatch => {
  const repos = new Map<string, RepoRead>()
  const parts = new Map<string, RepoParts>()
  let queued = new Map<string, Stale>()
  /** Each watched dir's watches, by the real path each watches. */
  const watched = new Map<string, Map<string, Watch>>()
  /** Why each root isn't watched, said once until the reason changes. */
  const unwatched = new Map<string, string>()
  /** Why each dir's last read failed, said once until the reason changes or a read succeeds. */
  const failing = new Map<string, string>()
  /** Each dir's nested project dirs, real paths: their changes are theirs. */
  let nested = new Map<string, string[]>()
  let watching = false
  let tick: NodeJS.Timeout | undefined
  let repoCursor = 0
  let treeCursor = 0

  const ask = (dir: string, stale: Stale) => {
    if (!isNothing(stale)) queued.set(dir, mergeStale(queued.get(dir), stale))
  }

  const drain = serially(
    loggedRead('git', async () => {
      const now = dirs()
      if (!now) return
      const asks = [...queued].filter(([dir]) => now.includes(dir)).map(([dir, stale]) => ({ dir, last: parts.get(dir), stale }))
      queued = new Map()
      let moved = false
      for (const dir of [...repos.keys()].filter((d) => !now.includes(d))) {
        repos.delete(dir)
        parts.delete(dir)
        moved = true
      }
      for (const [i, result] of (asks.length ? await read(asks) : []).entries()) {
        const { dir } = asks[i]
        if (result.status === 'rejected') {
          const why = String(result.reason)
          if (failing.get(dir) !== why) console.error(`git in ${dir}:`, result.reason)
          failing.set(dir, why)
          continue
        }
        failing.delete(dir)
        if (result.value.parts) parts.set(dir, result.value.parts)
        else parts.delete(dir)
        if (asJson(result.value.read) !== asJson(repos.get(dir))) {
          repos.set(dir, result.value.read)
          moved = true
        }
        if (watching && watched.has(dir)) watchRoots(dir)
      }
      if (moved) changed()
    }),
  )

  const settle = loop<Settling, SettleEvent, SettleEffect>({
    state: {},
    handlers: settleHandlers,
    execute: {
      ...timers<SettleEvent>(),
      read: ({ dir, stale }) => {
        ask(dir, stale)
        void drain()
      },
    } satisfies Executors<SettleEffect, SettleEvent>,
  })

  const notWatched = (root: string, err: unknown) => {
    const why = err instanceof Error ? err.message : String(err)
    if (unwatched.get(root) === why) return
    unwatched.set(root, why)
    console.error(`${root} is not watched (${why}): its repo is read by the safety rounds alone until it is`)
  }

  /**
   * The real paths `dir`'s reads depend on, each with the directories its watch ignores: the dir, and its git dirs
   * when they lie outside it.
   */
  const rootsOf = (dir: string): Map<string, string[]> => {
    const root = realpathSync(dir)
    const layout = parts.get(dir)?.layout
    const ignored = ignoredIn(layout?.commonDir ?? `${root}/.git`)
    const outside = layout ? [layout.commonDir, layout.gitDir].filter((p) => !inside(p, root)) : []
    const roots = [root, ...outside.filter((p, i) => !outside.slice(0, i).some((q) => inside(p, q)))]
    return new Map(roots.map((r) => [r, ignored.filter((dir) => inside(dir, r))]))
  }

  /** A dir's changes, `null` when unknown, as the settle machine's events. */
  const changesIn = (dir: string) => (files: string[] | null) => {
    const at = Date.now()
    const layout = parts.get(dir)?.layout
    for (const file of files ?? [null]) settle.dispatch({ type: 'changed', dir, stale: staleOf(layout, nested.get(dir) ?? [], file), at })
  }

  /** Starts each of `dir`'s roots not watched as it should be, and closes the ones it no longer has. */
  const watchRoots = (dir: string) => {
    const current = watched.get(dir) ?? new Map<string, Watch>()
    watched.set(dir, current)
    let roots: Map<string, string[]>
    try {
      roots = rootsOf(dir)
    } catch (err) {
      return notWatched(dir, err)
    }
    for (const [root, watch] of current)
      if (roots.get(root)?.join('\0') !== watch.ignore.join('\0')) {
        close(watch)
        current.delete(root)
      }
    for (const [root, ignore] of [...roots].filter(([r]) => !current.has(r))) {
      const stopped = (err: unknown) => {
        if (current.get(root) === watch) current.delete(root)
        notWatched(root, err)
        return undefined
      }
      const watch: Watch = {
        ignore,
        subscription: subscribe(root, ignore, changesIn(dir), stopped).then((s) => (unwatched.delete(root), s), stopped),
      }
      current.set(root, watch)
    }
  }

  const unwatch = (dir: string) => {
    for (const watch of watched.get(dir)?.values() ?? []) close(watch)
    watched.delete(dir)
    settle.dispatch({ type: 'forget', dir })
  }

  /** `dir`'s real path; none for a dir that can't be resolved, which its watch says why. */
  const realOrNothing = (dir: string): string[] => {
    try {
      return [realpathSync(dir)]
    } catch {
      return []
    }
  }

  /** Returns the dirs it started watching. */
  const reconcileNow = (now: string[]): string[] => {
    for (const dir of [...watched.keys()].filter((d) => !now.includes(d))) unwatch(dir)
    const reals = new Map(now.map((dir) => [dir, realOrNothing(dir)[0]]))
    nested = new Map(
      now.map((dir) => {
        const root = reals.get(dir)
        return [dir, [...reals.values()].filter((r): r is string => !!root && !!r && r !== root && r.startsWith(`${root}/`))]
      }),
    )
    const added = now.filter((dir) => !watched.has(dir))
    for (const dir of now) watchRoots(dir)
    return added
  }

  const reconcile = () => {
    const now = watching && dirs()
    if (!now) return
    for (const dir of reconcileNow(now)) ask(dir, 'all')
    void drain()
  }

  const safetyTick = () => {
    const now = dirs()
    if (!now) return
    const repoStep = roundSlice(now, repoCursor, SAFETY_TICK_MS / SAFETY_REPO_MS)
    repoCursor = repoStep.at
    for (const dir of repoStep.slice) ask(dir, REPO_ROUND)
    const trees = now.flatMap((dir) => [...(parts.get(dir)?.statuses.keys() ?? [])].map((name) => [dir, name] as const))
    const treeStep = roundSlice(trees, treeCursor, SAFETY_TICK_MS / SAFETY_TREES_MS)
    treeCursor = treeStep.at
    for (const [dir, name] of treeStep.slice) ask(dir, { repo: false, main: false, trees: [name], branches: [] })
    void drain()
    reconcileNow(now)
  }

  const refresh = () => {
    for (const dir of dirs() ?? []) ask(dir, 'all')
    return drain()
  }

  return {
    repos: () => repos,
    refresh,
    start: async () => {
      watching = true
      const now = dirs()
      if (now) reconcileNow(now)
      tick = setInterval(logged('safety read', safetyTick), SAFETY_TICK_MS)
      await Promise.all([...watched.values()].flatMap((watches) => [...watches.values()].map((w) => w.subscription)))
      return refresh()
    },
    pause: () => {
      watching = false
      clearInterval(tick)
      for (const dir of [...watched.keys()]) unwatch(dir)
      for (const dir of Object.keys(settle.state())) settle.dispatch({ type: 'forget', dir })
    },
    reconcile,
  }
}
