/**
 * The extensions in the tower's system (decision `extensions`): one braided resource per accepted extension, `x:<cap>`,
 * started after the core and what it requires, and reconciled whenever the config changes. A resource is memoized by a
 * hash of what it starts from, so an extension the edit leaves unchanged keeps running and a changed one restarts with
 * its dependents. `core:extensions` holds what the board and `GET /extensions` show of them (the registry, recomputed
 * after each reconcile and as calls find problems, and the resources it was computed over) and what runs now, which
 * the dispatch reaches each extension's verbs and reads through (`calls.ts`).
 */
import { buildTopology, defineResource, reconcileSystem, toMermaid, topologicalSort, type Resource, type StartedResource, type StartedSystem, type SystemConfig } from 'braided'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mismatchOf, NO_EXTENSIONS, PROBLEMS_SHOWN, registry, resolve, withProblem, type Accepted, type Outcome, type Registry, type Resolved } from '../bridge/extensions.ts'
import type { Folder, FoldProblem, OwnAt, SubjectDecl } from '../bridge/folds.ts'
import { discover, newestIn } from '../extensions.ts'
import { runProcess } from '../run.ts'
import { API_VERSION, apiError, COMPOSITES, type ApiError } from '../shared/api.ts'
import { EXTENSION_STATE_NAME } from '../shared/extension-words.ts'
import {
  nestedIn,
  qualifiedOf,
  type CallCtx,
  type Caller,
  type Client,
  type ExtensionProblem,
  type ExtensionView,
  type Fold,
  type FoldCtx,
  type Manifest,
  type ProblemLane,
  type Slot,
  type Start,
  type Started,
  type StartCtx,
} from '../shared/extensions.ts'
import { ConfigError, type Config } from '../shared/model.ts'
import type { Reads } from '../shared/shelf-page.ts'
import type { DispatchResource } from './dispatch.ts'
import type { HttpResource } from './http.ts'
import { PUBLISH_DEBOUNCE_MS, type PublisherResource } from './publisher.ts'
import type { ConfigResource, SystemResource, TowerResources, TowerSystem } from './spine.ts'
import { storesOf } from './stores.ts'
import { BOARD_CALLER, runBoardTrigger } from './triggers.ts'
import { offOn } from '../bridge/stores.ts'

/** The resources as braided orders them, read from their dependencies alone: nothing needs to run. */
const topologyOf = (resources: SystemConfig): Reads['extensions']['topology'] => {
  const nodes = resources as Record<string, Resource>
  const topology = buildTopology(nodes, topologicalSort(nodes))
  return { ...topology, mermaid: toMermaid(topology) }
}

/** Each verb a core composite calls through the dispatch, with the composites that call it. */
const compositesByVerb: Record<string, string[]> = Object.fromEntries(
  [...new Set(Object.values(COMPOSITES).flat())].sort().map((verb) => [verb, Object.keys(COMPOSITES).filter((composite) => COMPOSITES[composite].includes(verb))]),
)

/** A started extension, as its resource holds it: its manifest, and its handlers, each run with a ctx for its caller. */
export type Instance = {
  manifest: Manifest
  /** Set once its halt begins: a call then answers that it is restarting. */
  halting: boolean
  verb(name: string, input: unknown, caller: Caller): unknown
  read(name: string, req: { params: Record<string, string>; query: unknown }, caller: Caller): unknown
  /** Its folds by subject kind, what each gets as `own` at a subject, and its settings on a floor. */
  folds: Record<string, Fold>
  foldOwn(at: OwnAt): FoldCtx['own']
  settingsOf(project: string): unknown
  /** Each of its stream folds stopped before a fact its step threw on, and why. */
  threw(): { stream: string; project?: string; message: string }[]
  /** Its link around `target`, a qualified verb or hook. */
  link(target: string, input: unknown, next: (input: unknown) => Promise<unknown>, caller: Caller): unknown
  /** Its answer to `hook`, qualified. */
  answer(hook: string, payload: unknown, caller: Caller): unknown
  /** Fires a slot of its manifest's: the handler's calls are made as `caller`. */
  slot(name: string, slot: Slot, caller: Caller): Promise<void>
  halt(): Promise<void>
}

/** A capability as a call finds it: provided by nobody, provided and not running, being started or restarted, or running. */
export type Live = { t: 'none' } | { t: 'down'; why: string } | { t: 'moving'; why: 'starting' | 'restarting' } | { t: 'up'; a: Accepted; instance: Instance }

/** What the registry is computed over, and what runs: the latest resolve, how each start went (`at`, when), the resources and their instances. */
type Held = { resolved: Resolved; outcomes: Map<string, Outcome>; at: number; resources: SystemConfig; system: Record<string, unknown> }

const NO_RESOLVED: Resolved = { order: [], accepted: new Map(), refused: new Map() }

/** The resource an extension's capability is started as. */
export const resourceOf = (cap: string) => `x:${cap}`

export const extensions = defineResource({
  start: () => {
    let held: Held = { resolved: NO_RESOLVED, outcomes: new Map(), at: 0, resources: {}, system: {} }
    /** The capabilities the reconcile under way starts or restarts. */
    let moving = new Set<string>()
    /** The problems calls found, by extension id, newest first: kept until the extension starts again. */
    let calls = new Map<string, ExtensionProblem[]>()
    let shown: Registry = NO_EXTENSIONS
    /** The problems the latest board's folds found, by extension id: each dated by the first build of a run that found it. */
    let folded = new Map<string, ExtensionProblem[]>()
    const listeners = new Set<() => void>()
    /** The running extensions, in resolved order, each with its instance. */
    const running = () =>
      held.resolved.order.flatMap((id) => {
        const a = held.resolved.accepted.get(id)!
        const instance = held.system[resourceOf(a.provides)] as Instance | undefined
        const started = shown.extensions.find((e) => e.id === id)?.state === 'started'
        return instance && started && !instance.halting && !moving.has(a.provides) ? [{ a, instance }] : []
      })
    /** Every extension as the registry shows it, the latest board's fold problems first. */
    const views = (): ExtensionView[] =>
      shown.extensions.map((e) => (folded.has(e.id) ? { ...e, problems: [...folded.get(e.id)!, ...e.problems].slice(0, PROBLEMS_SHOWN) } : e))
    const changed = () => {
      shown = registry(held.resolved, held.outcomes, held.at, calls)
      for (const listener of listeners) listener()
    }
    return {
      registry: () => shown,
      /** `GET /extensions`: every extension as it stands, and the tower's resources as braided orders them. */
      read: (): Reads['extensions'] => ({ extensions: views(), topology: topologyOf(held.resources), chains: shown.chains, answers: shown.answers, composites: compositesByVerb }),
      /** The running extensions that fold, as the fold pass reads them, each one's floor settings read once per build. */
      folders: (): Folder[] => {
        const all = running()
        const verbsOf = (cap: string) => new Set(Object.keys(all.find(({ a }) => a.provides === cap)?.a.manifest.verbs ?? {}))
        return all
          .filter(({ instance }) => Object.keys(instance.folds).length)
          .map(({ a, instance }) => {
            const settings = new Map<string, unknown>()
            return {
              id: a.id,
              cap: a.provides,
              requires: a.requires,
              wants: a.wants,
              off: a.off,
              specs: a.folds,
              folds: instance.folds,
              commands: Object.keys(a.manifest.commands ?? {}),
              verbs: new Map([a.provides, ...a.requires, ...a.wants].map((cap) => [cap, verbsOf(cap)])),
              settings: (project) => {
                if (project === undefined) return a.settings
                if (!settings.has(project)) settings.set(project, instance.settingsOf(project))
                return settings.get(project)
              },
              own: instance.foldOwn,
            }
          })
      },
      /** Where each running extension's own subject kinds sit, by kind, `<cap>.<kind>`. */
      subjects: (): Map<string, SubjectDecl> =>
        new Map(running().flatMap(({ a }) => Object.entries(a.manifest.subjects ?? {}).map(([kind, decl]) => [`${a.provides}.${kind}`, decl] as const))),
      /**
       * Every extension as the board shows it once a build's folds found `problems` (`now`, when), with each stream fold
       * stopped by a throwing step: a problem found by the build before keeps its date, and none of it notifies a change.
       */
      folded: (problems: FoldProblem[], now: number): ExtensionView[] => {
        const reduces = running().flatMap(({ a, instance }) =>
          instance.threw().map(({ stream, project, message }): FoldProblem => ({ id: a.id, problem: { lane: 'fold', level: 'error', code: 'threw', message: project ? `on ${project}, ${message}` : message, path: `streams.${stream}` } })),
        )
        const same = (p: ExtensionProblem, q: FoldProblem['problem']) => p.code === q.code && p.path === q.path && p.subject === q.subject && (p.code === 'slow' || p.message === q.message)
        folded = new Map(
          [...Map.groupBy([...problems, ...reduces], (p) => p.id)].map(([id, found]) => [
            id,
            found.map(({ problem }) => ({ ...problem, at: folded.get(id)?.find((p) => same(p, problem))?.at ?? now, count: 1 })),
          ]),
        )
        return views()
      },
      /** The capabilities a reconcile is about to start or restart: until the next `set`, a call to one is unavailable. */
      moving: (caps: Set<string>) => void (moving = caps),
      /** What a reconcile ended with; the call problems of the extensions it `started` are dropped. */
      set: (next: Held, started: string[]) => {
        held = next
        moving = new Set()
        calls = new Map([...calls].filter(([id]) => !started.includes(id)))
        changed()
      },
      /** The extensions the latest reconcile accepted: what `/schema` lists. */
      accepted: (): Accepted[] => [...held.resolved.accepted.values()],
      /** A capability as a call finds it now. */
      live: (cap: string): Live => {
        const instance = held.system[resourceOf(cap)] as Instance | undefined
        if (moving.has(cap) || instance?.halting) return { t: 'moving', why: instance ? 'restarting' : 'starting' }
        const a = [...held.resolved.accepted.values()].find((accepted) => accepted.provides === cap)
        if (a && instance) return { t: 'up', a, instance }
        const view = shown.extensions.find((e) => e.provides === cap)
        return view ? { t: 'down', why: EXTENSION_STATE_NAME[view.state] } : { t: 'none' }
      },
      /** Every extension that runs now, and isn't halting. */
      running: (): { a: Accepted; instance: Instance }[] =>
        [...held.resolved.accepted.values()].flatMap((a) => {
          const instance = held.system[resourceOf(a.provides)] as Instance | undefined
          return instance && !instance.halting && !moving.has(a.provides) ? [{ a, instance }] : []
        }),
      /** A problem a call found in extension `id`. */
      problem: (id: string, problem: Omit<ExtensionProblem, 'count'>) => {
        calls = new Map(calls).set(id, withProblem(calls.get(id) ?? [], problem))
        changed()
      },
      /** Calls `listener` after each `set` and each problem, until the returned function is called. */
      onChange: (listener: () => void) => {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    }
  },
  halt: () => {},
})
export type ExtensionsResource = StartedResource<typeof extensions>

/** How long a command `ctx.run` runs may take when it names no timeout. */
const RUN_MS = 60_000

/** How long `start` may take before the extension counts as failed. */
const START_MS = 10_000

/** `start` returned something other than what the manifest declares. */
export class MismatchError extends Error {}

/**
 * The extension's `start`: its server module's default export, imported afresh for each hash; none without a server.
 * Only the module itself is imported afresh: the modules it imports are Node's, cached as first loaded until the tower restarts.
 */
const startOf = async (a: Accepted, hash: string): Promise<Start> => {
  if (!a.manifest.server) return () => ({})
  const module = await import(`${pathToFileURL(path.join(a.dir, a.manifest.server)).href}?v=${hash}`)
  if (typeof module.default !== 'function') throw new MismatchError(`${a.manifest.server} has no default export: its start`)
  return module.default
}

/** `promise`, or a rejection once `ms` pass first; what it settles to after that goes to `late`. */
const within = <T>(ms: number, promise: Promise<T>, late: (value: T) => void): Promise<T> =>
  new Promise((done, fail) => {
    let over = false
    const timer = setTimeout(() => {
      over = true
      fail(new Error(`start didn't settle within ${ms / 1000} s`))
    }, ms)
    promise.then(
      (value) => (clearTimeout(timer), over ? late(value) : done(value)),
      (err) => (clearTimeout(timer), over ? console.error('a start past its time threw:', err) : fail(err)),
    )
  })

type Deps = {
  'core:config': ConfigResource
  'core:publisher': PublisherResource
  'core:dispatch': DispatchResource
  'core:http': HttpResource
  'core:extensions': ExtensionsResource
  'core:system': SystemResource
} & Record<string, unknown>

/** What every extension starts after: the core's pieces its ctx reaches, the dispatch its calls go through, and the server its core reads are read from. */
const CORE_DEPS = ['core:config', 'core:system', 'core:publisher', 'core:dispatch', 'core:http', 'core:extensions']

/** A capability's verbs and reads as functions over `call` and `read`, named as its provider's manifest names them. */
const clientOf = (cap: string, manifest: Manifest, call: StartCtx['call'], read: StartCtx['read']): Client =>
  Object.assign(Object.fromEntries(Object.keys(manifest.verbs ?? {}).map((verb) => [verb, (input?: unknown) => call(`${cap}/${verb}`, input)])), {
    read: Object.fromEntries(Object.keys(manifest.reads ?? {}).map((name) => [name, (params?: Record<string, string>, query?: Record<string, string>) => read(`${cap}/${name}`, params, query)])),
  }) as Client

/**
 * Starts an extension: its ctx built, its `start` called and checked; what ctx opened is cleared at halt, or as a start
 * fails. Its instance answers each call with a ctx of its own, whose calls carry that call's caller one step deeper.
 */
async function startExtension(a: Accepted, hash: string, deps: Deps): Promise<Instance> {
  const { 'core:config': config, 'core:publisher': publisher, 'core:dispatch': dispatch, 'core:http': http, 'core:extensions': holder, 'core:system': live } = deps
  const controller = new AbortController()
  const timers = new Set<NodeJS.Timeout>()
  const on = (project: string) => !offOn(config.read(), project, a.chain)
  const stores = storesOf(a, config, live, on)
  let unheard = () => {}
  const dispose = () => {
    unheard()
    for (const timer of timers) clearInterval(timer)
    timers.clear()
    stores.stop()
    controller.abort()
  }
  const log = (message: string) => console.log(`${a.id}: ${message}`)
  /** The manifests of what it requires, and of what it wants that started (one that failed is no dependency): what `ctx.deps` is made from. */
  const providers = new Map([...a.requires, ...a.wants].flatMap((cap) => {
    const provider = deps[resourceOf(cap)] as Instance | undefined
    return provider ? [[cap, provider.manifest] as const] : []
  }))

  /** A qualified name it may call or read: the core's, its own, or one of a capability it declares and that runs. */
  const reachable = (name: string): { cap: string; name: string } | ApiError => {
    const q = qualifiedOf(name)
    if (!q) return apiError('invalid', `"${name}" is no qualified name: <capability>/<name>, the core's tower/<name>`)
    if (q.cap === 'tower' || q.cap === a.provides || providers.has(q.cap)) return q
    if (Object.hasOwn(a.manifest.wants ?? {}, q.cap)) return apiError('unavailable', `${a.id} wants ${q.cap}, which doesn't run now: ctx.deps.${q.cap} is undefined`)
    return apiError('refused', `${a.id} reaches ${name} without declaring ${q.cap}: declare requires.${q.cap}, or wants.${q.cap}, in its manifest`)
  }

  /** A call of a deprecated verb or read counts against the extension that makes it, as a warning. */
  const noteDeprecated = (q: { cap: string; name: string }, lane: ProblemLane) => {
    const deprecated = q.cap === 'tower' ? undefined : dispatch.deprecationOf(q.cap, q.name)
    if (!deprecated) return
    const message = `${a.provides} calls ${q.cap}/${q.name}, deprecated since ${q.cap} ${deprecated.since}${deprecated.use ? `: use ${deprecated.use}` : ''}`
    holder.problem(a.id, { lane, level: 'warn', code: 'deprecated', message, at: Date.now() })
  }

  /** `call`, `read`, `deps` and `raise` for calls made as `caller`. */
  const callsOf = (caller: Caller): Pick<StartCtx, 'call' | 'read' | 'deps' | 'raise'> => {
    const call: StartCtx['call'] = async (verb, input = {}) => {
      const q = reachable(verb)
      if ('t' in q) return q
      noteDeprecated(q, 'verb')
      return dispatch.call(verb, input, caller)
    }
    const read: StartCtx['read'] = async (name, params = {}, query = {}) => {
      const q = reachable(name)
      if ('t' in q) return q
      noteDeprecated(q, 'read')
      return q.cap === 'tower' ? http.read(q.name, params, query, caller) : dispatch.read(q.cap, q.name, params, query, caller)
    }
    const wanted = Object.keys(a.manifest.wants ?? {}).map((cap): [string, Client | undefined] => [cap, undefined])
    const deps = Object.fromEntries([...wanted, ...[...providers].map(([cap, manifest]): [string, Client] => [cap, clientOf(cap, manifest, call, read)])])
    const raise: StartCtx['raise'] = async (hook, payload) => {
      if (!a.hooks.has(hook)) throw new Error(`${a.provides} has no hook ${hook}: ctx.raise raises its own, by the name its manifest's hooks give it`)
      return dispatch.raise(`${a.provides}/${hook}`, payload, caller)
    }
    return { call, read, deps, raise }
  }

  const ctx: StartCtx = {
    id: a.id,
    provides: a.provides,
    version: a.manifest.version,
    dir: a.dir,
    tower: { version: API_VERSION },
    settings: a.settings,
    settingsOf: (project) => {
      const now = config.read()
      return a.schema?.parse({ ...now.extensions?.[a.id]?.settings, ...now.projects[project]?.extensions?.[a.id]?.settings })
    },
    on,
    every: (ms, fn) =>
      void timers.add(
        setInterval(() => void Promise.resolve().then(fn).catch((err) => console.error(`${a.id}: every ${ms} ms:`, err)), ms),
      ),
    log,
    signal: controller.signal,
    board: () => publisher.board(),
    run: (argv, { cwd, timeoutMs = RUN_MS, stdin }) => runProcess(argv, { cwd, timeoutMs, stdin, signal: controller.signal }),
    ...callsOf({ t: 'extension', id: a.provides, via: 'ctx', within: [] }),
    ...stores.ctx,
  }
  /** The ctx a handler of `qualified` gets: its caller, and calls made one step deeper. */
  const handlerCtx = (caller: Caller, qualified: string): CallCtx => ({ ...ctx, caller, ...callsOf(nestedIn(caller, qualified)) })
  /** What a start returned, halted: it started something, and won't run. */
  const haltLate = (started: Started) =>
    void Promise.resolve()
      .then(() => (typeof started?.halt === 'function' ? started.halt() : undefined))
      .catch((err) => console.error(`${a.id}: halt:`, err))
  try {
    const start = await startOf(a, hash)
    const started = await within(START_MS, Promise.resolve().then(() => start(ctx)), haltLate)
    const mismatch = mismatchOf(started, a.manifest)
    if (mismatch) {
      haltLate(started)
      throw new MismatchError(mismatch)
    }
    stores.attach(started)
    if (started.board) {
      unheard = publisher.onBoard(
        runBoardTrigger(started.board, {
          off: () => {
            const now = config.read()
            return new Set(Object.keys(now.projects).filter((project) => offOn(now, project, a.chain)))
          },
          call: callsOf(BOARD_CALLER).call,
          problem: (problem) => holder.problem(a.id, { ...problem, lane: 'trigger', at: Date.now(), path: 'triggers.board' }),
        }),
      )
    }
    const instance: Instance = {
      manifest: a.manifest,
      halting: false,
      folds: started.folds ?? {},
      foldOwn: stores.foldOwn,
      settingsOf: ctx.settingsOf,
      threw: stores.threw,
      verb: (name, input, caller) => started.verbs![name](input, handlerCtx(caller, `${a.provides}/${name}`)),
      read: (name, req, caller) => started.reads![name](req, handlerCtx(caller, `${a.provides}/${name}`)),
      link: (target, input, next, caller) => started.around![target](input, next, handlerCtx(caller, target)),
      answer: (hook, payload, caller) => started.answers![hook](payload, handlerCtx(caller, hook)),
      slot: async (name, slot, caller) => started.slots![name](slot, { ...ctx, caller, ...callsOf(caller) }),
      halt: async () => {
        instance.halting = true
        try {
          await started.halt?.()
        } finally {
          dispose()
        }
      },
    }
    return instance
  } catch (err) {
    dispose()
    throw err
  }
}

/** What a resource starts from: its id, manifest, settings, files and dependencies. The same hash, the same resource. */
const hashOf = (a: Accepted): string =>
  createHash('sha256')
    .update(JSON.stringify([a.id, a.text, a.settings, newestIn(a.dir), [...a.requires].sort(), [...a.wants].sort()]))
    .digest('hex')
    .slice(0, 16)

const extensionResource = (a: Accepted, hash: string) =>
  defineResource({
    dependencies: { required: [...CORE_DEPS, ...a.requires.map(resourceOf)], optional: a.wants.map(resourceOf) },
    start: (deps: Deps) => startExtension(a, hash, deps),
    halt: (instance) => instance.halt(),
  })

/** Each accepted extension's resource by `x:<cap>`: the one in `memo` when its hash is unchanged, else a new one. */
const resourcesOf = (accepted: Accepted[], memo: Map<string, Resource>) => {
  const hashed = accepted.map((a) => ({ a, hash: hashOf(a) }))
  const next = new Map(hashed.map(({ a, hash }) => [hash, memo.get(hash) ?? (extensionResource(a, hash) as Resource)]))
  return { memo: next, resources: Object.fromEntries(hashed.map(({ a, hash }) => [resourceOf(a.provides), next.get(hash)!])) }
}

/** An error a resource met, as an outcome says it. */
const errorOf = (err: Error): Outcome['error'] => ({ code: err instanceof MismatchError ? 'mismatch' : 'failed', message: err.message })

/**
 * The extensions run beside the started core: reconciled now, and again whenever the config changes, one reconcile at a
 * time. `stop` waits for the one under way and hands back the system as it stands, to be halted.
 */
export const runExtensions = async (core: TowerResources, started: TowerSystem) => {
  const { 'core:config': config, 'core:system': live, 'core:extensions': holder } = started
  let resources: SystemConfig = core
  let system: StartedSystem<SystemConfig> = started
  let memo = new Map<string, Resource>()
  let outcomes = new Map<string, Outcome>()
  /** Which extension each capability's resource last ran. */
  let idOf = new Map<string, string>()
  let seen: string | undefined
  holder.set({ resolved: NO_RESOLVED, outcomes, at: Date.now(), resources, system }, [])

  const reconcile = async () => {
    let now: Config
    try {
      now = config.read()
    } catch (err) {
      if (err instanceof ConfigError) return
      throw err
    }
    const text = JSON.stringify(now)
    if (text === seen) return
    seen = text
    const resolved = resolve(discover(now), now, API_VERSION)
    const accepted = resolved.order.map((id) => resolved.accepted.get(id)!)
    const next = resourcesOf(accepted, memo)
    const nextResources = { ...core, ...next.resources }
    holder.moving(new Set(accepted.map((a) => a.provides).filter((cap) => (nextResources as SystemConfig)[resourceOf(cap)] !== (resources as SystemConfig)[resourceOf(cap)])))
    const result = await reconcileSystem(resources, system, nextResources)
    const at = Date.now()
    const nextIdOf = new Map(accepted.map((a) => [resourceOf(a.provides), a.id]))
    const halts = new Map([...result.haltErrors].map(([rid, err]) => [idOf.get(rid) ?? nextIdOf.get(rid)!, err.message]))
    for (const [id, message] of halts) console.error(`${id} didn't halt: ${message}`)
    const listed = new Set([...resolved.accepted.keys(), ...resolved.refused.keys()])
    const nextOutcomes = new Map([...outcomes].filter(([id]) => listed.has(id)))
    for (const [id, halt] of halts) nextOutcomes.set(id, { at, halt })
    for (const rid of result.started.filter((rid) => nextIdOf.has(rid))) {
      const id = nextIdOf.get(rid)!
      const err = result.errors.get(rid)
      if (err) console.error(`${id} didn't start:`, err.message)
      nextOutcomes.set(id, { at, ...(err && { error: errorOf(err) }), ...(halts.has(id) && { halt: halts.get(id) }) })
    }
    resources = nextResources
    system = result.system
    memo = next.memo
    outcomes = nextOutcomes
    idOf = nextIdOf
    holder.set({ resolved, outcomes, at, resources, system: system as Record<string, unknown> }, result.started.flatMap((rid) => (nextIdOf.has(rid) ? [nextIdOf.get(rid)!] : [])))
  }

  let queue = Promise.resolve()
  const enqueue = () => (queue = queue.then(reconcile).catch((err) => console.error('extensions:', err)))

  let timer: NodeJS.Timeout | undefined
  const unsubscribe = live.onChange(() => {
    timer ??= setTimeout(() => {
      timer = undefined
      void enqueue()
    }, PUBLISH_DEBOUNCE_MS)
  })
  await enqueue()

  return {
    stop: async () => {
      unsubscribe()
      clearTimeout(timer)
      await queue
      return { resources, system }
    },
  }
}
