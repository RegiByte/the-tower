/**
 * Review threads on the board, worked out from the parsed files, git and who is working where: nothing about a thread
 * is stored but its file.
 */
import { MAIN_CHECKOUT } from '../shared/model.ts'
import { checkoutOfId, landedOfId, verdictOf, type Message, type ReviewThread, type Verdict } from '../shared/reviews.ts'
import { tagOf } from '../shared/tags.ts'
import { noteOffers, type NoteCalls, type NoteVerb } from './verbs.ts'
import type { FloorBranch, FloorWorktree, RepoRead } from './worktrees.ts'

/**
 * A checkout's thread: `messages` it holds and the `last` one. `landed`: the checkout's work has landed, so Tidy files
 * it (`landedThreadId`). A worktree's has when no worktree of that name is in use or holds work, and every branch cut under the name is
 * absorbed into its base; `main`'s when no worker runs there and every main checkout is clean and level with its
 * upstream.
 */
export type FloorThread = {
  checkout: string; id: string; tag: string; messages: number; last?: Pick<Message, 'author' | 'at' | 'n'>; landed: boolean
  /** Where its checkout's work stands: a note is offered only while it is live. */
  state: CheckoutState
  verbs: NoteVerb[]
  calls: NoteCalls
}

/** A thread Tidy filed: its item's id and tag, and when it was filed, as a message heading writes a time. */
export type FiledThread = { id: string; tag: string; at: string }

/**
 * Where a checkout's work stands. `live`: work can go on there, so a note on it reaches someone. `landed`: its work is in
 * its base, `on` naming that base while git still holds the worktree or a branch cut under its name, `empty` when git
 * says no branch of it gained a commit since it was cut (there was nothing to land), `edited` how many of its commits
 * landed as edited copies (carried) on `branch` (the landing read's), and `filed` once Tidy filed its thread. `gone`: its worktree is gone, and nothing
 * says its work landed. The main checkouts are always live.
 */
export type CheckoutState = { is: 'live' } | { is: 'landed'; on?: string; empty?: true; edited?: number; branch?: string; filed?: FiledThread } | { is: 'gone' }

/** No worktree of the name is in use or holds work, and every branch cut under it is absorbed into its base. */
const worktreeLanded = (tree: FloorWorktree | undefined, cutUnder: FloorBranch['repos']) =>
  (!tree || (tree.state === 'removable' && tree.repos.every((r) => r.absorbed))) && cutUnder.every((r) => r.absorbed)

/** As `worktreeLanded`, or landed as copies, some edited: absorbed or carried everywhere. */
const worktreeCarried = (tree: FloorWorktree | undefined, cutUnder: FloorBranch['repos']) =>
  (!tree || ((tree.state === 'removable' || tree.state === 'carried') && tree.repos.every((r) => r.absorbed || r.carried))) && cutUnder.every((r) => r.absorbed || r.carried)

const cutUnderOf = (checkout: string, branches: FloorBranch[]) => branches.flatMap((b) => b.repos.filter((r) => r.tree === checkout))

const landed = (checkout: string, reads: RepoRead[] | undefined, worktrees: FloorWorktree[], branches: FloorBranch[], mainInUse: boolean): boolean => {
  if (!reads) return false
  if (checkout === MAIN_CHECKOUT) return !mainInUse && reads.every((r) => !r.git || (r.main.dirty === 0 && r.main.ahead === 0))
  return worktreeLanded(worktrees.find((w) => w.name === checkout), cutUnderOf(checkout, branches))
}

/**
 * A checkout's `CheckoutState`, by what git reads of the floor (`reads`, `undefined` until all are read, when every
 * checkout is live) and the thread Tidy filed for this work, if any. A worktree whose folder is missing is gone.
 */
export const checkoutState = (
  checkout: string,
  reads: RepoRead[] | undefined,
  worktrees: FloorWorktree[],
  branches: FloorBranch[],
  filed: FiledThread | undefined,
): CheckoutState => {
  if (checkout === MAIN_CHECKOUT || !reads) return { is: 'live' }
  const tree = worktrees.find((w) => w.name === checkout)
  const cutUnder = cutUnderOf(checkout, branches)
  const cut = [...(tree?.repos ?? []), ...cutUnder]
  const base = cut[0]
  const on = base && (base.against ?? base.base)
  const empty = cut.length > 0 && cut.every((r) => r.own === 0)
  const edited = cut.reduce((n, r) => n + (r.absorbed ? 0 : (r.carried?.edited ?? 0)), 0)
  const branch = tree ? tree.repos[0].branch : cutUnder.length ? branches.find((b) => b.repos.some((r) => r.tree === checkout))!.name : undefined
  const landedHere = { is: 'landed' as const, ...(on && { on }), ...(empty && { empty: true as const }), ...(edited && { edited, branch }), ...(filed && { filed }) }
  if (tree) return worktreeCarried(tree, cutUnder) ? landedHere : tree.state === 'lost' ? { is: 'gone' } : { is: 'live' }
  return (cutUnder.length && worktreeCarried(tree, cutUnder)) || filed ? landedHere : { is: 'gone' }
}

/**
 * The thread Tidy filed for work in `checkout` begun at `startedAt` (as a message heading writes a time): the first filed after it, since a
 * worktree's name can be cut again for new work once its thread is filed. `files`: the project's thread files by item id.
 */
export const filedThreadOf = (files: { id: string }[], checkout: string, startedAt: string): FiledThread | undefined =>
  files
    .flatMap(({ id }) => {
      const filed = landedOfId(id)
      return filed && filed.checkout === checkout && filed.landed >= startedAt ? [{ id, tag: tagOf(id), at: filed.landed }] : []
    })
    .sort((a, b) => a.at.localeCompare(b.at))[0]

/** `files`: the project's thread files by item id. `reads`: its dirs' git, `undefined` until all are read. */
export const floorThreads = (
  project: string,
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
    const state = checkoutState(checkout, reads, worktrees, branches, undefined)
    return [
      {
        checkout,
        id,
        tag: tagOf(id),
        messages: thread.messages.length,
        last: last && { author: last.author, at: last.at, n: last.n },
        landed: landed(checkout, reads, worktrees, branches, mainInUse),
        state,
        ...noteOffers(project, checkout, state.is === 'live'),
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
