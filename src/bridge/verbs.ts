/**
 * What can be done right now with each thing on the board, as data: renderers map a verb to a label, and never decide
 * availability themselves. Lists are in a fixed order, the first being the thing's primary verb. Each verb that is a
 * request of the renderer API comes with its call, built from the same list; `drive`, `brief` and `goto` are moves
 * within the renderer and have none.
 */
import type { Call } from '../shared/api.ts'
import { reviewPrompt } from '../shared/reviews.ts'
import type { SessionRef } from './chains.ts'
import type { Status } from './status.ts'
import type { TidyPlan } from './board.ts'
import type { FloorWorktreeRepo, WorktreeState } from './worktrees.ts'

/**
 * `drive` opens the terminal; `submit` sends the worker a prompt from outside its terminal; `goto` goes to the
 * session that resumed the conversation; `review` starts a reviewer of its work in a fork of its checkout; `send-home`
 * ends the worker and every worker under it that runs (`crewOf`), offered to a worker in a crew; `let-go` takes a
 * stranded worker off duty, its conversation left resumable; `note` adds a note to the review thread about its work
 * (`NoteVerb`).
 */
export type CardVerb = 'drive' | 'submit' | 'resume' | 'goto' | 'brief' | 'review' | 'reap' | 'kill' | 'let-go' | 'send-home' | 'note'
/**
 * `note` adds a note to a checkout's review thread, offered while its work goes on (`CheckoutState` live): a note on
 * work that landed, or whose worktree is gone, reaches nobody. The API still takes one there.
 */
export type NoteVerb = 'note'
export type ConversationVerb = 'resume' | 'goto'
/** A process a session left running can always be ended on its own. */
export type ResourceVerb = 'reap'
/**
 * `spawn` starts a session, `cut` one in a new worktree of every dir, `shell` a shell in one of the floor's dirs, `editor`
 * opens a dir in the user's editor, `tidy` applies the floor's `TidyPlan` as listed: worktrees and kept branches, landed review
 * threads, leftover processes and idle workers.
 */
export type FloorVerb = 'spawn' | 'cut' | 'shell' | 'editor' | 'tidy'
/**
 * `recut` restores a lost worktree's folders from its branch, `prune` forgets them; `remove` is offered only when nothing
 * would be lost, or its work landed as copies (`carried`); `discard` throws away work that never landed, its tips named
 * on the checkout's review thread first.
 */
export type WorktreeVerb = 'recut' | 'prune' | 'remove' | 'discard'
/** `delete` is offered only on a branch absorbed into its base, or carried there as copies. */
export type BranchVerb = 'recut' | 'delete'

const LIVE: ReadonlySet<Status> = new Set(['booting', 'blocked', 'idle', 'working', 'needs_input', 'watching', 'done', 'failed'])

/** Claude's composer has focus: not before Claude starts (on a screen that blocks it, maybe), nor on a question. */
const AT_COMPOSER: ReadonlySet<Status> = new Set(['idle', 'working', 'watching', 'done', 'failed'])

/** The session's PTY is running: its screen is live and it takes keys. */
export const isLive = (status: Status) => LIVE.has(status)

/**
 * A conversation goes on in whoever resumed it, else it can be resumed once its session is no longer running, where
 * it ran (`resumable`: its cwd is still one of its floor's folders).
 */
const conversationVerbs = (live: boolean, resumable: boolean, resumedBy: SessionRef | undefined): ConversationVerb[] =>
  resumedBy ? ['goto'] : live || !resumable ? [] : ['resume']

/**
 * The work a reviewer would review: the worker's checkout and callsign, on a floor whose dirs are all git repos. None
 * for a worker that is itself a reviewer, or whose checkout is gone (`checkoutGone`): a fork needs it there.
 */
export type ReviewTarget = { project: string; checkout: string; callsign: string }

/** `awaitsResume`: stranded, on duty until its latest conversation is resumed or it is let go. */
const cardVerbs = (status: Status, resumable: boolean, conversations: { resumedBy?: SessionRef }[], leftovers: number, review: ReviewTarget | undefined, awaitsResume: boolean): CardVerb[] => {
  const live = isLive(status)
  const latest = conversations.at(-1)
  return [
    ...(live ? ['drive' as const] : []),
    ...(AT_COMPOSER.has(status) ? ['submit' as const] : []),
    ...(latest ? conversationVerbs(live, resumable, latest.resumedBy) : []),
    ...(conversations.length > 0 ? ['brief' as const] : []),
    ...(conversations.length > 0 && review ? ['review' as const] : []),
    ...(leftovers > 0 ? ['reap' as const] : []),
    ...(live ? ['kill' as const] : []),
    ...(awaitsResume ? ['let-go' as const] : []),
  ]
}

/** `canCut`: every dir of the project is a git repo with an origin. `tidyable`: its Tidy lists something. */
const floorVerbs = (hostUp: boolean, termsUp: boolean, canCut: boolean, tidyable: boolean): FloorVerb[] => [
  ...(hostUp ? ['spawn' as const] : []),
  ...(hostUp && canCut ? ['cut' as const] : []),
  ...(termsUp ? ['shell' as const] : []),
  'editor',
  ...(tidyable ? ['tidy' as const] : []),
]

/** A worktree in use offers nothing. Work at risk is discarded only on a floor keeping review threads, where its tips are noted. */
const worktreeVerbs = (state: WorktreeState, keepsThreads: boolean): WorktreeVerb[] =>
  state === 'lost' ? ['recut', 'prune'] : state === 'removable' || state === 'carried' ? ['remove'] : state === 'at-risk' && keepsThreads ? ['discard'] : []

/** `review` leaves the reviewer's notes on the thread for the user to send; a worker hiring its own reviewer adds `tell`. */
/** `send-home` is a kill per running worker, the deepest first. */
/** `note` takes the author and what the note says. */
export type CardCalls = { submit?: Call<'submit'>; resume?: Call<'resume'>; review?: Call<'spawn'>; reap?: Call<'reap'>; kill?: Call<'kill'>; 'let-go'?: Call<'let-go'>; 'send-home'?: Call<'kill'>[]; note?: Call<'review/append'> }
export type NoteCalls = { note?: Call<'review/append'> }
export type ConversationCalls = { resume?: Call<'resume'> }
export type ResourceCalls = { reap: Call<'reap/process'> }
/** `spawn` and `shell` take the directory the user picks, `editor` too; `cut` takes the name, branch and base the user picks, or none. */
export type FloorCalls = { spawn?: Call<'spawn'>; cut?: Call<'spawn'>; shell?: Call<'shell/spawn'>; editor?: Call<'open'>; tidy?: Call<'tidy'> }
/** `discard` carries what each repo held as shown, refused once it moved; it takes the author of its note. */
export type WorktreeCalls = { recut?: Call<'worktree/recut'>; prune?: Call<'worktree/prune'>; remove?: Call<'worktree/remove'>; discard?: Call<'worktree/discard'> }
export type BranchCalls = { recut?: Call<'branch/recut'>; delete?: Call<'branch/delete'> }

type Offers<V extends string, C> = { verbs: V[]; calls: C }

/** The calls of the offered verbs that have one. */
const callsOf = <V extends string, C>(verbs: V[], requests: { [K in V]?: () => unknown }): C =>
  Object.fromEntries(verbs.flatMap((v) => (requests[v] ? [[v, requests[v]()]] : []))) as C

export const conversationOffers = (session: string, conversation: string, live: boolean, resumable: boolean, resumedBy: SessionRef | undefined): Offers<ConversationVerb, ConversationCalls> => {
  const verbs = conversationVerbs(live, resumable, resumedBy)
  return { verbs, calls: callsOf(verbs, { resume: (): Call<'resume'> => ['resume', { id: session, conversation }] }) }
}

export const cardOffers = (
  id: string,
  status: Status,
  resumable: boolean,
  conversations: { id: string; resumedBy?: SessionRef }[],
  leftovers: number,
  review: ReviewTarget | undefined,
  awaitsResume: boolean,
): Offers<CardVerb, CardCalls> => {
  const verbs = cardVerbs(status, resumable, conversations, leftovers, review, awaitsResume)
  return {
    verbs,
    calls: callsOf(verbs, {
      submit: (): Call<'submit'> => ['submit', { id }],
      resume: (): Call<'resume'> => ['resume', { id, conversation: conversations.at(-1)!.id }],
      review: (): Call<'spawn'> => ['spawn', { project: review!.project, cut: { from: review!.checkout }, prompt: reviewPrompt(review!.callsign, false) }],
      reap: (): Call<'reap'> => ['reap', { id }],
      kill: (): Call<'kill'> => ['kill', { id }],
      'let-go': (): Call<'let-go'> => ['let-go', { id }],
    }),
  }
}

/**
 * `send-home` on a worker in a crew: someone reports to it or it reports to someone. `crew`: the worker and everyone
 * under it, each under its hirer or author, so the reverse ends the deepest first. Offered while any of them runs.
 */
export const sendHomeOffer = (crew: { id: string; status: Status }[], inCrew: boolean): Offers<'send-home', Pick<CardCalls, 'send-home'>> => {
  const running = crew.filter((c) => isLive(c.status)).reverse()
  return inCrew && running.length
    ? { verbs: ['send-home'], calls: { 'send-home': running.map(({ id }): Call<'kill'> => ['kill', { id }]) } }
    : { verbs: [], calls: {} }
}

/** `live`: the checkout's work goes on, on a floor that keeps review threads. */
export const noteOffers = (project: string, checkout: string, live: boolean): Offers<NoteVerb, NoteCalls> =>
  live ? { verbs: ['note'], calls: { note: ['review/append', { project, checkout }] } } : { verbs: [], calls: {} }

export const resourceOffers = (session: string, pid: number): Offers<ResourceVerb, ResourceCalls> => ({
  verbs: ['reap'],
  calls: { reap: ['reap/process', { id: session, pid }] },
})

export const isTidy = ({ worktrees, branches, threads, prune, logs }: TidyPlan) => !worktrees.length && !branches.length && !threads.length && !prune.length && !logs.length

/** Tidy's call carries the plan it applies: the tower refuses it once the floor's plan moved on. */
export const floorOffers = (project: string, hostUp: boolean, termsUp: boolean, canCut: boolean, tidy: TidyPlan): Offers<FloorVerb, FloorCalls> => {
  const verbs = floorVerbs(hostUp, termsUp, canCut, !isTidy(tidy))
  return {
    verbs,
    calls: callsOf(verbs, {
      spawn: (): Call<'spawn'> => ['spawn', { project }],
      cut: (): Call<'spawn'> => ['spawn', { project, cut: {} }],
      shell: (): Call<'shell/spawn'> => ['shell/spawn', { project }],
      editor: (): Call<'open'> => ['open', {}],
      tidy: (): Call<'tidy'> => ['tidy', { project, plan: tidy }],
    }),
  }
}

export const worktreeOffers = (project: string, name: string, state: WorktreeState, repos: Pick<FloorWorktreeRepo, 'dir' | 'head' | 'dirty'>[], keepsThreads: boolean): Offers<WorktreeVerb, WorktreeCalls> => {
  const verbs = worktreeVerbs(state, keepsThreads)
  return {
    verbs,
    calls: callsOf(verbs, {
      recut: (): Call<'worktree/recut'> => ['worktree/recut', { project, name }],
      prune: (): Call<'worktree/prune'> => ['worktree/prune', { project, name }],
      remove: (): Call<'worktree/remove'> => ['worktree/remove', { project, name }],
      discard: (): Call<'worktree/discard'> => ['worktree/discard', { project, name, held: repos.map(({ dir, head, dirty }) => ({ dir, head: head!, dirty })) }],
    }),
  }
}

/** `landed`: absorbed or carried in every repo that has it. */
export const branchOffers = (project: string, name: string, landed: boolean): Offers<BranchVerb, BranchCalls> => {
  const verbs: BranchVerb[] = landed ? ['recut', 'delete'] : ['recut']
  return {
    verbs,
    calls: callsOf(verbs, {
      recut: (): Call<'branch/recut'> => ['branch/recut', { project, name }],
      delete: (): Call<'branch/delete'> => ['branch/delete', { project, name }],
    }),
  }
}
