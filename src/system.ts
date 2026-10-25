/**
 * A running view of the whole system: every session folded from its log and kept current as the host appends
 * to it, every probe's stream folded, every policy parsed and each project's policy facts folded, the items of every collection, the host's live set, the terms daemon's shells,
 * what sessions left running on the machine, and what git says about the tower's worktrees in every project dir.
 */
import { once } from 'node:events'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { factsAfter, type Session } from './bridge/facts.ts'
import { foldLog } from './checkpoints.ts'
import { probeFacts, readingsOf, type ProbeFacts, type ProbeReading, type StreamFile } from './bridge/probes.ts'
import { APPROVALS_STREAM, policyFacts, RUNS_STREAM, type PolicyFacts, type PolicyFile } from './bridge/policies.ts'
import { hashOf, parsePolicy } from './bridge/policy-file.ts'
import { streamFacts, type StreamFact, type StreamText } from './bridge/streams.ts'
import { frozen } from './bridge/frozen.ts'
import type { Peer, Resource } from './bridge/resources.ts'
import type { RepoRead } from './bridge/worktrees.ts'
import { readItem, scanCollections } from './collections.ts'
import { hostLive, peersIn, resourcesIn, scanProcesses, termsShells } from './machine.ts'
import { ConfigError, projectDirs, type CollectionItem, type Config } from './shared/model.ts'
import { projectsStreamsPath, systemStreamsPath, type SystemPaths } from './shared/paths.ts'
import { POLICIES } from './shared/policies.ts'
import type { HostLive } from './shared/protocol.ts'
import { parseThread, REVIEWS, type ReviewThread } from './shared/reviews.ts'
import type { Shell } from './shared/terms.ts'
import type { LogFile, StreamMonth } from './bridge/retention.ts'
import { factEvents, isArchived, logBytes, logFilesIn, logIdOf, tailLog } from './tail.ts'
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

/** Each item of the policies collections, parsed and hashed: a file `held` at the same version is not read again. */
const policyFilesIn = (paths: SystemPaths, items: CollectionItem[], held: PolicyFile[]): PolicyFile[] =>
  items
    .filter((i) => i.collection === POLICIES)
    .flatMap(({ project, id, modifiedAt }) => {
      const same = held.find((p) => p.project === project && p.id === id && p.modifiedAt === modifiedAt)
      if (same) return [same]
      const text = readItem(paths, project, POLICIES, id)
      return text === undefined ? [] : [{ project, id, modifiedAt, hash: hashOf(text), parsed: parsePolicy(text) }]
    })

const PROBE_STREAM = /^probe\.([\w-]+)$/
const MONTH_FILE = /^\d{4}-\d{2}\.jsonl(\.gz)?$/

/** A stream file's reads, as of its size. */
type HeldStream = StreamFile & { bytes: number }

/** A stream file read again, archived or plain: lines that are no JSON are passed over, and the tower's log says so. */
const readStream = (file: string, bytes: number): HeldStream => {
  const read = readingsOf(logBytes(file).toString('utf8'))
  if (read.unreadable) console.error(`${file}: ${read.unreadable} line(s) are no JSON, each a read passed over`)
  return { ...read, bytes }
}

/** A stream file's facts, as of its size. */
type HeldFacts = StreamText & { bytes: number }

const readFacts = (file: string, bytes: number): HeldFacts => {
  const read = streamFacts(logBytes(file).toString('utf8'))
  if (read.unreadable) console.error(`${file}: ${read.unreadable} line(s) are no JSON, each a fact passed over`)
  return { ...read, bytes }
}

/** One stream's facts, from its month files in order, each read again only once its size changed. */
const streamIn = (dir: string, held: Map<string, HeldFacts>, files: Map<string, HeldFacts>): StreamFact[] =>
  existsSync(dir)
    ? logFilesIn(readdirSync(dir).filter((f) => MONTH_FILE.test(f)))
        .sort()
        .flatMap((f) => {
          const file = path.join(dir, f)
          const bytes = statSync(file).size
          const read = held.get(file)?.bytes === bytes ? held.get(file)! : readFacts(file, bytes)
          files.set(file, read)
          return read.facts
        })
    : []

/** Each project's policy facts, from its `runs` and `approvals` streams, and the files as read. */
const policyStreamsIn = (root: string, held: Map<string, HeldFacts>): { facts: Map<string, PolicyFacts>; files: Map<string, HeldFacts> } => {
  const files = new Map<string, HeldFacts>()
  const facts = new Map(
    readdirSync(root).map((project) => [
      project,
      policyFacts(streamIn(path.join(root, project, RUNS_STREAM), held, files), streamIn(path.join(root, project, APPROVALS_STREAM), held, files)),
    ]),
  )
  return { facts, files }
}

/**
 * Each probe's stream, by probe name, from its month files in order (while Tidy archives a month both its files are
 * there, and the plain one is read), and the files as read: a file `held` at the same size is not read again.
 */
const probeStreamsIn = (root: string, held: Map<string, HeldStream>): { streams: Map<string, ProbeReading[]>; files: Map<string, HeldStream> } => {
  const files = new Map<string, HeldStream>()
  const streams = new Map<string, ProbeReading[]>()
  for (const stream of readdirSync(root)) {
    const name = PROBE_STREAM.exec(stream)?.[1]
    if (!name) continue
    const readings = logFilesIn(readdirSync(path.join(root, stream)).filter((f) => MONTH_FILE.test(f)))
      .sort()
      .flatMap((f) => {
        const file = path.join(root, stream, f)
        const bytes = statSync(file).size
        const read = held.get(file)?.bytes === bytes ? held.get(file)! : readStream(file, bytes)
        files.set(file, read)
        return read.readings
      })
    streams.set(name, readings)
  }
  return { streams, files }
}

/**
 * Every stream's month files under `streams/`, the system's (`system/<stream>/`) and each project's
 * (`projects/<project>/<stream>/`), whoever writes them: the core's and the extensions' alike. Read by size only.
 */
const streamMonthsIn = (paths: SystemPaths): StreamMonth[] => {
  const streamDirs = (root: string) => readdirSync(root, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? [path.join(root, d.name)] : []))
  const dirs = [...streamDirs(systemStreamsPath(paths)), ...streamDirs(projectsStreamsPath(paths)).flatMap(streamDirs)]
  return dirs.flatMap((dir) =>
    logFilesIn(readdirSync(dir).filter((f) => MONTH_FILE.test(f))).map((f) => {
      const file = path.join(dir, f)
      return { file: path.relative(paths.streams, file), archived: isArchived(file), bytes: statSync(file).size }
    }),
  )
}

/** A stream folded as its facts arrive: `system`'s one, or each project's. */
export type StreamFold = { stream: string; scope: 'system' | 'project'; init: unknown; step: (state: unknown, fact: StreamFact) => unknown; label: string }

/** Where a fold stands on one stream: its state after `count` facts, and why the fact after them threw, while it does. */
type Folded = { state: unknown; count: number; threw?: string }


/**
 * The fold of one stream from where it stood: a stream only grows, so only facts past `count` are stepped; one that
 * holds fewer facts (a month removed by hand) is folded again from `init`. A step that throws stops the fold before
 * that fact, to be tried again when the stream grows.
 */
const foldOn = (fold: StreamFold, facts: StreamFact[], held: Folded | undefined): Folded => {
  const from = held && facts.length >= held.count ? held : { state: frozen(fold.init), count: 0 }
  let { state, count } = from
  for (const fact of facts.slice(count)) {
    try {
      state = frozen(fold.step(state, fact))
      count++
    } catch (err) {
      const frozenState = err instanceof TypeError && Object.isFrozen(state) && typeof state === 'object' && state !== null
      const why = `a fact of ${fold.stream} threw in its reduce, and the fold stops before it${frozenState ? ' (step gets a frozen state: it returns a new one)' : ''}`
      console.error(`${fold.label}: ${why}:`, err)
      return { state, count, threw: `${why}: ${(err as Error).message}` }
    }
  }
  return { state, count }
}

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
  /** Every item of the policies collections, parsed and hashed, read again when its file changes. */
  policies: () => PolicyFile[]
  /** Each project's policy facts, by project, from its `runs` and `approvals` streams, read again when they grow. */
  policyFacts: () => Map<string, PolicyFacts>
  /** Each probe's stream folded, by probe name, read again when it grows. */
  probes: () => Map<string, ProbeFacts>
  /** A probe's reads, oldest first: none for a probe with no stream. */
  probeReads: (name: string) => ProbeReading[]
  /** Every stream's month files on disk, by path under `streams/`. */
  streamMonths: () => StreamMonth[]
  /**
   * Folds a stream as its facts arrive until `stop`: `state` is the system's, or a project's, frozen; `init` before any
   * fact; `threw`, each fold stopped before a fact its step threw on, and why. A fold that moves is a change.
   */
  foldStream: (fold: StreamFold) => { state: (project?: string) => unknown; threw: () => { project?: string; message: string }[]; stop: () => void }
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
  /** Resolves once `holds` is true of the system, checked now and after each change, or after `ms`. */
  until: (holds: () => boolean, ms: number) => Promise<void>
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
  /** Stops watching: every watcher closed, every tail stopped, every poll and timer cleared, the git reader ended. */
  stop: () => Promise<void>
}

/**
 * `onChange` is called after anything the system holds changes: a logged event, a probe's read, a collection's items, the live set,
 * the shells, the processes, git, or the config file.
 */
export const watchSystem = async (paths: SystemPaths, notify: () => void): Promise<System> => {
  /** Each `until` waiting: its check, and how it is done. */
  const waiters = new Map<() => void, () => void>()
  const onChange = () => {
    notify()
    for (const check of waiters.keys()) check()
  }
  const watchers: FSWatcher[] = []
  const sessions = new Map<string, Session>()
  const logs = new Map<string, LogFile>()
  /** Each tailed log's stop, by session id, until its session exits or its log is archived. */
  const tails = new Map<string, () => void>()
  let items: CollectionItem[] = []
  let threads: ThreadFile[] = []
  let policyFiles: PolicyFile[] = []
  let policyStreamFiles = new Map<string, HeldFacts>()
  let policies = new Map<string, PolicyFacts>()
  let streamFiles = new Map<string, HeldStream>()
  let streamMonths: StreamMonth[] = []
  let probeStreams = new Map<string, ProbeReading[]>()
  let probes = new Map<string, ProbeFacts>()
  let live: HostLive | undefined
  let running: Resource[] = []
  let peers: Peer[] = []
  let shells: Shell[] | undefined
  let repos = new Map<string, RepoRead>()
  const awaited = new Map<string, () => void>()
  /** Each stream fold: its files as read, and where it stands, by project (`''` for the system's). */
  const folds = new Map<StreamFold, { files: Map<string, HeldFacts>; at: Map<string, Folded> }>()

  /** Folds `fold` on to what its stream holds now; whether it moved. */
  const refold = (fold: StreamFold): boolean => {
    const held = folds.get(fold)!
    const files = new Map<string, HeldFacts>()
    const dirs: [string, string][] =
      fold.scope === 'system'
        ? [['', path.join(systemStreamsPath(paths), fold.stream)]]
        : readdirSync(projectsStreamsPath(paths)).map((project) => [project, path.join(projectsStreamsPath(paths), project, fold.stream)])
    let moved = false
    const at = new Map(
      dirs.flatMap(([key, dir]) => {
        if (!existsSync(dir)) return []
        const before = held.at.get(key)
        const next = foldOn(fold, streamIn(dir, held.files, files), before)
        moved ||= next.count !== before?.count || next.state !== before?.state
        return [[key, next] as const]
      }),
    )
    folds.set(fold, { files, at })
    return moved
  }

  const refoldAll = (scope: StreamFold['scope']) => {
    let moved = false
    for (const fold of folds.keys()) if (fold.scope === scope) moved = refold(fold) || moved
    if (moved) onChange()
  }

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
    if (session.facts.state.status === 'exited' || session.facts.broken || session.facts.letGoAt !== undefined || isArchived(logPath)) return
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
      const done = !('unreadable' in event) && event[1] === 'x'
      if (done || facts.letGoAt !== undefined) {
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
        policyFiles = policyFilesIn(paths, items, policyFiles)
        onChange()
      }),
      RESCAN_DEBOUNCE_MS,
    )
  }

  /** A probe's read appends a line: its stream is folded again once the write settles. */
  let streamsTimer: NodeJS.Timeout | undefined
  const rescanStreams = () => {
    const next = probeStreamsIn(systemStreamsPath(paths), streamFiles)
    const nextProbes = new Map([...next.streams].map(([name, readings]) => [name, probeFacts(readings)]))
    const filesBefore = [...streamFiles.keys()]
    streamFiles = next.files
    probeStreams = next.streams
    if (asJson(nextProbes) === asJson(probes) && asJson([...streamFiles.keys()]) === asJson(filesBefore)) return
    probes = nextProbes
    onChange()
  }
  /** Any stream's line or file, the extensions' too, moves the month files Tidy lists. */
  const rescanMonths = () => {
    const next = streamMonthsIn(paths)
    if (asJson(next) === asJson(streamMonths)) return
    streamMonths = next
    onChange()
  }
  const scheduleStreams = () => {
    streamsTimer ??= setTimeout(logged('streams', () => ((streamsTimer = undefined), rescanStreams(), refoldAll('system'), rescanMonths())), RESCAN_DEBOUNCE_MS)
  }

  /** A policy's fact appends a line: its project's streams are folded again once the write settles. */
  let policyStreamsTimer: NodeJS.Timeout | undefined
  const rescanPolicyStreams = () => {
    const next = policyStreamsIn(projectsStreamsPath(paths), policyStreamFiles)
    const filesBefore = [...policyStreamFiles.keys()]
    policyStreamFiles = next.files
    if (asJson(next.facts) === asJson(policies) && asJson([...policyStreamFiles.keys()]) === asJson(filesBefore)) return
    policies = next.facts
    onChange()
  }
  const schedulePolicyStreams = () => {
    policyStreamsTimer ??= setTimeout(logged('policy streams', () => ((policyStreamsTimer = undefined), rescanPolicyStreams(), refoldAll('project'), rescanMonths())), RESCAN_DEBOUNCE_MS)
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
   * Git is read on a thread of its own (`repo-reader.ts`): starting a process holds its thread's event loop about 3 ms
   * on macOS, and one read of every project dir starts hundreds, which on this thread held back every keystroke and
   * screen the tower relays. A reader that fails is started again on the next read.
   */
  let reader: Worker | undefined
  /** Once stopped, no read starts a reader again. */
  let stopped = false
  const readRepos = async (dirs: string[]): Promise<PromiseSettledResult<RepoRead>[]> => {
    if (!reader) {
      reader = new Worker(new URL('./repo-reader.ts', import.meta.url))
      reader.unref()
    }
    const ended = new AbortController()
    const exited = once(reader, 'exit', { signal: ended.signal }).then(([code]) => {
      throw new Error(`the git reader exited (${code}) before it answered`)
    })
    const reply = Promise.race([once(reader, 'message', { signal: ended.signal }), exited])
    reader.postMessage(dirs)
    try {
      return (await reply)[0]
    } catch (err) {
      reader = undefined
      throw err
    } finally {
      ended.abort()
    }
  }

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
    if (stopped) return
    const dirs = [...new Set(Object.values(config.projects).flatMap(projectDirs))]
    const next = new Map<string, RepoRead>()
    for (const [i, read] of (await readRepos(dirs)).entries()) {
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
  const watching = (watcher: FSWatcher, what: string) => watchers.push(watchedOrExit(watcher, what))
  watching(
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
  policyFiles = policyFilesIn(paths, items, policyFiles)
  watching(watch(paths.collections, { recursive: true }, scheduleRescan), paths.collections)
  mkdirSync(systemStreamsPath(paths), { recursive: true })
  rescanStreams()
  watching(watch(systemStreamsPath(paths), { recursive: true }, scheduleStreams), systemStreamsPath(paths))
  mkdirSync(projectsStreamsPath(paths), { recursive: true })
  rescanPolicyStreams()
  rescanMonths()
  watching(watch(projectsStreamsPath(paths), { recursive: true }, schedulePolicyStreams), projectsStreamsPath(paths))
  watching(watch(path.dirname(paths.config), logged('config', (_: string, file: string | null) => file === path.basename(paths.config) && onChange())), paths.config)
  await refreshLive()
  await refreshShells()
  const livePolls = [setInterval(refreshLive, LIVE_POLL_MS), setInterval(refreshShells, LIVE_POLL_MS)]

  return {
    sessions: () => [...sessions.values()].sort((a, b) => b.header.startedAt - a.header.startedAt),
    session: (id) => sessions.get(id),
    logs: () => logs,
    items: () => items,
    threads: () => threads,
    policies: () => policyFiles,
    policyFacts: () => policies,
    probes: () => probes,
    foldStream: (fold) => {
      folds.set(fold, { files: new Map(), at: new Map() })
      refold(fold)
      return {
        state: (project) => (folds.get(fold)?.at.get(project ?? '')?.state ?? frozen(fold.init)),
        threw: () => [...(folds.get(fold)?.at ?? [])].flatMap(([key, { threw }]) => (threw === undefined ? [] : [{ ...(key && { project: key }), message: threw }])),
        stop: () => void folds.delete(fold),
      }
    },
    probeReads: (name) => probeStreams.get(name) ?? [],
    streamMonths: () => streamMonths,
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
    until: (holds, ms) =>
      new Promise((resolve) => {
        const done = () => (waiters.delete(check), clearTimeout(timer), resolve())
        const check = () => holds() && done()
        const timer = setTimeout(done, ms)
        waiters.set(check, done)
        check()
      }),
    refreshRunning,
    refreshShells,
    refreshRepos,
    observe,
    stop: async () => {
      stopped = true
      for (const watcher of watchers) watcher.close()
      for (const stopTail of tails.values()) stopTail()
      tails.clear()
      ;[...livePolls, ...machinePolls].forEach(clearInterval)
      ;[rescanTimer, streamsTimer, policyStreamsTimer].forEach(clearTimeout)
      for (const done of [...awaited.values()]) done()
      for (const done of [...waiters.values()]) done()
      const ending = reader
      reader = undefined
      await ending?.terminate()
    },
  }
}
