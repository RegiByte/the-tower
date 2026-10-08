import type { RepoChanges } from '../../../src/changes.ts'
import type { ChangesRead as Read } from '../../../src/shared/panels.ts'
import { REVIEWS, parseThread, threadId, type ReviewThread } from '../../../src/shared/reviews.ts'
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

const threadText = (project: string, checkout: string): Promise<string> =>
  FIXTURE === undefined ? tower.text(`collection/${project}/${REVIEWS}/${encodeURIComponent(threadId(checkout))}`) : Promise.resolve(FIXTURE_THREADS[`${project}/${checkout}`] ?? '')

/** Each thread as last read, by `<project>/<checkout>`: the version of its file it was read at, and the read. */
const threads = new Map<string, { at: number; thread?: ReviewThread; read: Promise<ReviewThread> }>()

const emptyThread = (checkout: string): ReviewThread => ({ checkout, messages: [] })

/** The thread's entry for the version of its file the board names, read anew when the file moved on. */
function entryOf(board: Board, project: string, checkout: string) {
  const item = board.floors.find((f) => f.id === project)?.collections.find((c) => c.id === REVIEWS)?.items.find((i) => i.id === threadId(checkout))
  if (!item) return undefined
  const key = `${project}/${checkout}`
  const had = threads.get(key)
  if (had?.at === item.modifiedAt) return had
  const read = threadText(project, checkout).then(parseThread)
  const entry = { at: item.modifiedAt, thread: had?.thread, read }
  threads.set(key, entry)
  read.then((thread) => {
    if (threads.get(key) !== entry) return
    entry.thread = thread
    arrived()
  }, failed)
  return entry
}

/**
 * A checkout's thread: empty while it has no file, `undefined` until its file is first read. A file the board says
 * moved on is read again; until it arrives, the thread as it was.
 */
export const threadOf = (board: Board, project: string, checkout: string): ReviewThread | undefined => {
  const entry = entryOf(board, project, checkout)
  return entry ? entry.thread : emptyThread(checkout)
}

/** A checkout's thread as its file reads at the version the board names, once read. */
export const threadRead = (board: Board, project: string, checkout: string): Promise<ReviewThread> =>
  entryOf(board, project, checkout)?.read ?? Promise.resolve(emptyThread(checkout))

/** A worker's Changes as last read, with each repo's viewed marks (path → the hash it was marked at), by repo dir. */
export type ChangesRead = Read & { id: string }

const changes = new Map<string, ChangesRead>()
export const changesOf = (id: string) => changes.get(id)

const readRepos = (id: string): Promise<RepoChanges[]> =>
  FIXTURE === undefined ? (tower.get as (path: string) => Promise<RepoChanges[]>)(`changes/${id}`) : Promise.resolve(FIXTURE_CHANGES[id] ?? [])

const readViewed = (dir: string) => (FIXTURE === undefined ? tower.store.get(`viewed:${dir}`) : Promise.resolve(undefined)) as Promise<Record<string, string> | undefined>

/** Reads a worker's Changes now, with the viewed marks every renderer in this browser keeps. */
export async function readChanges(id: string, now: number) {
  const repos = await readRepos(id).catch((err: Error) => (failed(err), undefined))
  if (!repos) return
  const marks = await Promise.all(repos.map((r) => readViewed(r.dir)))
  changes.set(id, { id, repos, at: now, viewed: Object.fromEntries(repos.map((r, i) => [r.dir, marks[i] ?? {}])) })
  arrived()
}

/** Keeps a repo's viewed marks, for the read it was marked on and every renderer in this browser; a fixture board keeps them in the page. */
export function markViewed(read: ChangesRead, dir: string, marks: Record<string, string>) {
  read.viewed[dir] = marks
  if (FIXTURE === undefined) tower.store.set(`viewed:${dir}`, marks)
}
