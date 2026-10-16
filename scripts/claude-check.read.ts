/**
 * What `scripts/claude-check.ts` reads of a run, as pure functions over recorded logs: the shapes of what Claude
 * posted, the status timeline each recording folds to, the surfaces no fixture covers, the release's changelog, and
 * the report that says whether the release moves the tested range.
 */
import { timeline } from '../test/replay.ts'
import type { Status } from '../src/bridge/status.ts'
import type { SessionLog } from '../src/shared/model.ts'
import type { Ignore } from './claude-check.scenarios.ts'

/**
 * Each event's name and payload keys, one level into objects, sorted: what a recording says of Claude's surfaces. A key
 * missing from some of the event's occurrences is optional, marked `?` (a classic hook names `agent_id` only when a
 * subagent raised it), as is an event some take of the recording missed (`Notification` comes after a minute idle).
 */
export type Shapes = Record<string, string[]>

/** The committed baseline: each recording's shapes, and the release they were taken on. */
export type Baseline = { claude: string; recordings: Record<string, Shapes> }

/** Keys whose objects are a tool's own input or output, which change with the tool and the model's call. */
const CONTENT = new Set(['tool_input', 'tool_response'])

/** `tool.call` carries the tool's input spread beside its own fields: only these are the mod's. */
const TOOL_CALL_KEYS = new Set(['hook_event_name', 'tool', 'tool_use_id', 'agentId'])

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const keysOf = (payload: Record<string, unknown>): string[] =>
  payload.hook_event_name === 'tool.call'
    ? Object.keys(payload).filter((k) => TOOL_CALL_KEYS.has(k))
    : Object.entries(payload).flatMap(([k, v]) => [k, ...(isObject(v) && !CONTENT.has(k) ? Object.keys(v).map((inner) => `${k}.${inner}`) : [])])

/** Claude's events in a log: what the tower writes itself (`tower.*`) is left out. */
const claudeEvents = (log: SessionLog): Record<string, unknown>[] =>
  log.events.flatMap((e) => (e[1] === 'h' && !String(e[2].hook_event_name).startsWith('tower.') ? [e[2] as Record<string, unknown>] : []))

export const shapesOf = (log: SessionLog): Shapes => {
  const seen = new Map<string, { times: number; keys: Map<string, number> }>()
  for (const payload of claudeEvents(log)) {
    const name = String(payload.hook_event_name)
    const event = seen.get(name) ?? { times: 0, keys: new Map() }
    event.times++
    for (const k of new Set(keysOf(payload))) event.keys.set(k, (event.keys.get(k) ?? 0) + 1)
    seen.set(name, event)
  }
  return sortedShapes(Object.fromEntries([...seen].map(([name, { times, keys }]) => [name, [...keys].map(([k, n]) => (n === times ? k : `${k}?`))])))
}

const sortedShapes = (shapes: Shapes): Shapes =>
  Object.fromEntries(Object.entries(shapes).sort(([a], [b]) => a.localeCompare(b)).map(([name, keys]) => [name, [...keys].sort()]))

const bare = (key: string) => key.replace(/\?$/, '')
const required = (keys: string[]) => keys.filter((k) => !k.endsWith('?'))

/** Two takes of a recording's shapes as one: a key is required only where every take raised it on every occurrence. */
export const mergedShapes = (a: Shapes, b: Shapes): Shapes => {
  const take = (shapes: Shapes, event: string) => shapes[event] ?? shapes[`${event}?`]
  const events = new Set([...Object.keys(a), ...Object.keys(b)].map(bare))
  return sortedShapes(
    Object.fromEntries(
      [...events].map((event) => {
        const [ka, kb] = [take(a, event), take(b, event)]
        const both = ka !== undefined && kb !== undefined
        const all = new Set([...(ka ?? []), ...(kb ?? [])].map(bare))
        const always = (k: string) => both && required(ka).includes(k) && required(kb).includes(k)
        return [both && event in a && event in b ? event : `${event}?`, [...all].map((k) => (always(k) ? k : `${k}?`))]
      }),
    ),
  )
}

/** Over the recordings named: each event's keys raised anywhere, the keys every occurrence raised, and who raised it. */
const unionOf = (recordings: Record<string, Shapes>, names: string[]) => {
  const keys = new Map<string, Set<string>>()
  const always = new Map<string, Set<string>>()
  const seen = new Map<string, string[]>()
  const expected = new Set<string>()
  for (const name of names)
    for (const [marked, ks] of Object.entries(recordings[name] ?? {})) {
      const event = bare(marked)
      if (event === marked) expected.add(event)
      keys.set(event, new Set([...(keys.get(event) ?? []), ...ks.map(bare)]))
      const req = new Set(required(ks))
      always.set(event, always.has(event) ? new Set([...always.get(event)!].filter((k) => req.has(k))) : req)
      seen.set(event, [...(seen.get(event) ?? []), name])
    }
  return { keys, always, seen, expected }
}

/** A shape that changed: an event or a key only in the baseline (`-`) or only in the run (`+`), with where it was seen. */
export type ShapeChange = { sign: '+' | '-'; event: string; key?: string; in: string[] }

/**
 * The run's shapes against the baseline's, over the recordings both hold. Compared as one vocabulary: which
 * recording raises an event shifts with timing (a `Notification` after a minute idle) and with the model's choices,
 * so a scenario that stops raising an event shows in its status replay, and an event gone from the whole run shows
 * here. An event or a key is gone when the baseline always had it and the run has none; new when the baseline
 * never had it.
 */
export const shapeChanges = (baseline: Record<string, Shapes>, run: Record<string, Shapes>): ShapeChange[] => {
  const names = Object.keys(run).filter((name) => name in baseline)
  const before = unionOf(baseline, names)
  const after = unionOf(run, names)
  const events = [...new Set([...before.keys.keys(), ...after.keys.keys()])].sort()
  const raising = (shapes: Record<string, Shapes>, event: string, key: string) =>
    names.filter((name) => (shapes[name][event] ?? shapes[name][`${event}?`])?.some((k) => bare(k) === key))
  return events.flatMap((event): ShapeChange[] => {
    const is = after.keys.get(event)
    if (!is) return before.expected.has(event) ? [{ sign: '-', event, in: before.seen.get(event)! }] : []
    if (!before.keys.has(event)) return [{ sign: '+', event, in: after.seen.get(event)! }]
    return [
      ...[...before.always.get(event)!].filter((k) => !is.has(k)).map((key): ShapeChange => ({ sign: '-', event, key, in: raising(baseline, event, key) })),
      ...[...is].filter((k) => !before.keys.get(event)!.has(k)).map((key): ShapeChange => ({ sign: '+', event, key, in: raising(run, event, key) })),
    ]
  })
}

/** The statuses a log folds to, in order: what the bridge makes of it. */
export const statusesOf = (log: SessionLog): Status[] => timeline(log).map(([status]) => status)

/**
 * A timeline in the form a scenario compares it in. `trust`: the trust screen a fresh directory raises first, a
 * leading `blocked`, is left out (its fixture was recorded in a directory already trusted). `watching`: whether a turn
 * ended with background work still running is left out (which ends first is the clock's). `repeats`: a cycle of
 * statuses that repeats back to back counts once (how many turns a subagent's reports take is the clock's).
 */
export const comparedForm = (statuses: Status[], ignore: Ignore[]): Status[] => {
  const trusted = ignore.includes('trust') && statuses[0] === 'blocked' ? statuses.slice(1) : statuses
  const settled = ignore.includes('watching') ? withoutRuns(trusted.filter((s) => s !== 'watching')) : trusted
  return ignore.includes('repeats') ? withoutRepeats(settled) : settled
}

/** A status entered twice in a row, once a status between them is left out, is entered once. */
const withoutRuns = (statuses: Status[]): Status[] => statuses.filter((s, i) => s !== statuses[i - 1])

const withoutRepeats = (statuses: Status[]): Status[] => {
  for (let size = 1; size <= statuses.length / 2; size++)
    for (let i = 0; i + 2 * size <= statuses.length; i++)
      if (statuses.slice(i, i + size).join() === statuses.slice(i + size, i + 2 * size).join())
        return withoutRepeats([...statuses.slice(0, i + size), ...statuses.slice(i + 2 * size)])
  return statuses
}

/** The keys of a JSON value, as dotted paths into its objects; arrays are leaves. */
const pathsOf = (value: unknown, prefix = ''): string[] =>
  isObject(value) ? Object.entries(value).flatMap(([k, v]) => [`${prefix}${k}`, ...pathsOf(v, `${prefix}${k}.`)]) : []

/** What the quota probe's fold reads of `get_usage`'s answer (`src/bridge/probes.ts`). */
export const USAGE_READ = ['rate_limits_available', 'rate_limits.five_hour.utilization', 'rate_limits.five_hour.resets_at', 'rate_limits.seven_day.utilization', 'rate_limits.seven_day.resets_at']

/** `get_usage`'s answer against the recorded one, both with nulls dropped: what the fold reads, and every key that moved. */
export const usageChanges = (recorded: unknown, answer: unknown) => {
  const was = new Set(pathsOf(recorded))
  const is = new Set(pathsOf(answer))
  return { missing: USAGE_READ.filter((p) => !is.has(p)), added: [...is].filter((p) => !was.has(p)), removed: [...was].filter((p) => !is.has(p)) }
}

/** The private modes the tower's fullscreen setting asks Claude for: the alternate screen and SGR mouse reports. */
export const FULLSCREEN_MODES = ['?1049h', '?1006h']

export const modesEnabled = (log: SessionLog): string[] =>
  FULLSCREEN_MODES.filter((mode) => log.events.some((e) => e[1] === 'o' && e[2].includes(`\x1b[${mode}`)))

/** The release the mod posted as the session started. */
export const versionPosted = (log: SessionLog): string | undefined => {
  const posted = log.events.find((e) => e[1] === 'h' && e[2].hook_event_name === 'tower.claude')
  return posted && String((posted[2] as { version?: unknown }).version)
}

/** Words that mark a changelog entry as one about a surface the tower reads. */
const WATCHED = /\bhooks?\b|\bmods?\b|\bmod's\b|compact|trust|permission|\bpeers?\b|SendMessage|cross-session|\busage\b|fullscreen|paste/i

/** The release's section of Claude's changelog, each entry marked when it names a watched surface. */
export const changelogOf = (changelog: string, version: string): { entry: string; watched: boolean }[] | undefined => {
  const sections = changelog.split(/^## /m)
  const section = sections.find((s) => s.split('\n', 1)[0].trim() === version)
  if (!section) return undefined
  return section
    .split('\n')
    .slice(1)
    .filter((line) => line.startsWith('- '))
    .map((line) => ({ entry: line.slice(2), watched: WATCHED.test(line) }))
}

/** Which events Claude's built-in `sec-default` mod kept from the tower's, from `--debug-file`'s lines. */
export const heldBack = (debugLog: string): Map<string, number> => {
  const held = new Map<string, number>()
  for (const [, event, by] of debugLog.matchAll(/^.*?tower: (\S+) bypassed by (\S+)/gm)) held.set(`${event} by ${by}`, (held.get(`${event} by ${by}`) ?? 0) + 1)
  return held
}
