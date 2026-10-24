/**
 * The extensions in the tower's system (decision `extensions`): one braided resource per accepted extension, `x:<cap>`,
 * started after the core and what it requires, and reconciled whenever the config changes. A resource is memoized by a
 * hash of what it starts from, so an extension the edit leaves unchanged keeps running and a changed one restarts with
 * its dependents. `core:extensions` holds what the board and `GET /extensions` show of them: the registry, recomputed
 * after each reconcile, and the resources it was computed over.
 */
import { buildTopology, defineResource, reconcileSystem, toMermaid, topologicalSort, type Resource, type StartedResource, type StartedSystem, type SystemConfig } from 'braided'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { NO_EXTENSIONS, offOn, registry, resolve, type Accepted, type Outcome, type Registry } from '../bridge/extensions.ts'
import { discover, newestIn } from '../extensions.ts'
import { API_VERSION } from '../shared/api.ts'
import { STARTED_KEYS, type Start, type Started, type StartCtx } from '../shared/extensions.ts'
import { ConfigError, type Config } from '../shared/model.ts'
import type { Reads } from '../shared/shelf-page.ts'
import { PUBLISH_DEBOUNCE_MS, type PublisherResource } from './publisher.ts'
import type { ConfigResource, TowerResources, TowerSystem } from './spine.ts'

/** The resources as braided orders them, read from their dependencies alone: nothing needs to run. */
const topologyOf = (resources: SystemConfig): Reads['extensions']['topology'] => {
  const nodes = resources as Record<string, Resource>
  const topology = buildTopology(nodes, topologicalSort(nodes))
  return { ...topology, mermaid: toMermaid(topology) }
}

export const extensions = defineResource({
  start: () => {
    let current: { registry: Registry; resources: SystemConfig } = { registry: NO_EXTENSIONS, resources: {} }
    const listeners = new Set<() => void>()
    return {
      registry: () => current.registry,
      /** `GET /extensions`: every extension as it stands, and the tower's resources as braided orders them. */
      read: (): Reads['extensions'] => ({ extensions: current.registry.extensions, topology: topologyOf(current.resources) }),
      set: (next: typeof current) => {
        current = next
        for (const listener of listeners) listener()
      },
      /** Calls `listener` after each `set`, until the returned function is called. */
      onChange: (listener: () => void) => {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    }
  },
  halt: () => {},
})
export type ExtensionsResource = StartedResource<typeof extensions>

/** The resource an extension's capability is started as. */
export const resourceOf = (cap: string) => `x:${cap}`

/** How long `start` may take before the extension counts as failed. */
const START_MS = 10_000

/** `start` returned something other than what the manifest declares. */
export class MismatchError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Why what `start` returned doesn't match the manifest, if it doesn't: with no lanes yet, only `halt` may come back. */
const mismatchOf = (started: unknown): string | undefined => {
  if (!isObject(started)) return `start returned ${JSON.stringify(started)}: it returns an object of what its manifest declares`
  const undeclared = Object.keys(started).filter((key) => !(STARTED_KEYS as readonly string[]).includes(key))
  if (undeclared.length) return `start returned ${undeclared.join(', ')}, which its manifest doesn't declare`
  if (started.halt !== undefined && typeof started.halt !== 'function') return 'start returned a halt that is no function'
  return undefined
}

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

type Deps = { 'core:config': ConfigResource; 'core:publisher': PublisherResource } & Record<string, unknown>

/** What every extension starts after: the core's pieces its ctx reaches now, and the dispatch its calls will go through. */
const CORE_DEPS = ['core:config', 'core:system', 'core:publisher', 'core:dispatch']

/** Starts an extension: its ctx built, its `start` called and checked; what ctx opened is cleared at halt, or as a start fails. */
async function startExtension(a: Accepted, hash: string, deps: Deps): Promise<{ halt: () => Promise<void> }> {
  const { 'core:config': config, 'core:publisher': publisher } = deps
  const controller = new AbortController()
  const timers = new Set<NodeJS.Timeout>()
  const dispose = () => {
    for (const timer of timers) clearInterval(timer)
    timers.clear()
    controller.abort()
  }
  const log = (message: string) => console.log(`${a.id}: ${message}`)
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
    on: (project) => !offOn(config.read(), project, a.chain),
    every: (ms, fn) =>
      void timers.add(
        setInterval(() => void Promise.resolve().then(fn).catch((err) => console.error(`${a.id}: every ${ms} ms:`, err)), ms),
      ),
    log,
    signal: controller.signal,
    board: () => publisher.board(),
  }
  /** What a start returned, halted: it started something, and won't run. */
  const haltLate = (started: Started) =>
    void Promise.resolve()
      .then(() => (typeof started?.halt === 'function' ? started.halt() : undefined))
      .catch((err) => console.error(`${a.id}: halt:`, err))
  try {
    const start = await startOf(a, hash)
    const started = await within(START_MS, Promise.resolve().then(() => start(ctx)), haltLate)
    const mismatch = mismatchOf(started)
    if (mismatch) {
      haltLate(started)
      throw new MismatchError(mismatch)
    }
    return {
      halt: async () => {
        try {
          await started.halt?.()
        } finally {
          dispose()
        }
      },
    }
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
    halt: ({ halt }) => halt(),
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
  holder.set({ registry: NO_EXTENSIONS, resources })

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
    holder.set({ registry: registry(resolved, outcomes, at), resources })
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
