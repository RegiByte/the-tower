/**
 * What can be pruned from a floor, and who looks stuck, computed from its cards and worktrees: nothing is pruned by
 * itself, the floor's Tidy applies the list as shown (decision `tidy`).
 */
import type { Card } from './board.ts'
import type { FloorWorktree } from './worktrees.ts'

/** A worker working this long without a word from Claude is stuck: flagged, never killed, since a long build looks the same. */
export const STUCK_MS = 20 * 60 * 1000

/**
 * `reap`: a process whose session no longer runs, orphaned or not. `kill`: a hired worker done with its purpose, quiet
 * since `since` (epoch ms); it can be resumed, but its next turn reads the whole conversation again, uncached.
 */
export type Prune = { t: 'reap'; id: string; pid: number } | { t: 'kill'; id: string; since: number }


/** Quiet since it went idle or someone last typed into it, whichever came later. */
const idleSince = (c: Card) => Math.max(c.enteredAt, c.typedAt ?? 0)

/**
 * Its worktree's work has landed: in every repo nothing uncommitted and the branch absorbed into its base, a fork with no
 * commits of its own included. A worker in a main checkout has no work of its own to land.
 */
const landed = (c: Card, worktrees: FloorWorktree[]) => {
  const tree = c.worktree && worktrees.find((w) => w.name === c.worktree!.name)
  return tree !== undefined && tree.repos.every((r) => r.present && r.dirty === 0 && r.absorbed)
}

/**
 * Quiet between turns: `done` with its turn finished, its answer read or not (the answer stays in its log and brief), or
 * `idle` with no wait. A question, a screen or a failure keeps it.
 */
const quiet = (c: Card) => c.status === 'done' || (c.status === 'idle' && !c.waiting && !c.waitsOn)

/**
 * Only a hire is ever offered: a worker the user started stays until the user sends it home, however long it waits,
 * since its job may grow over time. A hire goes once its purpose is done: quiet, no running worker reporting to it,
 * and its work landed. Landed decides, so a finished hire whose answer nobody has read goes too.
 */
const killable = (c: Card, cards: Card[], worktrees: FloorWorktree[]) =>
  c.live && c.hiredBy !== undefined && quiet(c) && !cards.some((other) => other.live && other.reportsTo === c.id) && landed(c, worktrees)

/** Every process of a session no longer live, then every hire done with its purpose, quiet longest first. */
export const prunable = (cards: Card[], worktrees: FloorWorktree[]): Prune[] => [
  ...cards.filter((c) => !c.live).flatMap((c) => c.resources.map(({ pid }) => ({ t: 'reap' as const, id: c.id, pid }))),
  ...cards
    .filter((c) => killable(c, cards, worktrees))
    .map((c) => ({ t: 'kill' as const, id: c.id, since: idleSince(c) }))
    .sort((a, b) => a.since - b.since),
]

/** Working with no hook or mod event from Claude for `STUCK_MS`. */
export const isStuck = (status: Card['status'], heardAt: number | undefined, now: number) =>
  status === 'working' && heardAt !== undefined && now - heardAt >= STUCK_MS
