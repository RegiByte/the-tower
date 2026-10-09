import { mirrorOf, snapshot, type Mirror } from '../bridge/screen.ts'
import type { LogEvent } from '../shared/model.ts'
import { logSize, readLog, screenEvents, tailLog } from '../tail.ts'

/** What a viewer of a screen is sent: the snapshot once, then each `o`, `r` and `x` event as it is logged. */
export type ScreenViewer = { snapshot: (data: string) => void; event: (event: LogEvent) => void }

/** A screen's viewers: one waiting for its snapshot holds the events logged meanwhile, sent once the snapshot is. */
type Viewer = ScreenViewer & { held?: LogEvent[] }

/** A mirror, its viewers, its tail, and how to take it off the watched screens once it is dropped. */
type Watched = { mirror: Mirror; viewers: Set<Viewer>; stopTail: () => void; forget: () => void; ended: boolean; idle?: NodeJS.Timeout }

/**
 * The screens of running sessions that someone watches, one mirror each, shared by every viewer of the session: the
 * first viewer builds it from the log, it follows the log with one tail, and each later viewer is sent its snapshot.
 * A mirror whose last viewer left is kept for `graceMs`, so a viewer that reconnects finds it; one whose session
 * exited is dropped once its viewers leave. Live state only: nothing is kept across a restart of the tower.
 */
export function screenMirrors(logPathOf: (id: string) => string, graceMs: number) {
  const watched = new Map<string, Promise<Watched | undefined>>()

  const drop = (w: Watched) => {
    clearTimeout(w.idle)
    w.stopTail()
    w.mirror.dispose()
    w.forget()
  }

  /** A mirror of the session's screen, or `undefined` once its log holds its exit. */
  const build = async (id: string, forget: () => void): Promise<Watched | undefined> => {
    const logPath = logPathOf(id)
    const { log, offset } = readLog(logPath, screenEvents)
    if (log.events.some((event) => event[1] === 'x')) return undefined
    const w: Watched = { mirror: await mirrorOf(log), viewers: new Set(), stopTail: () => {}, forget, ended: false }
    w.stopTail = tailLog(logPath, offset, screenEvents, (event) => {
      w.mirror.draw(event)
      for (const viewer of w.viewers) {
        if (viewer.held) viewer.held.push(event)
        else viewer.event(event)
      }
      if (event[1] !== 'x') return
      w.ended = true
      w.stopTail()
      forget()
      if (!w.viewers.size) drop(w)
    })
    return w
  }

  const entryOf = (id: string): Promise<Watched | undefined> => {
    const existing = watched.get(id)
    if (existing) return existing
    const forget = () => {
      if (watched.get(id) === entry) watched.delete(id)
    }
    const entry = build(id, forget)
    watched.set(id, entry)
    entry.then((w) => w || forget(), forget)
    return entry
  }

  /**
   * Sends `viewer` the session's screen, then its events as they are logged, until the returned function is called.
   * `undefined` for a session whose log already holds its exit: its screen is the last frame, which no mirror keeps.
   */
  const watch = async (id: string, viewer: ScreenViewer): Promise<(() => void) | undefined> => {
    const w = await entryOf(id)
    if (!w) return undefined
    clearTimeout(w.idle)
    const v: Viewer = { ...viewer, held: [] }
    w.viewers.add(v)
    viewer.snapshot(await w.mirror.snapshot())
    for (const event of v.held!) viewer.event(event)
    v.held = undefined
    let watching = true
    return () => {
      if (!watching) return
      watching = false
      w.viewers.delete(v)
      if (w.viewers.size) return
      if (w.ended) drop(w)
      else w.idle = setTimeout(() => drop(w), graceMs)
    }
  }

  return { watch }
}

/**
 * The last frames of sessions whose log holds their exit, kept in memory: such a log never changes again, so its
 * snapshot is computed once per plain log size (archiving a log keeps it valid, a rewrite changes it) and the least recently opened
 * is dropped past `maxEntries`. Opens of one session in flight share one computation, and a log without an exit, or a
 * computation that failed, is not kept.
 */
export function lastFrames(logPathOf: (id: string) => string, maxEntries: number) {
  type Frame = { data: string; final: boolean }
  const entries = new Map<string, { size: number; frame: Promise<Frame> }>()

  const compute = async (logPath: string): Promise<Frame> => {
    const { log } = readLog(logPath, screenEvents)
    return { data: await snapshot(log), final: log.events.some((event) => event[1] === 'x') }
  }

  const frame = async (id: string): Promise<string> => {
    const logPath = logPathOf(id)
    const size = logSize(logPath)
    const existing = entries.get(id)
    if (existing?.size === size) {
      entries.delete(id)
      entries.set(id, existing)
      return (await existing.frame).data
    }
    const entry = { size, frame: compute(logPath) }
    entries.set(id, entry)
    const forget = () => {
      if (entries.get(id) === entry) entries.delete(id)
    }
    entry.frame.then((f) => f.final || forget(), forget)
    for (const oldest of entries.keys()) {
      if (entries.size <= maxEntries) break
      entries.delete(oldest)
    }
    return (await entry.frame).data
  }

  return { frame }
}
