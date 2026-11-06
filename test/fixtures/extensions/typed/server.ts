import type { CallCtx, Start } from '../../../../src/shared/extensions.ts'

/** A verb that answers what it received: the input exactly as the word delivered it, and who called. */
const echo = (input: unknown, ctx: CallCtx) => ({ input: input as object, caller: ctx.caller, said: `said ${JSON.stringify(input)}` })

const start: Start = () => ({
  verbs: { echo, count: echo, flag: echo, tags: echo, shape: echo, note: echo, send: echo, resolve: echo, hire: echo },
  reads: {
    'said/<project>': ({ params, query }) => ({ text: `${params.project} at ${query.checkout ?? 'main'}\n` }),
    lines: () => ({ lines: ['one', 'two'] }),
    'plain/<id>': ({ params, query }) => ({ id: params.id, ...query }),
  },
})

export default start
