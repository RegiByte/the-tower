import type { RepoChanges } from '../../../src/changes.ts'
import { loop, timers } from '../../../src/shared/loop.ts'
import {
  changesFailure, changesHandlers, changesPath, changesOf as changesIn, heldThread, noChanges, readChanges, readThread, scopeOf as scopeIn, threadFailure, threadWant,
  type ChangesEvent, type ChangesScope, type ThreadAt,
} from '../../../src/shared/panels.ts'
import { heldHandlers, noReads, reading } from '../../../src/shared/reads.ts'
import { parseThread, type ReviewThread } from '../../../src/shared/reviews.ts'
import { tower, type Board, type Card } from './api.ts'
import { wallNow } from './clock.ts'
import { FIXTURE, FIXTURE_CHANGES, FIXTURE_THREADS } from './fixtures.ts'

/**
 * Review threads and Changes as Tower 3D reads them: a thread's file is read and parsed once per version the board
 * names, the open desk's worker's Changes while its Changes or Reviews are open, with the viewed marks every renderer
 * keeps in `tower.store`. A fixture board reads its own, the same on every load.
 */

let arrived = () => {}
let failed = (_: string) => {}
/** Runs `then` whenever a thread or a Changes read arrives, `fail` with why one can't be read over what is held. */
export const onReviews = (then: () => void, fail: (message: string) => void) => ((arrived = then), (failed = fail))

const threads = loop({
  state: noReads<ReviewThread>(),
  handlers: heldHandlers<ReviewThread>(),
  execute: {
    read: reading(FIXTURE === undefined ? readThread((path) => tower.text(path)) : (slot) => Promise.resolve(parseThread(FIXTURE_THREADS[slot] ?? ''))),
    draw: () => arrived(),
    toast: ({ message }) => failed(message),
  },
})

const wanted = (board: Board, at: ThreadAt) => {
  const want = threadWant(board.floors, at)
  if (want) threads.dispatch(want)
  return threads.state()
}

/**
 * A thread: empty while it has no file, `undefined` until its file is first read. A file the board says moved on is
 * read again; until it arrives, the thread as it was.
 */
export const threadOf = (board: Board, at: ThreadAt) => heldThread(wanted(board, at), board.floors, at)

/** Why a thread couldn't be read, while none is held. */
export const threadFailed = (board: Board, at: ThreadAt) => threadFailure(wanted(board, at), at)

/** Reads a thread again, after a read that failed. */
export function rereadThread(board: Board, at: ThreadAt) {
  const want = threadWant(board.floors, at)
  if (want) threads.dispatch({ ...want, type: 'refresh' })
}

const readRepos = (id: string, scope: ChangesScope): Promise<RepoChanges[]> =>
  FIXTURE === undefined ? (tower.get as (path: string) => Promise<RepoChanges[]>)(changesPath(id, scope)) : Promise.resolve(FIXTURE_CHANGES[id] ?? [])

const changes = loop({
  state: noChanges(),
  handlers: changesHandlers,
  execute: {
    ...timers<ChangesEvent>(),
    read: reading(readChanges({
      repos: readRepos,
      viewed: (key) => (FIXTURE === undefined ? tower.store.get(key) : Promise.resolve(undefined)) as Promise<Record<string, string> | undefined>,
      now: wallNow,
    })),
    draw: () => arrived(),
    toast: ({ message }) => failed(message),
    keep: ({ key, marks }) => void (FIXTURE === undefined && tower.store.set(key, marks)),
  },
})

/** Follows the worker whose Changes or Reviews are open, or none: read as they open, when its turn ends and every `CHANGES_POLL_MS`. */
export const followChanges = (c: Card | undefined) => changes.dispatch({ type: 'follow', card: c })

/** What a worker's Changes compare: all since the base until the viewer picks another. */
export const scopeOf = (id: string): ChangesScope => scopeIn(changes.state(), id)
/** A worker's Changes as last read under the scope it compares now. */
export const changesOf = (id: string) => changesIn(changes.state(), id)
/** Compares a worker's Changes under another scope, read now. */
export const compare = (id: string, scope: ChangesScope) => changes.dispatch({ type: 'compare', id, scope })
/** Why a worker's Changes couldn't be read, while none is held. */
export const changesFailed = (id: string) => changesFailure(changes.state(), id)
/** Reads a worker's Changes again, after a read that failed. */
export const rereadChanges = (id: string) => changes.dispatch({ type: 'retry', id })

/** Keeps a repo's viewed marks, on the read they were marked on and for every renderer in this browser; a fixture board keeps them in the page. */
export const markViewed = (id: string, repo: RepoChanges, marks: Record<string, string>) => changes.dispatch({ type: 'mark', id, repo, marks })
