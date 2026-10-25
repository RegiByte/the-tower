/**
 * The reviews extension (decision `review-threads`): one append-only markdown thread per checkout in its owned
 * `reviews` collection, appended to only through `reviews/append`; each card's thread and each floor's threads folded
 * from the parsed files and the core's checkouts; the floor's history, and what the CLI says of a thread.
 */
import type { Board, Card, Floor } from '../../src/bridge/board.ts'
import { apiError, type RouteInput } from '../../src/shared/api.ts'
import type { Part, Start } from '../../src/shared/extensions.ts'
import { appended, bodyProblem, nextNumber, parseThread, REVIEWS, sendText, stamp, threadId, unseenBy, type ReviewThread } from './client/reviews.ts'
import { cardPart, floorThreads, reviewHistory, type FloorPart, type ThreadFile } from './threads.ts'

type AppendInput = RouteInput['review/append']

/** What `tower thread`, `tower note` and `tower send` say of a checkout's thread, read as `reader`. */
type SaidQuery = { checkout: string; reader: string; sender?: string; hirer?: string }

const floorOf = (board: Board, project: string): Floor | undefined => board.floors.find((f) => f.id === project)

/** A floor's thread files in id order, as the collection lists them. */
const filesOf = (items: { id: string; parsed: unknown }[]): ThreadFile[] =>
  items.map(({ id, parsed }) => ({ id, thread: parsed as ReviewThread })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

const start: Start = (ctx) => {
  /** The appends in flight, by thread: each is read, numbered and written after the one before it. */
  let queue: Promise<unknown> = Promise.resolve()

  const files = (project: string) => filesOf(ctx.own.collections(project, REVIEWS))

  /** The thread's file as it is now, `undefined` while nobody wrote on it. */
  const textOf = async (project: string, id: string) => (ctx.collections.list(project, REVIEWS).some((i) => i.id === id) ? ctx.collections.read(project, REVIEWS, id) : undefined)

  /** A message on a checkout's thread, numbered one past the last, made on the first one. */
  const append = async ({ project, checkout, author, re, anchors, body }: AppendInput) => {
    if (!body.trim() && !anchors.length) return apiError('invalid', 'A note needs a body or an anchor')
    const problem = bodyProblem(body) ?? anchors.flatMap((a) => (a.from > a.to ? [`${a.repo}:${a.path}: line ${a.from} comes after ${a.to}`] : []))[0]
    if (problem) return apiError('invalid', problem)
    const id = threadId(checkout)
    const text = await textOf(project, id)
    const thread = parseThread(text ?? '')
    if (re !== undefined && !thread.messages.some((m) => m.n === re)) return apiError('not_found', `The thread of ${checkout} holds no n${re}`)
    const n = nextNumber(thread)
    const item = await ctx.collections.put(project, REVIEWS, id, appended(text, checkout, { author, at: stamp(new Date()), n, re, anchors, body: body.trim() }))
    return { t: 'appended' as const, id, n, modifiedAt: item.modifiedAt }
  }

  const said = async (project: string, { checkout, reader, sender, hirer }: SaidQuery) => {
    const id = threadId(checkout)
    const text = await textOf(project, id)
    if (text === undefined) return { unseen: [], lines: [`No notes on checkout ${checkout} yet. \`tower note\` writes the first.`] }
    const unseen = unseenBy(parseThread(text), reader).map((m) => m.n)
    const dir = floorOf(ctx.board(), project)?.collections.find((c) => c.id === REVIEWS)?.dir
    return {
      text,
      unseen,
      lines: [`(${dir}/${id}) ${unseen.length ? `New to you since your last note: ${unseen.map((n) => `n${n}`).join(', ')}.` : 'Nothing new to you since your last note.'}`],
      ...(sender !== undefined && { send: sendText(sender, checkout, unseen, hirer) }),
    }
  }

  return {
    parse: { [REVIEWS]: (text: string): ReviewThread => parseThread(text) },
    folds: {
      card: (card: Card, { board, own }): Part => ({ x: cardPart(card, floorOf(board, card.project)!, filesOf(own.collections[REVIEWS] ?? [])) }),
      floor: (floor: Floor, { own }): Part => ({ x: { threads: floorThreads(floor, filesOf(own.collections[REVIEWS] ?? [])) } satisfies FloorPart }),
    },
    verbs: {
      append: (input: AppendInput) => {
        const appending = queue.then(() => append(input))
        queue = appending.catch(() => undefined)
        return appending
      },
    },
    reads: {
      'history/<project>': ({ params }: { params: Record<string, string> }) => reviewHistory(files(params.project)),
      'said/<project>': ({ params, query }: { params: Record<string, string>; query: SaidQuery }) => said(params.project, query),
    },
  }
}

export default start
