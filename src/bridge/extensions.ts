/**
 * Extensions resolved before any of them runs (decision `extensions`): every manifest read, then refused when it can't
 * load (invalid, out of range, unmet, in a cycle, in conflict) and its required dependents skipped, so only an acyclic,
 * fully met graph reaches braided. The registry, what the board and `GET /extensions` show, is derived from what was
 * resolved and how each start went.
 */
import path from 'node:path'
import { z } from 'zod'
import { BUNDLED, capabilityOf, Manifest, MANIFEST_SCHEMA, meets, paramsOf, versionOf, type ExtensionProblem, type ExtensionView } from '../shared/extensions.ts'
import type { Config, ExtensionConfig } from '../shared/model.ts'

/** An extension folder the tower found: a bundled one, or one the config names. `text`: its `extension.json`, when there is one. */
export type Found = { id: string; bundled: boolean; dir?: string; text?: string }

/** A problem as loading finds it: the registry stamps when and how many times. */
export type LoadProblem = Omit<ExtensionProblem, 'at' | 'count'>

/** A verb of a manifest, its input and reply schemas as zod. */
export type CompiledVerb = { spec: NonNullable<Manifest['verbs']>[string]; input: z.ZodType; reply: z.ZodType }

/** A read of a manifest, its query and reply schemas as zod. */
export type CompiledRead = { spec: NonNullable<Manifest['reads']>[string]; query?: z.ZodType; reply: z.ZodType }

/** An extension that may start. `requires` and `wants`: the capabilities it starts after, the core aside. `off`: its floors off. */
export type Accepted = {
  id: string
  bundled: boolean
  dir: string
  text: string
  manifest: Manifest
  provides: string
  /** The system's settings parsed by `schema`, with its defaults. */
  settings: unknown
  schema?: z.ZodType
  requires: string[]
  wants: string[]
  /** Its verbs and reads by name, as the manifest declares them. */
  verbs: Map<string, CompiledVerb>
  reads: Map<string, CompiledRead>
  /** Its capability and every one it requires, directly or not: it is off on a floor where any of them is. */
  chain: string[]
  off: string[]
  problems: LoadProblem[]
}

/** An extension that may not start, and why. */
export type Refusal = { id: string; bundled: boolean; state: 'refused' | 'skipped' | 'off'; manifest?: Manifest; problems: LoadProblem[] }

/** `order`: the accepted, each after what it depends on. */
export type Resolved = { order: string[]; accepted: Map<string, Accepted>; refused: Map<string, Refusal> }

/** How an accepted extension's last start went, and its last halt when that threw. `at`: epoch ms. */
export type Outcome = { at: number; error?: { code: 'failed' | 'mismatch'; message: string }; halt?: string }

/** What the board and `GET /extensions` show of every extension. */
export type Registry = { extensions: ExtensionView[] }

export const NO_EXTENSIONS: Registry = { extensions: [] }

const error = (code: LoadProblem['code'], message: string, at?: string): LoadProblem => ({ lane: 'load', level: 'error', code, message, ...(at && { path: at }) })
const warn = (code: LoadProblem['code'], message: string, at?: string): LoadProblem => ({ lane: 'load', level: 'warn', code, message, ...(at && { path: at }) })

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Each issue of a failed parse, at its path below `at`. */
const issuesOf = (issues: z.core.$ZodIssue[]): { path: string; message: string }[] =>
  issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => ({ path: [...issue.path, key].join('.'), message: `unknown key ${key}` }))
      : issue.code === 'invalid_key'
        ? issuesOf(issue.issues).map((inner) => ({ path: issue.path.join('.'), message: inner.message }))
        : [{ path: issue.path.join('.'), message: issue.message }],
  )

/** A JSON Schema of a manifest as zod, or why it is none. */
export const zodOf = (schema: Record<string, unknown>): z.ZodType | string => {
  try {
    return z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0])
  } catch (err) {
    return (err as Error).message
  }
}

/** Settings parsed by an extension's schema: the value, or each problem at its key path below `at`. */
export const parseSettings = (schema: z.ZodType, value: unknown, at: string): { ok: true; value: unknown } | { ok: false; problems: { path: string; message: string }[] } => {
  const parsed = schema.safeParse(value)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, problems: issuesOf(parsed.error.issues).map((i) => ({ path: [at, i.path].filter(Boolean).join('.'), message: i.message })) }
}

/** A found folder's manifest, when it reads and parses. */
export const manifestOf = (found: Found): Manifest | undefined => {
  if (found.text === undefined) return undefined
  try {
    const parsed = Manifest.safeParse(JSON.parse(found.text))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/** The tower version a manifest requires, refused before its keys are read when this tower can't meet it. */
const versionProblem = (required: string, tower: string): LoadProblem | undefined => {
  const [rm, rn] = versionOf(required)
  const [tm, tn] = versionOf(tower)
  if (rm > tm) return error('too-new', `needs tower ${rm}; this is ${tm}: tower update`, 'requires.tower')
  if (rm < tm) return error('too-old', `written for tower ${rm}; this is ${tm}: CHANGELOG ${tm}.0 says what changed for extensions, then raise requires.tower`, 'requires.tower')
  if (rn > tn) return error('too-new', `needs tower ${required}; this is ${tower}: tower update`, 'requires.tower')
  return undefined
}

type SchemaNode = { properties?: Record<string, SchemaNode>; additionalProperties?: SchemaNode | boolean; 'x-since'?: string }

/** Every key the manifest uses that arrived after the tower version it requires: the outermost, not each below it. */
const newerKeys = (value: unknown, node: SchemaNode, required: string, at: string[] = []): { path: string; since: string }[] =>
  isObject(value)
    ? Object.entries(value).flatMap(([key, inner]) => {
        const child = node.properties?.[key] ?? (isObject(node.additionalProperties) ? node.additionalProperties : undefined)
        if (!child) return []
        const keyAt = [...at, key]
        const since = child['x-since']
        return since && !meets(required, since) && versionOf(since)[0] === versionOf(required)[0] ? [{ path: keyAt.join('.'), since }] : newerKeys(inner, child, required, keyAt)
      })
    : []

/** One warning per tower version the manifest's newer keys arrived in, naming them, at the first. */
const underDeclared = (raw: unknown, required: string): LoadProblem[] =>
  [...Map.groupBy(newerKeys(raw, MANIFEST_SCHEMA as SchemaNode, required), (key) => key.since)].map(([since, keys]) =>
    warn('under-declared', `uses ${keys.map((k) => k.path).join(', ')}, since ${since}, but requires tower ${required}: raise it to ${since}`, keys[0].path),
  )

/** The keys a manifest holds that the tower validates and doesn't read yet. */
const NOT_YET = ['views', 'regions'] as const

type Read = {
  found: Found
  claims?: string
  manifest?: Manifest
  problems: LoadProblem[]
  settings?: unknown
  schema?: z.ZodType
  verbs?: Map<string, CompiledVerb>
  reads?: Map<string, CompiledRead>
}

/** Whether a JSON Schema takes an object that must hold `project`, a string. */
const requiresProject = (schema: Record<string, unknown> | undefined): boolean => {
  const properties = schema?.properties as Record<string, { type?: unknown }> | undefined
  return schema?.type === 'object' && properties?.project?.type === 'string' && Array.isArray(schema.required) && schema.required.includes('project')
}

/**
 * A manifest's verbs and reads with their schemas as zod, or each reason they can't be: a schema the tower can't read,
 * a project-scoped one that names no floor, a verb named `read` (which `ctx.deps.<cap>.read` holds), and a name both
 * a verb and a read, since a provider's names share one namespace.
 */
const compileCalls = (manifest: Manifest): { verbs: Map<string, CompiledVerb>; reads: Map<string, CompiledRead>; problems: LoadProblem[] } => {
  const problems: LoadProblem[] = []
  const compiled = (schema: Record<string, unknown>, at: string): z.ZodType | undefined => {
    const zod = zodOf(schema)
    if (typeof zod !== 'string') return zod
    problems.push(error('invalid', `no JSON Schema the tower reads: ${zod}`, at))
    return undefined
  }
  const verbs = new Map<string, CompiledVerb>()
  for (const [name, spec] of Object.entries(manifest.verbs ?? {})) {
    const at = `verbs.${name}`
    if (spec.scope === 'project' && !requiresProject(spec.input)) problems.push(error('invalid', "a project-scoped verb's input requires project, a string: the floor it acts on", `${at}.input`))
    if (name === 'read') problems.push(error('invalid', 'no verb is named read: ctx.deps.<capability>.read holds its reads', at))
    if (Object.hasOwn(manifest.reads ?? {}, name)) problems.push(error('invalid', `${name} is a verb and a read: a provider's verbs and reads share one namespace`, at))
    const input = compiled(spec.input, `${at}.input`)
    const reply = compiled(spec.reply, `${at}.reply`)
    if (input && reply) verbs.set(name, { spec, input, reply })
  }
  const reads = new Map<string, CompiledRead>()
  for (const [name, spec] of Object.entries(manifest.reads ?? {})) {
    const at = `reads.${name}`
    if (spec.scope === 'project' && !paramsOf(name).includes('project') && !requiresProject(spec.query)) {
      problems.push(error('invalid', 'a project-scoped read names its floor: a <project> param, or project, a string, required in its query', at))
    }
    const query = spec.query && compiled(spec.query, `${at}.query`)
    const reply = compiled(spec.reply, `${at}.reply`)
    if (reply && (!spec.query || query)) reads.set(name, { spec, ...(query && { query }), reply })
  }
  return { verbs, reads, problems }
}

/** One extension's config entry, manifest and settings, read in that order; the first that refuses it ends the read. */
const readOne = (found: Found, entry: ExtensionConfig | undefined, tower: string): Read => {
  const at = `extensions.${found.id}`
  if (!found.bundled && typeof entry?.path !== 'string') return { found, problems: [error('invalid', `${at} names no bundled extension, so it takes path: the absolute folder holding its extension.json`)] }
  if (!found.bundled && !path.isAbsolute(entry!.path!)) return { found, problems: [error('invalid', `${at}.path takes an absolute folder, not ${JSON.stringify(entry!.path)}`)] }
  if (found.text === undefined) return { found, problems: [error('invalid', `no extension.json in ${found.dir}`)] }
  let raw: unknown
  try {
    raw = JSON.parse(found.text)
  } catch (err) {
    return { found, problems: [error('invalid', `extension.json is no JSON: ${(err as Error).message}`)] }
  }
  const claims = isObject(raw) ? [raw.provides, raw.id].find((name): name is string => typeof name === 'string') : undefined
  const requiredTower = isObject(raw) && isObject(raw.requires) ? raw.requires.tower : undefined
  const tooFar = typeof requiredTower === 'string' && /^\d+\.\d+$/.test(requiredTower) ? versionProblem(requiredTower, tower) : undefined
  if (tooFar) return { found, claims, problems: [tooFar] }
  const parsed = Manifest.safeParse(raw)
  if (!parsed.success) {
    return { found, claims, problems: issuesOf(parsed.error.issues).map((i) => error('invalid', i.message.startsWith('unknown key') ? `${i.message}: this tower is ${tower}. If the key is newer, raise requires.tower; otherwise it's a typo` : i.message, i.path)) }
  }
  const manifest = parsed.data
  if (!found.bundled && (BUNDLED as readonly string[]).includes(manifest.id)) return { found, claims, manifest, problems: [error('invalid', `${manifest.id} is a bundled extension's id: give yours its own, with provides: "${manifest.id}" to replace it`, 'id')] }
  if (manifest.id !== found.id) return { found, claims, manifest, problems: [error('invalid', `id is "${manifest.id}", but ${found.bundled ? 'its folder' : 'the config'} names it "${found.id}": a copied folder keeps the id it was written with`, 'id')] }
  const schema = manifest.settings && zodOf(manifest.settings)
  if (typeof schema === 'string') return { found, claims, manifest, problems: [error('invalid', `settings is no JSON Schema the tower reads: ${schema}`, 'settings')] }
  if (!schema && entry?.settings !== undefined) return { found, claims, manifest, problems: [error('invalid', `${at}.settings: ${found.id} takes no settings`)] }
  const settings = schema && parseSettings(schema, entry?.settings ?? {}, `${at}.settings`)
  if (settings && !settings.ok) return { found, claims, manifest, problems: settings.problems.map((p) => error('invalid', `${p.path}: ${p.message}`)) }
  const calls = compileCalls(manifest)
  if (calls.problems.length) return { found, claims, manifest, problems: calls.problems }
  const warnings = [
    ...NOT_YET.filter((key) => manifest[key] !== undefined).map((key) => warn('not-yet', `${key} is reserved for a later tower: validated, and not read yet`, key)),
    ...underDeclared(raw, manifest.requires.tower),
  ]
  return { found, claims, manifest, problems: warnings, settings: settings?.value, schema, verbs: calls.verbs, reads: calls.reads }
}

/** The capabilities `manifest` requires, the core aside. */
const requiredOf = (manifest: Manifest) => Object.keys(manifest.requires).filter((cap) => cap !== 'tower')

/** A cycle through `start` along `edges`, staying within `members`: `a → b → a`. */
const cycleThrough = (start: string, edges: Map<string, string[]>, members: Set<string>): string => {
  const walk = [start]
  for (let at = start; ; ) {
    at = edges.get(at)!.find((next) => members.has(next))!
    const seen = walk.indexOf(at)
    walk.push(at)
    if (seen !== -1) return walk.slice(seen).join(' → ')
  }
}

/** Strongly connected components of more than one member, or of one with an edge to itself (Tarjan). */
const cyclesOf = (nodes: string[], edges: Map<string, string[]>): Set<string>[] => {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const found: Set<string>[] = []
  const visit = (node: string) => {
    index.set(node, index.size)
    low.set(node, index.get(node)!)
    stack.push(node)
    for (const next of edges.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (stack.includes(next)) low.set(node, Math.min(low.get(node)!, index.get(next)!))
    }
    if (low.get(node) !== index.get(node)) return
    const component = new Set<string>()
    for (let member = stack.pop()!; ; member = stack.pop()!) {
      component.add(member)
      if (member === node) break
    }
    if (component.size > 1 || edges.get(node)?.includes(node)) found.push(component)
  }
  for (const node of nodes) if (!index.has(node)) visit(node)
  return found
}

/** Whether an extension is off on a floor: a capability of its `chain` is off there. */
export const offOn = (config: Config, project: string, chain: string[]): boolean =>
  chain.some((cap) => config.projects[project]?.capabilities?.[cap]?.off === true)

/** `cap` and every capability it requires, directly or not. */
const chainOf = (cap: string, requires: (cap: string) => string[]): string[] => [...new Set([cap, ...requires(cap).flatMap((needed) => chainOf(needed, requires))])]

/**
 * What may start, and why each other extension may not: every manifest parsed and its config entry checked (`invalid`,
 * `too-new`, `too-old`), one provider per capability (`conflict`: a bundled one is kept), each requirement met
 * (`unmet`), no cycle among requires and wants (`cycle`), and the dependents of what is refused skipped until nothing
 * changes (`skipped`). `tower`: the API version, the core's capability.
 */
export const resolve = (found: Found[], config: Config, tower: string): Resolved => {
  const entries = config.extensions ?? {}
  const refused = new Map<string, Refusal>()
  const refuse = (read: Read, state: Refusal['state'], problems: LoadProblem[]) =>
    refused.set(read.found.id, { id: read.found.id, bundled: read.found.bundled, state, ...(read.manifest && { manifest: read.manifest }), problems })

  const reads = found.map((f) => readOne(f, entries[f.id], tower))
  const off = reads.filter((r) => entries[r.found.id]?.off === true)
  for (const r of off) refuse(r, 'off', [])
  const parsed = reads.filter((r) => !off.includes(r))
  for (const r of parsed) if (r.problems.some((p) => p.level === 'error')) refuse(r, 'refused', r.problems)

  const byCap = Map.groupBy(
    parsed.filter((r) => !refused.has(r.found.id)),
    (r) => capabilityOf(r.manifest!),
  )
  const providers = new Map<string, Read>()
  for (const [cap, claimants] of byCap) {
    if (claimants.length === 1) {
      providers.set(cap, claimants[0])
      continue
    }
    const bundled = claimants.filter((r) => r.found.bundled)
    const kept = bundled.length === 1 ? bundled[0] : undefined
    const others = claimants.filter((r) => r !== kept).map((r) => r.found.id)
    const message = kept
      ? `${others.join(' and ')} and ${kept.found.id} (bundled) all provide ${cap}: set extensions.${kept.found.id}.off to replace it`
      : `${others.join(' and ')} all provide ${cap}: turn all but one off with extensions.<id>.off`
    if (kept) providers.set(cap, kept)
    for (const r of claimants) if (r !== kept) refuse(r, 'refused', [...r.problems, error('conflict', message)])
  }

  const claimed = new Set(parsed.flatMap((r) => (r.claims ? [r.claims] : [])))
  const offProvider = (cap: string) => off.find((r) => r.manifest && capabilityOf(r.manifest) === cap)
  const inRange = (cap: string, version: string) => {
    const provider = providers.get(cap)
    return provider !== undefined && meets(provider.manifest!.version, version)
  }

  const candidates = [...providers.values()].filter((r) => !refused.has(r.found.id))
  for (const r of candidates) {
    const unmet = Object.entries(r.manifest!.requires).flatMap(([cap, version]): LoadProblem[] => {
      if (cap === 'tower') return []
      const provider = providers.get(cap)
      if (!provider) {
        if (claimed.has(cap)) return []
        const offOne = offProvider(cap)
        return [error('unmet', `requires ${cap}, which no extension provides${offOne ? ` (${offOne.found.id}${offOne.found.bundled ? ', bundled,' : ''} is off)` : ''}`, `requires.${cap}`)]
      }
      return meets(provider.manifest!.version, version) ? [] : [error('unmet', `requires ${cap} ${version}; ${provider.found.id} provides ${provider.manifest!.version}`, `requires.${cap}`)]
    })
    if (unmet.length) refuse(r, 'refused', [...r.problems, ...unmet])
  }

  const remaining = () => candidates.filter((r) => !refused.has(r.found.id))
  const edgesOf = (r: Read) => [
    ...requiredOf(r.manifest!).filter((cap) => providers.has(cap)),
    ...Object.entries(r.manifest!.wants ?? {}).flatMap(([cap, version]) => (inRange(cap, version) ? [cap] : [])),
  ]
  const edges = new Map(remaining().map((r) => [capabilityOf(r.manifest!), edgesOf(r)]))
  for (const cycle of cyclesOf([...edges.keys()].sort(), edges)) {
    const first = [...cycle].sort()[0]
    const message = `in a cycle: ${cycleThrough(first, edges, cycle)}`
    for (const cap of cycle) refuse(providers.get(cap)!, 'refused', [...providers.get(cap)!.problems, error('cycle', message)])
  }

  const running = (cap: string) => {
    const provider = providers.get(cap)
    return provider !== undefined && !refused.has(provider.found.id)
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const r of remaining()) {
      const down = requiredOf(r.manifest!).filter((cap) => !running(cap))
      if (!down.length) continue
      refused.set(r.found.id, { id: r.found.id, bundled: r.found.bundled, state: 'skipped', manifest: r.manifest, problems: [...r.problems, ...down.map((cap) => error('skipped', `${cap} is not running: its problems first`, `requires.${cap}`))] })
      changed = true
    }
  }

  const kept = remaining()
  const requiresByCap = new Map(kept.map((r) => [capabilityOf(r.manifest!), requiredOf(r.manifest!)]))
  const accepted = new Map(
    kept.map((r): [string, Accepted] => {
      const manifest = r.manifest!
      const provides = capabilityOf(manifest)
      const chain = chainOf(provides, (cap) => requiresByCap.get(cap)!)
      const wants = Object.entries(manifest.wants ?? {}).flatMap(([cap, version]) => (inRange(cap, version) && running(cap) ? [cap] : []))
      const without = Object.entries(manifest.wants ?? {})
        .filter(([cap]) => !wants.includes(cap))
        .map(([cap, version]): LoadProblem => {
          const provider = providers.get(cap)
          const why = !provider ? 'which no extension provides' : !meets(provider.manifest!.version, version) ? `and ${provider.found.id} provides ${provider.manifest!.version}` : `and ${provider.found.id} doesn't run`
          return { lane: 'load', level: 'info', code: 'unmet', message: `wants ${cap} ${version}, ${why}: it runs without it, ctx.deps.${cap} undefined`, path: `wants.${cap}` }
        })
      return [
        r.found.id,
        {
          id: r.found.id,
          bundled: r.found.bundled,
          dir: r.found.dir!,
          text: r.found.text!,
          manifest,
          provides,
          settings: r.settings,
          ...(r.schema && { schema: r.schema }),
          requires: requiredOf(manifest),
          wants,
          verbs: r.verbs!,
          reads: r.reads!,
          chain,
          off: Object.keys(config.projects).filter((project) => offOn(config, project, chain)),
          problems: [...r.problems, ...without],
        },
      ]
    }),
  )

  const order: string[] = []
  const placed = new Set<string>()
  const byCapName = [...accepted.values()].sort((a, b) => a.provides.localeCompare(b.provides))
  while (order.length < accepted.size) {
    const next = byCapName.find((a) => !placed.has(a.provides) && [...a.requires, ...a.wants].every((cap) => placed.has(cap)))!
    placed.add(next.provides)
    order.push(next.id)
  }
  return { order, accepted, refused }
}

/** The most problems an extension shows. */
const PROBLEMS_SHOWN = 20

/** A halt that threw: the tower cleared what ctx opened all the same. */
const haltProblems = (outcome: Outcome | undefined): ExtensionProblem[] =>
  outcome?.halt ? [{ lane: 'halt', level: 'error', code: 'failed', message: outcome.halt, at: outcome.at, count: 1 }] : []

/** A manifest's verbs as the board shows them, by qualified name. */
const verbsOf = (manifest: Manifest | undefined): ExtensionView['verbs'] =>
  Object.entries(manifest?.verbs ?? {}).map(([name, v]) => ({
    name: `${capabilityOf(manifest!)}/${name}`,
    scope: v.scope,
    ...(v.description !== undefined && { description: v.description }),
    ...(v.words && { words: v.words }),
    ...(v.deprecated && { deprecated: v.deprecated }),
  }))

/**
 * Problems of the calls an extension answered or made, newest first, kept by the tower as they happen: one already
 * listed (the same lane, code, path and message) counts once more, dated by its latest.
 */
export const withProblem = (problems: ExtensionProblem[], problem: Omit<ExtensionProblem, 'count'>): ExtensionProblem[] => {
  const same = problems.find((p) => p.lane === problem.lane && p.code === problem.code && p.path === problem.path && p.message === problem.message)
  return [{ ...problem, count: (same?.count ?? 0) + 1 }, ...problems.filter((p) => p !== same)].slice(0, PROBLEMS_SHOWN)
}

/** Bundled first, then by id. */
const shownOrder = (a: ExtensionView, b: ExtensionView) => Number(b.bundled) - Number(a.bundled) || a.id.localeCompare(b.id)

/**
 * Every extension as it stands: resolved, then started (`outcomes`, by id), each accepted one `skipped` when one it
 * requires isn't running. `now`: when its load problems are dated.
 */
export const registry = (resolved: Resolved, outcomes: Map<string, Outcome>, now: number, calls: Map<string, ExtensionProblem[]> = new Map()): Registry => {
  const stamp = (problems: LoadProblem[], at: number): ExtensionProblem[] => problems.map((p) => ({ ...p, at, count: 1 }))
  const states = new Map<string, ExtensionView['state']>()
  const stateOfCap = (cap: string) => states.get([...resolved.accepted.values()].find((a) => a.provides === cap)!.id)
  const started = resolved.order.map((id): ExtensionView => {
    const a = resolved.accepted.get(id)!
    const outcome = outcomes.get(id)!
    const down = a.requires.filter((cap) => stateOfCap(cap) !== 'started')
    const state = down.length ? 'skipped' : outcome.error ? 'failed' : 'started'
    states.set(id, state)
    const without = state === 'started' ? a.wants.filter((cap) => stateOfCap(cap) !== 'started') : []
    const startProblems: ExtensionProblem[] = [
      ...without.map((cap) => ({ lane: 'start', level: 'info', code: 'unmet', message: `wants ${cap}, which didn't start: it runs without it, ctx.deps.${cap} undefined`, at: outcome.at, count: 1, path: `wants.${cap}` }) as const),
      ...haltProblems(outcome),
      ...(state === 'skipped'
        ? down.map((cap) => ({ lane: 'start', level: 'error', code: 'skipped', message: `${cap} is not running: its problems first`, at: outcome.at, count: 1 }) as const)
        : outcome.error
          ? [{ lane: 'start', level: 'error', code: outcome.error.code, message: outcome.error.message, at: outcome.at, count: 1 } as const]
          : []),
    ]
    return {
      id,
      provides: a.provides,
      version: a.manifest.version,
      title: a.manifest.title,
      bundled: a.bundled,
      state,
      ...(a.off.length && { off: a.off }),
      problems: [...(calls.get(id) ?? []), ...startProblems, ...stamp(a.problems, now)].slice(0, PROBLEMS_SHOWN),
      verbs: verbsOf(a.manifest),
    }
  })
  const held = [...resolved.refused.values()].map(
    (r): ExtensionView => ({
      id: r.id,
      provides: r.manifest ? capabilityOf(r.manifest) : r.id,
      version: r.manifest?.version ?? '',
      title: r.manifest?.title ?? r.id,
      bundled: r.bundled,
      state: r.state,
      problems: [...haltProblems(outcomes.get(r.id)), ...stamp(r.problems, now)].slice(0, PROBLEMS_SHOWN),
      verbs: verbsOf(r.manifest),
    }),
  )
  return { extensions: [...started, ...held].sort(shownOrder) }
}
