import type { Card, Floor } from '../../../../src/bridge/board.ts'
import type { Start } from '../../../../src/shared/extensions.ts'

type Beats = { count: number; items: string[] }

type Rung = { rang: number; caller: object; trail?: string[] }

const refused = (reply: unknown): boolean => (reply as { t?: string }).t === 'error'

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
        return { item: item.id, heard: await ctx.raise('beat.kept', { project, item: item.id }) }
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
        tidy: [{ key: 'echo', label: 'Echo the beats', hint: 'answered done, and nothing kept changes' }],
        asks: [{ key: `beat-${floor.id}`, subject: `floor:${floor.id}`, title: `Keep a beat on ${floor.name}`, since: startedAt, sound: 'offer', actions: [{ verb: 'pulse/beat', call: { project: floor.id } }] }],
      }),
    },
    around: {
      'chime/ring': async ({ times }: { times: number }, next) => {
        if (times === 3) return next({ times: 0 })
        const rung = (await next({ times: times * 2 })) as Rung
        return refused(rung) ? rung : { ...rung, trail: ['pulse', ...(rung.trail ?? [])] }
      },
      'tower/collection/create': async (input: { name?: string; content: string }, next) => {
        if (input.name === 'boom') throw new Error('a guard that breaks')
        if (input.content.includes('secret')) return { t: 'error', code: 'refused', message: 'pulse keeps secrets out of collections' }
        return next(input)
      },
    },
    answers: {
      'pulse/beat.kept': ({ item }: { item: string }) => ({ heard: `pulse kept ${item}` }),
      'tower/tidy.apply': ({ keys }: { keys: string[] }) => ({ done: keys, skipped: [] }),
    },
    halt: () => ctx.log('halted'),
  }
}

export default start
