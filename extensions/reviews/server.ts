/**
 * The reviews extension (decision `review-threads`): one append-only markdown thread per checkout in its owned
 * `reviews` collection, appended to only through `reviews/append`; each card's thread and each floor's threads folded
 * from the parsed files and the core's checkouts; the floor's history, and what the CLI says of a thread. Its notes
 * are resolved by appending a note that marks them (`reviews/resolve`). A landed
 * checkout's thread is filed by Tidy (`tower/tidy.apply`), and a discarded one's recovery note is left before anything
 * goes (`tower/discard.record`) and the thread filed once the worktree is gone (`tower/discard.done`). A reviewer is
 * hired with `reviews/hire` (decision `reviewer`): its `of` field is logged at its spawn, and its launch contributor
 * puts it in its author's crew and out of the floor's hiring limits, as the core's facts `tower.reports-to` and
 * `tower.exempt`.
 */
import type { Board, Card, Floor } from '../../src/bridge/board.ts'
import type { Tip } from '../../src/bridge/worktrees.ts'
import { apiError, isApiError, type ApiError, type RouteInput } from '../../src/shared/api.ts'
import { workerNamed } from '../../src/shared/crews.ts'
import type { CallCtx, FoldCtx, LaunchParts, LaunchRequest, Part, Start } from '../../src/shared/extensions.ts'
import { appended, bodyProblem, landedThreadId, nextNumber, parseThread, resolutionBody, resolveProblem, REVIEWS, reviewPrompt, sendText, stamp, threadId, unseenBy, type ReviewThread } from './client/reviews.ts'
import { discardNote, tidyEntries } from './filing.ts'
import { cardPart, floorThreads, reviewHistory, type FloorPart, type ThreadFile } from './threads.ts'

type AppendInput = RouteInput['review/append']

type Appended = { t: 'appended'; id: string; n: number; modifiedAt: number }

type ResolveInput = { project: string; checkout: string; author: string; notes: number[]; body?: string }

/** The capability, which names its spawn field's fact and the crew edges and exemptions it gives. */
const CAP = 'reviews'

/**
 * The callsign whose work a card's worker reviews: what the core read of a reviewer spawned before its fact was
 * logged (`card.reviews`, before the board is projected), else its `of` fact while its crew edge is this extension's
 * (a fork carries the fact and no edge, and is a reviewer of nobody).
 */
const ofCard = (card: Card, own: FoldCtx['own']): string | undefined =>
  card.reviews ?? (card.crew?.by === CAP ? (own.facts?.findLast((f) => f.name === 'of')?.value as string | undefined) : undefined)

/** Why a worker's work can't be reviewed now, as a sentence; `undefined` when it can. */
const unreviewable = (card: Card, floor: Floor, of: string | undefined): string | undefined =>
  !card.conversations.length
    ? 'it has no conversation yet'
    : of
      ? `it is a reviewer itself, of ${of}'s work`
      : card.checkoutState.is === 'landed'
        ? card.checkoutState.empty
          ? `its checkout ${card.checkout} had nothing to land`
          : `its work in ${card.checkout} landed${card.checkoutState.on ? ` on ${card.checkoutState.on}` : ''}`
        : card.worktree?.gone || card.checkoutState.is === 'gone'
          ? `its checkout ${card.checkout} is gone, so there is nothing to fork`
          : !floor.git
            ? "a dir of its floor isn't a git repo"
            : undefined

/** A reviewer's launch: in the crew of the worker it reviews, out of the hiring limits. A resume or a fork is neither. */
const launch = ({ kind, fields }: LaunchRequest): LaunchParts =>
  kind === 'spawn' && typeof fields?.of === 'string' ? { reportsTo: fields.of, exempt: ['hiring'] } : {}

type Hire = { project: string; of: string; by?: string; tell?: boolean }

/** What `tower thread`, `tower note` and `tower send` say of a checkout's thread, read as `reader`. */
type SaidQuery = { checkout: string; reader: string; sender?: string; hirer?: string }

const floorOf = (board: Board, project: string): Floor | undefined => board.floors.find((f) => f.id === project)

const filesBy = new WeakMap<{ id: string; parsed: unknown }[], ThreadFile[]>()

/** A floor's thread files in id order, as the collection lists them, made once per list: a build's folds share one. */
const filesOf = (items: { id: string; parsed: unknown }[]): ThreadFile[] => {
  if (!filesBy.has(items)) filesBy.set(items, items.map(({ id, parsed }) => ({ id, thread: parsed as ReviewThread })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
  return filesBy.get(items)!
}

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
      card: (card: Card, { board, own }: FoldCtx): Part => {
        const of = ofCard(card, own)
        const floor = floorOf(board, card.project)!
        return {
          x: cardPart(card, floor, filesOf(own.collections[REVIEWS] ?? []), of),
          actions: unreviewable(card, floor, of) ? [] : [{ verb: `${CAP}/hire`, call: { project: card.project, of: card.callsign } }],
        }
      },
      floor: (floor: Floor, { own }): Part => {
        const threads = floorThreads(floor, filesOf(own.collections[REVIEWS] ?? []))
        return { x: { threads } satisfies FloorPart, tidy: tidyEntries(threads) }
      },
    },
    launch,
    verbs: {
      hire: ({ project, of, by, tell }: Hire, { call }: CallCtx) => {
        const floor = floorOf(ctx.board(), project)!
        const author = workerNamed(floor.cards.filter((c) => !c.continuedBy), of)
        if (!author) return apiError('not_found', `${project} has no worker called ${of.toUpperCase()}`)
        const why = unreviewable(author, floor, (author.x?.[CAP] as { of?: string } | undefined)?.of)
        if (why) return apiError('refused', `${author.callsign}'s work can't be reviewed: ${why}`)
        return call('tower/spawn', {
          project,
          cut: { from: author.checkout },
          prompt: reviewPrompt(author.callsign, tell === true),
          x: { [CAP]: { of: author.callsign } },
          ...(by !== undefined && { by, hire: true }),
        })
      },
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
