/**
 * Review threads on the board, worked out from the parsed files and where each checkout's work stands (the core's
 * `checkoutState`): nothing about a thread is stored but its file.
 */
import type { Card, Floor } from '../../src/bridge/board.ts'
import { checkoutLanded, checkoutState, landedByRecord, type CheckoutsRead, type CheckoutState, type LandedState } from '../../src/bridge/checkouts.ts'
import { tagOf } from '../../src/shared/tags.ts'
import { checkoutOfId, landedOfId, resolvedIn, stamp, threadCheckoutOf, threadId, unseenBy, verdictOf, type Message, type ReviewThread, type Verdict } from './client/reviews.ts'

/** A thread file of the floor's collection, parsed. */
export type ThreadFile = { id: string; thread: ReviewThread }

/** What a note is added with: the verb, and the fields the board knows. */
export type NoteCall = [verb: 'reviews/append', input: { project: string; checkout: string }]

/** `note` adds a note to a checkout's thread, offered while its work goes on: a note on finished work reaches nobody. */
export type NoteOffers = { verbs: 'note'[]; calls: { note?: NoteCall }; actions: { verb: 'note'; call: NoteCall }[] }

const noteOffers = (project: string, checkout: string, live: boolean): NoteOffers => {
  const call: NoteCall = ['reviews/append', { project, checkout }]
  return live ? { verbs: ['note'], calls: { note: call }, actions: [{ verb: 'note', call }] } : { verbs: [], calls: {}, actions: [] }
}

/**
 * A checkout's thread: `messages` it holds and the `last` one. `landed`: the checkout's work has landed
 * (`checkoutLanded`), so Tidy files it (`landedThreadId`). `state`: where its work stands, a note offered only while it
 * is live. `key`: `<project>/<checkout>`, its subject's (`reviews.thread:floor:<project>/<key>`).
 */
export type FloorThread = {
  key: string; checkout: string; id: string; tag: string; messages: number; last?: Pick<Message, 'author' | 'at' | 'n'>; landed: boolean; state: CheckoutState
  /** Its resolved notes, by number, in order. @since 1.94 */
  resolved: number[]
} & NoteOffers

/** A thread Tidy filed: its item's id and tag, and when it was filed, as a message heading writes a time. */
export type FiledThread = { id: string; tag: string; at: string }

/**
 * The reviews part of a card. `thread`: the checkout its review thread is about (`threadCheckoutOf`: a reviewer's is its
 * author's). `threadState`: where that work stands, with the thread Tidy filed once it landed. `unseen`: the notes of that
 * thread it hasn't seen (after its own last one), while the work is live and the thread has a file. `filed`: the thread
 * Tidy filed once the work of its own checkout landed. `note`: the call that adds a note to its thread, while that work is
 * live; the renderer adds the author and what the note says. `of`: the callsign whose work it reviews, when it is a
 * reviewer.
 */
export type CardPart = { thread: string; threadState: CheckoutState; unseen?: number; filed?: FiledThread; note?: NoteCall; of?: string }

/** The reviews part of a floor: the thread of each checkout that has one, in id order. */
export type FloorPart = { threads: FloorThread[] }

/** What a floor's checkouts are read from, as the core's board holds them. */
export const checkoutsOf = (floor: Floor): CheckoutsRead => ({ worktrees: floor.worktrees, branches: floor.branches, ...(floor.main && { main: floor.main }) })

/**
 * The thread Tidy filed for work in `checkout` begun at `startedAt` (as a message heading writes a time): the first filed after it, since a
 * worktree's name can be cut again for new work once its thread is filed. `files`: the project's thread files by item id.
 */
export const filedThreadOf = (files: { id: string }[], checkout: string, startedAt: string): FiledThread | undefined =>
  filedByCheckout(files)
    .get(checkout)
    ?.find((t) => t.at >= startedAt)

/** Each checkout's filed threads, the first filed first, indexed once per files array. */
const filedIndex = new WeakMap<{ id: string }[], Map<string, FiledThread[]>>()
const filedByCheckout = (files: { id: string }[]): Map<string, FiledThread[]> => {
  const held = filedIndex.get(files)
  if (held) return held
  const index = new Map<string, FiledThread[]>()
  for (const { id } of files) {
    const filed = landedOfId(id)
    if (!filed) continue
    if (!index.has(filed.checkout)) index.set(filed.checkout, [])
    index.get(filed.checkout)!.push({ id, tag: tagOf(id), at: filed.landed })
  }
  for (const threads of index.values()) threads.sort((a, b) => a.at.localeCompare(b.at))
  filedIndex.set(files, index)
  return index
}

/** Where a checkout's work stands for work begun at `since`: landed, with its thread, once Tidy filed one after it began. */
const stateSince = (checkout: string, read: CheckoutsRead, files: { id: string }[], since: string): CheckoutState => {
  const state = checkoutState(checkout, read)
  const filed = filedThreadOf(files, checkout, since)
  if (!filed) return state
  const recorded = landedByRecord(checkout, state, read)
  return recorded.is === 'landed' ? { ...recorded, filed } : recorded
}

/** A card's reviews part on its floor; `of`: the callsign whose work it reviews, when it is a reviewer. */
export const cardPart = (card: Card, floor: Floor, files: ThreadFile[], of: string | undefined): CardPart => {
  const read = checkoutsOf(floor)
  const since = stamp(new Date(card.startedAt))
  const own = stateSince(card.checkout, read, files, since)
  const thread = threadCheckoutOf({ ...card, x: { ...card.x, reviews: { of } } })
  const threadState = stateSince(thread, read, files, since)
  const live = threadState.is === 'live'
  const file = files.find((f) => f.id === threadId(thread))
  const filed = own.is === 'landed' ? (own as LandedState).filed : undefined
  return {
    thread,
    threadState,
    ...(live && file && { unseen: unseenBy(file.thread, card.callsign).length }),
    ...(filed && { filed }),
    ...(live && { note: ['reviews/append', { project: card.project, checkout: thread }] satisfies NoteCall }),
    ...(of && { of }),
  }
}

/** The thread file a card's part names: its work's, or the one Tidy filed once that work landed; none before a note is written. */
export const threadFileOf = (part: CardPart, files: ThreadFile[]): ThreadFile | undefined => {
  const filed = part.threadState.is === 'landed' ? (part.threadState as LandedState).filed : undefined
  return files.find((f) => f.id === (filed?.id ?? threadId(part.thread)))
}

/** A floor's threads: each live thread file's (`<checkout>.md`), in id order. */
export const floorThreads = (floor: Floor, files: ThreadFile[]): FloorThread[] => {
  const read = checkoutsOf(floor)
  return files
    .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap(({ id, thread }) => {
      const checkout = checkoutOfId(id)
      if (checkout === undefined) return []
      const last = thread.messages.at(-1)
      const state = checkoutState(checkout, read)
      return [
        {
          key: `${floor.id}/${checkout}`,
          checkout,
          id,
          tag: tagOf(id),
          messages: thread.messages.length,
          ...(last && { last: { author: last.author, at: last.at, n: last.n } }),
          landed: checkoutLanded(checkout, read),
          resolved: [...resolvedIn(thread).keys()].sort((a, b) => a - b),
          state,
          ...noteOffers(floor.id, checkout, state.is === 'live'),
        },
      ]
    })
}

/** A thread as history: `landed`, when Tidy filed it (a message heading's time); none while its work is unlanded. */
export type ReviewRecord = { id: string; checkout: string; landed?: string; messages: (Message & { verdict?: Verdict })[] }

/** What one author wrote across the threads: notes, replies (`re` another), each verdict, and the checkouts written on. */
export type AuthorTally = { notes: number; replies: number; verdicts: Partial<Record<Verdict, number>>; checkouts: string[] }

export type ReviewHistory = { threads: ReviewRecord[]; authors: Record<string, AuthorTally> }

/** A project's review threads, live and landed, oldest first, and what each author wrote in them. */
export const reviewHistory = (files: { id: string; thread: ReviewThread }[]): ReviewHistory => {
  const threads = files
    .flatMap(({ id, thread }): ReviewRecord[] => {
      const checkout = checkoutOfId(id)
      const filed = landedOfId(id)
      const messages = thread.messages.map((m) => {
        const verdict = verdictOf(m)
        return verdict ? { ...m, verdict } : m
      })
      if (checkout !== undefined) return [{ id, checkout, messages }]
      return filed ? [{ id, checkout: filed.checkout, landed: filed.landed, messages }] : []
    })
    .sort((a, b) => (a.messages[0]?.at ?? '').localeCompare(b.messages[0]?.at ?? ''))
  const authors = threads.reduce<Record<string, AuthorTally>>((tally, { checkout, messages }) => {
    for (const m of messages) {
      const t = (tally[m.author] ??= { notes: 0, replies: 0, verdicts: {}, checkouts: [] })
      if (m.re === undefined) t.notes++
      else t.replies++
      if (m.verdict) t.verdicts[m.verdict] = (t.verdicts[m.verdict] ?? 0) + 1
      if (!t.checkouts.includes(checkout)) t.checkouts.push(checkout)
    }
    return tally
  }, {})
  return { threads, authors }
}
