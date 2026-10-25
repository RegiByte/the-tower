/**
 * The reviews extension (decision `review-threads`): one append-only markdown thread per checkout in its owned
 * `reviews` collection, appended to only through `reviews/append`; each card's thread and each floor's threads folded
 * from the parsed files and the core's checkouts; the floor's history, and what the CLI says of a thread. Its notes
 * are resolved by appending a note that marks them (`reviews/resolve`). A landed
 * checkout's thread is filed by Tidy (`tower/tidy.apply`), and a discarded one's recovery note is left before anything
 * goes (`tower/discard.record`) and the thread filed once the worktree is gone (`tower/discard.done`).
 */
import type { Board, Card, Floor } from '../../src/bridge/board.ts'
import type { Tip } from '../../src/bridge/worktrees.ts'
import { apiError, isApiError, type ApiError, type RouteInput } from '../../src/shared/api.ts'
import type { CallCtx, Part, Start } from '../../src/shared/extensions.ts'
import { appended, bodyProblem, landedThreadId, nextNumber, parseThread, resolutionBody, resolveProblem, REVIEWS, sendText, stamp, threadId, unseenBy, type ReviewThread } from './client/reviews.ts'
import { discardNote, tidyEntries } from './filing.ts'
import { cardPart, floorThreads, reviewHistory, type FloorPart, type ThreadFile } from './threads.ts'

type AppendInput = RouteInput['review/append']

type Appended = { t: 'appended'; id: string; n: number; modifiedAt: number }

type ResolveInput = { project: string; checkout: string; author: string; notes: number[]; body?: string }

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
      floor: (floor: Floor, { own }): Part => {
        const threads = floorThreads(floor, filesOf(own.collections[REVIEWS] ?? []))
        return { x: { threads } satisfies FloorPart, tidy: tidyEntries(threads) }
      },
    },
    verbs: {
      append: (input: AppendInput) => {
        const appending = queue.then(() => append(input))
        queue = appending.catch(() => undefined)
        return appending
      },
      resolve: async ({ project, checkout, author, notes, body }: ResolveInput, { call }: CallCtx) => {
        const text = await textOf(project, threadId(checkout))
        if (text === undefined) return apiError('not_found', `${checkout} has no review thread on ${project}`)
        const problem = resolveProblem(parseThread(text), notes)
        if (problem) return apiError('invalid', problem)
        return call('reviews/append', { project, checkout, author, anchors: [], body: resolutionBody(notes, body) })
      },
    },
    answers: {
      'tower/tidy.apply': async ({ project, keys }: { project: string; keys: string[] }) => {
        const at = new Date()
        const done: string[] = []
        const skipped: string[] = []
        for (const checkout of keys) {
          try {
            await ctx.collections.rename(project, REVIEWS, threadId(checkout), landedThreadId(checkout, at))
            done.push(checkout)
          } catch (err) {
            skipped.push(`${checkout}: ${(err as Error).message}`)
          }
        }
        return { done, skipped }
      },
      'tower/discard.record': async ({ project, name, author, tips }: { project: string; name: string; author: string; tips: Tip[] }, { call }: CallCtx) => {
        const noted = (await call('reviews/append', { project, checkout: name, author, anchors: [], body: discardNote(name, tips) })) as Appended | ApiError
        if (isApiError(noted)) return { ...noted, message: `the discard of "${name}" wasn't noted on its thread: ${noted.message}` }
        return { note: `noted as n${noted.n} on ${noted.id}`, item: { collection: REVIEWS, id: noted.id } }
      },
      'tower/discard.done': async ({ project, name }: { project: string; name: string }) => {
        const filed = await ctx.collections.rename(project, REVIEWS, threadId(name), landedThreadId(name, new Date()))
        return { note: `filed as ${filed.id}`, item: { collection: REVIEWS, id: filed.id } }
      },
    },
    reads: {
      'history/<project>': ({ params }: { params: Record<string, string> }) => reviewHistory(files(params.project)),
      'said/<project>': ({ params, query }: { params: Record<string, string>; query: SaidQuery }) => said(params.project, query),
    },
  }
}

export default start
