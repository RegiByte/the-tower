/**
 * A running view of the whole system: every session folded from its log and kept current as the host appends
 * to it, every stream an extension folds kept current, the items of every collection, the host's live set, the terms daemon's shells,
 * the jobs log and the jobs the jobs daemon holds, what sessions left running on the machine, and what git says about the tower's worktrees in every project dir.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { factsAfter, type Session } from './bridge/facts.ts'
import { foldLog } from './checkpoints.ts'
import { streamFacts, type StreamFact, type StreamText } from './bridge/streams.ts'
import { frozen } from './bridge/frozen.ts'
import type { Peer, Resource } from './bridge/resources.ts'
import type { RepoRead } from './bridge/worktrees.ts'
import { scanCollections } from './collections.ts'
import { watchRepos, type RepoAsk } from './repo-watch.ts'
import type { RepoReading } from './worktrees.ts'
import { heldJobs, hostLive, peersIn, resourcesIn, scanProcesses, termsShells } from './machine.ts'
import { ConfigError, projectDirs, type CollectionItem, type Config } from './shared/model.ts'
import { projectsStreamsPath, systemStreamsPath } from './shared/paths.ts'
import type { SystemPaths } from './shared/model.ts'
import type { HostLive } from './shared/protocol.ts'
import type { Shell } from './shared/terms.ts'
import type { HeldJob } from './shared/jobs.ts'
import { jobsOf, type JobRecord } from './bridge/jobs.ts'
import type { LogFile, StreamMonth } from './bridge/retention.ts'
import { factEvents, isArchived, logBytes, logFilesIn, logIdOf, tailLog } from './tail.ts'
import { exitUnwatched, logged, loggedRead, serially, watchedOrExit } from './logged.ts'
import { thrownWords } from './shared/thrown.ts'
import { subscribe, type Subscription } from './subscribe.ts'

const LIVE_POLL_MS = 1000
const MACHINE_POLL_MS = 5000

/** The git reader's thread, and each read it has yet to answer by the id it was asked with. */
type Reader = { worker: Worker; unanswered: Map<number, (reading: PromiseSettledResult<RepoReading>) => void> }
const RESCAN_DEBOUNCE_MS = 100

/** A value as JSON, Sets and Maps as arrays, so two reads compare by what they hold. */
const asJson = (value: unknown): string | undefined =>
  JSON.stringify(value, (_, v) => (v instanceof Set ? [...v].sort() : v instanceof Map ? [...v] : v))

/** The file's text: a file gone, or one that can't be read, is a config error naming it. */
const configText = (file: string): string => {
  try {
    return readFileSync(file, 'utf8')
  } catch (err) {
    const { code, message } = err as NodeJS.ErrnoException
    throw new ConfigError(code === 'ENOENT' ? `${file} is gone: put it back, or \`tower init\` writes a first one` : `${file} can't be read: ${message}`)
  }
}

/** The config as the file holds it now; a file it can't read, or JSON it can't parse, is a config error naming the file. */
export const readConfig = (file: string): Config => {
  const text = configText(file)
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new ConfigError(`${file} is not valid JSON: ${(err as Error).message}`)
  }
}

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isCommand = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every((arg) => typeof arg === 'string')

/** Either the legacy array shape, or a non-empty object of named, non-empty commands. */
export const validArgv = (value: unknown): boolean => isCommand(value) || (isObject(value) && Object.keys(value).length > 0 && Object.values(value).every(isCommand))

/** What `config` lacks of the keys every read of it stands on, `undefined` when it has them. */
export const configLack = (config: Config): string | undefined => {
  if (!isObject(config)) return 'it holds no JSON object'
  if (!validArgv(config.argv)) return 'argv must name the command sessions start with, such as ["claude"]'
  if (!isObject(config.projects)) return 'projects must be an object of floors, each with name, hub and repos'
  for (const [id, project] of Object.entries(config.projects)) {
    if (!isObject(project)) return `projects.${id} must be an object with name, hub and repos`
    if (typeof project.hub !== 'string') return `projects.${id}.hub must be the path of a directory`
    if (!Array.isArray(project.repos) || !project.repos.every((repo) => typeof repo === 'string')) return `projects.${id}.repos must be a list of directories, [] for none`
  }
  return undefined
}

/**
 * The config as the running tower takes it: one short of what every read stands on is a config error the board says.
 * `readConfig` stays the plain read, so `tower down`, `tower config check` and the config verbs reach a config the
 * tower can't take.
 */
export const takenConfig = (file: string): Config => {
  const config = readConfig(file)
  const lacking = configLack(config)
  if (lacking) throw new ConfigError(`${file}: ${lacking}. \`tower config check\` names every problem`)
  return config
}

const MONTH_FILE = /^\d{4}-\d{2}\.jsonl(\.gz)?$/

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

/**
 * Every stream's month files under `streams/`, the system's (`system/<stream>/`) and each project's
 * (`projects/<project>/<stream>/`), whoever writes them: the core's and the extensions' alike; and the jobs log's,
 * as `jobs/<month>`. Read by size only.
 */
const streamMonthsIn = (paths: SystemPaths): StreamMonth[] => {
  const streamDirs = (root: string) => readdirSync(root, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? [path.join(root, d.name)] : []))
  const dirs = [...streamDirs(systemStreamsPath(paths)), ...streamDirs(projectsStreamsPath(paths)).flatMap(streamDirs)]
  const monthsIn = (dir: string, named: (file: string) => string) =>
    logFilesIn(readdirSync(dir).filter((f) => MONTH_FILE.test(f))).map((f) => {
      const file = path.join(dir, f)
      return { file: named(file), archived: isArchived(file), bytes: statSync(file).size }
    })
  return [...dirs.flatMap((dir) => monthsIn(dir, (file) => path.relative(paths.streams, file))), ...monthsIn(paths.jobs, (file) => path.join('jobs', path.basename(file)))]
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
      return { state, count, threw: `${why}: ${thrownWords(err)}` }
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
  /** Every job the jobs log holds, as last read: a log the fold can't read keeps the last read, and the tower's log says why. */
  jobs: () => JobRecord[]
  /** The jobs the jobs daemon holds; `undefined` while it isn't running. */
  heldJobs: () => HeldJob[] | undefined
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
  /** Read the jobs log and ask the jobs daemon again now, after a request that changed its jobs. */
  refreshJobs: () => Promise<void>
  /** Read every project dir's git again now, after a request that changed its worktrees or branches. */
  refreshRepos: () => Promise<void>
  /** Take the config again now, as a change to its file would, after the tower wrote it. */
  refreshConfig: () => void
  /**
   * Keeps `running` and `peers` current, re-read every 5 s, and `repos`, read as their git changes (`repo-watch.ts`),
   * until the returned function is called; nobody observing, they are not read or watched at all. Resolves once they
   * are current: the first observer after none reads them now.
   */
  observe: () => Promise<() => void>
  /** Observes as `observe` does from now, not waiting: `release` ends it, and `read` settles with that first read. */
  watchMachine: () => { release: () => void; read: Promise<unknown> }
  /** Stops watching: every watcher closed, every tail stopped, every poll and timer cleared, the git reader ended. */
  stop: () => Promise<void>
}

/**
 * `onChange` is called after anything the system holds changes: a logged event, a stream's fact, a collection's items, the live set,
 * the shells, the jobs log or the daemon's jobs, the processes, git, or the config file.
 */
export const watchSystem = async (paths: SystemPaths, notify: () => void): Promise<System> => {
  /** Each `until` waiting: its check, and how it is done. */
  const waiters = new Map<() => void, () => void>()
  const onChange = () => {
    notify()
    for (const check of waiters.keys()) check()
  }
  const watchers: FSWatcher[] = []
  const subscriptions: Subscription[] = []
  const sessions = new Map<string, Session>()
  const logs = new Map<string, LogFile>()
  /** Each tailed log's stop, by session id, until its session exits or its log is archived. */
  const tails = new Map<string, () => void>()
  let items: CollectionItem[] = []
  let streamMonths: StreamMonth[] = []
  let live: HostLive | undefined
  let running: Resource[] = []
  let peers: Peer[] = []
  let shells: Shell[] | undefined
  let jobs: JobRecord[] = []
  let jobFiles = new Map<string, HeldFacts>()
  let held: HeldJob[] | undefined
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
        onChange()
      }),
      RESCAN_DEBOUNCE_MS,
    )
  }

  /** A system stream's fact appends a line: its folds step on once the write settles. */
  let streamsTimer: NodeJS.Timeout | undefined
  /** Any stream's line or file, the extensions' too, moves the month files Tidy lists. */
  const rescanMonths = () => {
    const next = streamMonthsIn(paths)
    if (asJson(next) === asJson(streamMonths)) return
    streamMonths = next
    onChange()
  }
  const scheduleStreams = () => {
    streamsTimer ??= setTimeout(logged('streams', () => ((streamsTimer = undefined), refoldAll('system'), rescanMonths())), RESCAN_DEBOUNCE_MS)
  }

  /** A project stream's fact appends a line: the project streams are folded again once the write settles. */
  let projectStreamsTimer: NodeJS.Timeout | undefined
  const scheduleProjectStreams = () => {
    projectStreamsTimer ??= setTimeout(logged('project streams', () => ((projectStreamsTimer = undefined), refoldAll('project'), rescanMonths())), RESCAN_DEBOUNCE_MS)
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

  /** The jobs daemon appends a line per fact: the log is read again once the write settles, each month file only once its size changed. */
  let jobsTimer: NodeJS.Timeout | undefined
  const readJobs = logged('jobs log', () => {
    const files = new Map<string, HeldFacts>()
    const next = jobsOf(streamIn(paths.jobs, jobFiles, files))
    jobFiles = files
    if (asJson(next) === asJson(jobs)) return
    jobs = next
    onChange()
  })
  const scheduleJobs = () => {
    jobsTimer ??= setTimeout(() => ((jobsTimer = undefined), readJobs(), logged('streams', rescanMonths)()), RESCAN_DEBOUNCE_MS)
  }

  /** The jobs daemon logs a job's start before it answers, so after a request the log is read too, not left to the watch. */
  const refreshJobs = loggedRead('jobs daemon', async () => {
    readJobs()
    const next = await heldJobs(paths)
    if (asJson(next) === asJson(held)) return
    held = next
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
  let reader: Reader | undefined
  /** Once stopped, no read starts a reader again. */
  let stopped = false
  let lastAsk = 0
  const startReader = (): Reader => {
    const worker = new Worker(new URL('./repo-reader.ts', import.meta.url))
    worker.unref()
    const started: Reader = { worker, unanswered: new Map() }
    const failed = (err: Error) => {
      if (reader === started) reader = undefined
      for (const answer of started.unanswered.values()) answer({ status: 'rejected', reason: err })
      started.unanswered.clear()
    }
    worker.on('message', ({ id, reading }: { id: number; reading: PromiseSettledResult<RepoReading> }) => {
      started.unanswered.get(id)!(reading)
      started.unanswered.delete(id)
    })
    worker.on('error', failed)
    worker.on('exit', (code) => failed(new Error(`the git reader exited (${code}) before it answered`)))
    return started
  }
  const readRepo = (ask: RepoAsk) =>
    new Promise<PromiseSettledResult<RepoReading>>((answer) => {
      reader ??= startReader()
      const id = ++lastAsk
      reader.unanswered.set(id, answer)
      reader.worker.postMessage({ id, ask })
    })

  /**
   * A dir git fails to read keeps its last read, and the failure goes to the tower's log. A config the tower can't
   * read keeps every last read: the board says what to fix.
   */
  const configDirs = (): string[] | undefined => {
    if (stopped) return undefined
    try {
      return [...new Set(Object.values(takenConfig(paths.config).projects).flatMap(projectDirs))]
    } catch (err) {
      if (err instanceof ConfigError) return undefined
      throw err
    }
  }
  const startedWithin = (from: number, to: number) => [...sessions.values()].some(({ header }) => header.startedAt > from && header.startedAt <= to)
  const repoWatch = watchRepos(configDirs, readRepo, startedWithin, onChange)
  const refreshRepos = repoWatch.refresh

  /** The processes are scanned, and the repos' git watched and read, only while someone observes the machine. */
  let observers = 0
  let machinePolls: NodeJS.Timeout[] = []
  let machineRead: Promise<unknown> = Promise.resolve()
  const watchMachine = () => {
    if (observers++ === 0) {
      machineRead = Promise.all([refreshRunning(), repoWatch.start()])
      machinePolls = [setInterval(refreshRunning, MACHINE_POLL_MS)]
    }
    let released = false
    const release = () => {
      if (released) return
      released = true
      if (--observers === 0) {
        machinePolls.forEach(clearInterval)
        repoWatch.pause()
      }
    }
    return { release, read: machineRead }
  }
  const observe = async (): Promise<() => void> => {
    const { release, read } = watchMachine()
    try {
      await read
    } catch (err) {
      release()
      throw err
    }
    return release
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
  /** Watches `dir`'s tree, made if missing; resolves once watching. */
  const subscribed = async (dir: string, changed: () => void) => {
    mkdirSync(dir, { recursive: true })
    subscriptions.push(await subscribe(realpathSync(dir), [], changed, exitUnwatched(dir)))
  }
  await subscribed(paths.collections, scheduleRescan)
  items = scanCollections(paths)
  await subscribed(systemStreamsPath(paths), scheduleStreams)
  await subscribed(projectsStreamsPath(paths), scheduleProjectStreams)
  await subscribed(paths.jobs, scheduleJobs)
  readJobs()
  rescanMonths()
  const configChanged = () => {
    repoWatch.reconcile()
    onChange()
  }
  /** Watches the folder holding `file` for changes to it. */
  const watchingConfig = (file: string) =>
    watching(watch(path.dirname(file), logged('config', (_: string, changed: string | null) => changed === path.basename(file) && configChanged())), file)
  watchingConfig(paths.config)
  /** A config that is a link is written in its target's folder, which a watch of the link's folder doesn't see. */
  const target = realpathSync(paths.config)
  if (path.dirname(target) !== realpathSync(path.dirname(paths.config))) watchingConfig(target)
  await refreshLive()
  await refreshShells()
  await refreshJobs()
  const livePolls = [setInterval(refreshLive, LIVE_POLL_MS), setInterval(refreshShells, LIVE_POLL_MS), setInterval(refreshJobs, LIVE_POLL_MS)]

  return {
    sessions: () => [...sessions.values()].sort((a, b) => b.header.startedAt - a.header.startedAt),
    session: (id) => sessions.get(id),
    logs: () => logs,
    items: () => items,
    foldStream: (fold) => {
      folds.set(fold, { files: new Map(), at: new Map() })
      refold(fold)
      return {
        state: (project) => (folds.get(fold)?.at.get(project ?? '')?.state ?? frozen(fold.init)),
        threw: () => [...(folds.get(fold)?.at ?? [])].flatMap(([key, { threw }]) => (threw === undefined ? [] : [{ ...(key && { project: key }), message: threw }])),
        stop: () => void folds.delete(fold),
      }
    },
    streamMonths: () => streamMonths,
    live: () => live,
    running: () => running,
    peers: () => peers,
    shells: () => shells,
    jobs: () => jobs,
    heldJobs: () => held,
    repos: repoWatch.repos,
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
    refreshJobs,
    refreshRepos,
    refreshConfig: configChanged,
    observe,
    watchMachine,
    stop: async () => {
      stopped = true
      repoWatch.pause()
      for (const watcher of watchers) watcher.close()
      await Promise.all(subscriptions.map((s) => s.close()))
      for (const stopTail of tails.values()) stopTail()
      tails.clear()
      ;[...livePolls, ...machinePolls].forEach(clearInterval)
      ;[rescanTimer, streamsTimer, projectStreamsTimer, jobsTimer].forEach(clearTimeout)
      for (const done of [...awaited.values()]) done()
      for (const done of [...waiters.values()]) done()
      const ending = reader
      reader = undefined
      await ending?.worker.terminate()
    },
  }
}
