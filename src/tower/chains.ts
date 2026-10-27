/**
 * The chains around verbs and hooks, and hooks raised (decision `extensions`). A call runs through each link the
 * registry orders around its target, outermost first, to the handler and back out: what a link passes on is parsed
 * again by the target's schema, and what it answers is checked against the target's reply, so a link that throws,
 * passes on what the target doesn't take or answers off its schema fails the call (a link may be a guard, so it is
 * never bypassed). A hook's answers are each answerer's on its own, in fold order, inside the hook's chain.
 */
import { z } from 'zod'
import { offOn } from '../bridge/stores.ts'
import { apiError, HOOKS, isApiError, type ApiError } from '../shared/api.ts'
import { qualifiedOf, tooDeep, type Answered, type Caller } from '../shared/extensions.ts'
import type { Config } from '../shared/model.ts'
import type { ExtensionsResource } from './extensions.ts'

/** A verb's or hook's schemas, as its chain checks what passes through it. */
export type TargetSchemas = { input: z.ZodType; reply: z.ZodType }

/** What a chain answered, and the capability whose link refused, when one did. */
export type Wrapped = { reply: unknown; refusedBy?: string }

/** A hook's schemas: what it is raised with, and what each answer is. */
type HookSchemas = { payload: z.ZodType; answer: z.ZodType }

/** The list of answers a hook's chain carries back out, each checked against the hook's answer schema. */
const answeredList = (answer: z.ZodType) =>
  z.array(
    z.union([
      z.object({ cap: z.string(), ok: z.literal(true), answer }),
      z.object({ cap: z.string(), ok: z.literal(false), code: z.string(), message: z.string() }),
    ]),
  )

/** The floor a verb's input or a hook's payload names, when it names one. */
const floorOf = (value: unknown): string | undefined => {
  const project = (value as { project?: unknown } | undefined)?.project
  return typeof project === 'string' ? project : undefined
}

export const chainCalls = (holder: ExtensionsResource, readConfig: () => Config) => {
  /** Whether the extension providing `cap` takes part on the floor `value` names: always, when it names none. */
  const takesPart = (chain: string[], value: unknown) => {
    const project = floorOf(value)
    return project === undefined || !offOn(readConfig(), project, chain)
  }

  /**
   * `inner` called through the chain around `target`, for `caller`. Without links, `inner` gets the input as given;
   * with them, the input is parsed first, and a link off on the input's floor is passed over, running or not: only a link that takes part and isn't up refuses.
   */
  const wrap = async (target: string, schemas: TargetSchemas, input: unknown, caller: Caller, inner: (input: unknown) => Promise<unknown>): Promise<Wrapped> => {
    const caps = holder.registry().chains[target] ?? []
    if (!caps.length) return { reply: await inner(input) }
    const parsed = schemas.input.safeParse(input)
    if (!parsed.success) return { reply: apiError('invalid', z.prettifyError(parsed.error)) }
    let refusedBy: string | undefined
    const step = async (i: number, value: unknown): Promise<unknown> => {
      if (i === caps.length) return inner(value)
      const cap = caps[i]
      if (!takesPart(holder.registry().stores.find((s) => s.provides === cap)!.chain, value)) return step(i + 1, value)
      const live = holder.live(cap)
      if (live.t !== 'up') {
        refusedBy = cap
        return apiError('unavailable', `${target} runs inside ${cap}'s link, and ${cap} ${live.t === 'moving' ? `is ${live.why}` : "doesn't run"}: try again in a moment`)
      }
      const failed = (code: 'invalid' | 'threw' | 'shape', message: string): ApiError => {
        holder.problem(live.a.id, { lane: 'around', level: 'error', code, message, at: Date.now(), path: `around.${target}` })
        refusedBy = cap
        return apiError(code === 'invalid' ? 'invalid' : 'internal', `${live.a.id}'s link around ${target} ${message}`)
      }
      let passedOn: unknown
      const next = async (value: unknown) => {
        const checked = schemas.input.safeParse(value)
        passedOn = checked.success ? await step(i + 1, checked.data) : failed('invalid', `passed on an input ${target} doesn't take: ${z.prettifyError(checked.error)}`)
        return passedOn
      }
      let reply: unknown
      try {
        reply = await live.instance.link(target, value, next, caller)
      } catch (err) {
        console.error(`${live.a.id}: around ${target}:`, err)
        return failed('threw', `threw: ${(err as Error).message ?? String(err)}`)
      }
      if (isApiError(reply)) {
        if (reply !== passedOn) refusedBy = cap
        return reply
      }
      const checked = schemas.reply.safeParse(reply)
      return checked.success ? checked.data : failed('shape', `answered off ${target}'s reply schema: ${z.prettifyError(checked.error)}`)
    }
    const reply = await step(0, parsed.data)
    return { reply, ...(isApiError(reply) && refusedBy && { refusedBy }) }
  }

  /** Each of `caps` answering `hook`, in order, on its own: its answer checked, its failure a `hook` problem. */
  const deliver = async (hook: string, answer: z.ZodType, payload: unknown, caller: Caller, caps: string[]): Promise<Answered[]> => {
    const answers: Answered[] = []
    for (const cap of caps) {
      const live = holder.live(cap)
      if (live.t !== 'up') {
        answers.push({ cap, ok: false, code: 'unavailable', message: `${cap} ${live.t === 'moving' ? `is ${live.why}` : "doesn't run"}` })
        continue
      }
      if (!takesPart(live.a.chain, payload)) continue
      const failed = (message: string): Answered => {
        holder.problem(live.a.id, { lane: 'hook', level: 'error', code: 'hook', message, at: Date.now(), path: `answers.${hook}` })
        return { cap, ok: false, code: 'internal', message: `${live.a.id} failed to answer ${hook}: ${message}` }
      }
      let given: unknown
      try {
        given = await live.instance.answer(hook, payload, caller)
      } catch (err) {
        console.error(`${live.a.id}: answering ${hook}:`, err)
        answers.push(failed(`threw: ${(err as Error).message ?? String(err)}`))
        continue
      }
      if (isApiError(given)) {
        answers.push({ cap, ok: false, code: given.code, message: given.message })
        continue
      }
      const checked = answer.safeParse(given)
      answers.push(checked.success ? { cap, ok: true, answer: checked.data } : failed(`its answer doesn't match the hook's answer schema: ${z.prettifyError(checked.error)}`))
    }
    return answers
  }

  /** A hook's schemas by its qualified name: the core's, or a running extension's. */
  const hookOf = (hook: string): HookSchemas | undefined => {
    const q = qualifiedOf(hook)!
    if (q.cap === 'tower') return Object.hasOwn(HOOKS, q.name) ? HOOKS[q.name] : undefined
    const live = holder.live(q.cap)
    return live.t === 'up' ? live.a.hooks.get(q.name) : undefined
  }

  /**
   * `hook` raised for `caller` with `payload`: the answers of those `among` its answerers picks, inside the hook's chain.
   * A refusal of the chain is the one answer of the capability whose link refused. A payload its schema refuses, or a
   * raise nested too deep, throws: the provider raised it wrong.
   */
  const raising = async (hook: string, payload: unknown, caller: Caller, among: (answerers: string[]) => string[]): Promise<Answered[]> => {
    const schemas = hookOf(hook)
    if (!schemas) throw new Error(`No hook ${hook}`)
    const deep = tooDeep(caller, hook)
    if (deep) throw new Error(deep)
    const parsed = schemas.payload.safeParse(payload)
    if (!parsed.success) throw new Error(`${hook} raised with a payload its schema refuses: ${z.prettifyError(parsed.error)}`)
    const { reply, refusedBy } = await wrap(hook, { input: schemas.payload, reply: answeredList(schemas.answer) }, parsed.data, caller, (value) =>
      deliver(hook, schemas.answer, value, caller, among(holder.registry().answers[hook] ?? [])),
    )
    if (!isApiError(reply)) return reply as Answered[]
    return [{ cap: refusedBy ?? qualifiedOf(hook)!.cap, ok: false, code: reply.code, message: reply.message }]
  }

  /** `hook` raised for every answerer, in fold order. */
  const raise = (hook: string, payload: unknown, caller: Caller) => raising(hook, payload, caller, (answerers) => answerers)

  /** `hook` raised for the answerer `cap` alone: `not_found` its one answer when `cap` doesn't answer it. */
  const raiseTo = async (hook: string, cap: string, payload: unknown, caller: Caller): Promise<Answered[]> =>
    (holder.registry().answers[hook] ?? []).includes(cap)
      ? raising(hook, payload, caller, () => [cap])
      : [{ cap, ok: false, code: 'not_found', message: `${cap} doesn't answer ${hook}: no running extension provides it with ${hook} in its answers` }]

  return { wrap, raise, raiseTo }
}
