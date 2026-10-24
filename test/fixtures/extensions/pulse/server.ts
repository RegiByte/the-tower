import type { Start } from '../../../../src/shared/extensions.ts'

const start: Start = (ctx) => {
  const { every, line } = ctx.settings as { every: number; line?: string }
  ctx.every(every, () => ctx.log(line ?? 'pulse'))
  return {
    verbs: {
      ping: async ({ project, times }: { project: string; times?: number }, call) => ({ project, chimed: await call.deps.chime!.ring({ times }) }),
      pong: () => ({ pong: true }),
    },
    reads: {
      'beats/<project>': ({ params }) => ({ project: params.project, every }),
    },
    halt: () => ctx.log('halted'),
  }
}

export default start
