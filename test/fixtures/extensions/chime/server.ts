import type { Start } from '../../../../src/shared/extensions.ts'

const start: Start = () => ({
  verbs: {
    ring: ({ times }: { times: number }, ctx) => ({ rang: times, caller: ctx.caller }),
    ask: ({ verb }: { verb: string }, ctx) => ctx.call(verb),
  },
})

export default start
