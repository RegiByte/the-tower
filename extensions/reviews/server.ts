/**
 * The reviews extension (decision `review-threads`): one append-only markdown thread per checkout in its owned
 * `reviews` collection, appended to only through `reviews/append`; each card's thread and each floor's threads folded
 * from the parsed files and the core's checkouts, each anchor of a card's thread marking the lines it is about; the
 * floor's history, what the CLI says of a thread, and where a card's anchors stand among its worker's changes. Its notes
 * are resolved by appending a note that marks them (`reviews/resolve`). A landed
 * checkout's thread is filed by Tidy (`tower/tidy.apply`), and a discarded one's recovery note is left before anything
 * goes (`tower/discard.record`) and the thread filed once the worktree is gone (`tower/discard.done`). A reviewer is
 * hired with `reviews/hire` (decision `reviewer`) and starts on this extension's own skill: its `of` field is logged at its spawn, and its launch contributor
 * puts it in its author's crew and out of the floor's hiring limits, as the core's facts `tower.reports-to` and
 * `tower.exempt`.
 */
import { type Board, can, type Card, type CheckoutTip, type Floor, workerNamed } from '/lib/board.js'
import { statusName } from '/lib/cards.js'
import type { RepoChanges } from '/lib/changes.js'
import { type ApiError, type CallCtx, type FoldCtx, type LaunchParts, type LaunchRequest, type Part, type RouteInput, type Start, apiError, isApiError } from '/lib/extension.js'
import { threadMarks } from './client/anchors.ts'
import { anchorStates, appended, bodyProblem, landedThreadId, nextNumber, parseThread, resolutionBody, resolveProblem, REVIEWS, sendText, stamp, threadCheckoutOf, threadId, unseenBy, type Anchor, type ReviewThread } from './client/reviews.ts'
import { discardNote, tidyEntries } from './filing.ts'
import { anchorLine, parseAnchor, quotedAnchor } from './quoting.ts'
import { cardPart, floorThreads, reviewHistory, threadFileOf, type CardPart, type FloorPart, type ThreadFile } from './threads.ts'

type AppendInput = RouteInput['review/append']

type Appended = { t: 'appended'; id: string; n: number; modifiedAt: number }

type Caller = CallCtx['caller']

type ResolveInput = { project: string; checkout?: string; on?: string; author?: string; notes?: number[]; resolves?: string[]; body?: string }

type NoteInput = { project: string; on?: string; re?: string; at?: string[]; body?: string }

type SendInput = { to: string }

/** The capability, which names its spawn field's fact and the crew edges and exemptions it gives. */
const CAP = 'reviews'

/**
 * The callsign whose work a card's worker reviews: whom this extension's crew edge names. A fork carries the `of` fact
 * and no edge, and is a reviewer of nobody; the core gives a reviewer spawned before its fact was logged the same edge.
 */
const ofCard = (card: Card): string | undefined => (card.crew?.by === CAP ? card.crew.callsign : undefined)

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

/** Where a landed worker's commits are to be read, for a refused review to say. */
const landedFix = ({ checkoutState: s }: Card): string => (s.is === 'landed' && !s.empty && s.on ? `. Its commits are on ${s.on}: \`git log ${s.on}\` in the floor's main checkout` : '')

/** A reviewer's launch: in the crew of the worker it reviews, out of the hiring limits. A resume or a fork is neither. */
const launch = ({ kind, fields }: LaunchRequest): LaunchParts =>
  kind === 'spawn' && typeof fields?.of === 'string' ? { reportsTo: fields.of, exempt: ['hiring'] } : {}

type Hire = { project: string; of: string; by?: string; tell?: boolean }

type Spawned = { t: 'spawned'; id: string; cut: { name: string } }

/** A note's number as a worker types it, `3` or `n3`. */
const noteNumber = (typed: string) => Number(typed.replace(/^n/, ''))

/** A reviewer's first prompt: this extension's skill, on the callsign of the worker it reviews. With `tell`, it sends its notes to that worker when done. */
const reviewerPrompt = (callsign: string, tell: boolean) => `/reviews:review ${callsign}${tell ? ' tell' : ''}`

/** Whose anchors: the worker whose card's thread they are on, among whose changes they stand. */
type AnchorsQuery = { card: string }

/** What a checkout's thread says, read as `reader`, with the prompt Send types when `sender` is given. */
type SaidQuery = { checkout: string; reader: string; sender?: string; hirer?: string }

/** `text`: the thread's file, none while nobody wrote on it. */
type Said = { text?: string; unseen: number[]; lines: string[]; send?: string }

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

  /** Where each anchor of a card's thread stands among its worker's changes against its default branch. */
  const anchors = async (project: string, { card: id }: AnchorsQuery) => {
    const card = floorOf(ctx.board(), project)?.cards.find((c) => c.id === id)
    if (!card) return apiError('not_found', `${project} has no worker ${id} on the board`)
    const part = card.x?.[CAP] as CardPart | undefined
    if (!part) return apiError('not_found', `reviews is off on ${project}`)
    const file = threadFileOf(part, files(project))
    if (!file) return { states: {} }
    return { states: anchorStates(file.thread, (await ctx.read('tower/changes/<id>', { id })) as RepoChanges[]) }
  }

  /** The worker a call is made as, on the board; `undefined` for a call no worker made. */
  const callerCard = ({ t, id }: Caller): Card | undefined => (t === 'worker' ? ctx.board().floors.flatMap((f) => f.cards).find((c) => c.id === id) : undefined)

  /** A worker by callsign: on `project` first, when one is given, then on every floor and among the cards the board leaves out. */
  const workerOf = (project: string | undefined, name: string, cards: Card[]): Card | undefined => {
    const onFloor = workerNamed((project === undefined ? undefined : floorOf(ctx.board(), project))?.cards.filter((c) => !c.continuedBy) ?? [], name)
    return onFloor?.onDuty ? onFloor : (workerNamed(cards.filter((c) => !c.continuedBy), name) ?? onFloor)
  }

  /** Starts a reviewer of the worker called `of` in a fork of its checkout, on that worker's floor. */
  const hireReviewer = async ({ project, of, by, tell }: Omit<Hire, 'project'> & { project: string | undefined }, call: CallCtx['call'], cards: Card[]): Promise<{ reply: Spawned; author: Card } | ApiError> => {
    const author = workerOf(project, of, cards)
    if (!author) return apiError('not_found', `No worker is called ${of.toUpperCase()}: \`tower agents --all\` lists who is on duty`)
    const floor = floorOf(ctx.board(), author.project)
    if (!floor?.x?.[CAP]) return apiError('refused', `reviews is off on ${author.project}`)
    const why = unreviewable(author, floor, ofCard(author))
    if (why) return apiError('refused', `${author.callsign}'s work can't be reviewed: ${why}${landedFix(author)}`)
    if (!floor.cards.some((c) => c.id === author.id)) return apiError('refused', `${author.callsign} is off the board, so a reviewer can't join its crew: resume it first (\`tower resume ${author.id}\`)`)
    const reply = (await call('tower/spawn', {
      project: author.project,
      cut: { from: author.checkout },
      prompt: reviewerPrompt(author.callsign, tell === true),
      x: { [CAP]: { of: author.callsign } },
      ...(by !== undefined && { by, hire: true }),
    })) as Spawned | ApiError
    return isApiError(reply) ? reply : { reply, author }
  }

  /** Where a thread's file is, for a word to name. */
  const fileLine = (project: string, id: string) => `${floorOf(ctx.board(), project)?.collections.find((c) => c.id === REVIEWS)?.dir}/${id}`

  const said = async (project: string, { checkout, reader, sender, hirer }: SaidQuery): Promise<Said> => {
    const id = threadId(checkout)
    const text = await textOf(project, id)
    if (text === undefined) return { unseen: [], lines: [`No notes on checkout ${checkout} yet. \`tower x reviews note\` writes the first.`] }
    const unseen = unseenBy(parseThread(text), reader).map((m) => m.n)
    return {
      text,
      unseen,
      lines: [`(${fileLine(project, id)}) ${unseen.length ? `New to you since your last note: ${unseen.map((n) => `n${n}`).join(', ')}.` : 'Nothing new to you since your last note.'}`],
      ...(sender !== undefined && { send: sendText(sender, checkout, unseen, hirer) }),
    }
  }

  /** A checkout's thread as a worker reads it: the file, what is new to it, and how its anchors are named. */
  const threadWords = async (project: string, named: string | undefined, caller: Caller) => {
    const card = callerCard(caller)
    const checkout = named ?? (card && threadCheckoutOf(card))
    if (checkout === undefined) return apiError('invalid', 'Only a worker has a thread of its own: name a checkout')
    const { text, lines } = await said(project, { checkout, reader: card?.callsign ?? 'the user' })
    return { said: [...(text === undefined ? [] : [text.trimEnd(), '']), ...lines, anchorLine(floorOf(ctx.board(), project)!, checkout)].join('\n') }
  }

  return {
    parse: { [REVIEWS]: (text: string): ReviewThread => parseThread(text) },
    folds: {
      card: (card: Card, { board, own }: FoldCtx): Part => {
        const of = ofCard(card)
        const floor = floorOf(board, card.project)!
        const files = filesOf(own.collections[REVIEWS] ?? [])
        const x = cardPart(card, floor, files, of)
        const file = threadFileOf(x, files)
        return {
          x,
          actions: unreviewable(card, floor, of) ? [] : [{ verb: `${CAP}/hire`, call: { project: card.project, of: card.callsign } }],
          ...(of && { badges: [{ label: `reviews ${of}`, tone: 'quiet', hint: `reviews the work of ${of}, on its review thread` }] }),
          ...(file && { marks: threadMarks(file.thread) }),
        }
      },
      floor: (floor: Floor, { own }): Part => {
        const threads = floorThreads(floor, filesOf(own.collections[REVIEWS] ?? []))
        return { x: { threads } satisfies FloorPart, tidy: tidyEntries(threads) }
      },
    },
    launch,
    verbs: {
      hire: async (input: Hire, { call, cards }: CallCtx) => {
        const hired = await hireReviewer(input, call, cards())
        return isApiError(hired) ? hired : hired.reply
      },
      review: async ({ of, tell }: Pick<Hire, 'of' | 'tell'>, { call, caller, cards }: CallCtx) => {
        const hired = await hireReviewer({ project: callerCard(caller)?.project, of, tell, by: caller.t === 'worker' ? caller.id : undefined }, call, cards())
        if (isApiError(hired)) return hired
        const { reply, author } = hired
        const reviewer = cards().find((c) => c.id === reply.id)!
        return { ...reply, said: `${reviewer.callsign} reviews ${author.callsign}'s work in worktree ${reply.cut.name}, a fork of checkout ${author.checkout}. ${tell ? `It sends its notes to ${author.callsign} when done.` : 'Its notes wait on the thread for the user.'}` }
      },
      append: (input: AppendInput) => {
        const appending = queue.then(() => append(input))
        queue = appending.catch(() => undefined)
        return appending
      },
      note: async ({ project, on, re: typed, at = [], body = '' }: NoteInput, { call, caller }: CallCtx) => {
        const re = typed === undefined ? undefined : noteNumber(typed)
        const card = callerCard(caller)
        if (!card) return apiError('refused', 'A note is signed by the worker that writes it: this call comes from no worker. `reviews/append` takes its author')
        const checkout = on ?? threadCheckoutOf(card)
        const floor = floorOf(ctx.board(), project)!
        const anchors: Anchor[] = []
        for (const text of at) {
          const anchor = parseAnchor(text)
          if (!anchor) return apiError('invalid', `"${text}" is no anchor. ${anchorLine(floor, checkout)}`)
          const quoted = quotedAnchor(floor, card.worktree?.from === checkout ? card.checkout : checkout, anchor)
          if (isApiError(quoted)) return quoted
          anchors.push(quoted)
        }
        if (!body.trim() && !anchors.length) return apiError('invalid', `A note needs its body on stdin: tower x reviews note${on === undefined ? '' : ` --on ${on}`} <<'EOF' … EOF`)
        const noted = (await call('reviews/append', { project, checkout, author: card.callsign, re, anchors, body })) as Appended | ApiError
        if (isApiError(noted)) return noted
        return { ...noted, said: `Noted as n${noted.n} on the thread of checkout ${checkout}${re ? `, answering n${re}` : ''}: ${fileLine(project, noted.id)}` }
      },
      send: async ({ to }: SendInput, { call, caller, cards }: CallCtx) => {
        const sender = callerCard(caller)
        if (!sender) return apiError('refused', 'A send names the worker that sends it: this call comes from no worker')
        const target = workerOf(sender.project, to, cards())
        if (!target) return apiError('not_found', `No worker is called ${to.toUpperCase()}: \`tower agents --all\` lists who is on duty`)
        if (!floorOf(ctx.board(), target.project)?.x?.[CAP]) return apiError('refused', `reviews is off on ${target.project}`)
        if (!can(target, 'submit')) return apiError('refused', `${target.callsign} isn't at its composer (${statusName(target)}): send once it is`)
        const { text, unseen, send } = await said(target.project, { checkout: target.checkout, reader: target.callsign, sender: sender.callsign, hirer: target.hiredBy?.callsign })
        if (text === undefined) return apiError('not_found', `Checkout ${target.checkout} has no notes to send`)
        const submitted = await call('tower/submit', { id: target.id, text: send!, by: sender.id })
        if (isApiError(submitted)) return submitted
        return { said: `Sent ${target.callsign} a pointer to ${unseen.length ? unseen.map((n) => `n${n}`).join(', ') : 'the thread'} on checkout ${target.checkout}.` }
      },
      resolve: async ({ project, checkout: named, on, author: signed, notes: given, resolves, body }: ResolveInput, { call, caller }: CallCtx) => {
        const notes = given ?? resolves?.map(noteNumber)
        if (!notes) return apiError('invalid', 'resolve names the notes it resolves: tower x reviews resolve 3 4')
        const card = callerCard(caller)
        const checkout = named ?? on ?? (card && threadCheckoutOf(card))
        const author = signed ?? card?.callsign
        if (checkout === undefined || author === undefined) return apiError('invalid', 'This call comes from no worker: name the checkout and the author')
        const text = await textOf(project, threadId(checkout))
        if (text === undefined) return apiError('not_found', `${checkout} has no review thread on ${project}`)
        const problem = resolveProblem(parseThread(text), notes)
        if (problem) return apiError('invalid', problem)
        const noted = (await call('reviews/append', { project, checkout, author, anchors: [], body: resolutionBody(notes, body) })) as Appended | ApiError
        if (isApiError(noted)) return noted
        return { ...noted, said: `Resolved ${notes.map((k) => `n${k}`).join(', ')} with n${noted.n} on the thread of checkout ${checkout}: ${fileLine(project, noted.id)}` }
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
      'tower/discard.record': async ({ project, name, author, tips }: { project: string; name: string; author: string; tips: CheckoutTip[] }, { call }: CallCtx) => {
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
      'thread/<project>': ({ params, query }: { params: Record<string, string>; query: { checkout?: string } }, { caller }: CallCtx) => threadWords(params.project, query.checkout, caller),
      'said/<project>': ({ params, query }: { params: Record<string, string>; query: SaidQuery }) => said(params.project, query),
      'anchors/<project>': ({ params, query }: { params: Record<string, string>; query: AnchorsQuery }) => anchors(params.project, query),
    },
  }
}

export default start
