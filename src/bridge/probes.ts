/**
 * Probes: readings the tower takes on its own while due, each appended as a fact to the probe's stream
 * (`streams/system/probe.<name>/YYYY-MM.jsonl`). What a stream says of the account, and whether its probe reads now,
 * are folded here from its reads and the board.
 */
import { ConfigError, type Config, type ProbeConfig } from '../shared/model.ts'
import type { Board } from './board.ts'
import { limitsRead, type Facts, type RateLimit } from './facts.ts'

/** The readers the core knows, a closed set: each only reads, and none sends a prompt, starts a session or calls a verb. */
export const READERS = ['claude.usage'] as const
export type Reader = (typeof READERS)[number]

/** A stream's first line: each event's `t` is seconds since `startedAt` (epoch ms), the start of the file's UTC month. */
export type StreamHeader = { stream: string; startedAt: number; version: 1 }

/** One read: the reader's answer as it came (nulls dropped), or why there is none, and how long it took. */
export type ProbeRead = { reads: Reader; ms: number } & ({ ok: true; answer: unknown } | { ok: false; error: string })

export type StreamEvent = [t: number, code: 'p', read: ProbeRead]

/** A read at its moment, epoch ms. */
export type ProbeReading = [at: number, read: ProbeRead]

/** What a probe's stream says. */
export type ProbeFacts = {
  lastAt?: number
  /** Why the last read has no answer; absent once a read answers. */
  error?: string
  /** When a read last answered. */
  answeredAt?: number
  /** The reads at the stream's end that failed. */
  failsInRow: number
  /** The last answer says the account has no rate limits to read: an API key, a cloud provider, nobody signed in. */
  unavailable: boolean
  limitReadings: Facts['limitReadings']
  rateLimits?: Facts['rateLimits']
  /** By limit kind, each climb between two answers in a row of the same window: the reads of one source round alike. */
  rises: Record<string, Rise[]>
}

/** A limit's percent climbed `points` from the answer at `from` to the next at `to` (epoch ms), in the window resetting at `resetsAt`. */
export type Rise = [from: number, to: number, points: number, resetsAt: string]

export const NO_READS: ProbeFacts = { failsInRow: 0, unavailable: false, limitReadings: {}, rises: {} }

/** The climbs from the limits of one answer to the next's, by kind. */
const risesTo = (rises: ProbeFacts['rises'], before: Facts['rateLimits'], at: number, limits: RateLimit[]): ProbeFacts['rises'] =>
  limits.reduce((next, { kind, percentUsed, resetsAt }) => {
    const was = before?.limits.find((l) => l.kind === kind)
    if (!before || !was || !resetsAt || was.resetsAt !== resetsAt || percentUsed <= was.percentUsed) return next
    return { ...next, [kind]: [...(next[kind] ?? []), [before.at, at, percentUsed - was.percentUsed, resetsAt] as Rise] }
  }, rises)

export const streamName = (probe: string): string => `probe.${probe}`

/** The start of `at`'s UTC month: a stream's file is named by it, and its events counted from it. */
export const monthStart = (at: number): number => {
  const d = new Date(at)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

export const monthFile = (at: number): string => `${new Date(at).toISOString().slice(0, 7)}.jsonl`

/** The line a read is appended as, to the file of its month. */
export const eventLine = (at: number, read: ProbeRead): string => JSON.stringify([Math.round(at - monthStart(at)) / 1000, 'p', read] satisfies StreamEvent)

/** A stream file's reads, and how many of its lines are no JSON. */
export type StreamFile = { readings: ProbeReading[]; unreadable: number }

const parsed = (line: string): unknown => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

/**
 * A stream file's reads; the text after the last newline is a line still being written. Each read stands alone, so a
 * line that is no JSON (an append torn by a crash, a hand edit) costs that read only: it is counted and passed over.
 * A header that is no JSON leaves no read to place in time.
 */
export const readingsOf = (text: string): StreamFile => {
  const [header, ...events] = text.split('\n').slice(0, -1).map(parsed) as [StreamHeader | undefined, ...(StreamEvent | undefined)[]]
  const readings = header ? events.flatMap((e): ProbeReading[] => (e ? [[header.startedAt + e[0] * 1000, e[2]]] : [])) : []
  return { readings, unreadable: events.length + 1 - readings.length - (header ? 1 : 0) }
}

type UsageWindow = { utilization?: number; resets_at?: string }

/** Claude's answer to `get_usage`, as much of it as the fold reads: a model's own weekly limit is in `model_scoped`. */
type UsageAnswer = {
  rate_limits_available?: boolean
  rate_limits?: { five_hour?: UsageWindow; seven_day?: UsageWindow; model_scoped?: (UsageWindow & { display_name?: string })[] }
}

/** A model's weekly limit as a kind, the way a session names one: `seven_day_opus`. */
const modelWeek = (model: string): string => `seven_day_${model.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`

const limitOf = (kind: string, window: UsageWindow | undefined): RateLimit[] =>
  window?.utilization === undefined ? [] : [{ kind, percentUsed: window.utilization, ...(window.resets_at && { resetsAt: toSecond(window.resets_at) }) }]

/** Claude answers a window's reset to the microsecond and a session measures it to the second: a window is known by its reset in both. */
const toSecond = (iso: string): string => new Date(Math.round(Date.parse(iso) / 1000) * 1000).toISOString()

/** What each reader's answer says, and when its read can wait: pure, so the fold and `due` read them. */
const READ_AS: Record<Reader, { limits: (answer: unknown) => RateLimit[]; unavailable: (answer: unknown) => boolean; heldUntil: (sessions: Facts['rateLimits'], facts: ProbeFacts, every: number) => number | undefined }> = {
  'claude.usage': {
    limits: (answer) => {
      const limits = (answer as UsageAnswer).rate_limits
      return [
        ...limitOf('five_hour', limits?.five_hour),
        ...limitOf('seven_day', limits?.seven_day),
        ...(limits?.model_scoped ?? []).flatMap((m) => (m.display_name ? limitOf(modelWeek(m.display_name), m) : [])),
      ]
    },
    unavailable: (answer) => (answer as UsageAnswer).rate_limits_available === false,
    /**
     * A session's turn measures the five-hour and weekly limits: no read while its reading is newer than `every`,
     * unless the probe's last answer had a limit the sessions don't measure (a model's own week).
     */
    heldUntil: (sessions, facts, every) =>
      sessions && (facts.rateLimits?.limits ?? []).every((l) => sessions.limits.some((s) => s.kind === l.kind)) ? sessions.at + every : undefined,
  },
}

export const probeFacts = (readings: ProbeReading[]): ProbeFacts =>
  readings.reduce<ProbeFacts>((facts, [at, read]) => {
    if (!read.ok) return { ...facts, lastAt: at, error: read.error, failsInRow: facts.failsInRow + 1 }
    const limits = READ_AS[read.reads].limits(read.answer)
    return {
      lastAt: at,
      answeredAt: at,
      failsInRow: 0,
      unavailable: READ_AS[read.reads].unavailable(read.answer),
      limitReadings: limitsRead(facts.limitReadings, at, limits),
      rateLimits: limits.length ? { at, limits } : facts.rateLimits,
      rises: risesTo(facts.rises, facts.rateLimits, at, limits),
    }
  }, NO_READS)

export type LimitsFrom = 'session' | 'probe'

/** The board's account limits: the newest reading of any session's measure or any probe's read. */
export type LimitsRead = Pick<Board, 'rateLimits' | 'rateLimitsAt' | 'rateLimitsFrom'>

/** The newest of the readings. */
export const newestReading = (readings: Facts['rateLimits'][]): Facts['rateLimits'] =>
  readings.reduce<Facts['rateLimits']>((latest, r) => (r && (!latest || r.at > latest.at) ? r : latest), undefined)

/**
 * Rate limits belong to the account: the newest reading, a session's or a probe's, stands for every limit it has; a
 * limit only the other reads (a model's own week, which only the probe reads) is the other's newest.
 */
export const accountLimits = (sessions: Pick<Facts, 'rateLimits'>[], probes: ProbeFacts[]): LimitsRead => {
  const [session, probe] = [newestReading(sessions.map((f) => f.rateLimits)), newestReading(probes.map((f) => f.rateLimits))]
  const [latest, other, from] = session && (!probe || session.at >= probe.at) ? [session, probe, 'session' as const] : [probe, session, 'probe' as const]
  if (!latest) return { rateLimits: [], rateLimitsAt: undefined, rateLimitsFrom: undefined }
  const only = (other?.limits ?? []).filter((l) => !latest.limits.some((n) => n.kind === l.kind))
  return { rateLimits: [...latest.limits, ...only], rateLimitsAt: latest.at, rateLimitsFrom: from }
}

/** A probe as the tower runs it: `every` in ms. */
export type Probe = { name: string; reads: Reader; every: number; off: boolean }

/** No probe reads more often than this, whatever the config or its stream says. */
export const FLOOR_MS = 60_000
const FAILS_BEFORE_BACKOFF = 3
const BACKOFF_MS = 10 * 60_000
const BACKOFF_MAX_MS = 60 * 60_000
const UNAVAILABLE_WAIT_MS = 6 * 60 * 60_000

/** How long after its last read a probe waits: `every`, longer after failures in a row (doubling) or while the account has nothing to read. */
export const waitOf = (probe: Probe, facts: ProbeFacts): number =>
  facts.unavailable
    ? UNAVAILABLE_WAIT_MS
    : facts.failsInRow >= FAILS_BEFORE_BACKOFF
      ? Math.max(probe.every, Math.min(BACKOFF_MS * 2 ** (facts.failsInRow - FAILS_BEFORE_BACKOFF), BACKOFF_MAX_MS))
      : probe.every

/**
 * Whether the probe reads at `now`, from its stream and the sessions' newest reading: never while off or while its
 * reader can wait on the sessions; otherwise once its wait has passed since its last read. A last read dated after `now` (the clock moved
 * back) makes it due: the tower's floor keeps reads apart.
 */
export const due = (probe: Probe, facts: ProbeFacts, sessions: Facts['rateLimits'], now: number): boolean => {
  if (probe.off || now < (READ_AS[probe.reads].heldUntil(sessions, facts, probe.every) ?? -Infinity)) return false
  return facts.lastAt === undefined || facts.lastAt > now || now - facts.lastAt >= waitOf(probe, facts)
}

/**
 * How a probe stands, as its stream says: `new` before its first read, `ok` while its last read answered, `failing`
 * after a read with no answer, `backoff` once failures in a row lengthen its wait, `unavailable` while its last answer
 * said the account has no rate limits to read, `off` by the config.
 */
export type ProbeState = 'off' | 'new' | 'ok' | 'failing' | 'backoff' | 'unavailable'

/** A probe as the board shows it: what it reads and how often, its last read, and when it reads next. Times in epoch ms. */
export type ProbeStatus = {
  name: string
  reads: Reader
  /** How often it reads while nothing else holds it, ms. */
  every: number
  state: ProbeState
  /** When it last read, answered or not. */
  lastAt?: number
  /** Why its last read has no answer. */
  error?: string
  /** When a read last answered. */
  answeredAt?: number
  failsInRow: number
  /** How long it waits after its last read, ms: `every`, longer while backing off or unavailable. */
  wait: number
  /**
   * When it reads next: its wait after its last read, or later while `held`; a moment past (0 before its first read)
   * means at the tower's next tick. Absent while off.
   */
  nextAt?: number
  /** `nextAt` is set by what the sessions read: a session's turn read every limit it reads, and it reads no sooner than `every` after. */
  held: boolean
}

/** GET `/probe/<name>`: a probe's status and its latest reads, newest first. */
export type ProbeView = { status: ProbeStatus; reads: ({ at: number } & ProbeRead)[] }

export const probeView = (status: ProbeStatus, readings: ProbeReading[], last: number): ProbeView => ({
  status,
  reads: readings.slice(-last).reverse().map(([at, read]) => ({ at, ...read })),
})

const stateOf = (probe: Probe, facts: ProbeFacts): ProbeState =>
  probe.off
    ? 'off'
    : facts.lastAt === undefined
      ? 'new'
      : facts.failsInRow >= FAILS_BEFORE_BACKOFF
        ? 'backoff'
        : facts.failsInRow
          ? 'failing'
          : facts.unavailable
            ? 'unavailable'
            : 'ok'

export const probeStatus = (probe: Probe, facts: ProbeFacts, sessions: Facts['rateLimits']): ProbeStatus => {
  const wait = waitOf(probe, facts)
  const after = facts.lastAt === undefined ? 0 : facts.lastAt + wait
  const heldUntil = READ_AS[probe.reads].heldUntil(sessions, facts, probe.every) ?? 0
  return {
    name: probe.name,
    reads: probe.reads,
    every: probe.every,
    state: stateOf(probe, facts),
    ...(facts.lastAt !== undefined && { lastAt: facts.lastAt }),
    ...(facts.error !== undefined && { error: facts.error }),
    ...(facts.answeredAt !== undefined && { answeredAt: facts.answeredAt }),
    failsInRow: facts.failsInRow,
    wait,
    ...(!probe.off && { nextAt: Math.max(after, heldUntil) }),
    held: !probe.off && heldUntil > after,
  }
}

/** The probes the core declares: the account's quota, read while no session's turn reads it. */
const BUILT_INS: Record<string, ProbeConfig> = { quota: { reads: 'claude.usage', every: '10m' } }

const PROBE_NAME = /^[\w-]+$/
const DURATION = /^(\d+)(s|m|h)$/
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 }

const isReader = (reads: unknown): reads is Reader => READERS.includes(reads as Reader)

/** Every probe: the built-ins, then the config's own, a config probe overriding a built-in's fields. A probe the tower can't run is a config error. */
export const probesOf = (config: Config): Probe[] => {
  const declared: Record<string, ProbeConfig> = { ...BUILT_INS, ...config.probes }
  return Object.keys(declared).map((name) => {
    const at = `probes.${name} in the config`
    if (!PROBE_NAME.test(name)) throw new ConfigError(`probes."${name}" in the config: a probe's name is letters, digits, "_" and "-"`)
    const own = declared[name]
    if (typeof own !== 'object' || own === null || Array.isArray(own)) throw new ConfigError(`${at}: takes an object: reads, every, off`)
    const { reads, every, off = false } = { ...BUILT_INS[name], ...own }
    if (!isReader(reads)) throw new ConfigError(`${at}: "reads" takes one of the readers: ${READERS.join(', ')}`)
    const [, n, unit] = DURATION.exec(String(every)) ?? []
    if (typeof every !== 'string' || !unit) throw new ConfigError(`${at}: "every" takes how often it reads, such as "10m" ("s", "m" or "h")`)
    const ms = Number(n) * UNIT_MS[unit]
    if (ms < FLOOR_MS) throw new ConfigError(`${at}: "every" is ${every}, under the floor of ${FLOOR_MS / 1000}s`)
    if (typeof off !== 'boolean') throw new ConfigError(`${at}: "off" takes true or false`)
    return { name, reads, every: ms, off }
  })
}

/** The request Claude answers with `/usage`'s data, and nothing else: no prompt is sent. */
export const USAGE_REQUEST = { type: 'control_request', request_id: 'usage', request: { subtype: 'get_usage', skip_behaviors: true } }

const withoutNulls = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_, v) => (v === null ? undefined : v)))

/** Claude's answer to `USAGE_REQUEST` among what it printed, nulls dropped; why there is none otherwise. */
export const usageAnswer = (stdout: string): { answer: unknown } | { error: string } => {
  const response = stdout
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .find((m) => m.type === 'control_response' && m.response?.request_id === USAGE_REQUEST.request_id)?.response
  if (!response) return { error: 'claude printed no answer to get_usage' }
  return response.subtype === 'success' ? { answer: withoutNulls(response.response) } : { error: String(response.error ?? 'get_usage failed') }
}
