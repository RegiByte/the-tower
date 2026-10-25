/**
 * Probes: readings the tower takes on its own while due, each appended as a fact to the probe's stream
 * (`streams/system/probe.<name>/YYYY-MM.jsonl`). What a stream says of the account, and whether its probe reads now,
 * are folded here from its reads and the board.
 */
import { ConfigError, type Config, type ProbeConfig } from '../shared/model.ts'
import { usageReading } from '../shared/rate-limits.ts'
import type { Board } from './board.ts'
import type { Facts } from './facts.ts'
import { limitsStep, NO_LIMITS, type LimitFacts } from './rate-limits.ts'
import { streamFacts } from './streams.ts'

/** The readers the core knows, a closed set: each only reads, and none sends a prompt, starts a session or calls a verb. */
export const READERS = ['claude.usage'] as const
export type Reader = (typeof READERS)[number]

/** One read: the reader's answer as it came (nulls dropped), or why there is none, and how long it took. */
export type ProbeRead = { reads: Reader; ms: number } & ({ ok: true; answer: unknown } | { ok: false; error: string })

/** A read at its moment, epoch ms. */
export type ProbeReading = [at: number, read: ProbeRead]

/** What a probe's stream says: its readings folded as every stream of rate limits is, and how its reads went. */
export type ProbeFacts = LimitFacts & {
  lastAt?: number
  /** Why the last read has no answer; absent once a read answers. */
  error?: string
  /** When a read last answered. */
  answeredAt?: number
  /** The reads at the stream's end that failed. */
  failsInRow: number
  /** The last answer says the account has no rate limits to read: an API key, a cloud provider, nobody signed in. */
  unavailable: boolean
}

export const NO_READS: ProbeFacts = { ...NO_LIMITS, failsInRow: 0, unavailable: false }

export const streamName = (probe: string): string => `probe.${probe}`

/** A stream file's reads, and how many of its lines are no JSON. */
export type StreamFile = { readings: ProbeReading[]; unreadable: number }

/** A probe stream's reads (`streamFacts`): a line that is no JSON costs that read only. */
export const readingsOf = (text: string): StreamFile => {
  const { facts, unreadable } = streamFacts(text)
  return { readings: facts.map(([at, , read]) => [at, read as ProbeRead]), unreadable }
}

/** When each reader's read can wait on the sessions' turns. */
const READ_AS: Record<Reader, { heldUntil: (sessions: Facts['rateLimits'], facts: ProbeFacts, every: number) => number | undefined }> = {
  'claude.usage': {
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
    const { unavailable, ...reading } = usageReading(read.answer)
    return { ...limitsStep(facts, at, reading), lastAt: at, answeredAt: at, failsInRow: 0, unavailable }
  }, NO_READS)

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
export type ProbeView = { status: Board['probes'][number]; reads: ({ at: number } & ProbeRead)[] }

export const probeView = (status: Board['probes'][number], readings: ProbeReading[], last: number): ProbeView => ({
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
