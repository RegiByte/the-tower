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
import type { WorktreeState } from './worktrees.ts'

/**
 * `drive` opens the terminal; `submit` sends the worker a prompt from outside its terminal; `goto` goes to the
 * session that resumed the conversation; `review` starts a reviewer of its work in a fork of its checkout; `send-home`
 * ends the worker and every worker under it that runs (`crewOf`), offered to a worker in a crew.
 */
export type CardVerb = 'drive' | 'submit' | 'resume' | 'goto' | 'brief' | 'review' | 'reap' | 'kill' | 'send-home'
export type ConversationVerb = 'resume' | 'goto'
/** A process a session left running can always be ended on its own. */
export type ResourceVerb = 'reap'
/**
 * `spawn` starts a session, `cut` one in a new worktree of every dir, `shell` a shell in one of the floor's dirs, `editor`
 * opens a dir in the user's editor, `tidy` applies the floor's `TidyPlan` as listed: worktrees and kept branches, landed review
 * threads, leftover processes and idle workers.
 */
export type FloorVerb = 'spawn' | 'cut' | 'shell' | 'editor' | 'tidy'
/** `recut` restores a lost worktree's folders from its branch, `prune` forgets them; `remove` is offered only when nothing would be lost. */
export type WorktreeVerb = 'recut' | 'prune' | 'remove'
/** Offered only on a branch absorbed into its base. */
export type BranchVerb = 'recut' | 'delete'

const LIVE: ReadonlySet<Status> = new Set(['booting', 'blocked', 'idle', 'working', 'needs_input', 'watching', 'done', 'failed'])

/** Claude's composer has focus: not before Claude starts (on a screen that blocks it, maybe), nor on a question. */
const AT_COMPOSER: ReadonlySet<Status> = new Set(['idle', 'working', 'watching', 'done', 'failed'])

/** The session's PTY is running: its screen is live and it takes keys. */
export const isLive = (status: Status) => LIVE.has(status)

/** A conversation goes on in whoever resumed it, else it can be resumed once its session is no longer running. */
const conversationVerbs = (live: boolean, resumedBy: SessionRef | undefined): ConversationVerb[] =>
  resumedBy ? ['goto'] : live ? [] : ['resume']

/**
 * The work a reviewer would review: the worker's checkout and callsign, on a floor whose dirs are all git repos. None
 * for a worker that is itself a reviewer.
 */
export type ReviewTarget = { project: string; checkout: string; callsign: string }

const cardVerbs = (status: Status, conversations: { resumedBy?: SessionRef }[], leftovers: number, review: ReviewTarget | undefined): CardVerb[] => {
  const live = isLive(status)
  const latest = conversations.at(-1)
  return [
    ...(live ? ['drive' as const] : []),
    ...(AT_COMPOSER.has(status) ? ['submit' as const] : []),
    ...(latest ? conversationVerbs(live, latest.resumedBy) : []),
    ...(conversations.length > 0 ? ['brief' as const] : []),
    ...(conversations.length > 0 && review ? ['review' as const] : []),
    ...(leftovers > 0 ? ['reap' as const] : []),
    ...(live ? ['kill' as const] : []),
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

/** A worktree in use, or with work only it holds, offers nothing: removing work at risk is done by hand, in a shell. */
const worktreeVerbs = (state: WorktreeState): WorktreeVerb[] => (state === 'lost' ? ['recut', 'prune'] : state === 'removable' ? ['remove'] : [])

/** `review` leaves the reviewer's notes on the thread for the user to send; a worker hiring its own reviewer adds `tell`. */
/** `send-home` is a kill per running worker, the deepest first. */
export type CardCalls = { submit?: Call<'submit'>; resume?: Call<'resume'>; review?: Call<'spawn'>; reap?: Call<'reap'>; kill?: Call<'kill'>; 'send-home'?: Call<'kill'>[] }
export type ConversationCalls = { resume?: Call<'resume'> }
export type ResourceCalls = { reap: Call<'reap/process'> }
/** `spawn` and `shell` take the directory the user picks, `editor` too; `cut` takes the name, branch and base the user picks, or none. */
export type FloorCalls = { spawn?: Call<'spawn'>; cut?: Call<'spawn'>; shell?: Call<'shell/spawn'>; editor?: Call<'open'>; tidy?: Call<'tidy'> }
export type WorktreeCalls = { recut?: Call<'worktree/recut'>; prune?: Call<'worktree/prune'>; remove?: Call<'worktree/remove'> }
export type BranchCalls = { recut?: Call<'branch/recut'>; delete?: Call<'branch/delete'> }

type Offers<V extends string, C> = { verbs: V[]; calls: C }

/** The calls of the offered verbs that have one. */
const callsOf = <V extends string, C>(verbs: V[], requests: { [K in V]?: () => unknown }): C =>
  Object.fromEntries(verbs.flatMap((v) => (requests[v] ? [[v, requests[v]()]] : []))) as C

export const conversationOffers = (session: string, conversation: string, live: boolean, resumedBy: SessionRef | undefined): Offers<ConversationVerb, ConversationCalls> => {
  const verbs = conversationVerbs(live, resumedBy)
  return { verbs, calls: callsOf(verbs, { resume: (): Call<'resume'> => ['resume', { id: session, conversation }] }) }
}

export const cardOffers = (
  id: string,
  status: Status,
  conversations: { id: string; resumedBy?: SessionRef }[],
  leftovers: number,
  review: ReviewTarget | undefined,
): Offers<CardVerb, CardCalls> => {
  const verbs = cardVerbs(status, conversations, leftovers, review)
  return {
    verbs,
    calls: callsOf(verbs, {
      submit: (): Call<'submit'> => ['submit', { id }],
      resume: (): Call<'resume'> => ['resume', { id, conversation: conversations.at(-1)!.id }],
      review: (): Call<'spawn'> => ['spawn', { project: review!.project, cut: { from: review!.checkout }, prompt: reviewPrompt(review!.callsign, false) }],
      reap: (): Call<'reap'> => ['reap', { id }],
      kill: (): Call<'kill'> => ['kill', { id }],
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

export const worktreeOffers = (project: string, name: string, state: WorktreeState): Offers<WorktreeVerb, WorktreeCalls> => {
  const verbs = worktreeVerbs(state)
  return {
    verbs,
    calls: callsOf(verbs, {
      recut: (): Call<'worktree/recut'> => ['worktree/recut', { project, name }],
      prune: (): Call<'worktree/prune'> => ['worktree/prune', { project, name }],
      remove: (): Call<'worktree/remove'> => ['worktree/remove', { project, name }],
    }),
  }
}

export const branchOffers = (project: string, name: string, absorbed: boolean): Offers<BranchVerb, BranchCalls> => {
  const verbs: BranchVerb[] = absorbed ? ['recut', 'delete'] : ['recut']
  return {
    verbs,
    calls: callsOf(verbs, {
      recut: (): Call<'branch/recut'> => ['branch/recut', { project, name }],
      delete: (): Call<'branch/delete'> => ['branch/delete', { project, name }],
    }),
  }
}
