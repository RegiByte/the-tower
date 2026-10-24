import type { Start } from '../../../../src/shared/extensions.ts'

type Rung = { rang: number; caller: object; trail?: string[] }

const start: Start = () => ({
  verbs: {
    ring: ({ times }: { times: number }, ctx) => ({ rang: times, caller: ctx.caller }),
    ask: ({ verb }: { verb: string }, ctx) => ctx.call(verb),
  },
  around: {
    'chime/ring': async (input, next) => {
      const rung = (await next(input)) as Rung
      return { ...rung, trail: ['chime', ...(rung.trail ?? [])] }
    },
  },
})

export default start
