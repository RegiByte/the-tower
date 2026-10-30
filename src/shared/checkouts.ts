import type { Card, Floor } from '../bridge/board.ts'
import { MAIN_CHECKOUT } from './model.ts'
import { can } from './offered.ts'

/** Who a checkout's review thread is about, who works at it, and who Send reaches. */

/** The callsign whose work a worker reviews, as the reviews extension's part of its card says (`x.reviews.of`). @since 1.95 @deprecated since 1.97: the reviews extension's client, `/x/reviews/reviews.js`; this copy goes at 2.0. */
export const reviewerOf = (c: Pick<Card, 'x'>): string | undefined => (c.x?.reviews as { of?: string } | undefined)?.of

/** The checkout whose review thread is about a worker's work: a reviewer writes on its author's, any other worker on its own. @deprecated since 1.97: the reviews extension's client, `/x/reviews/reviews.js`; this copy goes at 2.0. */
export const threadCheckoutOf = (c: Pick<Card, 'x' | 'worktree' | 'checkout'>) => (reviewerOf(c) && c.worktree?.from) || c.checkout

/** The worker a checkout's thread opens on: the one on duty there, else the latest to have worked there. */
export const workerIn = (f: Floor, checkout: string) => {
  const here = f.cards.filter((c) => c.checkout === checkout)
  return here.find((c) => c.onDuty) ?? here.toSorted((a, b) => b.startedAt - a.startedAt)[0]
}

/** Who a checkout is a desk of: its workers on duty, else the one there last, if the board still carries it. */
export const workersIn = (f: Floor, checkout: string) => {
  const here = f.cards.filter((c) => c.checkout === checkout)
  const onDuty = here.filter((c) => c.onDuty)
  return onDuty.length ? onDuty : here.toSorted((a, b) => b.startedAt - a.startedAt).slice(0, 1)
}

/**
 * Who a checkout's review notes can be sent to: the workers at their composer in that checkout, the most recently
 * active first, then the floor's other workers by start. Send reaches the first one in the checkout unless the viewer
 * picks another.
 */
export const sendTargets = (f: Floor, checkout: string) => {
  const ready = f.cards.filter((c) => can(c, 'submit'))
  return [
    ...ready.filter((c) => c.checkout === checkout).sort((a, b) => b.enteredAt - a.enteredAt),
    ...ready.filter((c) => c.checkout !== checkout).sort((a, b) => a.startedAt - b.startedAt),
  ]
}

/** Who Send reaches on a checkout's thread: the worker the viewer `picked`, else the most recently active in the checkout. */
export const sendTarget = (f: Floor, checkout: string, picked: string | undefined) => {
  const targets = sendTargets(f, checkout)
  return targets.find((t) => t.id === picked) ?? targets.find((t) => t.checkout === checkout)
}

/**
 * The files a checkout changed across its repos, as the board counts them (`changed`): what a worker's Changes there
 * show under scope `all`. `undefined` until git was read. @since 1.119
 */
export const changedIn = (f: Floor, checkout: string): number | undefined => {
  if (checkout === MAIN_CHECKOUT) return f.main?.changed
  const counts = (f.worktrees.find((w) => w.name === checkout)?.repos ?? []).flatMap((r) => (r.changed === undefined ? [] : [r.changed]))
  return counts.length ? counts.reduce((n, c) => n + c, 0) : undefined
}
