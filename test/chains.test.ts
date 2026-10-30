import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import type { Config } from '../src/shared/model.ts'
import type { Caller, ExtensionProblem } from '../src/shared/extensions.ts'
import type { ExtensionsResource } from '../src/tower/extensions.ts'
import { chainCalls, hookDeadline } from '../src/tower/chains.ts'

const config = { projects: { on: {}, off: { capabilities: { guard: { off: true } } } } } as unknown as Config
const holder = {
  registry: () => ({ chains: { 'tower/spawn': ['guard'] }, answers: { 'tower/tidy.apply': ['guard'] }, stores: [{ provides: 'guard', chain: ['guard'] }] }),
  live: () => ({ t: 'down', why: 'failed' }),
} as unknown as ExtensionsResource
const schemas = { input: z.object({ project: z.string() }), reply: z.object({ ok: z.boolean() }) }
const caller = { t: 'user', via: 'http', within: [] } as Caller

test("a link whose extension is down refuses the calls of floors where it takes part, and passes those of floors where it is off", async () => {
  const { wrap } = chainCalls(holder, () => config, hookDeadline)
  const inner = async () => ({ ok: true })
  const taking = await wrap('tower/spawn', schemas, { project: 'on' }, caller, inner)
  assert.deepEqual([(taking.reply as { code: string }).code, taking.refusedBy], ['unavailable', 'guard'])
  assert.deepEqual(await wrap('tower/spawn', schemas, { project: 'off' }, caller, inner), { reply: { ok: true } })
})

test("a hook's answerer whose extension is down answers unavailable on floors where it takes part, and is passed over where it is off", async () => {
  const { raiseTo } = chainCalls(holder, () => config, hookDeadline)
  const taking = await raiseTo('tower/tidy.apply', 'guard', { project: 'on', keys: [] }, caller)
  assert.deepEqual(taking.map((a) => [a.cap, a.ok]), [['guard', false]])
  assert.deepEqual(await raiseTo('tower/tidy.apply', 'guard', { project: 'off', keys: [] }, caller), [])
})

test("an answer past its hook's deadline is a failed answer and a hook problem on its answerer; one in time clears its timer", async () => {
  const problems: ExtensionProblem[] = []
  const answering = { slow: () => new Promise(() => {}), quick: async () => ({}) }
  const answers = (answerers: (keyof typeof answering)[]) =>
    ({
      registry: () => ({ chains: {}, answers: { 'tower/spawn.gate': answerers }, stores: answerers.map((cap) => ({ provides: cap, chain: [cap] })) }),
      live: (cap: keyof typeof answering) => ({ t: 'up', a: { id: cap }, instance: { answer: answering[cap] } }),
      problem: (_: string, problem: ExtensionProblem) => problems.push(problem),
    }) as unknown as ExtensionsResource
  const gate = { project: 'on', kind: 'spawn', runtime: 'claude', hire: false, exempt: [], fields: {} }

  const late = await chainCalls(answers(['slow', 'quick']), () => config, () => 0.05).raise('tower/spawn.gate', gate, caller)
  assert.deepEqual(late, [
    { cap: 'slow', ok: false, code: 'internal', message: "slow failed to answer tower/spawn.gate: didn't answer tower/spawn.gate within 0.05 s" },
    { cap: 'quick', ok: true, answer: {} },
  ])
  assert.deepEqual(problems.map((p) => [p.lane, p.code, p.path, p.message]), [['hook', 'hook', 'answers.tower/spawn.gate', "didn't answer tower/spawn.gate within 0.05 s"]])

  const inTime = await chainCalls(answers(['quick']), () => config, () => 3600).raise('tower/spawn.gate', gate, caller)
  assert.deepEqual(inTime, [{ cap: 'quick', ok: true, answer: {} }], 'a timer left running would hold this file for an hour')
})

test("the gate's deadline is its own; every other hook's, the core's and an extension's, the default", () => {
  assert.deepEqual(['tower/spawn.gate', 'tower/tidy.apply', 'reviews/thread.filed'].map(hookDeadline), [10, 30, 30])
})
