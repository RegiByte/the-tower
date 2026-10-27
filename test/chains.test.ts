import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import type { Config } from '../src/shared/model.ts'
import type { Caller } from '../src/shared/extensions.ts'
import type { ExtensionsResource } from '../src/tower/extensions.ts'
import { chainCalls } from '../src/tower/chains.ts'

const config = { projects: { on: {}, off: { capabilities: { guard: { off: true } } } } } as unknown as Config
const holder = {
  registry: () => ({ chains: { 'tower/spawn': ['guard'] }, stores: [{ provides: 'guard', chain: ['guard'] }] }),
  live: () => ({ t: 'down', why: 'failed' }),
} as unknown as ExtensionsResource
const schemas = { input: z.object({ project: z.string() }), reply: z.object({ ok: z.boolean() }) }
const caller = { t: 'user', via: 'http', within: [] } as Caller

test("a link whose extension is down refuses the calls of floors where it takes part, and passes those of floors where it is off", async () => {
  const { wrap } = chainCalls(holder, () => config)
  const inner = async () => ({ ok: true })
  const taking = await wrap('tower/spawn', schemas, { project: 'on' }, caller, inner)
  assert.deepEqual([(taking.reply as { code: string }).code, taking.refusedBy], ['unavailable', 'guard'])
  assert.deepEqual(await wrap('tower/spawn', schemas, { project: 'off' }, caller, inner), { reply: { ok: true } })
})
