/**
 * Review threads on the board, worked out from the parsed files, git and who is working where: nothing about a thread
 * is stored but its file.
 */
import { MAIN_CHECKOUT } from '../shared/model.ts'
import { checkoutOfId, landedOfId, verdictOf, type Message, type ReviewThread, type Verdict } from '../shared/reviews.ts'
import { tagOf } from '../shared/tags.ts'
import type { FloorBranch, FloorWorktree, RepoRead } from './worktrees.ts'

/**
 * A checkout's thread: `messages` it holds and the `last` one. `landed`: the checkout's work has landed, so Tidy files
 * it (`landedThreadId`). A worktree's has when no worktree of that name is in use or holds work, and every branch cut under the name is
 * absorbed into its base; `main`'s when no worker runs there and every main checkout is clean and level with its
 * upstream.
 */
export type FloorThread = { checkout: string; id: string; tag: string; messages: number; last?: Pick<Message, 'author' | 'at' | 'n'>; landed: boolean }

const landed = (checkout: string, reads: RepoRead[] | undefined, worktrees: FloorWorktree[], branches: FloorBranch[], mainInUse: boolean): boolean => {
  if (!reads) return false
  if (checkout === MAIN_CHECKOUT) return !mainInUse && reads.every((r) => !r.git || (r.main.dirty === 0 && r.main.ahead === 0))
  const tree = worktrees.find((w) => w.name === checkout)
  const cutUnder = branches.flatMap((b) => b.repos.filter((r) => r.tree === checkout))
  return (!tree || (tree.state === 'removable' && tree.repos.every((r) => r.absorbed))) && cutUnder.every((r) => r.absorbed)
}

/** `files`: the project's thread files by item id. `reads`: its dirs' git, `undefined` until all are read. */
export const floorThreads = (
  files: { id: string; thread: ReviewThread }[],
  reads: RepoRead[] | undefined,
  worktrees: FloorWorktree[],
  branches: FloorBranch[],
  mainInUse: boolean,
): FloorThread[] =>
  files.flatMap(({ id, thread }) => {
    const checkout = checkoutOfId(id)
    if (checkout === undefined) return []
    const last = thread.messages.at(-1)
    return [
      {
        checkout,
        id,
        tag: tagOf(id),
        messages: thread.messages.length,
        last: last && { author: last.author, at: last.at, n: last.n },
        landed: landed(checkout, reads, worktrees, branches, mainInUse),
      },
    ]
  })

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
