/**
 * What autotidy applies, pure over the board: the workers going home now, and the part of each floor's Tidy that is
 * theirs. Tidy's own conditions hold (a worktree only once nobody is in it and its work landed); autotidy only picks.
 */
import type { Board, Card, Floor, TidyPlan } from '../../src/bridge/board.ts'
import { checkoutLanded, checkoutsOn } from '../../src/bridge/checkouts.ts'
import type { AddedTidy } from '../../src/shared/extensions.ts'

export const CAP = 'autotidy'

export type Settings = { reap: boolean; worktrees: boolean; branches: boolean; extensions: boolean }

/** A worker going home: the sessions it ran as, its checkout and the branch its worktree held. */
export type Going = { sessions: string[]; checkout: string; branch?: string }

/**
 * How long going home lasts: the tower reads processes and git on their own beat, so a worker's leftovers and its
 * worktree's state reach the board a little after its going. What Tidy lists of it within this is tidied; what isn't
 * safe to remove by then is left for Tidy's press.
 */
export const GOING_MS = 2 * 60_000

/** When a card went off duty: let go, or else when it entered the status it holds (its end). */
const offDutyAt = (c: Card) => c.letGoAt ?? c.enteredAt

const goingOf = (c: Card): Going => ({ sessions: c.lineage.map((l) => l.id), checkout: c.checkout, ...(c.worktree?.branch && { branch: c.worktree.branch }) })

/** A floor's part: the settings it acts by, and the workers going home now. */
export type Part = Settings & { going: Going[] }

/**
 * The floor's workers going home at `now`: off duty for less than `GOING_MS`, continued by no session, and either ended
 * by the tower's kill (sent home, gone home by itself, a hire Tidy ended) or let go. A worker that exited by itself or
 * crashed is one the user may resume, and never counts. A stranded worker (the host stopped or lost it, or a signal
 * from outside ended it) is on duty until resumed or let go; once its conversation is found unresumable it goes off
 * duty without going home now, so it never counts.
 */
export const goingHome = (f: Floor, now: number): Going[] =>
  f.cards
    .filter((c) => !c.onDuty && !c.continuedBy && (c.letGoAt !== undefined || c.killed) && now - offDutyAt(c) < GOING_MS)
    .map(goingOf)

/**
 * The workers running on `prev` that `next` no longer carries, resumed by none of its cards: gone home on the board they
 * left it on. The board keeps an off-duty card while it is waiting, leaves processes or started today, so one that
 * leaves as it goes left no processes, and what it leaves that Tidy can take (its worktree, its checkout's entries) is
 * read on that same board: nobody on duty is in it any more, and git's read doesn't move as a worker ends. Its card is
 * gone, so how it ended isn't read: one that exited by itself counts too.
 */
export const leftBoard = (prev: Floor, next: Floor): Going[] =>
  prev.cards.filter((c) => c.live && !next.cards.some((n) => n.id === c.id || n.lineage.some((l) => l.id === c.id))).map(goingOf)

export const partOf = (settings: Settings, f: Floor, now: number): Part => ({ ...settings, going: goingHome(f, now) })

const acts = (p: Settings) => p.reap || p.worktrees || p.branches || p.extensions

export type Plan = Omit<TidyPlan, 'threads' | 'logs' | 'streams'> & { x: Record<string, string[]> }

const NOTHING: Plan = { worktrees: [], branches: [], prune: [], x: {} }

/**
 * The part of a floor's Tidy that belongs to the workers going home (the fold's, and `gone`, those that left the board
 * as they went), as its settings say: their worktrees as Tidy lists them once their checkout has landed (Tidy lists a
 * worktree whose branch is pushed and unmerged too, the user confirming the list), their kept branches as Tidy lists
 * them, and their processes and the extensions' entries for their checkouts unless someone on
 * duty works there (a process names no checkout, and may serve a worker sharing its starter's).
 */
export const planOf = (f: Floor, added: AddedTidy[], gone: Going[] = []): Plan => {
  const part = f.x?.[CAP] as Part | undefined
  if (!part || !acts(part)) return NOTHING
  const going = [...part.going, ...gone]
  const occupied = new Set(f.cards.filter((c) => c.onDuty).map((c) => c.checkout))
  const left = going.filter((g) => !occupied.has(g.checkout))
  const sessions = new Set(left.flatMap((g) => g.sessions))
  const free = new Set(left.map((g) => g.checkout))
  const checkouts = new Set(going.map((g) => g.checkout))
  const branches = new Set(going.flatMap((g) => (g.branch ? [g.branch] : [])))
  const x: Record<string, string[]> = {}
  if (part.extensions) for (const { cap, key, checkout } of added) if (cap !== CAP && checkout !== undefined && free.has(checkout)) (x[cap] ??= []).push(key)
  return {
    worktrees: part.worktrees ? f.tidy.worktrees.filter((name) => checkouts.has(name) && checkoutLanded(name, checkoutsOn(f))) : [],
    branches: part.branches ? f.tidy.branches.filter((name) => branches.has(name)) : [],
    prune: part.reap ? f.tidy.prune.filter((p) => p.t === 'reap' && sessions.has(p.id)) : [],
    x,
  }
}

export const addedOf = (board: Board, f: Floor): AddedTidy[] => board.adds[`floor:${f.id}`]?.tidy ?? []

/** What `next` lists that `prev` did not: what came to qualify, asked for once. */
export const fresh = (prev: Plan, next: Plan): Plan => {
  const x: Record<string, string[]> = {}
  for (const [cap, keys] of Object.entries(next.x)) {
    const added = keys.filter((k) => !prev.x[cap]?.includes(k))
    if (added.length) x[cap] = added
  }
  return {
    worktrees: next.worktrees.filter((n) => !prev.worktrees.includes(n)),
    branches: next.branches.filter((n) => !prev.branches.includes(n)),
    prune: next.prune.filter((p) => p.t === 'reap' && !prev.prune.some((q) => q.t === 'reap' && q.pid === p.pid && q.id === p.id)),
    x,
  }
}

/**
 * A plan without the worktrees `prev` didn't list: a going worker's own worktree was listed while it worked there, so
 * one that comes onto the board meanwhile was just made (recut by the user to resume a worker) and is never autotidy's.
 */
export const listedBefore = (prev: Floor, p: Plan): Plan => ({ ...p, worktrees: p.worktrees.filter((name) => prev.worktrees.some((w) => w.name === name)) })

/**
 * A plan cut into one plan per kind, each extension's entries a kind: Tidy refuses a whole call when any of it no longer
 * qualifies (a process that exited between the board and the call), and each entry is asked for once, so a stale entry
 * takes down only the entries of its kind, left for Tidy's press. A floor's board asks at most one call per kind, however
 * many workers go home at once, which keeps a crew within the board trigger's calls a minute.
 */
export const byKind = (p: Plan): Plan[] => [
  ...(p.worktrees.length ? [{ ...NOTHING, worktrees: p.worktrees }] : []),
  ...(p.branches.length ? [{ ...NOTHING, branches: p.branches }] : []),
  ...(p.prune.length ? [{ ...NOTHING, prune: p.prune }] : []),
  ...Object.entries(p.x).map(([cap, keys]) => ({ ...NOTHING, x: { [cap]: keys } })),
]

/** Tidy's input for a plan: the core's parts, the extensions' entries as `x`. */
export const tidyInput = (project: string, p: Plan) => ({
  project,
  plan: { worktrees: p.worktrees, branches: p.branches, threads: [], prune: p.prune, logs: [], streams: [], ...(Object.keys(p.x).length && { x: p.x }) },
})
