/**
 * Calls of the extensions' verbs and reads (decision `extensions`): the provider looked up when the call is made, its
 * input or query parsed by its manifest's schema, its floor checked, its handler run with the caller, and its reply
 * checked against its schema. A handler that throws or answers off its schema fails that call alone: the caller gets
 * `internal` naming the extension, and the extension a problem.
 */
import { z } from 'zod'
import type { Accepted, CompiledRead, CompiledVerb } from '../bridge/extensions.ts'
import { offOn } from '../bridge/stores.ts'
import { apiError, isApiError, type ApiError } from '../shared/api.ts'
import { matchRead, paramsOf, type Caller, type Deprecated, type ProblemLane } from '../shared/extensions.ts'
import type { Config } from '../shared/model.ts'
import type { ExtensionsResource, Instance } from './extensions.ts'

/** What an extension's verb or read answers: its reply, any JSON its schema takes, or an `ApiError`. */
export type Reply = unknown

/** A capability's provider, running and not halting, or why a call can't reach it now. */
const reach = (holder: ExtensionsResource, cap: string): { a: Accepted; instance: Instance } | ApiError => {
  const live = holder.live(cap)
  if (live.t === 'none') return apiError('not_found', `No capability "${cap}": \`tower extensions\` lists the extensions and what each provides`)
  if (live.t === 'down') return apiError('unavailable', `${cap} doesn't run (${live.why}): \`tower extensions\` says why`)
  if (live.t === 'moving') return apiError('unavailable', `${cap} is ${live.why}: try again in a moment`)
  return { a: live.a, instance: live.instance }
}

/** Why a call of a project-scoped verb or read on `project` is refused: no such floor, or its capability off there. */
const floorRefusal = (config: Config, a: Accepted, project: string): ApiError | undefined => {
  if (!Object.hasOwn(config.projects, project)) return apiError('not_found', `No project "${project}"`)
  const off = a.chain.find((cap) => offOn(config, project, [cap]))
  if (!off) return undefined
  return apiError('refused', off === a.provides ? `${a.provides} is off on ${project}` : `${a.provides} is off on ${project}: it requires ${off}, off there`)
}

export const extensionCalls = (holder: ExtensionsResource, readConfig: () => Config) => {
  /** What a handler answered, as the caller gets it: an `ApiError` it chose, or its reply once its schema takes it. */
  const answered = async (a: Accepted, lane: ProblemLane, name: string, reply: z.ZodType, handle: () => unknown): Promise<Reply> => {
    const qualified = `${a.provides}/${name}`
    const failed = (code: 'threw' | 'shape', message: string) => {
      holder.problem(a.id, { lane, level: 'error', code, message, at: Date.now(), path: `${lane}s.${name}` })
      return apiError('internal', `${a.id} failed ${qualified}: ${message}`)
    }
    let answer: unknown
    try {
      answer = await handle()
    } catch (err) {
      console.error(`${a.id}: ${qualified}:`, err)
      return failed('threw', (err as Error).message ?? String(err))
    }
    if (isApiError(answer)) return answer
    const checked = reply.safeParse(answer)
    return checked.success ? checked.data : failed('shape', `its reply doesn't match its schema: ${z.prettifyError(checked.error)}`)
  }

  /** A verb of `cap` as its running provider declares it, or why a call can't reach it now. */
  const verbOf = (cap: string, name: string): (CompiledVerb & { a: Accepted; instance: Instance }) | ApiError => {
    const found = reach(holder, cap)
    if ('t' in found) return found
    const compiled = found.a.verbs.get(name)
    return compiled ? { ...compiled, ...found } : apiError('not_found', `${cap} has no verb "${name}"`)
  }

  /** A verb of `cap`, its input parsed and its floor checked, answered by the provider's handler. */
  const verb = async (cap: string, name: string, input: unknown, caller: Caller): Promise<Reply> => {
    const compiled = verbOf(cap, name)
    if ('t' in compiled) return compiled
    const { a, instance } = compiled
    const parsed = compiled.input.safeParse(input)
    if (!parsed.success) return apiError('invalid', z.prettifyError(parsed.error))
    const refused = compiled.spec.scope === 'project' ? floorRefusal(readConfig(), a, (parsed.data as { project: string }).project) : undefined
    return refused ?? answered(a, 'verb', name, compiled.reply, () => instance.verb(name, parsed.data, caller))
  }

  /** A read of `cap` by its name, its query parsed and its floor checked, answered by the provider's handler. */
  const read = async (cap: string, name: string, params: Record<string, string>, query: Record<string, string>, caller: Caller): Promise<Reply> => {
    const found = reach(holder, cap)
    if ('t' in found) return found
    const { a, instance } = found
    const compiled: CompiledRead | undefined = a.reads.get(name)
    if (!compiled) return apiError('not_found', `${cap} has no read "${name}"`)
    const missing = paramsOf(name).filter((param) => !params[param])
    if (missing.length) return apiError('invalid', `${cap}/${name} takes ${missing.map((p) => `<${p}>`).join(', ')}`)
    const parsed = compiled.query ? compiled.query.safeParse(query) : { success: true as const, data: {} }
    if (!parsed.success) return apiError('invalid', z.prettifyError(parsed.error))
    const project = params.project ?? (parsed.data as { project?: string }).project
    const refused = compiled.spec.scope === 'project' ? floorRefusal(readConfig(), a, project!) : undefined
    return refused ?? answered(a, 'read', name, compiled.reply, () => instance.read(name, { params, query: parsed.data }, caller))
  }

  /**
   * The read a request's path below capability `cap` names, with its params and whether it serves a file, or why it
   * names none now; `undefined` when no extension declares `cap`, so the path is nobody's.
   */
  const readAt = (cap: string, path: string): { name: string; params: Record<string, string>; serves?: 'file' } | ApiError | undefined => {
    if (holder.live(cap).t === 'none') return undefined
    const found = reach(holder, cap)
    if ('t' in found) return found
    for (const [name, { spec }] of found.a.reads) {
      const params = matchRead(name, path)
      if (params) return { name, params, ...(spec.serves && { serves: spec.serves }) }
    }
    return apiError('not_found', `${cap} has no read at "${path}"`)
  }

  /** A verb or read of an extension that is on its way out, as its manifest says. */
  const deprecationOf = (cap: string, name: string): Deprecated | undefined => {
    const live = holder.live(cap)
    if (live.t !== 'up') return undefined
    return live.a.verbs.get(name)?.spec.deprecated ?? live.a.reads.get(name)?.spec.deprecated
  }

  return { verb, verbOf, read, readAt, deprecationOf }
}
