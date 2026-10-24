import type { Card, Floor } from '../../../../src/bridge/board.ts'
import type { Start } from '../../../../src/shared/extensions.ts'

type Beats = { count: number; items: string[] }

const start: Start = (ctx) => {
  const { every, line } = ctx.settings as { every: number; line?: string }
  const startedAt = Date.now()
  ctx.every(every, () => ctx.log(line ?? 'pulse'))
  return {
    verbs: {
      ping: async ({ project, times }: { project: string; times?: number }, call) => ({ project, chimed: await call.deps.chime!.ring({ times }) }),
      pong: () => ({ pong: true }),
      beat: async ({ project, session }: { project: string; session?: string }) => {
        const item = await ctx.collections.create(project, 'pulse', { name: 'beat', ext: 'md', content: `beat ${ctx.collections.list(project, 'pulse').length + 1}\n` })
        await ctx.streams.append('beats', { project }, 'b', { item: item.id })
        if (session) await ctx.facts.append(session, 'beat', 1)
        return { item: item.id }
      },
    },
    reads: {
      'beats/<project>': ({ params }) => ({ project: params.project, every }),
      'kept/<project>': ({ params, query }: { params: Record<string, string>; query: { session?: string } }) => ({
        beats: ctx.own.streams('beats', params.project),
        items: ctx.own.collections(params.project, 'pulse').map((i) => i.parsed),
        facts: query.session ? ctx.own.facts(query.session) : [],
      }),
    },
    parse: { pulse: (text) => ({ beat: text.trim() }) },
    reduce: { beats: { init: { count: 0, items: [] }, step: (state: Beats, [, , fact]) => ({ count: state.count + 1, items: [...state.items, (fact as { item: string }).item] }) } },
    folds: {
      card: (card: Card, { own }) => {
        const beats = (own.facts ?? []).length
        return beats ? { x: { beats }, badges: [{ label: `${beats} beat${beats === 1 ? '' : 's'}`, tone: 'ready' }], lines: [`You took ${beats} beat${beats === 1 ? '' : 's'}: \`tower x pulse beat\` keeps another.`] } : {}
      },
      floor: (floor: Floor, { own }) => ({
        x: { beats: (own.streams.beats as Beats).count },
        actions: [{ verb: 'pulse/ping', call: { project: floor.id } }],
        asks: [{ key: `beat-${floor.id}`, subject: `floor:${floor.id}`, title: `Keep a beat on ${floor.name}`, since: startedAt, sound: 'offer', actions: [{ verb: 'pulse/beat', call: { project: floor.id } }] }],
      }),
    },
    halt: () => ctx.log('halted'),
  }
}

export default start
