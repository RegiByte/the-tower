import type { Start } from '../../../../src/shared/extensions.ts'

const start: Start = (ctx) => {
  const { every, line } = ctx.settings as { every: number; line?: string }
  ctx.every(every, () => ctx.log(line ?? 'pulse'))
  return { halt: () => ctx.log('halted') }
}

export default start
