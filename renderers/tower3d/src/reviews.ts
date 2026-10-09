import type { RepoChanges } from '../../../src/changes.ts'
import { changesPath, liveScope, viewedKey, type ChangesRead as Read, type ChangesScope } from '../../../src/shared/panels.ts'
import { REVIEWS, parseThread, type ReviewThread } from '../../../src/shared/reviews.ts'
import { tower, type Board } from './api.ts'
import { FIXTURE, FIXTURE_CHANGES, FIXTURE_THREADS } from './fixtures.ts'

/**
 * Review threads and Changes as Tower 3D reads them: a thread's file is read and parsed once per version the board
 * names, a worker's Changes whenever asked, with the viewed marks every renderer keeps in `tower.store`. A fixture
 * board reads its own, the same on every load.
 */

let arrived = () => {}
let failed = (_: Error) => {}
/** Runs `then` whenever a thread or a Changes read arrives, `fail` when one can't be read. */
export const onReviews = (then: () => void, fail: (err: Error) => void) => ((arrived = then), (failed = fail))

/**
 * A thread as a panel reads it: its checkout, and its item's id in the floor's `reviews`, the checkout's own file or,
 * once its work landed, the one Tidy filed.
 */
export type ThreadAt = { project: string; checkout: string; id: string }

const threadText = ({ project, checkout, id }: ThreadAt): Promise<string> =>
  FIXTURE === undefined ? tower.text(`collection/${project}/${REVIEWS}/${encodeURIComponent(id)}`) : Promise.resolve(FIXTURE_THREADS[`${project}/${checkout}`] ?? '')

/** Each thread as last read, by `<project>/<id>`: the version of its file it was read at, the read, and why it failed. */
type ThreadEntry = { at: number; thread?: ReviewThread; failed?: string; read: Promise<ReviewThread> }
const threads = new Map<string, ThreadEntry>()

const emptyThread = (checkout: string): ReviewThread => ({ checkout, messages: [] })

const keyOf = ({ project, id }: ThreadAt) => `${project}/${id}`

/** The thread's entry for the version of its file the board names, read anew when the file moved on. */
function entryOf(board: Board, at: ThreadAt) {
  const item = board.floors.find((f) => f.id === at.project)?.collections.find((c) => c.id === REVIEWS)?.items.find((i) => i.id === at.id)
  if (!item) return undefined
  const key = keyOf(at)
  const had = threads.get(key)
  if (had?.at === item.modifiedAt) return had
  const read = threadText(at).then(parseThread)
  const entry: ThreadEntry = { at: item.modifiedAt, thread: had?.thread, read }
  threads.set(key, entry)
  read.then((thread) => {
    if (threads.get(key) !== entry) return
    entry.thread = thread
    arrived()
  }, (err: Error) => {
    if (threads.get(key) !== entry) return
    if (entry.thread) return failed(err)
    entry.failed = err.message
    arrived()
  })
  return entry
}

/**
 * A thread: empty while it has no file, `undefined` until its file is first read. A file the board says moved on is
 * read again; until it arrives, the thread as it was.
 */
export const threadOf = (board: Board, at: ThreadAt): ReviewThread | undefined => {
  const entry = entryOf(board, at)
  return entry ? entry.thread : emptyThread(at.checkout)
}

/** Why a thread couldn't be read, while none is held. */
export const threadFailed = (board: Board, at: ThreadAt) => {
  const entry = entryOf(board, at)
  return entry?.thread ? undefined : entry?.failed
}

/** Forgets a thread, to read it again on the next draw. */
export const rereadThread = (at: ThreadAt) => threads.delete(keyOf(at))

/** A thread as its file reads at the version the board names, once read. */
export const threadRead = (board: Board, at: ThreadAt): Promise<ReviewThread> =>
  entryOf(board, at)?.read ?? Promise.resolve(emptyThread(at.checkout))

/** A worker's Changes as last read under `scope`, with each repo's viewed marks (path → the hash it was marked at), by repo dir. */
export type ChangesRead = Read & { id: string; scope: ChangesScope }

const changes = new Map<string, ChangesRead>()
/** What each worker's Changes compare, by its id: all since the base until the viewer picks another. */
const scopes = new Map<string, ChangesScope>()
export const scopeOf = (id: string): ChangesScope => scopes.get(id) ?? 'all'
/** A worker's Changes as last read under the scope it compares now. */
export const changesOf = (id: string) => (changes.get(id)?.scope === scopeOf(id) ? changes.get(id) : undefined)
/** Compares a worker's Changes under another scope, read now. */
export const compare = (id: string, scope: ChangesScope, now: number) => (scopes.set(id, scope), readChanges(id, now))
/** Why a worker's Changes couldn't be read, by its id, while none is held. */
const changesFailures = new Map<string, string>()
export const changesFailed = (id: string) => (changes.has(id) ? undefined : changesFailures.get(id))

const readRepos = (id: string, scope: ChangesScope): Promise<RepoChanges[]> =>
  FIXTURE === undefined ? (tower.get as (path: string) => Promise<RepoChanges[]>)(changesPath(id, scope)) : Promise.resolve(FIXTURE_CHANGES[id] ?? [])

const readViewed = (repo: RepoChanges) => (FIXTURE === undefined ? tower.store.get(viewedKey(repo)) : Promise.resolve(undefined)) as Promise<Record<string, string> | undefined>

/** Reads a worker's Changes now, with the viewed marks every renderer in this browser keeps. */
export async function readChanges(id: string, now: number): Promise<void> {
  const scope = scopeOf(id)
  const repos = await readRepos(id, scope).catch((err: Error) => {
    if (changes.has(id)) return void failed(err)
    changesFailures.set(id, err.message)
    arrived()
  })
  if (!repos || scopeOf(id) !== scope) return
  changesFailures.delete(id)
  if (liveScope(repos, scope) !== scope) return compare(id, 'all', now)
  const marks = await Promise.all(repos.map(readViewed))
  changes.set(id, { id, scope, repos, at: now, viewed: Object.fromEntries(repos.map((r, i) => [r.dir, marks[i] ?? {}])) })
  arrived()
}

/** Keeps a repo's viewed marks, for the read it was marked on and every renderer in this browser; a fixture board keeps them in the page. */
export function markViewed(read: ChangesRead, repo: RepoChanges, marks: Record<string, string>) {
  read.viewed[repo.dir] = marks
  if (FIXTURE === undefined) tower.store.set(viewedKey(repo), marks)
}
