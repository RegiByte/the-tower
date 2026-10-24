/**
 * Extensions (decision `extensions`): a folder holding `extension.json`, the manifest, and optionally a server module
 * whose default export is `start`. An extension provides one capability, and the core is the capability `tower`, at
 * `API_VERSION`. The manifest is strict: a key this tower doesn't know refuses the extension, so later keys arrive as
 * API minors. The tower parses every manifest with `Manifest`, serves it at `/schema` as `extension`, and holds its
 * key paths, the ctx members and the core's names to `test/served-exports.json`.
 */
import { z } from 'zod'
import type { Board } from '../bridge/board.ts'
import type { StreamFact } from '../bridge/streams.ts'
import { cronProblem, isZone, periodProblem, type When } from './slots.ts'

export type { StreamFact }

/** The minor the manifest's first keys, the start ctx and the load codes arrived in. */
const SINCE = '1.81'

/** The minor verbs and reads, the caller and the calls arrived in. */
const CALLS = '1.82'

/** The minor stores arrived in: collections, streams and session facts. */
const STORES = '1.83'

/** The minor folds and contributions arrived in: subjects, folds, client commands and their files. */
const FOLDS = '1.84'
/** The minor middleware and hooks arrived in: `around`, `hooks`, `answers` and `ctx.raise`. */
const AROUND = '1.85'

/** The minor triggers and checks arrived in: slots, the board trigger, checks and `ctx.run`. */
const TRIGGERS = '1.86'

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
export const PROBLEM_CODES = ['invalid', 'mismatch', 'too-new', 'too-old', 'unmet', 'cycle', 'conflict', 'skipped', 'failed', 'under-declared', 'not-yet', 'threw', 'shape', 'deprecated', 'slow', 'hook', 'paused', 'contract'] as const
export type ProblemCode = (typeof PROBLEM_CODES)[number]

/**
 * Where a problem arose: reading the manifests, starting an extension, halting it, a call of a verb or a read, a fold,
 * a link of a chain it wraps, an answer to a hook, a slot or the board trigger.
 */
export type ProblemLane = 'load' | 'start' | 'halt' | 'verb' | 'read' | 'fold' | 'around' | 'hook' | 'trigger'

/**
 * Why an extension, or a part of it, doesn't run as declared. `error`s keep it from starting, or failed a call; `warn`s
 * leave it running; `info` says how it runs (without an extension it wants). `at`: epoch ms, when it was last found.
 * `count`: how many times. `path`: where in the manifest, `settings.every`.
 */
export type ExtensionProblem = {
  lane: ProblemLane
  level: 'error' | 'warn' | 'info'
  code: ProblemCode
  message: string
  at: number
  count: number
  path?: string
  /** The subject a fold failed on, by its key: `card:<id>`. @since 1.84 */
  subject?: string
}

/**
 * `started`; `refused` at load (its manifest, its versions, its dependencies); `failed` at start; `skipped` because
 * something it requires doesn't run; `off` in the config; `restarting` while it is restarted, its calls unavailable.
 */
export type ExtensionState = 'started' | 'refused' | 'failed' | 'skipped' | 'off' | 'restarting'

/** `system`: a verb or read of the whole system; `project`: one floor's, refused on a floor where its capability is off. */
export type Scope = 'system' | 'project'

/** A name in words, as a menu or the CLI offers it. */
export type Words = { label: string; hint?: string; destructive?: true }

/** A name on its way out: since its provider's version `since`, with what to `use` instead, qualified, and `why`. */
export type Deprecated = { since: string; use?: string; why?: string }

/** One of an extension's verbs as the board shows it: its qualified name, scope and words. */
export type ExtensionVerb = { name: string; scope: Scope; description?: string; words?: Words; deprecated?: Deprecated }

/** One of an extension's slots as the board shows it: `/slots.js` says its rule in words and finds its next slot. */
export type ExtensionSlot = { name: string; scope: Scope; when: When }

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
  /** Its manifest's verbs, by qualified name. @since 1.82 */
  verbs: ExtensionVerb[]
  /** Its manifest's client commands, by name: what renderers that import modules run. @since 1.84 */
  commands: ExtensionCommand[]
  /** Its manifest's slots. @since 1.86 */
  slots: ExtensionSlot[]
}

/**
 * One of an extension's client commands as the board shows it: the export of a module served at `/x/<cap>/<module>`,
 * and `on`, the subject kinds every subject of which is offered it.
 */
export type ExtensionCommand = { name: string; module: string; export: string; words: Words; on?: string[]; deprecated?: Deprecated }

/** What a fold may contribute beside its own part: the `adds` a manifest's fold declares. */
export const ADDS = ['actions', 'badges', 'tidy', 'lines', 'asks'] as const
export type Add = (typeof ADDS)[number]

/** How a badge reads, as a card's attention does. */
export const BADGE_TONES = ['quiet', 'working', 'needs', 'offered', 'ready', 'broken'] as const
export type BadgeTone = (typeof BADGE_TONES)[number]

/** A verb offered on a subject with its input (`call`), qualified: `pulse/ping`. Its words are its provider's. */
export type VerbAction = { verb: string; call: unknown }

/** One of the extension's own client commands offered on a subject, by name, with what it is handed as `args`. */
export type CommandAction = { command: string; args?: unknown }

export type Action = VerbAction | CommandAction

/** A word shown beside a subject: `href` a page it links to. */
export type Badge = { label: string; tone?: BadgeTone; hint?: string; href?: string }

/** Something a floor's Tidy would do for an extension, by `key`: listed with the core's, applied by its owner. */
export type TidyEntry = { key: string; label: string; hint?: string }

/**
 * Something asking for the user, in the attention order beside the waits. `key`: this ask alone, as `Wait.key` names a
 * wait. `subject`: the subject key it is about. `since`, `until`: epoch ms; it is gone past `until`. `sound`: it rings
 * as a wait does, or as an offer.
 */
export type Ask = { key: string; subject: string; title: string; since: number; until?: number; sound: 'wait' | 'offer'; actions: Action[] }

/** What one fold returns for one subject: its own part `x`, and what it adds to the subject and the board. */
export type Part = { x?: unknown; actions?: Action[]; badges?: Badge[]; tidy?: TidyEntry[]; lines?: string[]; asks?: Ask[] }

/** A contribution as the board carries it: tagged with the capability that made it. */
export type Added<T> = T & { cap: string }

export type AddedAction = (VerbAction | CommandAction) & { cap: string }
export type AddedBadge = Badge & { cap: string }
export type AddedTidy = TidyEntry & { cap: string }
export type AddedLine = { text: string; cap: string }

/** What extensions added to one subject, in fold order. `lines`: what `tower whoami` prints for a card's worker. */
export type Adds = { actions?: AddedAction[]; badges?: AddedBadge[]; tidy?: AddedTidy[]; lines?: AddedLine[] }

/** An ask as the board carries it: its `key` qualified by its capability, `<cap>:<key>`, and its actions tagged. */
export type BoardAsk = Omit<Ask, 'actions'> & { cap: string; actions: AddedAction[] }

/**
 * What a fold gets beside its subject: `board`, the core's, frozen; `settings`, the floor's (the system's for the
 * board's and a subject on no floor); `own`, its stores on the subject's floor, as `StartCtx.own` reads them: each
 * stream's reduce state (a project stream's on that floor; system streams alone for the board), each collection's
 * parsed items (none for the board), and on a card its facts over the worker's lineage.
 */
export type FoldCtx = {
  now: number
  settings: unknown
  board: Board
  own: { streams: Record<string, unknown>; collections: Record<string, ParsedItem[]>; facts?: SessionFact[] }
}

/** A fold of one subject kind: pure and synchronous, over frozen inputs. */
export type Fold = (subject: any, ctx: FoldCtx) => Part

/** An item of a collection, as `ctx.collections` lists it. `modifiedAt`: its version, epoch ms. */
export type Item = { id: string; tag: string; size: number; modifiedAt: number }

/** An item with what its collection's `parse` made of it; `undefined` without a `parse`. */
export type ParsedItem = Item & { parsed: unknown }

/**
 * Who a call is for, carried by every call. `t`: `user`, `worker` (`id` its session), `extension` (`id` its capability)
 * or `tower` (`id` the lane: `slot`); an open set, so a `t` a reader doesn't know is the strictest case it knows.
 * `via`: how it arrived. `within`: the qualified verbs this call is a step of, outermost first. Over HTTP the caller is
 * what the CLI's headers claim, not authenticated.
 */
export type Caller = {
  t: 'user' | 'worker' | 'extension' | 'tower' | (string & {})
  id?: string
  via: 'http' | 'cli' | 'ctx' | 'loop' | (string & {})
  within: string[]
}

/** The most calls one call may be nested in: a deeper one is refused, its chain named. */
export const MAX_DEPTH = 8

/** A qualified name split at its first `/`: the capability, the core's `tower`, and the provider's own name. */
export const qualifiedOf = (name: string): { cap: string; name: string } | undefined => {
  const at = name.indexOf('/')
  const cap = name.slice(0, at)
  return at > 0 && at < name.length - 1 && (cap === 'tower' || NAME.test(cap)) ? { cap, name: name.slice(at + 1) } : undefined
}

/** The caller of a call made inside the handler of `verb`: the handler's own, with `verb` appended to `within`. */
export const nestedIn = (caller: Caller, verb: string): Caller => ({ ...caller, within: [...caller.within, verb] })

/** Why `caller` may not call `verb`: the call would be nested more than `MAX_DEPTH` deep. */
export const tooDeep = (caller: Caller, verb: string): string | undefined =>
  caller.within.length >= MAX_DEPTH ? `${verb} would be nested more than ${MAX_DEPTH} calls deep: ${[...caller.within, verb].join(' → ')}` : undefined

/** A read's name as the manifest writes it: words and `<param>`s joined by `/`, `beats/<project>`. */
export const READ_PATH = /^[a-z][a-z0-9-]*(\/(<[a-z]+>|[a-z][a-z0-9-]*))*$/

/** The params a read's name holds, in order: `project` of `beats/<project>`. */
export const paramsOf = (read: string): string[] => [...read.matchAll(/<([a-z]+)>/g)].map((m) => m[1])

/** The params of `read` in a request's path below its capability, decoded; `undefined` when the path isn't the read's. */
export const matchRead = (read: string, path: string): Record<string, string> | undefined => {
  const parts = read.split('/')
  const got = path.split('/')
  if (parts.length !== got.length) return undefined
  const params: Record<string, string> = {}
  for (const [i, part] of parts.entries()) {
    const param = /^<([a-z]+)>$/.exec(part)?.[1]
    if (param === undefined ? part !== got[i] : !got[i]) return undefined
    if (param !== undefined) params[param] = decodeURIComponent(got[i])
  }
  return params
}

/**
 * Another capability's verbs and reads as functions, made from its provider's manifest: `deps.chime.ring(input)` is
 * `ctx.call('chime/ring', input)`, and `deps.chime.read['rings/<project>'](params, query)` is `ctx.read('chime/rings/<project>', …)`.
 */
export type Client = { read: Record<string, (params?: Record<string, string>, query?: Record<string, string>) => Promise<unknown>> } & Record<
  string,
  (input?: unknown) => Promise<unknown>
>

/**
 * A session fact `tower.x.<cap>.<name>` as an extension reads it: `name`, the part after `tower.x.<cap>.`; `at`, epoch
 * ms; `session`, the session that logged it.
 */
export type SessionFact = { name: string; value: unknown; at: number; session: string }

/**
 * One answer to a hook, by the capability that gave it: its answer, checked against the hook's `answer` schema, or why
 * there is none (an `ApiError` it chose, `internal` when it threw or answered off the schema, `unavailable` while it restarts).
 */
export type Answered<A = unknown> = { cap: string; ok: true; answer: A } | { cap: string; ok: false; code: string; message: string }

/**
 * A command `ctx.run` ran to its end: `exit` its code, `null` when a signal ended it (`signal`); `timedOut` when the
 * tower killed it at its timeout. Each stream is kept up to 64 KiB, stdout's beginning and stderr's end.
 */
export type RunResult = { exit: number | null; signal?: string; stdout: string; stderr: string; ms: number; timedOut: boolean }

/** Where a stream is: a `project` stream's facts are each floor's own; a `system` stream's are the tower's. */
export type StreamAt = { project?: string }

/** What `start` gets: who it is, its settings, timers and a log the tower clears and closes at halt, the board, and the calls. */
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
  /**
   * Calls a verb through the tower's one dispatch by its qualified name: the core's (`tower/spawn`), its own, and those of
   * what it requires or wants (`chime/ring`). Resolves to the verb's reply, or to an `ApiError` as a value. @since 1.82
   */
  call(verb: string, input?: unknown): Promise<unknown>
  /** Reads by qualified name (`tower/conversations/<id>`, `chime/rings/<project>`) what `call` reaches. @since 1.82 */
  read(read: string, params?: Record<string, string>, query?: Record<string, string>): Promise<unknown>
  /** Each capability it requires, and each it wants (`undefined` while missing), as functions. @since 1.82 */
  deps: Record<string, Client | undefined>
  /**
   * Raises one of its own hooks by name: the payload checked against its schema, then each answerer's answer, in fold
   * order, each on its own. What a failed answer does to the call raising it is the hook's `failure`. @since 1.85
   */
  raise(hook: string, payload: unknown): Promise<Answered[]>
  /** Its own streams, each fact checked against its code's schema; a stream's months are read in a window of epoch ms. @since 1.83 */
  streams: {
    append(stream: string, at: StreamAt, code: string, fact: unknown): Promise<void>
    read(stream: string, at: StreamAt, window?: { from?: number; to?: number }): AsyncIterable<StreamFact>
  }
  /** Logs `tower.x.<cap>.<name>` in a session's log, its value checked against the fact's schema. @since 1.83 */
  facts: { append(session: string, name: string, value: unknown): Promise<void> }
  /** Its own collections, on floors where it is on: the only writer of those it owns. @since 1.83 */
  collections: {
    list(project: string, name: string): Item[]
    read(project: string, name: string, id: string): Promise<string>
    create(project: string, name: string, item: { name: string; ext: string; content: string }): Promise<Item>
    /** Refused when the item changed since `modifiedAt`. */
    write(project: string, name: string, id: string, content: string, modifiedAt: number): Promise<Item>
    delete(project: string, name: string, id: string): Promise<void>
  }
  /**
   * Runs a command to its end from `cwd`: its env the tower's with the parent session scrubbed, its process group killed
   * by pid at `timeoutMs` (60 s when left out) and at halt. Rejects when it can't start. @since 1.86
   */
  run(argv: string[], opts: { cwd: string; timeoutMs?: number; stdin?: string }): Promise<RunResult>
  /** Its own stores as the tower folds them, read-only: what folds get as `own`. @since 1.83 */
  own: {
    /** A stream's `reduce` state: a `project` stream's on that floor; its `init` before any fact. */
    streams(name: string, project?: string): unknown
    /** A collection's items on a floor, each with its `parse` result, parsed again only when its file changes. */
    collections(project: string, name: string): ParsedItem[]
    /** Its facts in the session's lineage, oldest first, each once. */
    facts(session: string): SessionFact[]
  }
}

/**
 * A stream's fold: `step` takes each fact in order, from `init`. The state it gets is frozen, shared by every reader:
 * it returns a new one.
 */
export type Reduce = { init: unknown; step(state: any, fact: StreamFact): unknown }

/** What a verb's or read's handler gets: the ctx, whose calls carry the handler's caller with its verb in `within`. */
export type CallCtx = StartCtx & {
  /** Who the call is for. @since 1.82 */
  caller: Caller
}

/** A verb's handler: its input parsed by the manifest's schema, its reply checked against it. */
export type VerbHandler = (input: any, ctx: CallCtx) => unknown

/** A read's handler: its path's params, and its query parsed by the manifest's schema; its reply checked against it. */
export type ReadHandler = (req: { params: Record<string, string>; query: any }, ctx: CallCtx) => unknown

/**
 * A link of the chain around a verb or hook: it calls `next` with the input to pass on (parsed again by the target's
 * schema), or answers without calling it. What it answers is checked against the target's reply; a throw fails the call.
 */
export type AroundHandler = (input: any, next: (input: unknown) => Promise<unknown>, ctx: CallCtx) => unknown

/** An answer to a hook: the payload, as its schema parsed it; what it returns is checked against the hook's `answer`. */
export type AnswerHandler = (payload: any, ctx: CallCtx) => unknown

/**
 * A slot as its handler gets it: the slot's `name`, `at` (epoch ms), the floor of a `project`-scoped slot, and `key`,
 * the subject a fold's slot is for.
 */
export type Slot = { name: string; at: number; project?: string; key?: string }

/** What fires at a slot, called as the tower (`{t: 'tower', id: 'slot', via: 'loop'}`). */
export type SlotHandler = (slot: Slot, ctx: CallCtx) => void | Promise<void>

/** A call a trigger asks for: a verb by its qualified name, and its input. */
export type TriggerCall = { verb: string; input?: unknown }

/**
 * The board trigger: the calls a change between two boards asks for, pure and synchronous. Both boards are frozen, and
 * hold only the floors where its capability is on.
 */
export type BoardTrigger = (prev: Board, next: Board) => TriggerCall[]

/**
 * What `start` returns: a handler for every verb and read the manifest declares, no more and no fewer, and `halt`, called
 * before the tower clears what ctx opened. A handler answers an `ApiError` (`{t: 'error', code, message}`) to refuse.
 */
export type Started = {
  /** @since 1.82 */
  verbs?: Record<string, VerbHandler>
  /** @since 1.82 */
  reads?: Record<string, ReadHandler>
  halt?: () => void | Promise<void>
  /** Per collection, what an item's text means, cached by its version. @since 1.83 */
  parse?: Record<string, (text: string, item: Item) => unknown>
  /** Per stream, its fold. @since 1.83 */
  reduce?: Record<string, Reduce>
  /** Per subject kind its manifest folds, its fold. @since 1.84 */
  folds?: Record<string, Fold>
  /** A link per verb or hook its manifest's `around` names. @since 1.85 */
  around?: Record<string, AroundHandler>
  /** An answer per hook its manifest's `answers` names. @since 1.85 */
  answers?: Record<string, AnswerHandler>
  /** Per slot its manifest declares, what fires at it. @since 1.86 */
  slots?: Record<string, SlotHandler>
  /** What a board change asks for, when its manifest declares `triggers.board`. @since 1.86 */
  board?: BoardTrigger
}

/** The default export of an extension's server module. */
export type Start = (ctx: StartCtx) => Started | Promise<Started>

/** Each ctx member by lane, with the minor it arrived in: the `ctx` list of `test/served-exports.json`. */
type SinceOf<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown
    ? string
    : T[K] extends AbortSignal | readonly unknown[]
      ? string
      : T[K] extends object
        ? string extends keyof T[K]
          ? string
          : SinceOf<T[K]>
        : string
}

export const CTX_SINCE: { start: SinceOf<StartCtx>; call: SinceOf<Pick<CallCtx, 'caller'>>; fold: SinceOf<Omit<FoldCtx, 'board'>> & { board: string } } = {
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
    call: CALLS,
    read: CALLS,
    deps: CALLS,
    raise: AROUND,
    streams: { append: STORES, read: STORES },
    facts: { append: STORES },
    collections: { list: STORES, read: STORES, create: STORES, write: STORES, delete: STORES },
    own: { streams: STORES, collections: STORES, facts: STORES },
    run: TRIGGERS,
  },
  call: { caller: { t: CALLS, id: CALLS, via: CALLS, within: CALLS } },
  fold: { now: FOLDS, settings: FOLDS, board: FOLDS, own: { streams: FOLDS, collections: FOLDS, facts: FOLDS } },
}

/** The keys `start` may return. */
export const STARTED_KEYS = ['halt', 'verbs', 'reads', 'parse', 'reduce', 'folds', 'around', 'answers', 'slots', 'board'] as const

const sinceAt =
  (version: string) =>
  <T extends z.ZodType>(schema: T) =>
    schema.meta({ 'x-since': version })
const since = sinceAt(SINCE)
const sinceCalls = sinceAt(CALLS)
const stores = sinceAt(STORES)
const folds = sinceAt(FOLDS)
const around = sinceAt(AROUND)
const triggers = sinceAt(TRIGGERS)

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
const Word = z.string().regex(/^[a-z][a-z0-9.-]{0,47}$/, 'a lowercase word of letters, digits, dots and dashes, at most 48 long')
const ReadPath = z.string().regex(READ_PATH, 'words and <param>s joined by /, such as rings/<project>')
const Scope = z.enum(['system', 'project'])
const Deprecated = z.strictObject({
  since: sinceCalls(Version.describe("The provider's version it was deprecated in.")),
  use: sinceCalls(z.string().optional().describe('What to use instead, qualified: chime/ring.')),
  why: sinceCalls(z.string().optional()),
})
const Verb = z.strictObject({
  input: sinceCalls(Schema.describe("The input's JSON Schema: a project-scoped verb's requires `project`, a string.")),
  reply: sinceCalls(Schema),
  scope: sinceCalls(Scope.describe("`project`: refused on a floor where the capability is off, the floor its input's `project`.")),
  description: sinceCalls(z.string().optional()),
  words: sinceCalls(Words.optional()),
  deprecated: sinceCalls(Deprecated.optional()),
})
const Read = z.strictObject({
  query: sinceCalls(Schema.optional().describe("The query's JSON Schema; every value arrives as a string.")),
  reply: sinceCalls(Schema),
  scope: sinceCalls(Scope.describe("`project`: refused on a floor where the capability is off, the floor its `<project>` param, or its query's `project`.")),
  description: sinceCalls(z.string().optional()),
  deprecated: sinceCalls(Deprecated.optional()),
})
/** A verb or read by its provider's capability, the core as `tower`: `reviews/append`, `tower/collection/<project>/<collection>/<item>`. */
const Qualified = z
  .string()
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*(\/(<[a-z]+>|[a-z][a-z0-9.-]{0,47}))+$/, 'a verb or read qualified by its capability: reviews/append, tower/board')
const Door = z.union([
  Qualified.describe('The verb or read others reach the store by.'),
  z.strictObject({ none: stores(z.string().min(1).describe('Why the domain has no such act.')) }),
])
const Doors = z.strictObject({ list: stores(Door), read: stores(Door), create: stores(Door), edit: stores(Door), delete: stores(Door) })
const Collection = z
  .strictObject({
    label: stores(z.string()),
    description: stores(z.string()),
    owned: stores(z.boolean().optional().describe('Only its owner writes it: the generic writes are refused, naming the create door.')),
    doors: stores(Doors.optional().describe('How others reach it: each a verb or read, or why the domain has none. An owned collection declares all five.')),
  })
  .refine((c) => !c.owned || c.doors !== undefined, { message: 'an owned collection declares its doors: list, read, create, edit, delete', path: ['doors'] })
  .meta({ if: { properties: { owned: { const: true } }, required: ['owned'] }, then: { required: ['doors'] } })
const Stream = z.strictObject({
  scope: stores(z.enum(['system', 'project']).describe("`system`: the tower's one stream; `project`: one per floor.")),
  description: stores(z.string().optional()),
  facts: stores(
    z
      .record(z.string().regex(/^[a-z]$/, 'a fact code is one lowercase letter'), z.strictObject({ schema: stores(Schema), description: stores(z.string().optional()) }))
      .describe('Its fact codes, each with the JSON Schema its facts hold to.'),
  ),
  doors: stores(z.strictObject({ read: stores(Door), append: stores(Door) }).optional().describe('How others read it and append to it, through its owner.')),
})
const Fact = z.strictObject({ schema: stores(Schema), description: stores(z.string().optional()) })
const Hook = z.strictObject({
  payload: around(Schema.describe('What the provider raises it with.')),
  answer: around(Schema.describe('What each answerer answers.')),
  failure: around(z.enum(['refuses', 'reported']).describe('What a failed answer does to the call that raised the hook: refuses it, or is named in its reply.')),
  description: around(z.string().optional()),
  deprecated: around(Deprecated.optional()),
})
const Around = z.strictObject({
  before: around(z.array(Capability).optional().describe('The capabilities whose links it runs outside of: it sees the input before them and the reply after.')),
  after: around(z.array(Capability).optional().describe('The capabilities whose links it runs inside of.')),
})
const Cron = z.string().superRefine((cron, ctx) => {
  const problem = cronProblem(cron)
  if (problem) ctx.addIssue({ code: 'custom', message: problem })
})
const Period = z
  .string()
  .regex(/^\d+(s|m|h)$/)
  .superRefine((every, ctx) => {
    const problem = periodProblem(every)
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  })
const When = z.union([
  z.strictObject({
    cron: triggers(z.array(Cron).min(1).describe('Crons in the subset the tower says in words: their slots are the union of theirs.')),
    tz: triggers(z.string().refine(isZone, 'an IANA zone, like Europe/Lisbon').optional().describe("The zone the crons are read in; the tower machine's when left out.")),
  }),
  z.strictObject({
    every: triggers(
      Period.describe("A period aligned to the UTC clock: 5m fires at each multiple of 5 minutes since the epoch. The tower's 30 s loop bounds it: below 30s fires at most every 30 s."),
    ),
  }),
])
const SlotSpec = z.strictObject({
  when: triggers(When.describe('Its slots: crons, or a period.')),
  scope: triggers(Scope.optional().describe('`system`: one slot for the tower, the default; `project`: one per floor where it is on, the floor named.')),
})
const Check = z
  .strictObject({
    words: triggers(Words.describe('What it checks, as `tower doctor` prints it.')),
    run: triggers(z.array(z.string()).min(1).optional().describe('A command run from its folder, env scrubbed, killed at 10 s: exit 0 passes.')),
    read: triggers(ReadPath.optional().describe('One of its reads that takes no params: it passes when it answers. The tower must be up.')),
    fix: triggers(z.string().optional().describe('What to do when it fails.')),
  })
  .refine((c) => (c.run === undefined) !== (c.read === undefined), { message: 'a check holds exactly one of run and read' })
  .meta({ oneOf: [{ required: ['run'] }, { required: ['read'] }] })

/** How others reach a store: a verb or read qualified by its capability, or why the domain has no such act. */
export type Door = string | { none: string }
export type Doors = { list: Door; read: Door; create: Door; edit: Door; delete: Door }
export type Collection = z.infer<typeof Collection>
/** A line `tower doctor` prints: a command run from the extension's folder, or one of its reads. */
export type Check = z.infer<typeof Check>

const SubjectDecl = z.strictObject({
  description: folds(z.string().optional()),
  in: folds(z.enum(['board', 'floor', 'card']).describe('Where its subjects sit: in its own part of the board, a floor or a card.')),
  list: folds(z.string().min(1).describe('The array in its own x at `in` whose entries are the subjects; each has a `key`.')),
})
const FoldSpec = z.strictObject({
  x: folds(Schema.optional().describe("Its own part's JSON Schema, at subject.x.<capability>: on a card, a floor, the board, or an item of a collection it declares.")),
  adds: folds(z.array(z.enum(ADDS)).refine((adds) => new Set(adds).size === adds.length, { message: 'each add once' }).optional().describe('What it contributes beside its part.')),
})
const Command = z.strictObject({
  module: folds(Path.describe('Its module, below the client folder: served at /x/<capability>/<module>.')),
  export: folds(z.string().min(1)),
  words: folds(Words),
  on: folds(z.array(SubjectKind).optional().describe('The subject kinds every subject of which is offered it, with no fold.')),
  deprecated: folds(Deprecated.optional()),
})

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
    verbs: sinceCalls(z.record(Word, Verb).optional().describe('Its verbs by name: POST /<capability>/<name>, ctx.call, tower x.')),
    reads: sinceCalls(z.record(ReadPath, Read).optional().describe('Its reads by path: GET /<capability>/<path>, ctx.read.')),
    hooks: around(z.record(Word, Hook).optional().describe('Its own hooks, raised inside its verbs with ctx.raise: a hook shares one namespace with its verbs and reads.')),
    answers: around(
      z
        .record(Qualified, z.strictObject({}))
        .optional()
        .describe("The hooks it answers, qualified: tower/discard.record. Each one's capability is its own, the core's or one it requires or wants."),
    ),
    around: around(
      z
        .record(Qualified, Around)
        .optional()
        .describe("The verbs and hooks it wraps, qualified: tower/spawn, chime/ring. Each one's capability is its own, the core's or one it requires or wants."),
    ),
    collections: stores(z.record(Word, Collection).optional().describe('Its collections, each named `<provides>` or `<provides>.<name>`.')),
    streams: stores(z.record(Word, Stream).optional().describe('Its streams, `streams/{system|projects/<p>}/<provides>.<name>/`: always its own to write.')),
    facts: stores(z.record(Word, Fact).optional().describe('Its session facts, logged as `tower.x.<provides>.<name>`.')),
    client: folds(Path.optional().describe('Its folder of files served at /x/<capability>/: its commands\' modules.')),
    subjects: folds(z.record(Word, SubjectDecl).optional().describe('Its own subject kinds, `<provides>.<kind>`, that others contribute to: where they sit in its part.')),
    folds: folds(z.record(SubjectKind, FoldSpec).optional().describe('Per subject kind it folds: the x it makes and what it adds.')),
    commands: folds(z.record(Word, Command).optional().describe('Its client commands: a module\'s export run by renderers that import modules.')),
    slots: triggers(z.record(Word, SlotSpec).optional().describe("Its time triggers: start returns slots.<name>, which the tower's loop calls at each slot due.")),
    triggers: triggers(
      z
        .strictObject({ board: triggers(z.strictObject({}).optional().describe('start returns board(prev, next), called after each board build from the second on.')) })
        .optional()
        .describe('Its change triggers.'),
    ),
    checks: triggers(z.record(Word, Check).optional().describe('Lines `tower doctor` prints: a command, or one of its reads.')),
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
