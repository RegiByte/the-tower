/**
 * A worker's Changes as a viewer reads them: what they compare (`ChangesScope`), where its viewed marks are kept, and
 * the machine that reads them again as the worker works. Bundled into `/panels.js`.
 */
import type { RepoChanges } from '../changes.ts'
import type { Card } from '../bridge/board.ts'
import type { Handlers, StateEffect, TimerEffect } from './loop.ts'
import { failRead, failureAt, landRead, noReads, refreshRead, stepped, valueAt, type Held, type ReadEffect, type ReadEvent, type Reads } from './reads.ts'

/**
 * What the Changes compare, the `scope` of `changes/<id>`: everything since the base, what isn't committed, or a
 * commit's hash, that commit's own changes. Each repo says which it shows (`RepoChanges.shows`).
 */
export type ChangesScope = 'all' | 'uncommitted' | (string & {})
/** The read of a worker's Changes under a scope. */
export const changesPath = (id: string, scope: ChangesScope) => `changes/${id}${scope === 'all' ? '' : `?scope=${scope}`}`
/** A scope that compares one commit: its lines aren't the working tree's, which notes anchor to, so none are picked. */
export const isCommitScope = (scope: ChangesScope) => scope !== 'all' && scope !== 'uncommitted'
/**
 * The scope still there to show: `all` once no repo has commits since its base (they landed, or were reset away: the
 * picker isn't drawn, and all is what isn't committed), or once no repo lists the commit (rebased, amended).
 */
export const liveScope = (repos: RepoChanges[], scope: ChangesScope): ChangesScope =>
  repos.some((r) => r.commits.length) && (!isCommitScope(scope) || repos.some((r) => r.commits.some((c) => c.sha === scope))) ? scope : 'all'
/**
 * Where a repo's marks are kept in `tower.store`, apart for each scope it shows: a file's diff differs between them,
 * and a commit's marks hold for good, as the commit does.
 */
export const viewedKey = (repo: Pick<RepoChanges, 'dir' | 'shows'>) => `viewed:${repo.dir}${repo.shows === 'all' ? '' : `@${repo.shows}`}`

/** Each repo dir's marks: a file's path → the hash of the diff it was viewed at. */
export type Viewed = Record<string, Record<string, string>>
/** A worker's Changes as last read, at `at` (ms), with the viewer's marks. */
export type ChangesRead = { repos: RepoChanges[]; at: number; viewed: Viewed }

/** A worker's Changes are read again every `CHANGES_POLL_MS` while followed: Claude edits through scripts as often as through its edit tools. */
export const CHANGES_POLL_MS = 30_000

/**
 * A viewer's Changes: each worker's read under the scope it compares (`scopes`, all until the viewer picks another),
 * held by the worker's id, and the worker whose Changes or Reviews are open (`following`), read when they open, when
 * its turn ends and on a poll.
 */
export type ChangesReads = {
  reads: Reads<ChangesRead>
  scopes: Readonly<Record<string, ChangesScope>>
  following: { id: string; status: Card['status'] } | undefined
}

export const noChanges = (): ChangesReads => ({ reads: noReads(), scopes: {}, following: undefined })

/**
 * `follow` names the worker whose Changes or Reviews are open, or none, on every draw. `mark` keeps a repo's viewed
 * marks on the read the viewer marked them on.
 */
export type ChangesEvent =
  | { type: 'follow'; card: Pick<Card, 'id' | 'status'> | undefined }
  | { type: 'poll' }
  | { type: 'compare'; id: string; scope: ChangesScope }
  | { type: 'retry'; id: string }
  | { type: 'mark'; id: string; repo: Pick<RepoChanges, 'dir' | 'shows'>; marks: Record<string, string> }
  | Extract<ReadEvent<ChangesRead>, { type: 'got' | 'failed' }>

/** `keep` keeps a repo's viewed marks under `key` in `tower.store`, for every renderer in this browser. */
export type ChangesEffect = StateEffect<ChangesReads> | ReadEffect | TimerEffect<ChangesEvent> | { type: 'keep'; key: string; marks: Record<string, string> }

export const scopeOf = (s: ChangesReads, id: string): ChangesScope => s.scopes[id] ?? 'all'
/** A worker's Changes as last read under the scope it compares now. */
export const changesOf = (s: ChangesReads, id: string) => valueAt(s.reads.held[id], scopeOf(s, id))
/** Why a worker's Changes couldn't be read, while none is held under the scope it compares. */
export const changesFailure = (s: ChangesReads, id: string) => failureAt(s.reads.held[id], scopeOf(s, id))

const POLL: ChangesEffect = { type: 'timer/start', id: 'changes', ms: CHANGES_POLL_MS, fire: { type: 'poll' } }

const into = (s: ChangesReads) => (reads: Reads<ChangesRead>) => ({ ...s, reads })
const refreshing = (s: ChangesReads, id: string) => stepped(refreshRead(s.reads, id, scopeOf(s, id)), into(s))
function comparing(s: ChangesReads, id: string, scope: ChangesScope) {
  const next = { ...s, scopes: { ...s.scopes, [id]: scope } }
  return refreshing(next, id)
}

const marked = (h: Held<ChangesRead>, dir: string, marks: Record<string, string>): Held<ChangesRead> => {
  const mark = (read: ChangesRead) => ({ ...read, viewed: { ...read.viewed, [dir]: marks } })
  if (h.t === 'read') return { ...h, value: mark(h.value) }
  return h.last ? { ...h, last: { ...h.last, value: mark(h.last.value) } } : h
}

/** The machine of a viewer's Changes, on `/loop.js`: a renderer runs it with its executors and `timers()`. */
export const changesHandlers: Handlers<ChangesReads, ChangesEvent, ChangesEffect> = {
  follow: (s, { card }) => {
    const was = s.following
    if (!card) return was ? [{ type: 'state', state: { ...s, following: undefined } }, { type: 'timer/cancel', id: 'changes' }] : []
    const following = { id: card.id, status: card.status }
    if (was?.id !== card.id) return [...refreshing({ ...s, following }, card.id), POLL]
    const turnEnded = was.status === 'working' && card.status !== 'working'
    if (turnEnded) return refreshing({ ...s, following }, card.id)
    return was.status === card.status ? [] : [{ type: 'state', state: { ...s, following } }]
  },
  poll: (s) => (s.following ? [...refreshing(s, s.following.id), POLL] : []),
  compare: (s, { id, scope }) => comparing(s, id, scope),
  retry: (s, { id }) => refreshing(s, id),
  mark: (s, { id, repo, marks }) => {
    const h = s.reads.held[id]
    if (!h) return []
    const reads = { ...s.reads, held: { ...s.reads.held, [id]: marked(h, repo.dir, marks) } }
    return [{ type: 'state', state: { ...s, reads } }, { type: 'keep', key: viewedKey(repo), marks }]
  },
  got: (s, { slot, n, value }) => {
    const h = s.reads.held[slot]
    if (h?.n !== n) return []
    if (liveScope(value.repos, h.key) !== h.key) return comparing(s, slot, 'all')
    return stepped(landRead(s.reads, slot, n, value), into(s))
  },
  failed: (s, { slot, n, message }) => {
    const [reads, effects] = failRead(s.reads, slot, n, message)
    const h = reads.held[slot]
    const shown = h && valueAt(h, h.key) !== undefined
    return stepped([reads, effects.length && !shown ? [{ type: 'draw' }] : effects], into(s))
  },
}

/**
 * Reads a worker's Changes under a scope, with the viewer's marks on each repo: what the executor of the Changes'
 * `read` (`reading`) reads. `repos` reads them at `changesPath`, `viewed` the marks kept under a key (`tower.store`),
 * `now` stamps the read.
 */
export const readChanges =
  (io: { repos(id: string, scope: ChangesScope): Promise<RepoChanges[]>; viewed(key: string): Promise<Record<string, string> | undefined>; now(): number }) =>
  async (id: string, scope: ChangesScope): Promise<ChangesRead> => {
    const repos = await io.repos(id, scope)
    const marks = await Promise.all(repos.map((repo) => io.viewed(viewedKey(repo))))
    return { repos, at: io.now(), viewed: Object.fromEntries(repos.map((repo, i) => [repo.dir, marks[i] ?? {}])) }
  }
