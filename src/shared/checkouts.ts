import type { Card, Floor } from '../bridge/board.ts'
import { can } from './offered.ts'

/** Who a checkout's review thread is about, who works at it, and who Send reaches. */

/** The checkout whose review thread is about a worker's work: a reviewer writes on its author's, any other worker on its own. */
export const threadCheckoutOf = (c: Pick<Card, 'reviews' | 'worktree' | 'checkout'>) => (c.reviews && c.worktree?.from) || c.checkout

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
