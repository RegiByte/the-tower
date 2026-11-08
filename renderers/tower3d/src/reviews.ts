import { type RepoChanges, changesHandlers, changesPath, changesOf as changesIn, noChanges, readChanges, type ChangesEvent, type ChangesScope } from '/lib/changes.js'
import { loop, timers, heldHandlers, noReads, reading } from '/lib/machine.js'
import { heldThread, readThread, threadFailure, threadWant, parseThread } from './clients.ts'
import type { ThreadAt } from '../../../extensions/reviews/client/panel.ts'
import type { ReviewThread } from '../../../extensions/reviews/client/reviews.ts'
import { tower, type Board, type Card } from './api.ts'
import { wallNow } from './clock.ts'
import { FIXTURE, FIXTURE_CHANGES, FIXTURE_THREADS } from './fixtures.ts'

/**
 * Review threads as Tower 3D reads them: a thread's file is read and parsed once per version the board names, and the
 * open desk's worker's Changes while its Reviews are open, where the thread's anchors are looked for. A fixture board
 * reads its own, the same on every load.
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
    read: reading(readChanges({ repos: readRepos, viewed: () => Promise.resolve(undefined), now: wallNow })),
    draw: () => arrived(),
    toast: ({ message }) => failed(message),
    keep: () => {},
  },
})

/**
 * Follows the worker whose Reviews are open, or none: its Changes against its base, read as they open, when its turn
 * ends and every `CHANGES_POLL_MS`, so the thread's anchors say where they stand among them.
 */
export const followChanges = (c: Card | undefined) => changes.dispatch({ type: 'follow', card: c })

/** A worker's Changes against its base, as last read. */
export const changesOf = (id: string) => changesIn(changes.state(), id)
