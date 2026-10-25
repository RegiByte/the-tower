/**
 * Where a checkout's work stands, from what git reads of its floor: a fact about a checkout that Tidy, `tower whoami`,
 * the Changes panel and any extension read alike. A checkout is a tower worktree across every repo of its project, by
 * name, or `main` for the main checkouts.
 */
import { MAIN_CHECKOUT } from '../shared/model.ts'
import type { FloorBranch, FloorWorktree, RepoRead } from './worktrees.ts'

/**
 * Where a checkout's work stands. `live`: work can go on there. `landed`: its work is in its base, `on` naming that base
 * while git still holds the worktree or a branch cut under its name, `empty` when git says no branch of it gained a
 * commit since it was cut (there was nothing to land), `edited` how many of its commits landed as edited copies
 * (carried) on `branch` (the landing read's). `gone`: its worktree is gone, and nothing says its work landed. The main
 * checkouts are always live.
 */
export type CheckoutState =
  | { is: 'live' }
  | {
      is: 'landed'
      on?: string
      empty?: true
      edited?: number
      branch?: string
      /**
       * The thread Tidy filed once the work landed.
       * @deprecated since 1.93: the reviews extension's `card.x.reviews.filed`, copied onto `card.checkoutState` until 2.0.
       */
      filed?: FiledThread
    }
  | { is: 'gone' }

/** A thread Tidy filed: its item's id and tag, and when it was filed, as a message heading writes a time. */
export type FiledThread = { id: string; tag: string; at: string }

export type LandedState = Extract<CheckoutState, { is: 'landed' }>

/**
 * The main checkouts as git reads them across a floor's repos: unlanded files (`dirty`, tracked or not) and commits
 * `ahead` of their upstreams, summed, and whether a worker on duty runs there.
 */
export type MainCheckouts = { dirty: number; ahead: number; inUse: boolean }

/** What a checkout's state is read from: a floor's worktrees and kept branches, and its main checkouts once every dir is read. */
export type CheckoutsRead = { worktrees: FloorWorktree[]; branches: FloorBranch[]; main?: MainCheckouts }

/** The main checkouts of a floor's `reads` (`undefined` until each dir was read once). */
export const mainCheckouts = (reads: RepoRead[] | undefined, inUse: boolean): MainCheckouts | undefined =>
  reads && reads.reduce((sum, r) => (r.git ? { ...sum, dirty: sum.dirty + r.main.dirty, ahead: sum.ahead + r.main.ahead } : sum), { dirty: 0, ahead: 0, inUse })

/** No worktree of the name is in use or holds work, and every branch cut under it is absorbed into its base. */
const worktreeLanded = (tree: FloorWorktree | undefined, cutUnder: FloorBranch['repos']) =>
  (!tree || (tree.state === 'removable' && tree.repos.every((r) => r.absorbed))) && cutUnder.every((r) => r.absorbed)

/** As `worktreeLanded`, or landed as copies, some edited: absorbed or carried everywhere. */
const worktreeCarried = (tree: FloorWorktree | undefined, cutUnder: FloorBranch['repos']) =>
  (!tree || ((tree.state === 'removable' || tree.state === 'carried') && tree.repos.every((r) => r.absorbed || r.carried))) && cutUnder.every((r) => r.absorbed || r.carried)

const cutUnderOf = (checkout: string, branches: FloorBranch[]) => branches.flatMap((b) => b.repos.filter((r) => r.tree === checkout))

/**
 * Whether a checkout's work has landed, so nothing more comes of it there: a worktree's when no worktree of that name
 * is in use or holds work, and every branch cut under the name is absorbed into its base; `main`'s when no worker runs
 * there and every main checkout is clean and level with its upstream. None until every dir is read.
 */
export const checkoutLanded = (checkout: string, { worktrees, branches, main }: CheckoutsRead): boolean => {
  if (!main) return false
  if (checkout === MAIN_CHECKOUT) return !main.inUse && main.dirty === 0 && main.ahead === 0
  return worktreeLanded(worktrees.find((w) => w.name === checkout), cutUnderOf(checkout, branches))
}

/** A checkout's work as landed: its base, and whether it was empty or landed edited, as git still holds them. */
const landedAs = (checkout: string, { worktrees, branches }: CheckoutsRead): LandedState => {
  const tree = worktrees.find((w) => w.name === checkout)
  const cutUnder = cutUnderOf(checkout, branches)
  const cut = [...(tree?.repos ?? []), ...cutUnder]
  const base = cut[0]
  const on = base && (base.against ?? base.base)
  const empty = cut.length > 0 && cut.every((r) => r.own === 0)
  const edited = cut.reduce((n, r) => n + (r.absorbed ? 0 : (r.carried?.edited ?? 0)), 0)
  const branch = tree ? tree.repos[0].branch : cutUnder.length ? branches.find((b) => b.repos.some((r) => r.tree === checkout))!.name : undefined
  return { is: 'landed', ...(on && { on }), ...(empty && { empty: true as const }), ...(edited && { edited, branch }) }
}

/**
 * A checkout's `CheckoutState`, by what git reads of its floor (every checkout is live until every dir is read). A
 * worktree whose folder is missing is gone.
 */
export const checkoutState = (checkout: string, read: CheckoutsRead): CheckoutState => {
  if (checkout === MAIN_CHECKOUT || !read.main) return { is: 'live' }
  const tree = read.worktrees.find((w) => w.name === checkout)
  const cutUnder = cutUnderOf(checkout, read.branches)
  if (tree) return worktreeCarried(tree, cutUnder) ? landedAs(checkout, read) : tree.state === 'lost' ? { is: 'gone' } : { is: 'live' }
  return cutUnder.length && worktreeCarried(tree, cutUnder) ? landedAs(checkout, read) : { is: 'gone' }
}

/**
 * Where a checkout's work stands once a record kept elsewhere says it landed (a thread Tidy filed): landed, unless its
 * worktree is still there to say otherwise. The main checkouts stay live.
 */
export const landedByRecord = (checkout: string, state: CheckoutState, read: CheckoutsRead): CheckoutState =>
  checkout === MAIN_CHECKOUT || state.is === 'landed' || read.worktrees.some((w) => w.name === checkout) || !read.main ? state : landedAs(checkout, read)

/** What a floor of the board reads its checkouts' states from. */
export const checkoutsOn = (floor: CheckoutsRead): CheckoutsRead => ({ worktrees: floor.worktrees, branches: floor.branches, ...(floor.main && { main: floor.main }) })
