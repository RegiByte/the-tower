/**
 * Extensions (decision `extensions`): a folder holding `extension.json`, the manifest, and optionally a server module
 * whose default export is `start`. An extension provides one capability, and the core is the capability `tower`, at
 * `API_VERSION`. The manifest is strict: a key this tower doesn't know refuses the extension, so later keys arrive as
 * API minors. The tower parses every manifest with `Manifest`, serves it at `/schema` as `extension`, and holds its
 * key paths, the ctx members and the core's names to `test/served-exports.json`.
 */
import { z } from 'zod'
import type { Board } from '../bridge/board.ts'

/** The minor every key, member and code below arrived in. */
const SINCE = '1.81'

/** `id` and `provides`: lowercase words of letters and digits joined by single dashes, 2 to 32 long. */
export const NAME = /^(?=.{2,32}$)[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * The names no extension may be, id or capability: every first segment the core serves, names it may want, the agent
 * runtimes and the core's subject kinds. A new top-level core name outside this list arrives only at an API major.
 */
export const RESERVED = [
  ...['spawn', 'resume', 'keys', 'submit', 'resize', 'kill', 'let-go', 'probe', 'reap', 'open', 'reveal', 'edit', 'shell', 'collection', 'review', 'worktree', 'branch', 'tidy'],
  ...['policy', 'mux', 'schema', 'board', 'origins', 'patterns', 'renderers', 'archive', 'conversations', 'changes', 'screen', 'terminal', 'stats', 'landing', 'runs', 'shelf', 'run', 'r', 'shown', 'x'],
  ...['tower', 'core', 'user', 'extension', 'extensions', 'slot', 'slots', 'fact', 'facts', 'stream', 'streams', 'hook', 'hooks', 'view', 'views', 'region', 'regions'],
  ...['ask', 'asks', 'adds', 'subject', 'subjects', 'command', 'commands'],
  ...['runtime', 'runtimes', 'claude', 'codex', 'opencode'],
  ...['item', 'card', 'floor', 'conversation'],
] as const

/**
 * The capabilities the bundled extensions take, each by an extension of the same id: no other extension has that id,
 * and a user's replaces one by providing it on purpose. A new one arrives only at an API major.
 */
export const BUNDLED = ['reviews', 'policies', 'quota', 'drafts'] as const

/** The built-ins' old names, each with what it is now: none has moved yet. */
export const LEGACY: Record<string, string> = {}

/** Every problem an extension can have, by what it is. */
export const PROBLEM_CODES = ['invalid', 'mismatch', 'too-new', 'too-old', 'unmet', 'cycle', 'conflict', 'skipped', 'failed', 'under-declared', 'not-yet'] as const
export type ProblemCode = (typeof PROBLEM_CODES)[number]

/** Where a problem arose: reading the manifests, starting an extension, halting it. */
export type ProblemLane = 'load' | 'start' | 'halt'

/**
 * Why an extension, or a part of it, doesn't run as declared. `error`s keep it from starting; `warn`s leave it running.
 * `at`: epoch ms, when it was found. `count`: how many times. `path`: where in the manifest, `settings.every`.
 */
export type ExtensionProblem = { lane: ProblemLane; level: 'error' | 'warn'; code: ProblemCode; message: string; at: number; count: number; path?: string }

/**
 * `started`; `refused` at load (its manifest, its versions, its dependencies); `failed` at start; `skipped` because
 * something it requires doesn't run; `off` in the config.
 */
export type ExtensionState = 'started' | 'refused' | 'failed' | 'skipped' | 'off'

/**
 * An extension as the board shows it. `id` names the implementation, `provides` the capability every outward name is
 * qualified by. `off`: the floors it is off on, set there or because a capability it requires is. `problems`: newest first.
 */
export type ExtensionView = {
  id: string
  provides: string
  version: string
  title: string
  bundled: boolean
  state: ExtensionState
  off?: string[]
  problems: ExtensionProblem[]
}

/** What `start` gets: who it is, its settings, timers and a log the tower clears and closes at halt, and the board. */
export type StartCtx = {
  /** @since 1.81 */
  id: string
  /** @since 1.81 */
  provides: string
  /** @since 1.81 */
  version: string
  /** The extension's folder. @since 1.81 */
  dir: string
  /** @since 1.81 */
  tower: { version: string }
  /** The system's settings, parsed by the manifest's `settings` schema; `undefined` without one. @since 1.81 */
  settings: unknown
  /** A floor's settings, shallow-merged over the system's and parsed by the same schema, as the config holds them now. @since 1.81 */
  settingsOf(project: string): unknown
  /** Whether it is on, on that floor, as the config says now. @since 1.81 */
  on(project: string): boolean
  /** Calls `fn` every `ms` until halt. A throw goes to the tower's log. @since 1.81 */
  every(ms: number, fn: () => void | Promise<void>): void
  /** A line in the tower's log, tagged with the id. @since 1.81 */
  log(message: string): void
  /** Aborted at halt. @since 1.81 */
  signal: AbortSignal
  /** The board as it is now. @since 1.81 */
  board(): Board
}

/** What `start` returns: one function per name the manifest declares, and `halt`, called before the tower clears what ctx opened. */
export type Started = { halt?: () => void | Promise<void> }

/** The default export of an extension's server module. */
export type Start = (ctx: StartCtx) => Started | Promise<Started>

/** Each ctx member by lane, with the minor it arrived in: the `ctx` list of `test/served-exports.json`. */
type SinceOf<T> = { [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? string : T[K] extends object ? (T[K] extends AbortSignal ? string : SinceOf<T[K]>) : string }

export const CTX_SINCE: { start: SinceOf<StartCtx> } = {
  start: {
    id: SINCE,
    provides: SINCE,
    version: SINCE,
    dir: SINCE,
    tower: { version: SINCE },
    settings: SINCE,
    settingsOf: SINCE,
    on: SINCE,
    every: SINCE,
    log: SINCE,
    signal: SINCE,
    board: SINCE,
  },
}

/** The keys `start` may return, beside the ones each lane's names bring. */
export const STARTED_KEYS = ['halt'] as const

const since = <T extends z.ZodType>(schema: T) => schema.meta({ 'x-since': SINCE })

const Name = z
  .string()
  .regex(NAME, 'lowercase words of letters and digits joined by single dashes, 2 to 32 long')
  .refine((name) => !(RESERVED as readonly string[]).includes(name), { message: 'a name the core keeps: see RESERVED at /schema' })
  .meta({ not: { enum: [...RESERVED] } })
const Capability = z.string().regex(NAME, 'a capability: lowercase words of letters and digits joined by single dashes')
const Version = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)$/, '"major.minor", such as "1.0"')
const Path = z
  .string()
  .min(1)
  .regex(/^(?!\/)(?!.*\.\.)/, 'a path inside the folder: relative, without ".."')
const Schema = z.record(z.string(), z.unknown()).describe('A JSON Schema 2020-12, as /schema serves the API\'s.')
const SubjectKind = z.string().regex(/^(card|floor|board|conversation|item\.[a-z][a-z0-9.-]*|[a-z][a-z0-9]*(-[a-z0-9]+)*\.[a-z][a-z0-9-]*)$/)
const Words = z.strictObject({ label: since(z.string()), hint: since(z.string().optional()), destructive: since(z.literal(true).optional()) })
const View = z.strictObject({ module: since(Path), export: since(z.string().optional()), subject: since(SubjectKind), words: since(Words.optional()) })

export const Manifest = z
  .strictObject({
    $schema: since(z.string().optional()),
    meta: since(z.record(z.string(), z.unknown()).optional().describe("The author's own data: the tower never reads it.")),
    id: since(Name.describe('The implementation: the config names it by this.')),
    provides: since(Name.optional().describe('The capability every outward name is qualified by; the id when left out.')),
    version: since(Version.describe("The capability's contract version: a dependent's requires is met at this major, at its minor or newer.")),
    title: since(z.string().min(1)),
    description: since(z.string().optional()),
    requires: since(
      z
        .record(Capability, Version)
        .refine((requires) => Object.hasOwn(requires, 'tower'), { message: 'holds the tower version it is written for: "tower": "1.81"', path: ['tower'] })
        .meta({ required: ['tower'] })
        .describe('Hard dependencies by capability, the core as `tower`: refused unless each is met.'),
    ),
    wants: since(z.record(Name, Version).optional().describe('Optional dependencies: it starts without one that is missing.')),
    settings: since(Schema.optional().describe('What the config may set, as JSON Schema; no settings are taken without it.')),
    server: since(Path.optional().describe("The module whose default export is `start`; none, no code.")),
    views: since(z.record(z.string(), z.record(z.string(), View)).optional().describe('Reserved: views by renderer and region, validated and not yet read.')),
    regions: since(
      z
        .record(z.string(), z.strictObject({ subject: since(SubjectKind), description: since(z.string().optional()) }))
        .optional()
        .describe('Reserved: its own sub-regions, validated and not yet read.'),
    ),
  })
  .describe('An extension\'s manifest, `extension.json`: unknown keys refuse it.')
export type Manifest = z.infer<typeof Manifest>

/** The manifest's JSON Schema, served at `/schema` as `extension`. */
export const MANIFEST_SCHEMA = { $id: 'tower:extension', ...z.toJSONSchema(Manifest, { io: 'input' }) }

/** The capability an extension provides: its `provides`, or its id. */
export const capabilityOf = (manifest: Pick<Manifest, 'id' | 'provides'>): string => manifest.provides ?? manifest.id

/** A version as numbers. */
export const versionOf = (version: string): [major: number, minor: number] => version.split('.').map(Number) as [number, number]

/** Whether `provided` meets `required`: the same major, at its minor or newer. */
export const meets = (provided: string, required: string): boolean => {
  const [pm, pn] = versionOf(provided)
  const [rm, rn] = versionOf(required)
  return pm === rm && pn >= rn
}
