/**
 * A running view of the whole system: every session folded from its log and kept current as the host appends
 * to it, the items of every collection, the host's live set, the terms daemon's shells, what sessions left
 * running on the machine, and what git says about the tower's worktrees in every project dir.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch } from 'node:fs'
import path from 'node:path'
import { factsAfter, type Session } from './bridge/facts.ts'
import { foldLog } from './checkpoints.ts'
import type { Peer, Resource } from './bridge/resources.ts'
import type { RepoRead } from './bridge/worktrees.ts'
import { readItem, scanCollections } from './collections.ts'
import { hostLive, peersIn, resourcesIn, scanProcesses, termsShells } from './machine.ts'
import { ConfigError, projectDirs, type CollectionItem, type Config } from './shared/model.ts'
import type { SystemPaths } from './shared/paths.ts'
import type { HostLive } from './shared/protocol.ts'
import { parseThread, REVIEWS, type ReviewThread } from './shared/reviews.ts'
import type { Shell } from './shared/terms.ts'
import type { LogFile } from './bridge/retention.ts'
import { factEvents, isArchived, logFilesIn, logIdOf, tailLog } from './tail.ts'
import { readRepo } from './worktrees.ts'
import { logged, loggedRead, watchedOrExit } from './logged.ts'

const LIVE_POLL_MS = 1000
const MACHINE_POLL_MS = 5000
const RESCAN_DEBOUNCE_MS = 100

/** A value as JSON, Sets and Maps as arrays, so two reads compare by what they hold. */
const asJson = (value: unknown): string | undefined =>
  JSON.stringify(value, (_, v) => (v instanceof Set ? [...v].sort() : v instanceof Map ? [...v] : v))

/** The config as the file holds it now; JSON it can't parse is a config error naming the file. */
export const readConfig = (file: string): Config => {
  const text = readFileSync(file, 'utf8')
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new ConfigError(`${file} is not valid JSON: ${(err as Error).message}`)
  }
}

/**
 * One run at a time: a call while a run is in flight gets that run, and the read runs once more after it, so a read
 * always starts after the last call.
 */
const serially = (read: () => Promise<void>): (() => Promise<void>) => {
  let running: Promise<void> | undefined
  let again = false
  const call = (): Promise<void> => {
    if (running) {
      again = true
      return running
    }
    running = read().finally(() => {
      running = undefined
      if (again) {
        again = false
        void call()
      }
    })
    return running
  }
  return call
}

/** A review thread's file, by project and item id, and what it holds. */
export type ThreadFile = { project: string; id: string; modifiedAt: number; thread: ReviewThread }

/** Each item of the review collections, parsed: a file `held` at the same version is not read again. */
const threadsIn = (paths: SystemPaths, items: CollectionItem[], held: ThreadFile[]): ThreadFile[] =>
  items
    .filter((i) => i.collection === REVIEWS)
    .flatMap(({ project, id, modifiedAt }) => {
      const same = held.find((t) => t.project === project && t.id === id && t.modifiedAt === modifiedAt)
      if (same) return [same]
      const text = readItem(paths, project, REVIEWS, id)
      return text === undefined ? [] : [{ project, id, modifiedAt, thread: parseThread(text) }]
    })

export type System = {
  /** Newest first. */
  sessions: () => Session[]
  session: (id: string) => Session | undefined
  /** Each session's log on disk, by session id: its size read when tracked, when it ends and when it is archived. */
  logs: () => Map<string, LogFile>
  /** Every collection's items on disk, in id order. */
  items: () => CollectionItem[]
  /** Every review thread on disk, parsed, read again when its file changes. */
  threads: () => ThreadFile[]
  /** `undefined` while no host is running. */
  live: () => HostLive | undefined
  running: () => Resource[]
  /** The Claude session names of sessions whose Claude is running, read with the processes. */
  peers: () => Peer[]
  /** `undefined` while no terms daemon is running. */
  shells: () => Shell[] | undefined
  /** Every project dir's git, by dir, read without fetching: remote refs are as of the last fetch. */
  repos: () => Map<string, RepoRead>
  /** Ask the host again now, after a request that changed what it runs. */
  refreshLive: () => Promise<void>
  /** Resolves once the system holds the session the host just started, or after `ms`. */
  tracked: (id: string, ms: number) => Promise<void>
  /** Look at the machine's processes again now, after ending some. */
  refreshRunning: () => Promise<void>
  /** Ask the terms daemon again now, after a request that changed its shells. */
  refreshShells: () => Promise<void>
  /** Read every project dir's git again now, after a request that changed its worktrees or branches. */
  refreshRepos: () => Promise<void>
  /**
   * Keeps `running`, `peers` and `repos` current, re-read every 5 s, until the returned function is called; nobody
   * observing, they are not read at all. Resolves once they are current: the first observer after none reads them now.
   */
  observe: () => Promise<() => void>
}

/**
 * `onChange` is called after anything the system holds changes: a logged event, a collection's items, the live set,
 * the shells, the processes, git, or the config file.
 */
export const watchSystem = async (paths: SystemPaths, onChange: () => void): Promise<System> => {
  const sessions = new Map<string, Session>()
  const logs = new Map<string, LogFile>()
  /** Each tailed log's stop, by session id, until its session exits or its log is archived. */
  const tails = new Map<string, () => void>()
  let items: CollectionItem[] = []
  let threads: ThreadFile[] = []
  let live: HostLive | undefined
  let running: Resource[] = []
  let peers: Peer[] = []
  let shells: Shell[] | undefined
  let repos = new Map<string, RepoRead>()
  const awaited = new Map<string, () => void>()

  /**
   * Folds the log so far, from its checkpoint on, then keeps folding what the host appends while the session runs, until
   * it exits or breaks. A log the host just created may not hold its header yet: it is tracked on a later change.
   */
  const track = (file: string) => {
    const logPath = path.join(paths.sessions, file)
    const folded = foldLog(paths.cache, logPath)
    if (!folded) return
    const { session, offset } = folded
    const id = session.header.id
    const measure = () => logs.set(id, { archived: isArchived(logPath), bytes: statSync(logPath).size })
    sessions.set(id, session)
    measure()
    awaited.get(id)?.()
    if (session.facts.state.status === 'exited' || session.facts.broken || isArchived(logPath)) return
    const step = factsAfter(session.header.startedAt)
    const stop = tailLog(logPath, offset, factEvents(session.facts.state), (event) => {
      const facts = step(session.facts, event)
      if (facts.broken) {
        stop()
        tails.delete(id)
        /** The tail stops at the break, before what came in the same append: the user letting it go, read by folding again. */
        track(file)
        onChange()
        return
      }
      if (!('unreadable' in event) && event[1] === 'x') {
        stop()
        tails.delete(id)
        measure()
      }
      if (facts === session.facts) return
      session.facts = facts
      onChange()
    })
    tails.set(id, stop)
  }

  /**
   * A log no longer tailed (its session exited) that grew holds facts appended after its exit (`tower.letGo`): it is
   * folded again, from its checkpoint.
   */
  const refoldGrown = (file: string) => {
    const id = logIdOf(file)
    if (!sessions.has(id) || tails.has(id) || isArchived(file)) return
    const logPath = path.join(paths.sessions, file)
    if (!existsSync(logPath) || statSync(logPath).size === logs.get(id)!.bytes) return
    track(file)
    onChange()
  }

  /** The directory changes on every append; only a newly tracked log or a log archived changes the system. */
  const trackNew = () => {
    let changed = false
    for (const file of logFilesIn(readdirSync(paths.sessions))) {
      const id = logIdOf(file)
      if (!sessions.has(id)) {
        track(file)
        changed ||= sessions.has(id)
      } else if (logs.get(id)!.archived !== isArchived(file)) {
        tails.get(id)?.()
        tails.delete(id)
        logs.set(id, { archived: isArchived(file), bytes: statSync(path.join(paths.sessions, file)).size })
        changed = true
      }
    }
    if (changed) onChange()
  }

  /**
   * Changes under the collections directory are rescanned once they settle: a rescan stats every item, and saving
   * one file or writing many raises an event per step.
   */
  let rescanTimer: NodeJS.Timeout | undefined
  const scheduleRescan = () => {
    rescanTimer ??= setTimeout(
      logged('collections', () => {
        rescanTimer = undefined
        const next = scanCollections(paths)
        if (asJson(next) === asJson(items)) return
        items = next
        threads = threadsIn(paths, items, threads)
        onChange()
      }),
      RESCAN_DEBOUNCE_MS,
    )
  }

  /** Every read below that fails keeps its last read, and the failure goes to the tower's log: the next poll reads again. */
  const refreshLive = loggedRead('host', async () => {
    const next = await hostLive(paths)
    if (asJson(next) === asJson(live)) return
    live = next
    onChange()
  })

  const refreshShells = loggedRead('terms daemon', async () => {
    const next = await termsShells(paths)
    if (asJson(next) === asJson(shells)) return
    shells = next
    onChange()
  })

  const refreshRunning = serially(loggedRead('processes', async () => {
    const scan = await scanProcesses()
    const next = { running: await resourcesIn(scan), peers: peersIn(scan) }
    if (asJson(next) === asJson({ running, peers })) return
    running = next.running
    peers = next.peers
    onChange()
  }))

  /**
   * A dir git fails to read keeps its last read, and the failure goes to the tower's log. A config the tower can't
   * read keeps every last read: the board says what to fix.
   */
  const refreshRepos = serially(loggedRead('git', async () => {
    let config: Config
    try {
      config = readConfig(paths.config)
    } catch (err) {
      if (err instanceof ConfigError) return
      throw err
    }
    const dirs = [...new Set(Object.values(config.projects).flatMap(projectDirs))]
    const next = new Map<string, RepoRead>()
    for (const [i, read] of (await Promise.allSettled(dirs.map(readRepo))).entries()) {
      if (read.status === 'fulfilled') next.set(dirs[i], read.value)
      else {
        console.error(`git in ${dirs[i]}:`, read.reason)
        if (repos.has(dirs[i])) next.set(dirs[i], repos.get(dirs[i])!)
      }
    }
    if (asJson(next) === asJson(repos)) return
    repos = next
    onChange()
  }))

  /** The machine is read only while someone observes it: a scan of every process and every repo's git costs about 0.6 s. */
  let observers = 0
  let machinePolls: NodeJS.Timeout[] = []
  let machineRead: Promise<unknown> = Promise.resolve()
  const observe = async (): Promise<() => void> => {
    if (observers++ === 0) {
      machineRead = Promise.all([refreshRunning(), refreshRepos()])
      machinePolls = [setInterval(refreshRunning, MACHINE_POLL_MS), setInterval(refreshRepos, MACHINE_POLL_MS)]
    }
    await machineRead
    let released = false
    return () => {
      if (released) return
      released = true
      if (--observers === 0) machinePolls.forEach(clearInterval)
    }
  }

  trackNew()
  watchedOrExit(
    watch(
      paths.sessions,
      logged('sessions', (_: string, file: string | null) => {
        if (file && logFilesIn([file]).length) refoldGrown(file)
        trackNew()
      }),
    ),
    paths.sessions,
  )
  mkdirSync(paths.collections, { recursive: true })
  items = scanCollections(paths)
  threads = threadsIn(paths, items, threads)
  watchedOrExit(watch(paths.collections, { recursive: true }, scheduleRescan), paths.collections)
  watchedOrExit(watch(path.dirname(paths.config), logged('config', (_: string, file: string | null) => file === path.basename(paths.config) && onChange())), paths.config)
  await refreshLive()
  await refreshShells()
  setInterval(refreshLive, LIVE_POLL_MS)
  setInterval(refreshShells, LIVE_POLL_MS)

  return {
    sessions: () => [...sessions.values()].sort((a, b) => b.header.startedAt - a.header.startedAt),
    session: (id) => sessions.get(id),
    logs: () => logs,
    items: () => items,
    threads: () => threads,
    live: () => live,
    running: () => running,
    peers: () => peers,
    shells: () => shells,
    repos: () => repos,
    refreshLive,
    tracked: (id, ms) =>
      sessions.has(id)
        ? Promise.resolve()
        : new Promise((resolve) => {
            const done = () => (awaited.delete(id), clearTimeout(timer), resolve())
            const timer = setTimeout(done, ms)
            awaited.set(id, done)
          }),
    refreshRunning,
    refreshShells,
    refreshRepos,
    observe,
  }
}
